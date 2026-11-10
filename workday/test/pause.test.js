import test from "node:test";
import assert from "node:assert/strict";
import { validPause, scenarioKey } from "../lib/pause.js";
import { demo, salesDay } from "../lib/day.js";

test("全4場面で未入力または編集中の中断データを保存・復元できる", () => {
  for (let step = 0; step < 4; step++) {
    const answers = Array.from({ length: step }, () => ({
      id: "B",
      why: "共有したい",
    }));
    for (const [id, why] of [
      ["", ""],
      ["A", "  書きかけ…"],
    ]) {
      const p = { day: demo, step, answers, id, why };
      const restored = JSON.parse(JSON.stringify(p));
      assert.ok(validPause(restored));
      assert.deepEqual(restored, p);
    }
  }
  assert.notEqual(scenarioKey(demo), scenarioKey(salesDay));
});
test("場面と合わない履歴や破損した保存データを拒否する", () => {
  assert.ok(!validPause(null));
  assert.ok(!validPause({ day: demo, step: 2, answers: [], id: "A", why: "" }));
});
