import { usesFirestore, database, readCloudRecord, reserveCloudAttempt } from "./firestore-store.js";
import { GoogleAuth } from "google-auth-library";
import { cloudSession, reserveCloudSlot } from "./cloud-session.js";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { groundedResult, promptFor } from "./insights.js";

const project = "devfest-512005",
  model = "gemini-3.1-flash-lite";
const dir = () => path.join(process.cwd(), ".workday-local", "inference");
export const fingerprint = (ctx) =>
  createHash("sha256").update(promptFor(ctx)).digest("hex");
export async function permission(ctx) {
  if (
    Buffer.byteLength(promptFor(ctx)) > 12000
  )
    return null;
  const session = await cloudSession();
  if (session && session.remaining > 0) {
    const digest = fingerprint(ctx);
    if (usesFirestore()) {
      return await readCloudRecord("workday-attempts", digest) ? null : { ...session, digest, batch: true };
    }
    try { await readFile(path.join(dir(), "attempt-" + digest + ".json")); return null; }
    catch(e) { return e.code === "ENOENT" ? {...session, digest, batch:true} : null; }
  }
  if (session || process.env.NODE_ENV !== "development") return null;
  try {
    const t = JSON.parse(
      await readFile(path.join(dir(), "approval.json"), "utf8"),
    );
    if (
      t.project !== project ||
      t.model !== model ||
      t.digest !== fingerprint(ctx) ||
      !Number.isFinite(t.issuedAt) ||
      Date.now() < t.issuedAt ||
      Date.now() - t.issuedAt > 1800000
    )
      return null;
    try {
      await readFile(path.join(dir(), "attempt-" + t.digest + ".json"));
      return null;
    } catch (e) {
      if (e.code !== "ENOENT") return null;
    }
    return t;
  } catch {
    return null;
  }
}
async function localToken() {
  if (usesFirestore()) {
    return new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken();
  }
  const { stdout } = await promisify(execFile)(
    "gcloud",
    ["auth", "print-access-token", "--quiet"],
    { timeout: 15000 },
  );
  return stdout.trim();
}
export async function vertex(ctx, { token = localToken, send = fetch } = {}) {
  const ticket = await permission(ctx);
  if (!ticket) throw Error("この入力に対する実行承認がありません。");
  const access = await token();
  if (!access) throw Error("認証情報がありません。");
  const file = path.join(dir(), "attempt-" + ticket.digest + ".json");
  const audit = {
    time: new Date().toISOString(),
    project,
    model,
    task: ctx.task,
    digest: ticket.digest,
    status: "reserved",
    calls: 1,
  };
  let slot = null;
  if (usesFirestore()) {
    await reserveCloudAttempt(ticket, audit);
  } else {
    await mkdir(dir(), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(audit), { flag: "wx", mode: 0o600 });
    slot = ticket.batch ? await reserveCloudSlot(ticket, audit) : null;
  }
  try {
    const res = await send(
      "https://aiplatform.googleapis.com/v1/projects/" +
        project +
        "/locations/global/publishers/google/models/" +
        model +
        ":generateContent",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptFor(ctx) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            candidateCount: 1,
            maxOutputTokens: 2048,
          },
        }),
      },
    );
    audit.http = res.status;
    if (!res.ok) throw Error();
    const json = await res.json();
    audit.usage = json.usageMetadata || {};
    audit.estimatedUsd = ((audit.usage.promptTokenCount || 0) * 0.25 +
      ((audit.usage.candidatesTokenCount || 0) + (audit.usage.thoughtsTokenCount || 0)) * 1.5) / 1000000;
    const raw = json.candidates?.[0]?.content?.parts
      .filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("");
    const result = groundedResult(ctx, JSON.parse(raw));
    audit.result = result;
    audit.status = "complete";
    return result;
  } catch {
    audit.status = "failed";
    throw Error("根拠付きの応答を確認できませんでした。自動再送はありません。");
  } finally {
    if (usesFirestore()) {
      await database().collection("workday-attempts").doc(ticket.digest).set(audit);
    } else {
      await writeFile(file, JSON.stringify(audit));
      if (slot) await writeFile(slot, JSON.stringify(audit));
    }
  }
}
