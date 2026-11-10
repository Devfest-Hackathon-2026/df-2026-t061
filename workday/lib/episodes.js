import { readCsv } from "./interview.js";

export const columns = {
  company: "企業名",
  role: "職種",
  title: "実話のタイトル",
  division: "事業部・部署",
  respondent: "回答者コード",
  switchCondition: "別の判断が妥当になる条件",
  request: "新人への依頼と期限",
  known: "判断前に分かっていたこと",
  unknown: "まだ分からなかったこと",
  authority: "新人の裁量と相談できた相手",
  actionA: "行動A",
  aimA: "Aで守りたいこと",
  actionB: "行動B",
  aimB: "Bで守りたいこと",
  actual: "実際に選んだ行動",
  outcome: "実際の返事と次の仕事",
  basis: "別の行動の根拠",
  alternative: "別の行動の続き",
  frequency: "起こる頻度",
  exception: "誤解してほしくない点・例外条件",
};
const optional = new Set([
  "division",
  "alternative",
  "basis",
  "respondent",
  "switchCondition",
]);
export const provenance = ["別の実例", "経験上の予想", "分からない"];
export const unknownNext =
  "この先の展開は確認できていません。次に誰に何を確かめますか？";
export const scriptKeys = ["scene", "actionA", "actionB", "nextA", "nextB"];
export const episodeId = (s) =>
  JSON.stringify([
    s.company,
    s.role,
    s.title,
    s.division,
    ...(s.respondent ? [s.respondent] : []),
  ]);
export function importEpisodes(text) {
  const { headers, responses } = readCsv(text);
  const missing = Object.entries(columns).filter(
    ([k, h]) => !optional.has(k) && !headers.includes(h),
  );
  if (missing.length)
    throw Error(
      "新版の実話CSVが必要です。不足する見出し：" +
        missing.map(([, h]) => h).join("、"),
    );
  if (
    Object.values(columns).some(
      (h) => headers.indexOf(h) !== headers.lastIndexOf(h),
    )
  )
    throw Error("同じ見出しが複数あります。");
  const sources = [],
    errors = [];
  const seen = new Map(),
    conflicts = new Set();
  responses.forEach((row, i) => {
    try {
      const s = Object.fromEntries(
        Object.entries(columns).map(([k, h]) => [
          k,
          row[headers.indexOf(h)] || "",
        ]),
      );
      for (const [k, h] of Object.entries(columns)) {
        if (!optional.has(k) && !s[k]) throw Error(h + "が空欄です。");
        if (s[k].length > 1200)
          throw Error(h + "は1200文字以内にしてください。");
      }
      s.actual = s.actual.normalize("NFKC").toUpperCase();
      if (!["A", "B"].includes(s.actual))
        throw Error("実際に選んだ行動はAまたはBです。");
      if (s.actionA === s.actionB)
        throw Error("二つの行動を別々に記入してください。");
      s.basis ||= "分からない";
      if (!provenance.includes(s.basis))
        throw Error(
          "別の行動の根拠は「別の実例」「経験上の予想」「分からない」のいずれかです。",
        );
      if ((s.basis === "分からない") !== !s.alternative)
        throw Error("別の行動の続きと、その根拠の有無を合わせてください。");
      if (!s.respondent) delete s.respondent;
      if (!s.switchCondition) delete s.switchCondition;
      const id = episodeId(s);
      const prior = seen.get(id);
      if (prior && JSON.stringify(prior.source) !== JSON.stringify(s)) {
        conflicts.add(id);
        throw Error(
          "回答" +
            prior.row +
            "と同じ名前で内容が異なります。別の実話ならタイトルを変更し、更新なら最新の1行にしてください。どちらも未登録です。",
        );
      }
      seen.set(id, { row: i + 1, source: s });
      sources.push(s);
    } catch (e) {
      errors.push("回答" + (i + 1) + "：" + e.message);
    }
  });
  return {
    sources: sources.filter((s) => !conflicts.has(episodeId(s))),
    errors,
  };
}
export function basisFor(s, id) {
  return id === s.actual ? "実際に起きたこと" : s.basis;
}
export function seedScript(s) {
  const other = s.basis === "分からない" ? unknownNext : s.alternative;
  return {
    scene: s.request,
    actionA: s.actionA,
    actionB: s.actionB,
    nextA: s.actual === "A" ? s.outcome : other,
    nextB: s.actual === "B" ? s.outcome : other,
  };
}
// Inputs to Gemini's opening scene deliberately exclude later outcomes and the actual choice.
export function briefing(s) {
  return {
    role: s.role,
    request: s.request,
    known: s.known,
    unknown: s.unknown,
    authority: s.authority,
    actionA: s.actionA,
    aimA: s.aimA,
    actionB: s.actionB,
    aimB: s.aimB,
  };
}
export function aftermath(s) {
  const branches = {};
  for (const id of ["A", "B"]) {
    if (id !== s.actual && s.basis === "分からない") continue;
    branches["next" + id] = {
      action: s["action" + id],
      type: id === s.actual || s.basis === "別の実例" ? "observed" : "expected",
      basis: basisFor(s, id),
      fact: id === s.actual ? s.outcome : s.alternative,
    };
  }
  return { request: s.request, branches };
}
export function draft(s) {
  return {
    id: episodeId(s),
    source: s,
    script: seedScript(s),
    origin: "回答から作成",
    status: "下書き",
    revision: 1,
    checks: [],
    note: "",
  };
}
export function validateScript(record, script, checks) {
  if (
    !scriptKeys.every(
      (k) =>
        typeof script?.[k] === "string" &&
        script[k].trim() &&
        script[k].length <= 1200,
    )
  )
    throw Error("すべての場面を1〜1200文字で記入してください。");
  if (script.actionA.trim() === script.actionB.trim())
    throw Error("二つの行動が同じです。");
  if (
    record.source.basis === "分からない" &&
    script["next" + (record.source.actual === "A" ? "B" : "A")] !== unknownNext
  )
    throw Error("根拠がない側に結果を追加できません。");
  if (![0, 1, 2].every((i) => checks.includes(i)))
    throw Error("3つの確認項目をすべて確認してください。");
}
export function mergeSources(records, sources) {
  const byId = new Map(records.map((r) => [r.id, r]));
  let added = 0,
    updated = 0,
    skipped = 0;
  for (const s of sources) {
    const id = episodeId(s),
      old = byId.get(id);
    if (old && JSON.stringify(old.source) === JSON.stringify(s)) {
      skipped++;
      continue;
    }
    if (old) updated++;
    else added++;
    byId.set(id, { ...draft(s), revision: (old?.revision || 0) + 1 });
  }
  return { records: [...byId.values()], added, updated, skipped };
}
export function revise(records, base, changes) {
  const current = records.find((r) => r.id === base.id);
  if (!current || current.revision !== base.revision)
    throw Error(
      "別のタブで更新されました。企業一覧に戻り、最新の回答を開いてください。",
    );
  if (changes.status === "承認済み")
    validateScript(current, changes.script, changes.checks);
  return records.map((r) =>
    r.id === base.id ? { ...r, ...changes, revision: r.revision + 1 } : r,
  );
}

