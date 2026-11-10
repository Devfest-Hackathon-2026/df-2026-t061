import { registrationDraft, times } from "./day.js";
import { isHearingForm, hearingDay } from "./hearing.js";
// Google Forms exports quoted fields (including commas, line breaks and doubled quotes).
export function readCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, "");
  function pushField() {
    row.push(field.trim());
    field = "";
    closed = false;
  }
  function pushRow() {
    pushField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (c === ",") pushField();
    else if (c === "\n" || c === "\r") {
      pushRow();
      if (c === "\r" && input[i + 1] === "\n") i++;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (closed || c === '"')
      throw Error("CSVの引用符を確認してください。");
    else field += c;
  }
  if (quoted) throw Error("CSVの引用符が閉じられていません。");
  pushRow();
  if (rows.length < 2) throw Error("見出し行と回答が1件以上必要です。");
  const [headers, ...responses] = rows;
  if (responses.some((row) => row.length !== headers.length))
    throw Error("回答の列数が見出しと一致しません。");
  return { headers, responses };
}
export const questions = [
  ["company", "企業名"],
  ["division", "事業部"],
  ["role", "職種"],
  ["scenario_title", "シナリオ名"],
  ["episode", "日常の出来事・判断に迷った場面"],
  ["culture", "チームが大切にする行動と理由"],
];
export function interviewValues(row, mapping, headers = []) {
  const values = {};
  for (const [key, label] of questions) {
    const value = row[mapping[key]];
    if (!value) throw Error(label + "の回答または対応する列がありません。");
    values[key] = value;
  }
  for (const time of times) {
    for (const field of [
      "状況",
      "選択肢A",
      "選択肢B",
      "文化の理由",
      "文化に合う行動",
    ]) {
      const key = time + " " + field;
      const value = row[headers.indexOf(key)];
      if (value) values[key] = value;
    }
  }
  return values;
}

export function planBatch(csv, mapping) {
  const ready = [],
    pending = [];
  const hearing = isHearingForm(csv.headers);
  for (const [index, row] of csv.responses.entries()) {
    try {
      if (hearing) {
        ready.push(hearingDay(csv.headers, row));
        continue;
      }
      const values = interviewValues(row, mapping, csv.headers);
      const day = registrationDraft(values);
      const missing = [];
      for (const slot of day.time_slots) {
        const answer = (values[slot.time + " 文化に合う行動"] || "")
          .normalize("NFKC")
          .trim()
          .toUpperCase();
        if (!["A", "B"].includes(answer)) {
          missing.push(slot.time);
          continue;
        }
        for (const choice of slot.choices)
          choice.actual_culture_match = choice.id === answer;
      }
      if (missing.length) pending.push({ index, values, day, missing });
      else ready.push(day);
    } catch (e) {
      pending.push({ index, error: e.message });
    }
  }
  return { ready, pending };
}
