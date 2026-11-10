"use client";
import { useCallback, useEffect, useState } from "react";
import {
  sections,
  fields,
  topics,
  priorities,
  scopeVoices,
  selectAssignment,
} from "../lib/voices";
import Research from "./Research";
import EmployeeQuotes from "./EmployeeQuotes";
import "./insights.css";

const route = (view, params = {}) =>
  "#" + view + "?" + new URLSearchParams(params);
function useRoute() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    function read() {
      setHash(location.hash);
      window.scrollTo(0, 0);
    }
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const [view, search] = hash.slice(1).split("?");
  return [view || "home", Object.fromEntries(new URLSearchParams(search))];
}
function Link({ view, params, children, primary }) {
  return (
    <a className={primary ? "vi-button" : "vi-link"} href={route(view, params)}>
      {children}
    </a>
  );
}
function Scope({ rows, params, onChange }) {
  return (
    <div className="vi-filters">
      {[
        ["role", "職種"],
        ["division", "部署"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <select
            value={params[key]}
            onChange={(e) =>
              onChange(selectAssignment(rows, { ...params, [key]: e.target.value }))
            }
          >
            {[
              ...new Set(
                rows
                  .filter(
                    (r) =>
                      key === "role" || r.role === params.role,
                  )
                  .map((r) => r[key]),
              ),
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
function Directory({ rows }) {
  const [query, setQuery] = useState("");
  const visible = rows.filter((r) =>
    [r.company, r.industry, r.role].some((v) =>
      v
        .normalize("NFKC")
        .toLowerCase()
        .includes(query.trim().normalize("NFKC").toLowerCase()),
    ),
  );
  return (
    <>
      <h1>企業を探す</h1>
      <label className="vi-search">
        企業名・業界・職種
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例：導入支援"
        />
      </label>
      <div className="vi-grid">
        {[...new Set(visible.map((r) => r.company))].map((company) => {
          const staff = rows.filter((r) => r.company === company);
          const firstMatch = visible.find((r) => r.company === company);
          return (
            <a
              className="vi-card"
              key={company}
              href={route("company", selectAssignment(staff, firstMatch))}
            >
              <small>{staff[0].industry}</small>
              <h2>{company}</h2>
              <p>{[...new Set(staff.map((r) => r.role))].join("・")}</p>
              <strong>{staff.length}件の回答を見る →</strong>
            </a>
          );
        })}
      </div>
      {!visible.length && <p>一致する企業はありません。</p>}
    </>
  );
}
function displayInsight(text) {
  return text?.replace(/[(（]R-[0-9a-f-]+(?:\.{3}|…)?[)）]/gi, "").replace(/R-[0-9a-f-]+(?:\.{3}|…)?/gi, "この社員");
}
function Insights({ base, conditions, respondents }) {
  const qa = !conditions;
  const [q, setQ] = useState(""),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const payload = JSON.stringify({
    ...base,
    task: qa ? "qa" : "analysis",
    conditions: conditions || [],
    question: q,
  });
  const run = useCallback(async (mode, signal) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(payload), mode }),
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      if (!signal?.aborted) setResult(data);
    } catch {
      if (!signal?.aborted) {
        if (mode === "vertex") setResult(previous => previous && { ...previous, approved: false });
        setError(mode === "vertex"
          ? "AIによる回答を用意できませんでした。社員の原文をご覧ください。"
          : "社員の回答を読み込めませんでした。ページを再読み込みしてください。");
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [payload]);
  useEffect(() => {
    if (qa) return;
    const controller = new AbortController();
    run("local", controller.signal);
    return () => controller.abort();
  }, [qa, run]);
  const compare = result?.result.items || [];
  const ordered = [...compare].sort((a, b) => {
    const priority = (r) =>
      priorities.indexOf(conditions.find((c) => c.label === r.label).priority);
    return (
      priority(a) - priority(b) ||
      Number(b.status === "情報不足") - Number(a.status === "情報不足")
    );
  });
  return (
    <section className="vi-panel">
      <h2>{qa ? "社員の回答に質問する" : "希望と回答を照らし合わせる"}</h2>
      {qa && (
        <label>
          知りたいこと
          <textarea
            value={q}
            maxLength={300}
            disabled={busy}
            placeholder="新人は、顧客とどれくらい直接話しますか？"
            onChange={(e) => {
              setQ(e.target.value);
              setResult(null);
            }}
          />
        </label>
      )}
      {qa && (
        <button className="vi-button" disabled={busy || !q.trim()} onClick={() => run("local")}>
          {busy ? "確認中…" : "関連する回答を探す"}
        </button>
      )}
      {!qa && !result && !error && <p role="status">社員の回答を照合しています…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <div className="vi-result">
            {result.mode === "Gemini" && <small>社員の回答に基づくAIの見解</small>}
            {qa ? (
              <>
                <h3>{displayInsight(result.result.answer)}</h3>
                <EmployeeQuotes respondents={respondents} ids={result.result.ids} facts={result.facts} />
              </>
            ) : (
              <>
                {compare.map((r) => (
                  <article key={r.label}>
                    <small>
                      {conditions.find((c) => c.label === r.label)?.priority}
                    </small>
                    <h3>
                      {r.label}　<span>{r.status}</span>
                    </h3>
                    <p>{displayInsight(r.explanation)}</p>
                    <EmployeeQuotes respondents={respondents} ids={r.ids} facts={result.facts} />
                  </article>
                ))}
                <h2>面接で確かめたい質問</h2>
                {ordered.map((r) => (
                  <article key={r.label}>
                    <strong>{displayInsight(r.question)}</strong>
                    <p>{displayInsight(r.reason)}</p>
                    <small>確認する条件　{r.label}</small>
                  </article>
                ))}
              </>
            )}
          </div>
          {result.mode !== "Gemini" && result.approved && (
            <button className="vi-link" disabled={busy} onClick={() => run("vertex")}>
              {busy ? "回答を整理しています…" : qa ? "AIに回答をまとめてもらう" : "AIで希望条件を詳しく比較する"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function Detail({ rows, params: requested, view, conditions }) {
  const all = rows.filter((r) => r.company === requested.company);
  if (!all.length)
    return (
      <>
        <h1>対象企業を選んでください</h1>
        <Link view="directory">企業一覧へ</Link>
      </>
    );
  const params = selectAssignment(all, requested);
  const respondents = new Map(all.map((r, i) => [r.id, `社員${i + 1}`]));
  const scoped = scopeVoices(all, params);
  return (
    <>
      <Link view="directory">← 企業一覧</Link>
      <small className="vi-kicker">{all[0].industry}</small>
      <h1>{params.company}</h1>
      <Scope
        rows={all}
        params={params}
        onChange={(p) => (location.hash = route(view, p))}
      />
      <p>
        {scoped.length}件の新入社員回答
        {scoped.some((r) => r.sample) ? "（架空の見本を含みます）" : ""}。
        {scoped.length < 4
          ? "少数の経験であり、会社全体の傾向は判断できません。"
          : ""}
      </p>
      <nav className="vi-company-tabs" aria-label="企業ページ">
        {[
          ["company", "思い込みを確かめる"],
          ["voices", "社員の声・質問"],
          ["analysis", "ミスマッチ診断"],
        ].map(([key, label]) => (
          <a key={key} href={route(key, params)} aria-current={view === key ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {view === "analysis" ? (
        <>
          {conditions.length ? (
            <Insights
              respondents={respondents}
              key={JSON.stringify([params, conditions])}
              base={params}
              conditions={conditions}
            />
          ) : (
            <p>先に避けたい条件と重要度を設定してください。</p>
          )}
        </>
      ) : view === "company" ? (
        <Research respondents={respondents} key={JSON.stringify(params)} base={params} />
      ) : (
        <>
          <details className="vi-originals" open>
            <summary>社員の回答を項目別に読む</summary>
            {Object.entries(sections).map(([name, group]) => (
              <section className="vi-panel" key={name}>
                <h2>{name}</h2>
                {scoped.map((r) => {
                  const entries = Object.entries(group).filter(
                    ([k]) => r.answers[k],
                  );
                  return (
                    entries.length > 0 && (
                      <article key={r.id}>
                        <small>
                          {respondents.get(r.id)} ／ {r.role}・{r.division} ／ {r.year}年入社
                        </small>
                        <dl>
                          {entries.map(([k, label]) => (
                            <div key={k}>
                              <dt>{label}</dt>
                              <dd>{r.answers[k]}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    )
                  );
                })}
                {!scoped.some((r) =>
                  Object.keys(group).some((k) => r.answers[k]),
                ) && <p>この範囲には回答がありません。</p>}
              </section>
            ))}
          </details>
          <Insights respondents={respondents} key={JSON.stringify(params)} base={params} />
        </>
      )}
    </>
  );
}
function Preferences({ prefs, save }) {
  return (
    <>
      <h1>避けたい働き方</h1>
      <p>希望条件はこのブラウザーに自動保存され、各企業のミスマッチ診断で共通して使われます。</p>
      <section className="vi-panel">
        {Object.keys(topics).map(
          (k) => (
            <label className="vi-pref" key={k}>
              {k}
              <select
                value={prefs[k] || priorities[2]}
                onChange={(e) => save({ ...prefs, [k]: e.target.value })}
              >
                {priorities.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ),
        )}
      </section>
    </>
  );
}
function VoiceForm({ added }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/voices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...data,
          answers: Object.fromEntries(
            Object.keys(fields).map((k) => [k, data[k]]),
          ),
          consent: data.consent === "on",
        }),
      });
      const r = await res.json();
      if (!res.ok) {
        setError(r.error || "回答を登録できませんでした。時間をおいてもう一度お試しください。");
        return;
      }
      added(r);
    } catch {
      setError("回答を登録できませんでした。通信状況をご確認ください。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>新入社員の経験を届ける</h1>
      <p>
        ご自身の配属先で実際に経験したことを、答えられる項目から1つ以上記入してください。氏名・顧客名・連絡先・社外秘の内容は書かないでください。
      </p>
      <form onSubmit={submit} className="vi-panel">
        <h2>配属先</h2>
        <div className="vi-grid">
          {Object.entries({
            company: "企業名",
            industry: "業界",
            role: "職種",
            division: "部署",
            year: "入社年度（西暦）",
          }).map(([k, v]) => (
            <label key={k}>
              {v}
              <input
                name={k}
                required
                maxLength={k === "year" ? 4 : 100}
                pattern={k === "year" ? "[0-9]{4}" : undefined}
              />
            </label>
          ))}
        </div>
        {Object.entries(sections).map(([name, g]) => (
          <details key={name} open>
            <summary>{name}</summary>
            {Object.entries(g).map(([k, v]) => (
              <label key={k}>
                {v}
                <textarea name={k} maxLength={800} />
              </label>
            ))}
          </details>
        ))}
        <label className="vi-check">
          <input required name="consent" type="checkbox" />
          配属情報と回答内容が、名前を伏せてこのサービスに掲載されることに同意します。
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} className="vi-button">
          {busy ? "保存中…" : "回答を登録"}
        </button>
      </form>
    </>
  );
}
export default function Page() {
  const [view, params] = useRoute(),
    [rows, setRows] = useState([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [prefs, setPrefs] = useState({});
  useEffect(() => {
    fetch("/api/voices", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setRows)
      .catch(() => setError("回答を読み込めませんでした。"))
      .finally(() => setLoaded(true));
    try {
      setPrefs(
        JSON.parse(localStorage.getItem("workday.preferences") || "{}") || {},
      );
    } catch {}
  }, []);
  function save(p) {
    setPrefs(p);
    try {
      localStorage.setItem("workday.preferences", JSON.stringify(p));
    } catch {}
  }
  const conditions = Object.keys(topics)
    .filter(label => priorities.includes(prefs[label]) && prefs[label] !== priorities[2])
    .map(label => ({label, priority:prefs[label]}));
  return (
    <div className="voices">
      <header>
        <div className="vi-shell">
          <a className="vi-brand" href="#home">
            Workday
          </a>
          <nav>
            <Link view="directory">企業を探す</Link>
            <Link view="preferences">希望条件</Link>
            <Link view="employee">社員として回答</Link>
          </nav>
        </div>
      </header>
      <main className="vi-shell">
        {error && <p role="alert">{error}</p>}
        {view === "home" ? (
          <section className="vi-hero">
            <small>新入社員の経験から知る仕事</small>
            <h1>
              「入社してから知る」を、
              <br />
              「入社する前に知る」へ。
            </h1>
            <p>
              新人の仕事について、あなたならどう予想しますか？
              社員の実体験と比べて、応募前に確かめたいことを見つけましょう。
            </p>
            <div className="vi-home-actions">
              <Link primary view="directory">
                企業を探す →
              </Link>
              <Link primary view="preferences">自分の希望を整理する →</Link>
            </div>
          </section>
        ) : !loaded ? (
          <p>回答を読み込み中…</p>
        ) : view === "employee" ? (
          <VoiceForm
            added={(r) => {
              setRows((prev) => [...prev, r]);
              location.hash = route("company", {
                company: r.company,
                role: r.role,
                division: r.division,
              });
            }}
          />
        ) : view === "preferences" ? (
          <Preferences prefs={prefs} save={save} />
        ) : ["company", "voices", "analysis"].includes(view) ? (
          <Detail
            rows={rows}
            params={params}
            view={view}
            conditions={conditions}
          />
        ) : (
          <Directory rows={rows} />
        )}
      </main>
    </div>
  );
}
