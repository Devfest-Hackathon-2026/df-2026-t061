import test from "node:test";
import assert from "node:assert/strict";
import { demo } from "../lib/day.js";
test("企業登録・退勤レポート・不正なモデル応答を模擬通信で確認", async (t) => {
  process.env.GOOGLE_CLOUD_PROJECT = "local-test";
  process.env.VERTEX_MODEL = "test-model";
  const { handleWorkday } = await import("../lib/workday-server.js");
  const POST = (req) => handleWorkday(req, true);
  const registration = {
    task: "scenario",
    company: "架空社",
    division: "開発",
    role: "技術職",
    scenario_title: "業務体験",
    episode: "引き継ぎ前に不具合を発見した",
    culture: "早めに相談する",
  };
  let output = demo,
    captured;
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    if (url.startsWith("http://metadata."))
      return Response.json({ access_token: "mock" });
    assert.equal(opts.headers.Authorization, "Bearer mock");
    captured = JSON.parse(opts.body);
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
    });
  });
  const post = (b) =>
    POST(
      new Request("http://local/api/workday", {
        method: "POST",
        body: JSON.stringify(b),
      }),
    );
  const generated = await post(registration);
  assert.equal(generated.status, 200);
  const { day } = await generated.json();
  assert.equal(day.company, registration.company);
  assert.ok(captured.contents[0].parts[0].text.includes(registration.episode));
  output = { summary: "相談の時機について振り返りましょう。" };
  const history = day.time_slots.map(() => ({
    id: "B",
    why: "判断の根拠を共有したい",
  }));
  const feedback = await post({ task: "report", day, history });
  assert.equal((await feedback.json()).summary, output.summary);
  assert.ok(captured.contents[0].parts[0].text.includes(history[0].why));
  output = {};
  assert.equal((await post(registration)).status, 502);
});

test("資格情報の設定があっても実アプリの外部送信は0回", async (t) => {
  const network = t.mock.method(globalThis, "fetch", () => {
    throw Error("外部通信");
  });
  const { GET, POST } = await import("../app/api/workday/route.js");
  const { registrationDraft, validDay } = await import("../lib/day.js");
  const values = {
    company: "検証社",
    division: "開発",
    role: "担当",
    scenario_title: "一日",
    episode: "仕様の疑問",
    culture: "早期に相談",
  };
  const d = registrationDraft(values);
  assert.ok(validDay(d));
  assert.equal(d.time_slots[0].situation, values.episode);
  assert.equal((await (await GET()).json()).enabled, false);
  const post = (b) =>
    POST(
      new Request("http://local/api/workday", {
        method: "POST",
        body: JSON.stringify(b),
      }),
    );
  assert.equal((await post({ ...values, task: "scenario" })).status, 503);
  assert.deepEqual(
    await (
      await post({
        task: "report",
        day: d,
        history: d.time_slots.map(() => ({ id: "A", why: "相談する" })),
      })
    ).json(),
    { mode: "local" },
  );
  assert.equal(network.mock.callCount(), 0);
});
