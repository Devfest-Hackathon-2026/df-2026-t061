"use client";
import { useState } from "react";
import { isHearingForm } from "../lib/hearing";
import { questions, readCsv, planBatch } from "../lib/interview";

export function InterviewImport({ onBatch, onDone }) {
  const [csv, setCsv] = useState(null),
    [mapping, setMapping] = useState({}),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function register(data, columns) {
    const { ready, pending } = planBatch(data, columns);
    const added = onBatch(ready);
    setResult({ added, skipped: ready.length - added, pending });
    setError("");
  }
  async function read(file) {
    setResult(null);
    setError("");
    setCsv(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2_000_000)
        throw Error("2 MB以内のCSVを選択してください。");
      const data = readCsv(await file.text());
      const columns = Object.fromEntries(
        questions.map(([key, label]) => [
          key,
          data.headers.findIndex((h) => h === label || h === key),
        ]),
      );
      setMapping(columns);
      setCsv(data);
      if (
        isHearingForm(data.headers) ||
        Object.values(columns).every((i) => i >= 0)
      )
        register(data, columns);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function complete(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fixable = result.pending.filter((p) => p.day);
    const days = fixable.map((p) => ({
      ...p.day,
      time_slots: p.day.time_slots.map((slot) => {
        if (!p.missing.includes(slot.time)) return slot;
        const id = form.get(p.index + "-" + slot.time);
        return {
          ...slot,
          choices: slot.choices.map((c) => ({
            ...c,
            actual_culture_match: c.id === id,
          })),
        };
      }),
    }));
    try {
      const added = onBatch(days);
      setResult({
        ...result,
        added: result.added + added,
        skipped: result.skipped + days.length - added,
        pending: result.pending.filter((p) => !p.day),
      });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <details className="csv-import">
      <summary>Googleフォームの回答を取り込む</summary>
      <p>
        企業ヒアリングの回答CSVを選ぶと、回答1件につき4場面のシナリオを登録します。「業務時間の割合」は空欄でも取り込めます。同じ企業・事業部・職種・シナリオ名の登録はスキップします。
      </p>
      <p>
        <a className="link" href="/interview-example.csv" download>
          一括登録用CSVの見本をダウンロード
        </a>
      </p>
      <label>
        回答CSV
        <input
          type="file"
          disabled={busy}
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files[0];
            e.target.value = "";
            read(file);
          }}
        />
      </label>
      {csv && !result && (
        <>
          <p>質問名が異なる列を指定してください。</p>
          <div className="column-map">
            {questions.map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={mapping[key]}
                  onChange={(e) =>
                    setMapping({ ...mapping, [key]: Number(e.target.value) })
                  }
                >
                  <option value={-1}>列を選択</option>
                  {csv.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={
              Object.values(mapping).some((i) => i < 0) ||
              new Set(Object.values(mapping)).size !== questions.length
            }
            onClick={() => {
              try {
                register(csv, mapping);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            全回答を一括登録
          </button>
        </>
      )}
      {result && (
        <>
          <p role="status">
            登録 {result.added} 件 ／ 重複 {result.skipped} 件 ／ 要確認{" "}
            {result.pending.length} 件
          </p>
          <form onSubmit={complete}>
            {result.pending.map((p) => (
              <fieldset key={p.index}>
                <legend>
                  回答 {p.index + 1}　{p.day?.company}　{p.day?.scenario_title}
                </legend>
                {p.error ? (
                  <p>{p.error} CSVを修正して再度取り込んでください。</p>
                ) : (
                  p.day.time_slots
                    .filter((slot) => p.missing.includes(slot.time))
                    .map((slot) => (
                      <label key={slot.time}>
                        {slot.time}　{slot.situation}
                        <select
                          required
                          defaultValue=""
                          name={p.index + "-" + slot.time}
                        >
                          <option disabled value="">
                            文化に合う行動を選択
                          </option>
                          {slot.choices.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.id}　{c.text}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))
                )}
              </fieldset>
            ))}
            {result.pending.some((p) => p.day) && (
              <button className="primary">補った回答を登録</button>
            )}
          </form>
          <button className="link" onClick={onDone}>
            企業一覧を見る →
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
