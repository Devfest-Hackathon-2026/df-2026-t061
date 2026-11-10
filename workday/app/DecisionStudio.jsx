"use client";
import { useState } from "react";
import { demoCase, sourceFor } from "../lib/decision";
import { useNano } from "./useNano";

function NanoAction({ ai, label, onClick }) {
  if (ai.status === "checking") return <p>準備中…</p>;
  if (ai.status === "unavailable") return <p>このブラウザーでは質問の作成を利用できません。</p>;
  return <div>
    {ai.status !== "available" && <p>初回は質問を作るためのダウンロードが必要です。</p>}
    <button className="primary" disabled={ai.busy} onClick={onClick}>{ai.busy ? "作成中…" : label}</button>
    {ai.error && <p role="alert">{ai.error}</p>}
  </div>;
}

export function InterviewQuestion({ data }) {
  const ai = useNano();
  const [insight, setInsight] = useState(null);
  return <section className="interview-note">
    <h3>社員に聞いてみたいこと</h3>
    {insight ? <>
      <p>{insight.reflection}</p><blockquote>{insight.question}</blockquote>
      <small>あなたの考えと社員の回答をもとにAIが作成した質問案</small>
    </> : <>
      <p>「{data.why}」という考え方が、この職場ではどんな場面で通用するか、社員に確かめてみましょう。</p>
      <NanoAction ai={ai} label="自分の理由から面接の一問を作る" onClick={() => ai.run("feedback", data, setInsight)} />
    </>}
  </section>;
}

export function DecisionStudio({ catalog, initialDay, exit }) {
  const ai = useNano();
  const [sourceId, setSourceId] = useState(initialDay ? String(catalog.indexOf(initialDay)) : "example");
  const [index, setIndex] = useState(1);
  const [card, setCard] = useState(null);
  const [phase, setPhase] = useState("select");
  const [confirmExit, setConfirmExit] = useState(false);
  const [choice, setChoice] = useState("");
  const [why, setWhy] = useState("");
  const [reply, setReply] = useState("");
  const sourceDay = catalog[Number(sourceId)];
  function start(data) {
    setCard(data); setChoice(""); setWhy(""); setReply(""); setPhase("morning");
  }
  const action = card?.["action" + choice];
  const follow = card?.["next" + choice];
  return <section className="panel decision-studio">
    <button className="link" onClick={() => {
      if (phase === "morning" || phase === "afternoon") setConfirmExit(true);
      else exit();
    }}>← 企業一覧</button>
    {confirmExit && <div role="group" aria-label="体験を終了するか確認">
      <p>入力中の判断を破棄して企業一覧へ戻りますか？</p>
      <button className="primary" onClick={()=>setConfirmExit(false)}>体験を続ける</button>{" "}
      <button className="link" onClick={exit}>終了する</button>
    </div>}
    {phase === "select" ? <>
      <h2>午前の判断が、午後の仕事になる。</h2>
      <label>体験する仕事<select disabled={ai.busy} value={sourceId} onChange={e => {setSourceId(e.target.value); setIndex(1);}}>
        <option value="example">DXコンサルタントの体験例</option>
        {catalog.map((d,i) => <option key={i} value={i}>{d.company} ／ {d.role} ／ {d.scenario_title}</option>)}
      </select></label>
      {sourceId === "example" ? <>
        <p>独自機能を求める顧客にどう応えるか。用意した台本で、選んだ先の仕事を体験できます。</p>
        <button className="primary" disabled={ai.busy} onClick={() => start({...demoCase, origin:"体験用の台本"})}>分岐を体験する →</button>
        <NanoAction ai={ai} label="同じ材料でGemini Nanoの分岐を作る" onClick={()=>{
          const {company, source, evidence} = demoCase;
          const ref = {company, source, evidence};
          ai.run("scene",ref,result=>start({...ref,...result,origin:"Gemini Nanoによる模擬場面"}));
        }}/>
      </> : sourceDay && <>
        <label>判断の材料<select disabled={ai.busy} value={index} onChange={e=>setIndex(Number(e.target.value))}>
          {sourceDay.time_slots.map((s,i)=><option key={s.time} value={i}>{s.time}　{s.situation.slice(0,45)}</option>)}
        </select></label>
        <p>{sourceDay.time_slots[index].situation}</p>
        <NanoAction ai={ai} label="Gemini Nanoで2通りの続きを作る" onClick={()=>{
          const ref = sourceFor(sourceDay,index);
          ai.run("scene",ref,result=>start({...ref,...result,origin:"Gemini Nanoによる模擬場面"}));
        }}/>
        <button className="link" disabled={ai.busy} onClick={()=>setSourceId("example")}>用意した体験例を選ぶ</button>
      </>}
    </> : <>
      <small>{card.company} ／ {card.origin}</small>
      {phase === "morning" && <>
        <h2>11:00　次の30分をどう使いますか？</h2>
        <p>{card.scene}</p>
        {["A","B"].map(id=><button className="choice" aria-pressed={choice===id} key={id} onClick={()=>setChoice(id)}>{id}　{card["action"+id]}</button>)}
        <label>何を優先しましたか？<textarea maxLength={300} value={why} onChange={e=>setWhy(e.target.value)}/></label>
        <button className="primary" disabled={!choice || !why.trim()} onClick={()=>setPhase("afternoon")}>この判断で午後へ →</button>
      </>}
      {phase === "afternoon" && <>
        <h2>14:00　相手から返事が来ました</h2><small>午前の行動　{action}</small>
        <blockquote>{follow}</blockquote>
        <label>相手に何と返しますか？<textarea maxLength={300} value={reply} onChange={e=>setReply(e.target.value)}/></label>
        <button className="primary" disabled={!reply.trim()} onClick={()=>setPhase("review")}>振り返る →</button>
      </>}
      {phase === "review" && <>
        <h2>18:00　判断の振り返り</h2>
        <p>選んだ行動　{action}<br/>理由　{why}</p>
        <p>午後の依頼　{follow}<br/>あなたの返答　{reply}</p>
        <h3>シナリオの根拠</h3>
        <p>{card.source}</p><blockquote>{card.evidence}</blockquote>
        {card.context?.length > 0 && <details><summary>ヒアリングにある日常業務の記述</summary>
          {card.context.map((note,i)=><p key={i}>{note}</p>)}
        </details>}
        <details><summary>もう一方の行動なら？</summary><p>{card["action"+(choice==="A"?"B":"A")]}</p><p>{card["next"+(choice==="A"?"B":"A")]}</p></details>
        <InterviewQuestion data={{action,why,follow,reply,evidence:card.evidence}}/>
        <button className="link" onClick={()=>start(card)}>午前の判断を選び直す</button>
      </>}
    </>}
  </section>;
}
