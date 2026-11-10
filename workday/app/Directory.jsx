"use client";
import { useRef } from "react";
import { OfficeMark } from "./OfficeMark";
export function Directory({ catalog, day, setDay, start, openStudio, query, setQuery }) {
  const modal = useRef(null);
  const companies = catalog.reduce(
    (groups, d) => groups.set(d.company, [...(groups.get(d.company) || []), d]),
    new Map(),
  );
  const normalize = (s) => s.normalize("NFKC").toLocaleLowerCase("ja").trim();
  const visible = [...companies].filter(([company]) =>
    normalize(company).includes(normalize(query)),
  );
  const entries = companies.get(day?.company) || [];
  function open(entries) {
    setDay(entries[0]);
    modal.current.showModal();
  }
  return (
    <>
      <p className="intro">
        気になる企業を選んで、そこで働く一日を体験しましょう。
      </p>
      <div className="directory-bar">
        <input
          type="search"
          aria-label="企業名で検索"
          placeholder="企業名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span aria-live="polite">{visible.length} 社</span>
      </div>
      <div className="company-grid">
        {visible.map(([company, rows]) => (
          <button
            className="company-card"
            key={company}
            onClick={() => open(rows)}
            aria-haspopup="dialog"
          >
            <OfficeMark company={company} />
            <strong>{company}</strong>
            <span className="roles">
              {[...new Set(rows.map((d) => d.role))].join(" ・ ")}
            </span>
            <span className="card-foot">
              {new Set(rows.map((d) => d.division)).size} 事業部　{rows.length}{" "}
              シナリオ <b>→</b>
            </span>
          </button>
        ))}
      </div>
      {!catalog.length && <p>登録企業は0社です。「企業向け登録」からCSVを取り込めます。</p>}
      {!!catalog.length && !visible.length && (
        <p>
          該当する企業がありません。
          <button className="link" onClick={() => setQuery("")}>
            検索をクリア
          </button>
        </p>
      )}
      {day && <dialog
        ref={modal}
        aria-labelledby="company-title"
        className="company-modal panel"
        onClick={(e) => {
          if (e.target === modal.current) modal.current.close();
        }}
      >
        <div className="modal-inner">
          <button className="link" onClick={() => modal.current.close()}>
            ← 企業一覧
          </button>
          <h2 id="company-title">{day.company}</h2>
          {["division", "role", "scenario_title"].map((field, i) => {
            const parents = ["division", "role"].slice(0, i);
            const options = entries.filter((d) =>
              parents.every((k) => d[k] === day[k]),
            );
            return (
              <label key={field}>
                {["事業部", "職種", "シナリオ"][i]}
                <select
                  value={day[field]}
                  onChange={(e) =>
                    setDay(options.find((d) => d[field] === e.target.value))
                  }
                >
                  {[...new Set(options.map((d) => d[field]))].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            );
          })}
          <button
            className="primary"
            onClick={() => {
              modal.current.close();
              start();
            }}
          >
            出社する <span>→</span>
          </button>
          <button className="link" onClick={()=>{modal.current.close();openStudio(day);}}>この企業の回答で分岐体験を作る</button>
        </div>
      </dialog>}
    </>
  );
}
