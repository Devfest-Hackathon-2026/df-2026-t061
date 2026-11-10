"use client";
import { useEffect, useState, useRef } from "react";
import {
  researchTopics,
  studentQuestion,
  topicOf,
} from "../lib/research";
import EmployeeQuotes from "./EmployeeQuotes";

async function prepare(base, signal, mode = "local") {
  const res = await fetch("/api/insights", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...base, task: "research", mode }),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error);
  return data;
}
export default function Research({ base, respondents }) {
  const [preview, setPreview] = useState(null),
    [session, setSession] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saveError, setSaveError] = useState("");
  const job = useRef(null);
  const latestProgress = useRef(null);
  const { company, role = "", division = "" } = base;
  useEffect(() => {
    const ctrl = new AbortController();
    prepare({ company, role, division }, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setPreview(data);
        try {
          const saved = JSON.parse(
            localStorage.getItem("workday.research.v1." + data.storageKey),
          );
          if (
            Array.isArray(saved?.pack?.questions) &&
            saved.answers &&
            saved.mode === "Vertex AI / Gemini"
          )
            setSession(saved);
        } catch {}
        if (data.generated)
          setSession(
            (current) =>
              current || {
                pack: data.generated,
                mode: "Vertex AI / Gemini",
                answers: {},
                index: 0,
              },
          );
      })
      .catch(() => {
        if (!ctrl.signal.aborted)
          setError(
            "社員の回答を読み込めませんでした。ページを再読み込みしてください。",
          );
      });
    return () => {
      ctrl.abort();
      job.current?.abort();
    };
  }, [company, role, division]);
  function save(next) {
    latestProgress.current = next;
    setSession(next);
    try {
      localStorage.setItem(
        "workday.research.v1." + preview.storageKey,
        JSON.stringify(next),
      );
    } catch {
      setSaveError(
        "このブラウザーには保存できません。この画面を開いている間は続けられます。",
      );
    }
  }
  const facts = preview?.facts ?? [];
  const coveredTopics = [
    ...new Set(
      (session?.pack.questions || [])
        .map(
          (q) =>
            q.topic || topicOf(facts.find((f) => q.ids.includes(f.id)) || {}),
        )
        .filter(Boolean),
    ),
  ];
  const remainingTopics = researchTopics({
    facts,
    excludedTopics: coveredTopics,
  });
  async function start(additional = false) {
    if (job.current || !preview) return;
    const ctrl = new AbortController();
    job.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 180000);
    setBusy(true);
    setError("");
    try {
      const excludedTopics = additional ? coveredTopics : [];
      const request = { ...base, excludedTopics };
      const source = additional ? await prepare(request, ctrl.signal) : preview;
      if (!source.generated && !source.approved) {
        setError(
          source.remaining === 0
            ? "今回の利用回数の上限に達しました。"
            : "この内容で新しい質問を作成できません。",
        );
        return;
      }
      const pack = source.generated || (await prepare(
        { ...request, digest: source.digest }, ctrl.signal, "vertex"
      )).result;
      if (!ctrl.signal.aborted) {
        if (additional) {
          // Keep the earlier predictions and reflections.
          const current = latestProgress.current || session;
          save({
            ...current,
            index: current.pack.questions.length,
            pack: {
              ...current.pack,
              questions: [...current.pack.questions, ...pack.questions],
            },
          });
        } else save({ pack, mode: "Vertex AI / Gemini", answers: {}, index: 0 });
      }
    } catch (e) {
      setError(
        ctrl.signal.aborted
          ? "生成を中断しました。"
          : "企業研究を生成できませんでした。自動での再実行はありません。",
      );
    } finally {
      clearTimeout(timer);
      job.current = null;
      setBusy(false);
    }
  }
  const questions = session?.pack.questions ?? [];
  const i = session?.index ?? 0,
    q = questions[i],
    answer = session?.answers[i] || {};
  const displayedQuestion =
    q &&
    studentQuestion(
      answer.revealed && answer.prompt ? { ...q, text: answer.prompt } : q,
      facts,
    );
  function updateAnswer(patch) {
    save({
      ...session,
      answers: { ...session.answers, [i]: { ...answer, ...patch } },
    });
  }
  return (
    <section className="vi-panel vi-research">
      <h2>応募前の企業研究</h2>
      {!session ? (
        <>
          <p>この配属先での働き方を予想して、社員の経験と比べてみましょう。</p>
          {preview && facts.length > 0 && (
            <div className="vi-actions">
              <button id="start-company-research" className="vi-button"
                disabled={busy || !preview.approved} onClick={() => start()}>
                {busy ? "質問を準備しています…" : "企業研究を始める →"}
              </button>
            </div>
          )}
          {preview && !facts.length && (
            <p>
              この配属先には、設問の根拠にできる社員の回答がまだありません。
            </p>
          )}
          {preview && facts.length > 0 && !preview.approved && (
            <p role="status">
              現在、新しい設問を生成できません。原文は「社員の声・質問」で読めます。
            </p>
          )}
          {!preview && !error && <p role="status">社員の回答を確認中…</p>}
        </>
      ) : (
        <>
          {session.mode !== "原文を使った定型設問" && (
            <small>社員の回答をもとにAIが構成した企業研究です。</small>
          )}
          {q ? (
            <div className="vi-exercise" key={i}>
              <small>
                問い {i + 1} / {questions.length}
                {q.topic && `　${q.topic}`}
              </small>
              <h3>{displayedQuestion}</h3>
              {answer.revealed ? (
                <>
                  <div className="vi-comparison">
                  <div><strong>あなたの予想</strong>
                    <br />
                    {answer.text}
                  </div>
                  <div>
                  <h4>この配属先の社員が経験したこと</h4>
                  <EmployeeQuotes
                    respondents={respondents}
                    ids={q.ids}
                    facts={facts}
                  />
                  </div>
                  </div>
                  <label>
                    予想と違ったこと・もっと知りたいこと（任意）
                    <textarea
                      maxLength={500}
                      value={answer.reflection || ""}
                      onChange={(e) =>
                        updateAnswer({ reflection: e.target.value })
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    あなたの予想
                    <textarea
                      value={answer.text || ""}
                      maxLength={500}
                      placeholder="今のイメージを自由に書いてください"
                      onChange={(e) => updateAnswer({ text: e.target.value })}
                    />
                  </label>
                  <div className="vi-actions">
                    <button
                      className="vi-button"
                      disabled={!answer.text?.trim()}
                      onClick={() =>
                        updateAnswer({
                          revealed: true,
                          prompt: displayedQuestion,
                        })
                      }
                    >
                      社員の声を見る
                    </button>
                    {!answer.text?.trim() && (
                      <button
                        className="vi-link"
                        onClick={() =>
                          updateAnswer({
                            text: "まだ想像できない",
                            prompt: displayedQuestion,
                            revealed: true,
                          })
                        }
                      >
                        まだ想像できない
                      </button>
                    )}
                  </div>
                </>
              )}
              <div className="vi-actions">
                {i > 0 && (
                  <button
                    className="vi-link"
                    onClick={() => save({ ...session, index: i - 1 })}
                  >
                    前の問いへ
                  </button>
                )}
                {answer.revealed &&
                  (i + 1 < questions.length ? (
                    <button
                      className="vi-button"
                      onClick={() => save({ ...session, index: i + 1 })}
                    >
                      次の問いへ →
                    </button>
                  ) : (
                    <p>すべての問いを確認しました。</p>
                  ))}
              </div>
            </div>
          ) : (
            <p>実際の仕事を予想できる回答がまだありません。</p>
          )}
          {remainingTopics.length > 0 && (
            <button
              className="vi-link"
              disabled={busy}
              onClick={() => start(true)}
            >
              {busy ? "質問を準備しています…" : "別の観点で試す"}
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {saveError && <p role="alert">{saveError}</p>}
    </section>
  );
}
