import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { context, localResult, groundedResult } from "../lib/insights.js";
import { validateVoice } from "../lib/voices.js";
import { vertex, fingerprint } from "../lib/insight-vertex.js";
const rows = JSON.parse(
  await readFile(new URL("../data/voices.json", import.meta.url)),
);
const base = {
  company: rows[0].company,
  division: "導入支援部",
  role: "導入支援",
};
test("職種と部署を絞り、同部署の異なる経験を提示する", () => {
  const ctx = context(rows, {
    ...base,
    task: "qa",
    question: "顧客と会う機会は？",
  });
  assert.deepEqual(
    [...new Set(ctx.facts.map((f) => f.employee))],
    ["S01", "S02"],
  );
  const result = localResult(ctx);
  assert(
    result.ids.includes("S01.customers") &&
      result.ids.includes("S02.customers"),
  );
  const out = localResult(
    context(rows, {
      ...base,
      task: "analysis",
      conditions: [
        { label: "顧客対応が多い", priority: "絶対に避けたい" },
        { label: "転勤が多い", priority: "できれば避けたい" },
      ],
    }),
  );
  assert.deepEqual(
    out.items.map((r) => r.status),
    ["一部懸念あり", "情報不足"],
  );
  assert.deepEqual(out.items[1].ids, []);
});
test("別部署の引用や原文にない引用を許さない", () => {
  const ctx = context(rows, {
    ...base,
    task: "qa",
    question: "顧客に会いますか",
  });
  for (const ref of [
    { id: "S03.customers", quote: "顧客" },
    { id: "S01.customers", quote: "毎日訪問" },
  ])
    assert.throws(() => groundedResult(ctx, { answer: "...", refs: [ref] }));
  assert.equal(
    groundedResult(ctx, { answer: "断定", refs: [] }).answer,
    "情報が不足しています",
  );
});
test("回答は匿名の既知の項目だけ保存し、任意の空欄を許容", () => {
  const input = {
    ...rows[0],
    answers: { actualWork: "資料作成", private: "個人情報" },
  };
  assert.deepEqual(validateVoice(input).answers, { actualWork: "資料作成" });
  assert.throws(() => validateVoice({ ...input, answers: {} }));
  assert.throws(() =>
    validateVoice({
      ...input,
      answers: { tasks: "連絡先 sample@example.com" },
    }),
  );
});
test("入力に結びついた承認だけ許可し、確認質問まで1回で返す（模擬通信）", async (t) => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "workday-gate-")),
    old = process.cwd(),
    env = process.env.NODE_ENV;
  process.chdir(tmp);
  process.env.NODE_ENV = "development";
  t.after(async () => {
    process.chdir(old);
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    await rm(tmp, { recursive: true, force: true });
  });
  const ctx = context(rows, {
    ...base,
    task: "analysis",
    conditions: [{ label: "残業が多い", priority: "絶対に避けたい" }],
  });
  const result = {
    items: [
      {
        label: "残業が多い",
        status: "情報不足",
        explanation: "月合計は未記録。",
        refs: [{ id: "S01.overtime", quote: "月の合計時間は記録していない。" }],
        question: "繁忙月の残業時間を伺えますか？",
        reason: "合計時間を確認するため。",
      },
    ],
  };
  const send = t.mock.fn(async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
      usageMetadata: { promptTokenCount: 120, totalTokenCount: 180 },
    }),
  );
  const opts = { token: async () => "mock", send };
  await assert.rejects(vertex(ctx, opts));
  assert.equal(send.mock.callCount(), 0);
  const dir = ".workday-local/inference";
  await mkdir(dir, { recursive: true });
  await writeFile(
    dir + "/approval.json",
    JSON.stringify({
      project: "devfest-512005",
      model: "gemini-3.1-flash-lite",
      issuedAt: Date.now(),
      digest: fingerprint(ctx),
    }),
  );
  const out = await vertex(ctx, opts);
  assert.deepEqual(out.items[0].ids, ["S01.overtime"]);
  await assert.rejects(vertex(ctx, opts));
  assert.equal(send.mock.callCount(), 1);
});
