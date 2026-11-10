"use client";
import { useEffect, useRef, useState } from "react";
import { episodeId, importEpisodes, mergeSources } from "../lib/episodes";
import {
  groupResponses,
  hasPrediction,
  baseFields,
  inputSignature,
  saveTeam,
  sourcesCurrent,
  teamFields,
} from "../lib/team";
import { prepareSimulation } from "../lib/prepare-simulation";
import { nanoStatus } from "../lib/decision";
import { EpisodePlay } from "./EpisodePlay";
import { TeamEvidence } from "./TeamLab";

const steps = ["CSVを取り込む", "台本を生成", "体験・修正", "掲載"];
const labels = [
  "最初に学生が読む問い",
  "最初の予想の選択肢①",
  "最初の予想の選択肢②",
  "新人への依頼",
  "行動A",
  "行動B",
  "Aの後の展開",
  "Bの後の展開",
  "現場で共通すること",
  "条件による違い",
];
const batchKey = "workday.employer-import.v1";
function Review({ record, write, preview, ready }) {
  const [script, setScript] = useState(record.script),
    [notice, setNotice] = useState("");
  const played = record.playedBranch,
    other = played === "A" ? "B" : "A";
  function persist(next) {
    try {
      write((rows) => saveTeam(rows, record, script, played, "下書き"));
      setNotice("修正を保存しました。");
      if (next) next();
    } catch (e) {
      setNotice(e.message);
    }
  }
  return (
    <section className="panel case-editor">
      <h2>この体験で、仕事を誤解しないか</h2>
      <p>
        {record.source.company} ／ {record.source.role}
      </p>
      <h3>もう一方の選択　{other}</h3>
      <p>{script["action" + other]}</p>
      <blockquote>{script["next" + other]}</blockquote>
      <details>
        <summary>違和感のある箇所を修正する</summary>
        {(hasPrediction(record.script) ? teamFields : baseFields).map(
          (k, i) => (
            <label key={k}>
              {labels[teamFields.indexOf(k)]}
              <textarea
                maxLength={900}
                disabled={
                  record.team.unknownBranch &&
                  k === "next" + record.team.unknownBranch
                }
                value={script[k]}
                onChange={(e) => setScript({ ...script, [k]: e.target.value })}
              />
            </label>
          ),
        )}
      </details>
      <details>
        <summary>根拠を見る</summary>
        <TeamEvidence r={record} />
      </details>
      <div className="case-actions">
        <button className="link" onClick={() => persist(preview)}>
          修正を保存してもう一度体験
        </button>
        <button className="primary" onClick={() => persist(ready)}>
          掲載内容を確認 →
        </button>
      </div>
      <p role="status">{notice}</p>
    </section>
  );
}
export function EmployerFlow({ records, write, toStudents }) {
  const [stage, setStage] = useState("upload"),
    [batch, setBatch] = useState([]),
    [group, setGroup] = useState(0),
    [id, setId] = useState("");
  const [notice, setNotice] = useState(""),
    [errors, setErrors] = useState([]),
    [busy, setBusy] = useState(false),
    [nano, setNano] = useState("checking"),
    [cloud, setCloud] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    nanoStatus().then((v) => {
      if (live) setNano(v);
    });
    fetch("/api/team-once")
      .then((r) => r.json())
      .then((v) => {
        if (live) setCloud(v.enabled);
      })
      .catch(() => {});
    try {
      const ids = JSON.parse(sessionStorage.getItem(batchKey) || "[]");
      if (Array.isArray(ids)) setBatch(ids);
    } catch {}
    return () => {
      live = false;
    };
  }, []);
  const groups = groupResponses(records.filter((r) => batch.includes(r.id)));
  const selected = groups[group] || groups[0] || [];
  const stored = records.find((r) => r.id === id),
    teams = records.filter((r) => r.team);
  const record = stored?.working ? { ...stored, ...stored.working } : stored;
  const existing = teams.find(
    (r) =>
      hasPrediction(r.script) &&
      inputSignature(r.team.inputs) === inputSignature(selected),
  );
  const step = {
    upload: 0,
    generate: 1,
    trial: 2,
    review: 2,
    publish: 3,
    done: 3,
  }[stage];
  function open(r) {
    setErrors([]);
    setId(r.id);
    setStage(
      r.working?.playedBranch
        ? "review"
        : r.status === "承認済み"
          ? "done"
          : r.playedBranch
            ? "review"
            : "trial",
    );
  }
  async function upload(file) {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setErrors([]);
    setNotice("");
    try {
      if (file.size > 2_000_000) throw Error("2MB以内のCSVを選んでください。");
      const { sources, errors } = importEpisodes(await file.text());
      if (!sources.length)
        throw Error(errors.join("\n") || "回答がありません。");
      write((rows) => mergeSources(rows, sources).records);
      const ids = [...new Set(sources.map(episodeId))];
      setBatch(ids);
      setGroup(0);
      sessionStorage.setItem(batchKey, JSON.stringify(ids));
      setErrors(errors);
      setNotice(
        file.name + " ／ " + sources.length + "件の回答を読み込みました。",
      );
      setStage("generate");
    } catch (e) {
      setErrors([e.message]);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function generate(mode) {
    if (lock.current) return;
    if (existing) {
      open(existing);
      return;
    }
    lock.current = true;
    setBusy(true);
    setErrors([]);
    try {
      setId(await prepareSimulation(records, selected, mode, write));
      setStage("trial");
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function checkpoint(branch) {
    try {
      write((rows) => saveTeam(rows, record, record.script, branch, "下書き"));
      setStage("review");
    } catch (e) {
      setErrors([e.message]);
    }
  }
  function publish() {
    try {
      write((rows) =>
        saveTeam(rows, record, record.script, record.playedBranch, "承認済み"),
      );
      setStage("done");
    } catch (e) {
      setErrors([e.message]);
    }
  }
  const stale = record && !sourcesCurrent(record, records);
  return (
    <>
      <ol className="employer-steps" aria-label="掲載までの手順">
        {steps.map((label, i) => (
          <li key={label} aria-current={step === i ? "step" : undefined}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {errors.map((e, i) => (
        <p key={i} role="alert">
          {e}
        </p>
      ))}
      {stage === "upload" && (
        <section className="panel case-editor">
          <h2>社員の回答CSVを取り込む</h2>
          <label>
            回答CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = "";
                upload(f);
              }}
            />
          </label>
          <a className="link" href="/team-experiment.csv" download>
            見本CSVをダウンロード（社員3人分）
          </a>
          {groups.length > 0 && (
            <button className="link" onClick={() => setStage("generate")}>
              前回取り込んだ回答から続ける →
            </button>
          )}
          {teams.length > 0 && (
            <details>
              <summary>保存した台本（{teams.length}件）</summary>
              {teams.map((r) => (
                <button
                  className="case-row"
                  key={r.id}
                  disabled={!sourcesCurrent(r, records)}
                  onClick={() => open(r)}
                >
                  {r.source.company} ／ {r.source.title}　
                  {sourcesCurrent(r, records)
                    ? r.status
                    : "元回答が更新されました"}
                </button>
              ))}
            </details>
          )}
        </section>
      )}
      {stage === "generate" && (
        <section className="panel case-editor">
          <h2>回答から台本を作る</h2>
          <p>{notice}</p>
          {groups.length > 1 && (
            <label>
              体験を作るチーム
              <select
                value={group}
                disabled={busy}
                onChange={(e) => setGroup(Number(e.target.value))}
              >
                {groups.map((g, i) => (
                  <option key={i} value={i}>
                    {[
                      g[0].source.company,
                      g[0].source.division,
                      g[0].source.role,
                    ]
                      .filter(Boolean)
                      .join(" ／ ")}
                    （{g.length}件）
                  </option>
                ))}
              </select>
            </label>
          )}
          {!!selected.length && (
            <p>
              <strong>
                {[
                  selected[0].source.company,
                  selected[0].source.division,
                  selected[0].source.role,
                ]
                  .filter(Boolean)
                  .join(" ／ ")}
              </strong>
              <br />
              {selected.length}件の回答を使います。
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !selected.length ||
              (!existing && ["checking", "unavailable"].includes(nano))
            }
            onClick={() => generate("nano")}
          >
            {busy
              ? "処理中…"
              : existing
                ? "保存した台本を開く"
                : "シミュレーションを1本生成"}
          </button>
          {!existing && (
            <small>
              {nano === "unavailable"
                ? "この端末ではGemini Nanoを利用できません。見本CSVでは保存済みの生成結果を試せます。"
                : "Gemini Nanoが端末内で生成します。初回はモデルの準備が必要な場合があります。"}
            </small>
          )}
          {!existing && (
            <details>
              <summary>見本の台本で試す</summary>
              <button
                className="link"
                disabled={busy || !selected.length}
                onClick={() => generate("replay")}
              >
                見本の生成結果を読み込む（API 0回）
              </button>
              {cloud && (
                <button
                  className="link"
                  disabled={busy || !selected.length}
                  onClick={() => generate("vertex")}
                >
                  承認済みのクラウド検証を1回実行
                </button>
              )}
            </details>
          )}
          <button
            className="link"
            disabled={busy}
            onClick={() => {
              setStage("upload");
              setErrors([]);
            }}
          >
            別のCSVを選ぶ
          </button>
        </section>
      )}
      {step >= 2 && (!record || stale) ? (
        <section className="panel case-editor">
          <p>
            元の回答が更新されました。新しい回答から台本を作成してください。
          </p>
          <button onClick={() => setStage("upload")}>CSV取込へ</button>
        </section>
      ) : (
        <>
          {stage === "trial" && record && (
            <>
              <h2>学生と同じ画面で体験する</h2>
              <EpisodePlay
                key={record.id + ":" + record.revision}
                preview
                record={record}
                exit={checkpoint}
              />
              <button className="link" onClick={() => setStage("upload")}>
                下書き一覧に戻る
              </button>
            </>
          )}
          {stage === "review" && record && (
            <Review
              key={record.id + ":" + record.revision}
              record={record}
              write={write}
              preview={() => setStage("trial")}
              ready={() => setStage("publish")}
            />
          )}
          {stage === "publish" && record && (
            <section className="panel case-editor">
              <h2>学生の一覧に掲載しますか？</h2>
              <p>
                {record.source.company} ／ {record.source.role}
              </p>
              <h3>{record.source.title}</h3>
              {hasPrediction(record.script) && (
                <>
                  <h3>出社前の予想</h3>
                  <p>{record.script.openingQuestion}</p>
                  <small>
                    {record.script.predictionA} ／ {record.script.predictionB}{" "}
                    ／ まだ分からない
                  </small>
                </>
              )}
              <blockquote>{record.script.scene}</blockquote>
              {["A", "B"].map((k) => (
                <div key={k}>
                  <strong>
                    {k}　{record.script["action" + k]}
                  </strong>
                  <p>{record.script["next" + k]}</p>
                </div>
              ))}
              <div className="case-actions">
                <button className="link" onClick={() => setStage("review")}>
                  ← 修正する
                </button>
                <button className="primary" onClick={publish}>
                  確認して掲載
                </button>
              </div>
            </section>
          )}
          {stage === "done" && record && (
            <section className="panel case-editor">
              <h2>掲載済み</h2>
              <p>
                {record.source.company} ／ {record.source.title}
              </p>
              <button className="primary" onClick={toStudents}>
                学生の企業一覧を見る →
              </button>
              <button className="link" onClick={() => setStage("trial")}>
                台本を見直す
              </button>
              <button className="link" onClick={() => setStage("upload")}>
                別のCSVを取り込む
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
}
