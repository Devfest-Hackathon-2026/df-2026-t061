import { generateLocal } from "./decision.js";
import {
  inputSignature,
  makeTeam,
  material,
  sourcesCurrent,
  teamSchemaVersion,
} from "./team.js";

export async function prepareSimulation(records, selected, mode, write) {
  const signature = inputSignature(selected);
  const input = material(selected);
  const origin = {
    nano: "Gemini Nano（端末内）",
    vertex: "Vertex AI / Gemini 3.1 Flash-Lite",
    replay: "Geminiの実生成記録（再生）",
  }[mode];
  const id = "team:" + teamSchemaVersion + ":" + origin + ":" + signature;
  if (records.some((r) => r.id === id)) return id;
  const accept = (output, audit) => {
    const item = makeTeam(selected, output, origin);
    if (audit) item.audit = audit;
    write((rows) => {
      if (!sourcesCurrent(item, rows))
        throw Error("回答が更新されたため、生成結果を保存できません。");
      return rows.some((r) => r.id === item.id) ? rows : [...rows, item];
    });
    return item.id;
  };
  if (mode === "nano") {
    const key =
      "workday.nano-team-attempt:" + teamSchemaVersion + ":" + signature;
    return navigator.locks.request(key, async () => {
      if (localStorage.getItem(key))
        throw Error(
          "この回答は実行済みです。「保存した台本」から開いてください。失敗時も再送はありません。",
        );
      localStorage.setItem(key, "reserved");
      return accept(
        await generateLocal("team", input, AbortSignal.timeout(150000)),
      );
    });
  }
  const res =
    mode === "replay"
      ? await fetch("/team-run.json")
      : await fetch("/api/team-once", {
          method: "POST",
          headers: {
            "x-workday-action": "one-synthetic-case",
            "content-type": "application/json",
          },
          body: JSON.stringify({ evidence: input }),
        });
  const result = await res.json();
  if (!res.ok) throw Error(result.error || "台本を取得できませんでした。");
  if (JSON.stringify(result.evidence) !== JSON.stringify(input))
    throw Error("この方法は同梱の3人分の見本CSVでのみ利用できます。");
  return accept(result.output, result.audit);
}
