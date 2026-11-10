import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { material, checkOutput, teamInstruction, teamSchema } from "./team.js";
import { importEpisodes, draft } from "./episodes.js";

const model = "gemini-3.1-flash-lite",
  project = "devfest-512005";
const run = promisify(execFile);
export async function runOnce({
  dir,
  approved,
  sample,
  requested,
  fetcher = fetch,
  token = async () => {
    const { stdout } = await run(
      "gcloud",
      ["auth", "print-access-token", "--quiet"],
      { timeout: 15000 },
    );
    return stdout.trim();
  },
}) {
  if (!approved)
    throw Error(
      "クレジット対象と実行承認の確認待ちです。クラウドには送信していません。",
    );
  const data = importEpisodes(sample);
  if (data.errors.length || data.sources.length !== 3)
    throw Error("同梱の検証CSVを確認してください。");
  const evidence = material(
    data.sources.map((s) => ({ ...draft(s), status: "承認済み" })),
  );
  if (JSON.stringify(requested) !== JSON.stringify(evidence))
    throw Error(
      "見本CSVの社員01、02、03の順で選択してください。モデル呼び出しは0回です。",
    );
  const prompt = teamInstruction + "\n社員資料：" + JSON.stringify(evidence);
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        ...teamSchema,
        type: "OBJECT",
        properties: Object.fromEntries(
          teamSchema.required.map((k) => [k, { type: "STRING" }]),
        ),
      },
      candidateCount: 1,
      maxOutputTokens: 2048,
    },
  });
  if (Buffer.byteLength(body) > 12000) throw Error("入力上限を超えています。");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const cached = path.join(dir, "result.json");
  try {
    return JSON.parse(await readFile(cached, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  // Exclusive, durable reservation. A timeout, crash or HTTP error still spends the attempt.
  const access = await token().catch(() => {
    throw Error(
      "ローカルのgcloud認証情報を確認できません。モデル呼び出しは0回です。",
    );
  });
  if (!access) throw Error("gcloud認証がありません。");
  const ledger = path.join(dir, "attempt.json");
  const audit = {
    model,
    project,
    attempts: 1,
    time: new Date().toISOString(),
    status: "reserved",
  };
  try {
    await writeFile(ledger, JSON.stringify(audit), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code === "EEXIST")
      throw Error("1回の実行枠は予約済みです。再送しません。");
    throw e;
  }
  try {
    const res = await fetcher(
      "https://aiplatform.googleapis.com/v1/projects/" +
        project +
        "/locations/global/publishers/google/models/" +
        model +
        ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + access,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      },
    );
    audit.http = res.status;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      audit.serviceError = String(
        body.error?.status || "HTTP " + res.status,
      ).slice(0, 80);
      audit.reason = String(body.error?.message || "").slice(0, 420);
      throw Error();
    }
    const json = await res.json(),
      u = json.usageMetadata || {};
    audit.inputTokens = u.promptTokenCount ?? null;
    audit.outputTokens =
      u.totalTokenCount != null && audit.inputTokens != null
        ? u.totalTokenCount - audit.inputTokens
        : null;
    audit.estimatedUSD =
      audit.inputTokens == null || audit.outputTokens == null
        ? null
        : (audit.inputTokens * 0.25 + audit.outputTokens * 1.5) / 1e6;
    const raw = json.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    const result = {
      output: checkOutput(JSON.parse(raw)),
      audit: { ...audit, status: "complete" },
      evidence,
    };
    await writeFile(cached + ".tmp", JSON.stringify(result), { mode: 0o600 });
    await rename(cached + ".tmp", cached);
    Object.assign(audit, result.audit);
    return result;
  } catch {
    audit.status = "failed";
    throw Error(
      "応答の取得または検証に失敗しました。実行枠を消費したため再送しません。",
    );
  } finally {
    await writeFile(ledger, JSON.stringify(audit), { mode: 0o600 });
  }
}
