import { companyStories } from "./sample-companies.js";

export const times = ["09:00", "11:00", "14:00", "17:00"];
const sample = [
  [
    "チームデスク",
    "佐藤リーダー",
    "朝会の直前、問い合わせが入りました。今日の予定に影響しそうです。",
    "予定への影響を朝会で共有する",
    "まず対応を終えてから知らせる",
    "このチームは朝会で優先順位を一緒に決めます。",
    0,
  ],
  [
    "開発デスク",
    "先輩の伊藤さん",
    "仕様書にない動作を見つけました。先輩は別の調査をしています。",
    "もう少し一人で試してみる",
    "15分で仮説をまとめて相談する",
    "15分調べて判断がつかなければ、仮説を添えて相談する習慣があります。",
    1,
  ],
  [
    "会議室",
    "企画の木村さん",
    "新機能のレビューです。使いにくいという声が一件届きました。",
    "利用者の操作を一緒に確かめる",
    "すぐに改善案の試作を始める",
    "利用者の操作を観察してから改善案を決めます。",
    0,
  ],
  [
    "チームデスク",
    "佐藤リーダー",
    "調査が途中ですが、明日は別の担当者が引き継ぎます。",
    "明朝の口頭説明に備える",
    "試したことと未確認点を記録する",
    "非同期でも作業を続けられるよう、途中経過を記録します。",
    1,
  ],
];
function makeSlots(rows) {
  return rows.map(
    (
      [location, npc_name, situation, a, b, company_culture_explanation, match],
      i,
    ) => ({
      time: times[i],
      location,
      npc_name,
      situation,
      company_culture_explanation,
      choices: [a, b].map((text, j) => ({
        id: j ? "B" : "A",
        text,
        actual_culture_match: j === match,
      })),
    }),
  );
}
export const demo = {
  company: "ミナトソフト（架空）",
  division: "プロダクト事業部",
  role: "開発エンジニア",
  scenario_title: "開発チームの平日",
  time_slots: makeSlots(sample),
};
export const stringOk = (s, max = 700) =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max;
export function validDay(d) {
  return (
    d &&
    ["company", "division", "role", "scenario_title"].every((k) =>
      stringOk(d[k], 100),
    ) &&
    Array.isArray(d.time_slots) &&
    d.time_slots.length === 4 &&
    d.time_slots.every(
      (s, i) =>
        s?.time === times[i] &&
        [
          "location",
          "npc_name",
          "situation",
          "company_culture_explanation",
        ].every((k) => stringOk(s[k])) &&
        Array.isArray(s.choices) &&
        s.choices.length === 2 &&
        s.choices.every(
          (c, j) =>
            c?.id === (j ? "B" : "A") &&
            stringOk(c.text) &&
            (typeof c.actual_culture_match === "boolean" ||
              c.actual_culture_match === null),
        ) &&
        (s.choices.every((c) => c.actual_culture_match === null) ||
          (s.choices.every(
            (c) => typeof c.actual_culture_match === "boolean",
          ) &&
            s.choices.filter((c) => c.actual_culture_match).length === 1)),
    )
  );
}
export function validHistory(day, h) {
  return (
    validDay(day) &&
    Array.isArray(h) &&
    h.length === 4 &&
    h.every((a) => ["A", "B"].includes(a?.id) && stringOk(a.why, 300))
  );
}
export function review(day, h) {
  return day.time_slots.map((s, i) => {
    const c = s.choices.find((c) => c.id === h[i].id);
    return {
      time: s.time,
      action: c.text,
      match: c.actual_culture_match,
      why: h[i].why,
      culture: s.company_culture_explanation,
    };
  });
}
const sales = [
  [
    "営業デスク",
    "営業リーダー",
    "初回の商談に向けて、提案資料と質問を準備する時間があります。",
    "機能の紹介を先に練る",
    "相手が解決したい課題の仮説を書く",
    "初回は相手の目的を把握するため、質問の準備から始めます。",
    1,
  ],
  [
    "打合せ席",
    "取引先の担当者",
    "商談で「来月までに使いたい」と言われました。開発予定は未確認です。",
    "期限の背景を聞き、社内で確認する",
    "早めの導入を前提に提案する",
    "期待を正確に合わせるため、納期は開発側と確認してから回答します。",
    0,
  ],
  [
    "会議室",
    "導入支援の同僚",
    "お客様から操作の質問が続いています。同僚に何を共有しますか。",
    "質問の件数を報告する",
    "質問が出た作業と利用目的を伝える",
    "支援チームは、お客様が達成したい作業を起点に案内を考えます。",
    1,
  ],
  [
    "営業デスク",
    "営業リーダー",
    "見積もりを送付しました。次の担当者が明日フォローします。",
    "合意事項と未回答の質問を記録する",
    "送った資料を転送する",
    "約束と未確認点を分けて記録し、担当者が変わっても引き継げるようにします。",
    0,
  ],
];
export const salesDay = {
  ...demo,
  division: "営業事業部",
  role: "法人営業",
  scenario_title: "顧客と向き合う一日",
  time_slots: makeSlots(sales),
};
const designDay = {
  company: "ナギデザイン（架空）",
  division: "制作部",
  role: "デザイナー",
  scenario_title: "店舗案内のデザインレビュー",
  time_slots: makeSlots([
    [
      "制作デスク",
      "ディレクター",
      "店舗の案内図を改訂します。誰がどこで迷うか、依頼書には記載がありません。",
      "まず案内図を描く",
      "利用者が迷った場所を聞く",
      "制作前に利用者が困った場面を確かめます。",
      1,
    ],
    [
      "制作デスク",
      "同僚",
      "文字を大きくすると、案内図にすべての情報が入りません。",
      "現場で読む距離を確認する",
      "文字を縮めて全項目を残す",
      "実際に読む場面での見やすさを優先します。",
      0,
    ],
    [
      "会議室",
      "店長",
      "二案のどちらが良いか、意見が分かれました。",
      "スタッフの多数決で決める",
      "来店者に道順をたどってもらう",
      "使う人の行動を観察して判断します。",
      1,
    ],
    [
      "制作デスク",
      "ディレクター",
      "納品前に印刷の色味が少し変わりました。",
      "現物を確かめて記録する",
      "画面上のデータを確認する",
      "掲出環境でのチェックを引継ぎに残します。",
      0,
    ],
  ]),
};
const logisticsDay = {
  company: "あおば物流（架空）",
  division: "運営部",
  role: "配送コーディネーター",
  scenario_title: "配送センターの平日",
  time_slots: makeSlots([
    [
      "配車デスク",
      "班長",
      "朝の入荷が遅れ、一便の出発に影響が出そうです。",
      "影響先を確認して班に知らせる",
      "すべての到着を待つ",
      "見込みの段階で共有し、関係者に準備の時間をつくります。",
      0,
    ],
    [
      "倉庫",
      "担当者",
      "伝票と箱の個数が一致しません。",
      "帳簿に合わせて出荷する",
      "現物を再確認して差を記録する",
      "現物と伝票の両方を確認します。",
      1,
    ],
    [
      "会議室",
      "班長",
      "午後の便が混み、積み順の変更を検討しています。",
      "現場と安全な手順を確認する",
      "速く運べる順に決める",
      "作業者と安全な手順を共有してから変更します。",
      0,
    ],
    [
      "配車デスク",
      "夜勤の同僚",
      "再配達の希望時刻がまだ確定していません。",
      "確定した配達だけを渡す",
      "未確定事項と次の連絡先を伝える",
      "未確定の依頼にも次の担当者を決めます。",
      1,
    ],
  ]),
};
const additionalDays = companyStories.map(
  (
    [company, division, role, scenario_title, workplace, decisions],
    companyIndex,
  ) => ({
    company: company + "（架空）",
    division,
    role,
    scenario_title,
    time_slots: makeSlots(
      decisions.map(([situation, preferred, alternative, rationale], i) => {
        const match = (companyIndex + Math.floor(i / 2)) % 2;
        const actions =
          match === 0 ? [preferred, alternative] : [alternative, preferred];
        return [
          i === 2 ? "打合せスペース" : workplace,
          ["班長", "先輩社員", "チームリーダー", "交代の同僚"][i],
          situation,
          ...actions,
          rationale,
          match,
        ];
      }),
    ),
  }),
);
export const presets = [
  demo,
  salesDay,
  designDay,
  logisticsDay,
  ...additionalDays,
];

