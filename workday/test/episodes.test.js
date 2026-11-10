import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  importEpisodes,
  mergeSources,
  revise,
  basisFor,
  aftermath,
  unknownNext,
  briefing,
  reviewFile,
  importReview,
} from "../lib/episodes.js";
const text = readFileSync(
  new URL("../public/episode-v2.csv", import.meta.url),
  "utf8",
);
const { sources, errors } = importEpisodes(text);
test("2社の実話を非公開で読み込み、観測・予想・不明を区別する", () => {
  assert.deepEqual(errors, []);
  const batch = mergeSources([], sources);
  assert.equal(batch.added, 2);
  assert.ok(batch.records.every((r) => r.status === "下書き"));
  const [a, b] = batch.records;
  assert.equal(basisFor(a.source, "A"), "実際に起きたこと");
  assert.equal(basisFor(a.source, "B"), "経験上の予想");
  assert.equal(b.script.nextA, unknownNext);
  assert.equal(b.script.nextB, b.source.outcome);
  const prompt = briefing(a.source);
  for (const key of [
    "actual",
    "outcome",
    "alternative",
    "exception",
    "frequency",
  ])
    assert.ok(!(key in prompt));
});
test("編集、再承認、変更回答、同一CSVの再取り込みを区別する", () => {
  let rows = mergeSources([], sources).records,
    first = rows[0];
  const changes = {
    status: "承認済み",
    script: first.script,
    checks: [0, 1, 2],
  };
  assert.throws(() => revise(rows, first, { ...changes, checks: [0, 1] }));
  rows = revise(rows, first, changes);
  assert.throws(() => revise(rows, first, changes));
  assert.equal(mergeSources(rows, sources).records[0].status, "承認済み");
  const updated = mergeSources(rows, [
    { ...first.source, outcome: "別の返事" },
  ]).records;
  assert.equal(updated[0].status, "下書き");
  assert.deepEqual(updated[0].checks, []);
  assert.throws(() => importReview(updated, reviewFile(first)), /最新/);
});
test("端末間で渡した台本を再確認し、不明な側の創作を拒否する", () => {
  const [, b] = mergeSources([], sources).records;
  const file = reviewFile(b);
  assert.equal(
    importReview([], { ...file, status: "承認済み" })[0].status,
    "下書き",
  );
  assert.throws(
    () =>
      importReview([], {
        ...file,
        script: { ...file.script, nextA: "上司に怒られた" },
      }),
    /根拠/,
  );
});
test("不正な行だけ理由を返し、旧形式を新版として扱わない", () => {
  const mixed = text.replace('"経験上の予想"', '"想像"');
  assert.equal(importEpisodes(mixed).sources.length, 1);
  assert.match(importEpisodes(mixed).errors[0], /回答1/);
  assert.throws(() => importEpisodes("企業名,職種\n甲社,営業"), /新版/);
});

test("不明な側を生成対象から除き、予想には推定の区分を維持する", () => {
  const a = aftermath(sources[0]),
    b = aftermath(sources[1]);
  assert.equal(a.branches.nextA.type, "observed");
  assert.equal(a.branches.nextB.type, "expected");
  assert.deepEqual(Object.keys(b.branches), ["nextB"]);
});
test("同一CSVに異なる同名の実話があっても後ろの行で上書きしない", () => {
  const firstRow = text.split("\r\n")[1];
  const parsed = importEpisodes(
    text + firstRow.replace("導入前の月末に1、2回", "隔週"),
  );
  assert.equal(parsed.sources.length, 1);
  assert.match(parsed.errors[0], /同じ名前/);
});
