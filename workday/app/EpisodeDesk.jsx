"use client";
import { useState } from "react";
import {
  columns,
  briefing,
  aftermath,
  basisFor,
  importEpisodes,
  mergeSources,
  revise,
  scriptKeys,
  reviewFile,
  importReview,
} from "../lib/episodes";
import { useNano } from "./useNano";

const checks = [
  "判断前に知り得た情報だけを見せている",
  "A/Bとも新人の裁量で実行できる",
  "両方の続きが回答の根拠と一致する",
];
export function ReviewDesk({ record, write, back }) {
  const [script, setScript] = useState(record.script),
    [checked, setChecked] = useState(record.checks);
  const [note, setNote] = useState(record.note),
    [origin, setOrigin] = useState(record.origin);
  const [msg, setMsg] = useState("");
  const ai = useNano(),
    s = record.source;
  function downloadReview() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            reviewFile({ ...record, script, note, origin }),
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "社員確認-" + s.title + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function save(status) {
    try {
      write((rows) =>
        revise(rows, record, {
          script,
          checks: status === "要修正" ? [] : checked,
          note,
          origin,
          status,
        }),
      );
      setMsg(
        status === "承認済み"
          ? "承認しました。学生向け一覧に掲載されます。"
          : "下書きを保存しました。",
      );
    } catch (e) {
      setMsg(e.message);
    }
  }
  return (
    <section className="panel case-editor">
      <button className="link" onClick={back}>
        ← 確認待ち一覧
      </button>
      <h2>{s.title}</h2>
      <p>
        {s.company} ／ {s.role}　{record.status}
      </p>
      <div className="case-columns">
        <section>
          <h3>社員の回答</h3>
          <dl>
            {Object.entries(columns).map(
              ([k, label]) =>
                s[k] && (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>{s[k]}</dd>
                  </div>
                ),
            )}
          </dl>
        </section>
        <section>
          <h3>学生が体験する台本</h3>
          <p>
            依頼、当時の情報、裁量、二つの行動から冒頭を生成します。続きは根拠がある側だけ、別の操作で編集できます。
          </p>
          {ai.status !== "unavailable" ? (
            <button
              className="primary"
              disabled={ai.busy || ai.status === "checking"}
              onClick={() =>
                ai.run("opening", briefing(s), (result) => {
                  setScript({ ...script, ...result });
                  setOrigin("Gemini Nanoで編集");
                  setChecked([]);
                  setMsg("生成しました。回答と照合して保存してください。");
                })
              }
            >
              {ai.busy ? "端末内で生成中…" : "Gemini Nanoで冒頭を下書き"}
            </button>
          ) : (
            <p>
              端末内モデルが利用できません。回答をもとに手動で編集できます。
            </p>
          )}
          {ai.status !== "unavailable" && (
            <button
              className="link"
              disabled={ai.busy || ai.status === "checking"}
              onClick={() =>
                ai.run("continuation", aftermath(s), (result) => {
                  setScript({ ...script, ...result });
                  setChecked([]);
                  setOrigin("Gemini Nanoで編集");
                  setMsg(
                    "選択後の展開を編集しました。実例・予想の区分と原文を確認してください。",
                  );
                })
              }
            >
              根拠がある側の続きをGemini Nanoで編集
            </button>
          )}
          {["downloadable", "downloading", "unknown"].includes(ai.status) && (
            <small>初回はChromeが端末用のモデルを準備します。</small>
          )}
          {ai.error && <p role="alert">{ai.error}</p>}
          {scriptKeys.map((key, i) => {
            const label = [
              "依頼の場面",
              "行動A",
              "行動B",
              "Aを選んだ後",
              "Bを選んだ後",
            ][i];
            const basis = i >= 3 ? basisFor(s, key.slice(-1)) : "";
            return (
              <label key={key}>
                {label}
                {basis && " ／ " + basis}
                <textarea
                  disabled={ai.busy || basis === "分からない"}
                  maxLength={1200}
                  value={script[key]}
                  onChange={(e) => {
                    setScript({ ...script, [key]: e.target.value });
                    setChecked([]);
                  }}
                />
              </label>
            );
          })}
        </section>
      </div>
      <label>
        社員の修正メモ（任意）
        <textarea
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {checks.map((label, i) => (
        <label className="case-check" key={label}>
          <input
            type="checkbox"
            checked={checked.includes(i)}
            onChange={(e) =>
              setChecked(
                e.target.checked
                  ? [...checked, i]
                  : checked.filter((x) => x !== i),
              )
            }
          />
          {label}
        </label>
      ))}
      <div className="case-actions">
        <button
          className="link"
          disabled={ai.busy}
          onClick={() => save("下書き")}
        >
          下書きとして保存
        </button>
        <button
          className="link"
          disabled={ai.busy || !note.trim()}
          onClick={() => save("要修正")}
        >
          メモを添えて要修正にする
        </button>
        <button
          className="primary"
          disabled={ai.busy || checked.length !== 3}
          onClick={() => save("承認済み")}
        >
          確認した内容を承認して掲載
        </button>
      </div>
      <button className="link" onClick={downloadReview}>
        社員に渡す確認ファイルを保存
      </button>
      <p role="status">{msg}</p>
    </section>
  );
}
export function Inbox({ records, write, open }) {
  const [notice, setNotice] = useState(""),
    [errors, setErrors] = useState([]);
  async function read(file) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error("2MB以内のCSVを選んでください。");
      const { sources, errors } = importEpisodes(await file.text());
      let result;
      write((rows) => {
        result = mergeSources(rows, sources);
        return result.records;
      });
      setNotice(
        "新規 " +
          result.added +
          " 件 ／ 更新 " +
          result.updated +
          " 件 ／ 重複 " +
          result.skipped +
          " 件",
      );
      setErrors(errors);
    } catch (e) {
      setNotice("");
      setErrors([e.message]);
    }
  }
  return (
    <section className="panel case-editor">
      <h2>実話の回答を取り込む</h2>
      <p>
        1行につき1つの判断場面を登録します。同じ企業・部署・職種・タイトルの回答が変わった場合は、再確認のため下書きに戻ります。
      </p>
      <a className="link" href="/episode-v2.csv" download>
        新版CSVの見本をダウンロード
      </a>
      <label>
        Googleフォームの回答CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            read(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p role="status">{notice}</p>
      {errors.map((e, i) => (
        <p role="alert" key={i}>
          {e}
        </p>
      ))}
      <details>
        <summary>別の端末で社員が確認したファイルを取り込む</summary>
        <p>
          修正された台本を下書きとして受け取ります。掲載前に回答と照合してください。
        </p>
        <label>
          確認ファイル
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files[0];
              e.target.value = "";
              if (!f) return;
              try {
                if (f.size > 100000)
                  throw Error("確認ファイルは100KB以内です。");
                const bundle = JSON.parse(await f.text());
                write((rows) => importReview(rows, bundle));
                setErrors([]);
                setNotice("確認ファイルを読み込みました。");
              } catch (err) {
                setErrors([err.message]);
              }
            }}
          />
        </label>
      </details>
      <h2>回答の確認</h2>
      {!records.length && <p>まだ取り込んだ回答はありません。</p>}
      {records.map((r) => (
        <button className="case-row" key={r.id} onClick={() => open(r.id)}>
          <span>
            <strong>{r.source.title}</strong>
            <small>
              {r.source.company} ／ {r.source.role}
            </small>
          </span>
          <b>{r.status} →</b>
        </button>
      ))}
    </section>
  );
}