// The employer reviews these editable prompts before saving the scenario.
export function registrationDraft(values) {
  const fields = [
    "company",
    "division",
    "role",
    "scenario_title",
    "episode",
    "culture",
  ];
  const data = {};
  for (const k of fields) {
    if (!stringOk(values[k], ["episode", "culture"].includes(k) ? 700 : 100))
      throw Error("空欄や空白だけの項目があります。入力を確認してください。");
    data[k] = values[k].trim();
  }
  const situations = [
    data.episode,
    "対応を進める中で、判断に迷う点が出てきました。",
    "チームで対応方針を決める時間です。",
    "この件を明日の担当者へ引き継ぎます。",
  ];
  const pairs = [
    ["朝会で優先順位を相談する", "まず自分で対応方針を考える"],
    ["仮説を添えて同僚に相談する", "資料を調べて判断材料をそろえる"],
    ["判断の根拠を共有する", "試作品を使って方針を提案する"],
    ["判断と未解決の点を記録する", "次の担当者に直接説明する"],
  ];
  const result = {
    ...data,
    time_slots: makeSlots(
      times.map((_, i) => [
        ["チームデスク", "自分のデスク", "会議室", "チームデスク"][i],
        ["上司", "同僚", "上司", "同僚"][i],
        values[times[i] + " 状況"] || situations[i],
        values[times[i] + " 選択肢A"] || pairs[i][0],
        values[times[i] + " 選択肢B"] || pairs[i][1],
        values[times[i] + " 文化の理由"] || data.culture,
        0,
      ]),
    ),
  };
  if (!validDay(result))
    throw Error("各場面の回答は700文字以内にしてください。");
  return result;
}
