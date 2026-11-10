import { usesFirestore, readCloudRecord } from "../../../lib/firestore-store.js";
import { createHash } from "node:crypto";
import { previousResearchPrompt } from "../../../lib/research.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cloudSession } from "../../../lib/cloud-session.js";
import { listVoices } from "../../../lib/voice-store.js";
import { context, localResult } from "../../../lib/insights.js";
import {
  fingerprint,
  permission,
  vertex,
} from "../../../lib/insight-vertex.js";

export async function POST(req) {
  try {
    const raw = await req.text();
    if (raw.length > 5000) throw Error("入力が長すぎます。");
    const body = JSON.parse(raw),
      ctx = context(await listVoices(), body);
    if (body.mode === "vertex") {
      const origin = new URL(
        req.headers.get("origin") || "https://invalid.invalid",
      );
      if (
        origin.host !== req.headers.get("host") ||
        (!usesFirestore() && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
      )
        throw Error("アプリの画面から実行してください。");
      if (ctx.task === "research" && body.digest !== fingerprint(ctx))
        throw Error(
          "社員の回答が更新されました。ページを再読み込みしてください。",
        );
      return Response.json({
        result: await vertex(ctx),
        mode: "Gemini",
        facts: ctx.facts,
      });
    }
    const session = await cloudSession();
    const digest = fingerprint(ctx);
    const storageKey =
      ctx.task === "research"
        ? createHash("sha256").update(previousResearchPrompt(ctx)).digest("hex")
        : undefined;
    let generated = null;
    {
      const keys = storageKey && !ctx.excludedTopics.length ? [digest, storageKey] : [digest];
      for (const key of keys) {
        try {
          const audit = usesFirestore() ? await readCloudRecord("workday-attempts", key) : JSON.parse(
            await readFile(
              path.join(
                process.cwd(),
                ".workday-local",
                "inference",
                "attempt-" + key + ".json",
              ),
              "utf8",
            ),
          );
          if (audit?.status === "complete" && audit.result) {
            generated = audit.result;
            break;
          }
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
    }
    return Response.json({
      generated,
      storageKey,
      result: generated || localResult(ctx),
      mode: generated ? "Gemini" : "原文検索",
      facts: ctx.facts,
      approved: !!(await permission(ctx)),
      cloud: session !== null,
      remaining: session?.remaining ?? 0,
      digest,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
