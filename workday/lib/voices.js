export const sections = {
  入社前後のギャップ: {
    expectedWork: "入社前に想像していた仕事内容",
    actualWork: "実際の仕事内容",
    expectedPeople: "入社前に想像していた人間関係",
    actualPeople: "実際の人間関係",
    surprise: "入社後に驚いたこと",
    wish: "入社前に知っておきたかったこと",
  },
  具体的な業務: {
    duties: "担当している仕事",
    tasks: "具体的な作業",
    people: "関わる相手",
    steps: "業務の手順",
    decisions: "求められる判断",
    difficulty: "難しいと感じること",
    authority: "新人の責任と裁量",
  },
  働く環境: {
    collaboration: "チーム作業と個人作業の割合",
    customers: "顧客対応の頻度",
    overtime: "残業の状況",
    training: "教育・研修",
    atmosphere: "職場の雰囲気",
    other: "学生に伝えたいこと",
  },
};
export const fields = Object.assign({}, ...Object.values(sections));
export const topics = {
  顧客対応が多い: ["customers"],
  営業ノルマがある: ["duties", "decisions", "other"],
  残業が多い: ["overtime"],
  個人作業が多い: ["collaboration"],
  チーム作業が多い: ["collaboration"],
  単純作業が多い: ["tasks", "duties"],
  突発的な業務が多い: ["tasks", "surprise", "difficulty"],
  転勤が多い: ["other", "wish"],
  責任が重い: ["authority", "decisions"],
  裁量が少ない: ["authority"],
};
export const priorities = ["絶対に避けたい", "できれば避けたい", "気にしない"];
export function validateVoice(input) {
  const out = {};
  for (const [key, label] of Object.entries({
    company: "企業名",
    industry: "業界",
    role: "職種",
    division: "部署",
    year: "入社年度",
  })) {
    if (
      typeof input?.[key] !== "string" ||
      !input[key].trim() ||
      input[key].length > 100
    )
      throw Error(label + "を100文字以内で入力してください。");
    out[key] = input[key].trim();
  }
  if (!/^\d{4}$/.test(out.year))
    throw Error("入社年度を西暦4桁で入力してください。");
  out.answers = {};
  for (const key of Object.keys(fields)) {
    const v = input.answers?.[key];
    if (v == null || v === "") continue;
    if (typeof v !== "string" || v.length > 800)
      throw Error(fields[key] + "は800文字以内です。");
    if (v.trim()) out.answers[key] = v.trim();
  }
  if (!Object.keys(out.answers).length)
    throw Error("経験について少なくとも1項目ご記入ください。");
  if (
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|0\d{1,4}-\d{1,4}-\d{3,4}/.test(
      JSON.stringify(out),
    )
  )
    throw Error("連絡先を取り除いてください。");
  return out;
}
// Resolve partial company links to a role and a division that exist together.
export function selectAssignment(companyRows, requested = {}) {
  const row = companyRows.find(r => r.role === requested.role && r.division === requested.division)
    || companyRows.find(r => r.role === requested.role)
    || companyRows.find(r => r.division === requested.division)
    || companyRows[0];
  return row && {company: row.company, role: row.role, division: row.division};
}
export function scopeVoices(rows, { company, role, division }) {
  return rows.filter(
    (r) =>
      r.company === company &&
      (!role || r.role === role) &&
      (!division || r.division === division),
  );
}
export function evidence(rows) {
  return rows.flatMap((r) =>
    Object.entries(r.answers)
      .filter(([key]) => fields[key])
      .map(([key, text]) => ({
        id: r.id + "." + key,
        employee: r.id,
        role: r.role,
        division: r.division,
        year: r.year,
        key,
        label: fields[key],
        text,
      })),
  );
}
