import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { importEpisodes, draft } from "../lib/episodes.js";
import {
  groupResponses,
  material,
  makeTeam,
  sourcesCurrent,
  saveTeam,
  teamFields,
} from "../lib/team.js";
import { runOnce } from "../lib/team-once.js";
const sample = await readFile(
  new URL("../public/team-experiment.csv", import.meta.url),
  "utf8",
);
const records = importEpisodes(sample).sources.map((s) => ({
  ...draft(s),
  status: "承認済み",
}));
const example = Object.fromEntries(teamFields.map((k) => [k, k + "の本文"]));
example.openingQuestion = "伝票の入力欄を変更する約束は新人ができますか？";
test("アップロードした回答をチーム別にまとめ、元回答の個別承認なしで生成する", () => {
  const raw = records.map((r) => draft(r.source)),
    different = draft({ ...raw[0].source, division: "別部署" });
  const groups = groupResponses([raw[2], different, raw[1], raw[0]]);
  assert.deepEqual(
    groups.map((g) => g.length),
    [3, 1],
  );
  assert.deepEqual(material(groups[0]), material(records));
  assert.throws(() => material([raw[0], different]));
  assert.equal(makeTeam([raw[0]], example, "test").team.inputs.length, 1);
  const missingDept = raw
    .slice(0, 2)
    .map((r) => draft({ ...r.source, division: "" }));
  assert.equal(groupResponses(missingDept).length, 2);
});
test("社員の体験後にだけ掲載し、掲載済みの変更は再掲載まで学生に見せない", () => {
  const raw = records.map((r) => draft(r.source)),
    r = makeTeam(raw, example, "test"),
    rows = [...raw, r];
  assert.deepEqual(
    r.team.inputs.map((s) => s.condition),
    raw.map((r) => r.source.switchCondition),
  );
  assert.throws(() => saveTeam(rows, r, r.script, null, "承認済み"));
  const played = saveTeam(rows, r, r.script, "B", "下書き"),
    reviewed = played.at(-1);
  assert.equal(reviewed.status, "下書き");
  const live = saveTeam(
      played,
      reviewed,
      reviewed.script,
      reviewed.playedBranch,
      "承認済み",
    ),
    liveCase = live.at(-1);
  const edits = saveTeam(
    live,
    liveCase,
    { ...liveCase.script, nextA: "修正済み" },
    "A",
    "下書き",
  );
  assert.equal(edits.at(-1).status, "承認済み");
  assert.equal(edits.at(-1).script.nextA, r.script.nextA);
  assert.equal(edits.at(-1).working.script.nextA, "修正済み");
  assert.equal(
    sourcesCurrent(
      r,
      live.map((x, i) => (i === 0 ? { ...x, revision: x.revision + 1 } : x)),
    ),
    false,
  );
});
async function setup(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "team-guard-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return {
    sample,
    dir,
    approved: true,
    token: async () => "mock",
    requested: material(records),
  };
}
test("審査前・見本以外の入力ではモデル通信ゼロ", async (t) => {
  const base = await setup(t);
  const send = t.mock.fn();
  await assert.rejects(runOnce({ ...base, approved: false, fetcher: send }));
  await assert.rejects(runOnce({ ...base, requested: [], fetcher: send }));
  assert.equal(send.mock.callCount(), 0);
});
test("並行実行、再読込でも最大1回。料金・トークン数を保存", async (t) => {
  const base = await setup(t);
  const fetcher = t.mock.fn(async (url, opts) => {
    const payload = JSON.parse(opts.body);
    assert.equal(payload.tools, undefined);
    assert.equal(payload.generationConfig.maxOutputTokens, 2048);
    return Response.json({
      usageMetadata: { promptTokenCount: 100, totalTokenCount: 160 },
      candidates: [{ content: { parts: [{ text: JSON.stringify(example) }] } }],
    });
  });
  const calls = await Promise.allSettled([
    runOnce({ ...base, fetcher }),
    runOnce({ ...base, fetcher }),
  ]);
  assert.ok(calls.some((c) => c.status === "fulfilled"));
  const cache = await runOnce({ ...base, fetcher });
  assert.equal(fetcher.mock.callCount(), 1);
  assert.equal(cache.audit.outputTokens, 60);
  assert.equal(cache.audit.estimatedUSD, 0.000115);
});
test("失敗・タイムアウト後も枠を戻さず自動再送なし", async (t) => {
  const base = await setup(t),
    fetcher = t.mock.fn(async () => {
      throw Error("timeout");
    });
  await assert.rejects(runOnce({ ...base, fetcher }));
  await assert.rejects(runOnce({ ...base, fetcher }), /予約済み/);
  assert.equal(fetcher.mock.callCount(), 1);
});

test("冒頭には依頼に即した問いと異なる予想が必要。旧台本は再生成せず保存できる", () => {
  const r = makeTeam(records, example, "test");
  for (const modified of [
    { openingQuestion: "この職種の新人は何を決めますか？" },
    { predictionB: example.predictionA },
    { openingQuestion: "" },
  ])
    assert.throws(() => makeTeam(records, { ...example, ...modified }, "test"));
  const legacy = { ...r, script: { ...example } };
  for (const k of ["openingQuestion", "predictionA", "predictionB"])
    delete legacy.script[k];
  assert.doesNotThrow(() =>
    saveTeam([...records, legacy], legacy, legacy.script, "A", "下書き"),
  );
});
