import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCsv, interviewValues, questions } from "../lib/interview.js";
import { registrationDraft, validDay, presets } from "../lib/day.js";
test("フォームのCSV見本から4場面に回答を反映する", () => {
  const csv = readCsv(
    readFileSync(
      new URL("../public/interview-example.csv", import.meta.url),
      "utf8",
    ),
  );
  const mapping = Object.fromEntries(
    questions.map(([k, label]) => [k, csv.headers.indexOf(label)]),
  );
  const draft = registrationDraft(
    interviewValues(csv.responses[0], mapping, csv.headers),
  );
  assert.ok(validDay(draft));
  assert.match(draft.time_slots[1].situation, /出典/);
  assert.equal(draft.time_slots[3].choices[0].text, "変更の理由も添える");
  assert.equal(
    draft.time_slots[2].company_culture_explanation,
    "読者が必要とする情報を優先します。",
  );
});
test("複数回答・引用符・改行を保持し、不完全なCSVを拒否する", () => {
  assert.deepEqual(
    readCsv('\uFEFF名前,回答\r\n会社,"a,b\n""c"""\r\n会社2,他\r\n').responses,
    [
      ["会社", 'a,b\n"c"'],
      ["会社2", "他"],
    ],
  );
  assert.throws(() => readCsv("a,b\nx"));
  assert.throws(() => readCsv('a\n"x'));
  assert.throws(() => interviewValues(["会社"], { company: 0 }));
});
test("登録済みの架空21社には有効なシナリオがある", () => {
  assert.equal(new Set(presets.map((d) => d.company)).size, 21);
  assert.ok(presets.every(validDay));
});

test("一括取り込みで登録可能な回答・A/B未指定・必須回答不足を区別する", async () => {
  const { planBatch } = await import("../lib/interview.js");
  const csv = readCsv(
    readFileSync(
      new URL("../public/interview-example.csv", import.meta.url),
      "utf8",
    ),
  );
  const mapping = Object.fromEntries(
    questions.map(([key, label]) => [key, csv.headers.indexOf(label)]),
  );
  const second = csv.responses[0].slice();
  second[mapping.company] = "別会社";
  second[csv.headers.indexOf("11:00 文化に合う行動")] = "ｂ";
  const third = second.slice();
  third[csv.headers.indexOf("17:00 文化に合う行動")] = "不明";
  const fourth = second.slice();
  fourth[mapping.culture] = "";
  csv.responses.push(second, third, fourth);
  const { ready, pending } = planBatch(csv, mapping);
  assert.equal(ready.length, 2);
  assert.ok(ready.every(validDay));
  assert.ok(ready[1].time_slots[1].choices[1].actual_culture_match);
  assert.deepEqual(pending[0].missing, ["17:00"]);
  assert.ok(pending[1].error);
});

test("企業ヒアリング形式は会社別に取り込み、明示された判断だけを採点する", async () => {
  const { planBatch } = await import("../lib/interview.js");
  const headers = [
    "企業名",
    "事業部・部署",
    "職種",
    "ご記入者（お名前・役職）",
    "3. 1年目の実際の仕事（5つ）",
    "9. 正解のない判断場面（3つ）",
  ];
  const row = [
    "甲社",
    "編集部",
    "校正",
    "PRIVATE",
    "索引の校正\n\nトラブル・失敗の実例\n見出しが違う。\n急な割り込みの例\n著者から問い合わせ。",
    "【掲載判断】\n出典が不明です。\n→推奨：元資料を調べる\n→避ける：そのまま掲載",
  ];
  const { ready, pending } = planBatch(
    {
      headers,
      responses: [
        row,
        ["乙社", ...row.slice(1)],
        ["丙社", "営業", "営業", "PRIVATE", "", "あ"],
      ],
    },
    {},
  );
  assert.equal(ready.length, 2);
  assert.equal(pending.length, 1);
  assert.ok(!JSON.stringify(ready).includes("PRIVATE"));
  const slots = ready[0].time_slots;
  assert.equal(slots[1].situation, "見出しが違う。");
  assert.equal(slots[3].situation, "著者から問い合わせ。");
  assert.deepEqual(
    slots.map((s) => s.choices[0].actual_culture_match),
    [null, null, true, null],
  );
});

test("番号付きの場面→対応を3件とも順番通りに登録し、回答のない正誤を付けない", async () => {
  const { hearingDay } = await import("../lib/hearing.js");
  const headers = [
    "企業名",
    "事業部・部署",
    "職種",
    "3. 1年目の実際の仕事（5つ）",
    "9. 正解のない判断場面（3つ）",
  ];
  const row = [
    "例社",
    "制作部",
    "制作",
    "原稿の確認",
    "① 初稿か再校か。→初稿を先に確認。\n② 修正か再作成か。→時間を比較。\n③ 変更を受けるか。→目的を確認。",
  ];
  const day = hearingDay(headers, row);
  assert.ok(validDay(day));
  assert.deepEqual(
    day.time_slots.map((s) => s.situation),
    ["原稿の確認", "初稿か再校か。", "修正か再作成か。", "変更を受けるか。"],
  );
  assert.ok(
    day.time_slots.every((s) =>
      s.choices.every((c) => c.actual_culture_match === null),
    ),
  );
  assert.match(day.time_slots[2].company_culture_explanation, /時間を比較/);
  assert.throws(
    () => hearingDay(headers, [...row.slice(0, 4), "① 質問→"]),
    /正解のない判断場面/,
  );
});

test("最新版の全項目回答と任意欄が空の回答を同時に取り込む", async () => {
  const { planBatch } = await import("../lib/interview.js");
  const headers = ["企業名", "職種", "具体的な職種名", "3. 業務時間の割合",
    "3. 1年目の実際の仕事（5つ）", "9. 正解のない判断場面（3つ）"];
  const dilemma = ["納期", "仕様", "引き継ぎ"].map((topic) =>
    "【" + topic + "】相談が来た。推奨：確認する。避ける判断：未確認で進める。"
  ).join("\n\n");
  const { ready, pending } = planBatch({ headers, responses: [
    ["甲", "企画", "商品企画", "集計 3割", "売上を集計", dilemma],
    ["乙", "開発", "開発担当", "", "仕様を確認", dilemma],
  ] }, {});
  assert.deepEqual(pending, []);
  assert.deepEqual(ready.map(d => [d.company, d.division, d.role]), [
    ["甲", "部署未指定", "商品企画"], ["乙", "部署未指定", "開発担当"],
  ]);
  for (const day of ready) {
    assert.ok(validDay(day));
    assert.deepEqual(day.time_slots.slice(1).map(s => s.situation), [
      "【納期】相談が来た。", "【仕様】相談が来た。", "【引き継ぎ】相談が来た。",
    ]);
    for (const slot of day.time_slots.slice(1)) {
      assert.deepEqual(slot.choices.map(c => [c.text, c.actual_culture_match]), [
        ["確認する。", true], ["未確認で進める。", false],
      ]);
    }
  }
});
