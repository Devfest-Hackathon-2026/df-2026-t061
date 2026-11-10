"use client";
import { useEffect, useState } from "react";
import { EpisodePlay } from "../EpisodePlay";
import { importEpisodes, draft } from "../../lib/episodes";
import { makeTeam } from "../../lib/team";

// A recorded run is a demonstration, never an employer approval or a new model call.
export default function Demo() {
  const [record, setRecord] = useState(null),
    [error, setError] = useState(""),
    [initial, setInitial] = useState(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const [csv, log] = await Promise.all([
        fetch("/team-experiment.csv"),
        fetch("/team-run.json"),
      ]);
      if (!csv.ok || !log.ok) throw Error();
      const rows = importEpisodes(await csv.text()).sources.map(draft);
      const run = await log.json(),
        r = makeTeam(rows, run.output, run.origin);
      if (!live) return;
      const saved = JSON.parse(
        sessionStorage.getItem("workday.demo-pause") || "null",
      );
      if (saved?.id === r.id && saved.question === r.script.openingQuestion)
        setInitial(saved);
      setRecord(r);
    }
    load().catch(() => {
      if (live)
        setError(
          "仕事体験を読み込めませんでした。ページを再読み込みしてください。",
        );
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main className="shell">
      <p className="eyebrow">Workday ／ 仕事体験</p>
      <h1>{record?.source.title || "仕事体験"}</h1>
      {record && (
        <>
          <p>架空の社員3人の回答からAIが作成した仕事体験です。</p>
          <EpisodePlay
            record={record}
            initial={initial}
            onPause={(value) => {
              sessionStorage.setItem(
                "workday.demo-pause",
                JSON.stringify({
                  ...value,
                  question: record.script.openingQuestion,
                }),
              );
              window.location.assign("/");
            }}
            exit={() => {
              sessionStorage.removeItem("workday.demo-pause");
              window.location.assign("/");
            }}
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <a className="link" href="/#directory">
        企業一覧へ
      </a>
    </main>
  );
}
