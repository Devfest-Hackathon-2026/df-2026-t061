import test from "node:test";
import assert from "node:assert/strict";
import { demo, validDay, validHistory, review } from "../lib/day.js";
test("4場面を完走した履歴を理由ごと照合する", () => {
  const history = demo.time_slots.map((s) => ({
    id: s.choices.find((c) => c.actual_culture_match).id,
    why: "チームの判断材料を共有したい",
  }));
  assert.ok(validDay(demo));
  assert.ok(validHistory(demo, history));
  assert.equal(review(demo, history).filter((r) => r.match).length, 4);
  assert.equal(review(demo, history)[3].why, history[3].why);
  assert.equal(validHistory(demo, history.slice(1)), false);
  history[0].why = " ";
  assert.equal(validHistory(demo, history), false);
});
test("時刻・選択肢が壊れた生成結果を拒否する", () => {
  const broken = structuredClone(demo);
  broken.time_slots[1].time = "16:00";
  assert.equal(validDay(broken), false);
  broken.time_slots[1] = broken.time_slots[0];
  assert.equal(validDay(broken), false);
  broken.time_slots[1] = structuredClone(demo.time_slots[1]);
  broken.time_slots[1].choices[0].id = "B";
  assert.equal(validDay(broken), false);
});
