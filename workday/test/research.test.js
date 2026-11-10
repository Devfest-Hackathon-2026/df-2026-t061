import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  context,
  localResult,
  groundedResult,
  promptFor,
} from "../lib/insights.js";
import { studentQuestion, hasReferenceId } from "../lib/research.js";
const rows = JSON.parse(
  readFileSync(new URL("../data/voices.json", import.meta.url)),
);
const scope = (role = "", data = rows) =>
  context(data, { task: "research", company: rows[0].company, role });
test("predictions can expose distinct experiences in the same department; prompts do not give away the answer", () => {
  const p = localResult(scope("導入支援"));
  assert.ok(
    p.questions.some(
      (q) => q.ids.includes("S01.customers") && q.ids.includes("S02.customers"),
    ),
  );
  assert.ok(p.questions.every((q) => !q.text.includes("週3回")));
  assert.deepEqual(Object.keys(p), ["questions"]);
});
test("research uses evidence from the selected role and skips empty topics", () => {
  const ctx = scope("開発");
  assert.doesNotMatch(promptFor(ctx), /S02|S04/);
  assert.deepEqual(localResult(scope("不明")), {
    questions: [],
  });
  assert.deepEqual(
    localResult(
      scope("", [
        { ...rows[0], answers: { expectedWork: "実装が中心だと思った。" } },
      ]),
    ),
    { questions: [] },
  );
});
test("Gemini output must cite verbatim scoped evidence of the proper kind", () => {
  const ctx = scope("開発");
  const ref = (key) => {
    const f = ctx.facts.find((f) => f.key === key);
    return { id: f.id, quote: f.text };
  };
  const q = {
    text: "どんな作業を担当すると思いますか？",
    refs: [ref("actualWork")],
  };
  const run = (questions) => groundedResult(ctx, { questions });
  assert.deepEqual(run([q]).questions[0].ids, ["S03.actualWork"]);
  for (const refs of [
    [],
    [{ ...ref("actualWork"), id: "S02.actualWork" }],
    [{ ...ref("actualWork"), quote: "毎日ある" }],
  ])
    assert.throws(() => run([{ ...q, refs }]));
  assert.throws(() => run([]));
});
test("a respondent reporting no surprises does not become an interview concern", () => {
  const ctx = scope("", [
    {
      ...rows[0],
      answers: {
        actualWork: "マニュアルを書いた。",
        wish: "特にありません。",
        surprise: "特になし",
      },
    },
  ]);
  assert.deepEqual(
    localResult(ctx).questions.map((q) => q.topic),
    ["時間の使い方"],
  );
});
test("the app returns prediction questions in one authorized mock request and rejects repeats", async (t) => {
  const { mkdtemp, mkdir, writeFile, rm, readFile } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { POST } = await import("../app/api/insights/route.js");
  const { vertex } = await import("../lib/insight-vertex.js");
  const old = process.cwd(),
    env = process.env.NODE_ENV;
  const dir = await mkdtemp(join(tmpdir(), "research-gate-"));
  process.chdir(dir);
  process.env.NODE_ENV = "development";
  t.after(async () => {
    process.chdir(old);
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    await rm(dir, { recursive: true, force: true });
  });
  await mkdir("data");
  await writeFile("data/voices.json", JSON.stringify(rows));
  const body = { task: "research", company: rows[0].company, role: "開発" };
  const post = (extra) =>
    POST(
      new Request("http://localhost/api/insights", {
        method: "POST",
        headers: { Host: "localhost", Origin: "http://localhost" },
        body: JSON.stringify({ ...body, ...extra }),
      }),
    );
  const preview = await (await post({ mode: "local" })).json();
  assert.equal(preview.approved, false);
  assert.equal(
    (await post({ mode: "vertex", digest: preview.digest })).status,
    400,
  );
  const ctx = context(rows, body),
    source = (key) => {
      const f = ctx.facts.find((x) => x.key === key);
      return { id: f.id, quote: f.text };
    };
  const send = t.mock.fn(async (url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.contents[0].parts[0].text, /S03.wish/);
    assert.doesNotMatch(request.contents[0].parts[0].text, /S02|checklist/);
    assert.equal(request.generationConfig.maxOutputTokens, 2048);
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  questions: [
                    {
                      text: "新人が多く任される作業は何だと思いますか？",
                      refs: [source("actualWork")],
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });
  });
  const path = ".workday-local/inference";
  await mkdir(path, { recursive: true });
  await writeFile(
    path + "/approval.json",
    JSON.stringify({
      project: "devfest-512005",
      model: "gemini-3.1-flash-lite",
      issuedAt: Date.now(),
      digest: preview.digest,
    }),
  );
  assert.equal((await post({ mode: "vertex", digest: "changed" })).status, 400);
  const opts = { token: async () => "mock", send };
  const out = await vertex(ctx, opts);
  assert.deepEqual(Object.keys(out), ["questions"]);
  assert.deepEqual(out.questions[0].ids, ["S03.actualWork"]);
  await assert.rejects(vertex(ctx, opts));
  assert.equal(send.mock.callCount(), 1);
  const log = JSON.parse(
    await readFile(path + "/attempt-" + preview.digest + ".json"),
  );
  assert.equal(log.usage.candidatesTokenCount, 50);
});
test("a food production role uses five distinct evidenced perspectives and the next batch uses only remaining evidence", () => {
  const company = rows[0].company;
  const survey = [
    {
      ...rows[0],
      answers: {
        actualWork: "製造数の集計と現場との調整を担当します。",
        surprise: "生産予定が週に2回変わります。",
        authority: "出荷数量は責任者が承認します。",
        customers: "取引先への説明は営業が担当します。",
        other: "月に2回、朝礼のために早く出勤します。",
        training: "最初は先輩と一緒に集計します。",
      },
    },
  ];
  const first = context(survey, { company, task: "research" });
  const pack = localResult(first);
  assert.equal(pack.questions.length, 5);
  const used = pack.questions.map((q) => q.topic);
  assert.equal(new Set(used).size, 5);
  const second = context(survey, {
    company,
    task: "research",
    excludedTopics: used,
  });
  assert.deepEqual(
    localResult(second).questions.map((q) => q.topic),
    ["新人の教育"],
  );
  assert.notEqual(promptFor(first), promptFor(second));
  const modelQuestions = pack.questions.map((q) => ({
    text:
      "あなたがこの職場で働くとしたら、" +
      q.topic +
      "についてどう予想しますか？",
    refs: q.ids.map((id) => ({
      id,
      quote: first.facts.find((f) => f.id === id).text,
    })),
  }));
  const result = groundedResult(first, {
    questions: modelQuestions,
  });
  assert.deepEqual(
    result.questions.map((q) => q.text),
    modelQuestions.map((q) => q.text),
  );
  assert.deepEqual(
    result.questions.map((q) => q.topic),
    used,
  );
  for (const q of result.questions)
    assert.ok(
      q.ids.length && q.ids.every((id) => first.facts.some((f) => f.id === id)),
    );
});

