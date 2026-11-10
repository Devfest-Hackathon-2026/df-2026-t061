import test from "node:test";
import assert from "node:assert/strict";
import { generateLocal, demoCase, sourceFor } from "../lib/decision.js";
import { demo } from "../lib/day.js";

test("端末内の生成に選択・理由・根拠を渡し、1回の生成後にセッションを閉じる", async t => {
  let calls=0, closed=0;
  t.mock.method(globalThis, "fetch", ()=>assert.fail("外部送信"));
  const original = globalThis.LanguageModel;
  globalThis.LanguageModel = {create: async options=>{
    assert.deepEqual(options.expectedOutputs[0].languages,["ja"]);
    return {prompt:async(text, options)=>{
      calls++;
      assert.ok(text.includes("顧客の負担を減らしたい"));
      assert.ok(text.includes(demoCase.evidence));
      assert.deepEqual(options.responseConstraint.required,["reflection","question"]);
      return JSON.stringify({reflection:"顧客の負担を優先しました。",question:"例外を誰が判断しますか？"});
    },destroy(){closed++;}};
  }};
  t.after(()=>{ if(original) globalThis.LanguageModel=original; else delete globalThis.LanguageModel; });
  const output=await generateLocal("feedback",{action:demoCase.actionA,why:"顧客の負担を減らしたい",evidence:demoCase.evidence},new AbortController().signal);
  assert.equal(output.question,"例外を誰が判断しますか？");
  assert.equal(calls,1);assert.equal(closed,1);
});

test("分岐が同じ生成結果は表示せず、再試行しない", async t=>{
  let closed=0,calls=0;
  const original=globalThis.LanguageModel;
  globalThis.LanguageModel={create:async()=>({prompt:async()=>{calls++;return JSON.stringify({...demoCase,nextB:demoCase.nextA})},destroy(){closed++}})};
  t.after(()=>{ if(original) globalThis.LanguageModel=original; else delete globalThis.LanguageModel; });
  await assert.rejects(generateLocal("scene",sourceFor(demo,1),new AbortController().signal));
  assert.equal(calls,1);assert.equal(closed,1);
});
