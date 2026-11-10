"use client";
import { useState } from "react";
import Office from "./Office";
import { PauseButton } from "./PauseButton";
import { InterviewQuestion } from "./DecisionStudio";
import { TeamEvidence } from "./TeamLab";
import { hasPrediction } from "../lib/team";
import { basisFor } from "../lib/episodes";

export const pauseStore = "workday.episode-pause.v2";
export function EpisodePlay({
  record,
  initial,
  exit,
  onPause,
  preview = false,
}) {
  const s = record.source,
    c = record.script;
  // Older published scripts have no generated prediction; open their actual mission directly.
  const prediction = hasPrediction(c);
  const firstPhase = prediction ? "before" : "decision";
  const [phase, setPhase] = useState(
      !initial?.phase || initial.phase === "before"
        ? firstPhase
        : initial.phase,
    ),
    [expect, setExpect] = useState(initial?.expect || "");
  const [action, setAction] = useState(initial?.action || ""),
    [why, setWhy] = useState(initial?.why || "");
  const [reply, setReply] = useState(initial?.reply || ""),
    [after, setAfter] = useState(initial?.after || "");
  const [error, setError] = useState("");
  function branchBasis(id) {
    if (!record.team) return basisFor(s, id);
    return record.team.unknownBranch === id ? "結果は不明" : "仮想の展開";
  }
  function pause() {
    try {
      onPause({
        id: record.id,
        revision: record.revision,
        phase,
        expect,
        action,
        why,
        reply,
        after,
      });
    } catch {
      setError("中断データを保存できませんでした。体験は続けられます。");
    }
  }
  return (
    <>
      <div className="case-meta">
        <span>
          {s.company} ／ {s.role}
        </span>
        {!preview && phase !== "report" && <PauseButton onPause={pause} />}
      </div>
      {preview && (
        <small>社員プレビューでは、自由記述を空欄のまま進められます。</small>
      )}
      <div className="gridwrap">
        <div className="art">
          <div className="artbar">OFFICE VIEW</div>
          <Office
            active
            step={phase === "next" ? 2 : phase === "report" ? 3 : 0}
          />
          <div className="caption">{s.title}</div>
        </div>
        <section className="panel case-editor">
          {phase === "before" && (
            <>
              <h2>出社前の予想</h2>
              <p>{record.team?.inputs[0]?.request || s.request}</p>
              <blockquote>{c.openingQuestion}</blockquote>
              {[c.predictionA, c.predictionB, "まだ分からない"].map(
                (option) => (
                  <button
                    key={option}
                    className="choice"
                    aria-pressed={expect === option}
                    onClick={() => setExpect(option)}
                  >
                    {option}
                  </button>
                ),
              )}
              <button
                className="primary"
                disabled={!preview && !expect.trim()}
                onClick={() => setPhase("decision")}
              >
                依頼を受ける →
              </button>
            </>
          )}
          {phase === "decision" && (
            <>
              <h2>新人としてどう動きますか？</h2>
              {record.team && <small>企業の回答をもとにした模擬ケース</small>}
              <blockquote>{c.scene}</blockquote>
              <dl>
                {[
                  ["手元の情報", s.known],
                  ["まだ不明なこと", s.unknown],
                  ["任されている範囲", s.authority],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v || "未入力"}</dd>
                  </div>
                ))}
              </dl>
              {["A", "B"].map((id) => (
                <button
                  key={id}
                  className="choice"
                  aria-pressed={action === id}
                  onClick={() => setAction(id)}
                >
                  {id}　{c["action" + id]}
                </button>
              ))}
              <label>
                その行動で何を守りたいですか？
                <textarea
                  maxLength={300}
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={!action || (!preview && !why.trim())}
                onClick={() => setPhase("next")}
              >
                選んだ先へ →
              </button>
            </>
          )}
          {phase === "next" && (
            <>
              <h2>判断の続き</h2>
              <small>{branchBasis(action)}</small>
              <blockquote>{c["next" + action]}</blockquote>
              <label>
                次に、誰に何を伝えますか？
                <textarea
                  value={reply}
                  maxLength={300}
                  onChange={(e) => setReply(e.target.value)}
                />
              </label>
              <label>
                体験を経て、新人の仕事を今はどう説明しますか？
                <textarea
                  value={after}
                  maxLength={300}
                  onChange={(e) => setAfter(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={!preview && (!reply.trim() || !after.trim())}
                onClick={() => setPhase("report")}
              >
                退勤して振り返る →
              </button>
            </>
          )}
          {phase === "report" && (
            <>
              <h2>退勤レポート</h2>
              <dl>
                {[
                  ...(prediction
                    ? [
                        ["最初の問い", c.openingQuestion],
                        ["出社前の予想", expect],
                      ]
                    : expect
                      ? [["出社前の予想", expect]]
                      : []),
                  ["体験後の仕事のイメージ", after],
                  ["選んだ行動", c["action" + action]],
                  ["選んだ理由", why],
                  ["次の一手", reply],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v || "未入力"}</dd>
                  </div>
                ))}
              </dl>
              {record.team ? (
                <>
                  <h3>同じチームでも判断が変わる理由</h3>
                  <p>{c.common}</p>
                  <blockquote>{c.contrast}</blockquote>
                  <TeamEvidence r={record} />
                </>
              ) : (
                <>
                  <h3>現場で実際に起きたこと</h3>
                  <p>社員が選んだ行動　{s["action" + s.actual]}</p>
                  <blockquote>{s.outcome}</blockquote>
                  <p>起こる頻度　{s.frequency}</p>
                  <p>例外・誤解してほしくない点　{s.exception}</p>
                </>
              )}
              <details>
                <summary>もう一方の選択を見る</summary>
                <p>{c["action" + (action === "A" ? "B" : "A")]}</p>
                <small>{branchBasis(action === "A" ? "B" : "A")}</small>
                <p>{c["next" + (action === "A" ? "B" : "A")]}</p>
              </details>
              {!record.team && (
                <InterviewQuestion
                  data={{
                    action: c["action" + action],
                    why,
                    reply,
                    follow: c["next" + action],
                    evidence: s.outcome,
                    exception: s.exception,
                    expect,
                    after,
                  }}
                />
              )}
              <button className="primary" onClick={() => exit(action)}>
                {preview ? "もう一方の展開を確認する →" : "企業一覧に戻る"}
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