test("a source ID in a prediction never reaches the student, including previously saved questions", () => {
  const ctx = scope("開発");
  const source = ctx.facts.find((f) => f.key === "actualWork");
  const text =
    "S03.actualWork を担当していた時期、具体的な障害の種類で、特に頻繁に発生していたものは何だったと思いますか？";
  const question = { text, ids: [source.id] };
  const fallback = localResult(ctx).questions.find((q) =>
    q.ids.includes(source.id),
  );
  assert.equal(studentQuestion(question, ctx.facts), fallback.text);
  assert.doesNotMatch(fallback.text, /障害の種類|頻繁|どれくらい時間/);
  assert.ok(hasReferenceId("Ｓ０３．actualWorkについて", ctx.facts));
  const normal =
    "開発部で働くとしたら、先輩からよく頼まれそうなのはどんな作業ですか？";
  assert.equal(
    studentQuestion({ ...question, text: normal }, ctx.facts),
    normal,
  );
  const out = groundedResult(ctx, {
    questions: [{ text, refs: [{ id: source.id, quote: source.text }] }],
  });
  assert.equal(
    out.questions.find((q) => q.topic === fallback.topic).text,
    fallback.text,
  );
});

test("retrospective employee questions are repaired both after generation and when showing a saved prompt", () => {
  const ctx = scope("開発");
  const actual = ctx.facts.find((f) => f.key === "actualWork");
  const text = "配属当初、社員はどのような業務に注力していましたか？";
  const saved = { text, ids: [actual.id], topic: "時間の使い方" };
  const replacement = localResult(ctx).questions.find(
    (q) => q.topic === saved.topic,
  ).text;
  assert.equal(studentQuestion(saved, ctx.facts), replacement);
  const result = groundedResult(ctx, {
    questions: [{ text, refs: [{ id: actual.id, quote: actual.text }] }],
  });
  assert.equal(result.questions[0].text, replacement);
  assert.deepEqual(result.questions[0].ids, [actual.id]);
  assert.match(replacement, /配属されたら/);
});