// Review files are passed between people; importing one never publishes it.
export function reviewFile(r) {
  return {
    format: "workday-review-v2",
    source: r.source,
    script: r.script,
    note: r.note,
    origin: r.origin,
  };
}
export function importReview(rows, file) {
  if (file?.format !== "workday-review-v2")
    throw Error("新版の社員確認ファイルを選んでください。");
  const quote = (v) => '"' + v.replaceAll('"', '""') + '"';
  const cells = Object.keys(columns).map((k) => file.source?.[k] ?? "");
  if (cells.some((v) => typeof v !== "string"))
    throw Error("回答の形式が正しくありません。");
  const parsed = importEpisodes(
    Object.values(columns).join(",") + "\n" + cells.map(quote).join(","),
  );
  if (parsed.errors.length) throw Error(parsed.errors[0]);
  const record = draft(parsed.sources[0]),
    old = rows.find((r) => r.id === record.id);
  if (old && JSON.stringify(old.source) !== JSON.stringify(record.source))
    throw Error("回答が更新されています。最新の確認ファイルを使ってください。");
  validateScript(record, file.script, [0, 1, 2]);
  record.script = Object.fromEntries(
    scriptKeys.map((k) => [k, file.script[k]]),
  );
  record.note = typeof file.note === "string" ? file.note.slice(0, 1000) : "";
  record.origin = "社員確認ファイル";
  if (
    old &&
    scriptKeys.every((k) => record.script[k] === old.script[k]) &&
    record.note === old.note
  )
    return rows;
  record.revision = (old?.revision || 0) + 1;
  return old
    ? rows.map((r) => (r.id === old.id ? record : r))
    : [...rows, record];
}
