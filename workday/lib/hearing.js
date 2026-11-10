import { times, validDay } from "./day.js";

const tasksHeader = "3. 1年目の実際の仕事（5つ）";
const dilemmaHeader = "9. 正解のない判断場面（3つ）";
export function isHearingForm(headers) {
  return (
    ["企業名", "職種", tasksHeader, dilemmaHeader].every((h) => headers.includes(h)) &&
    (headers.includes("事業部・部署") || headers.includes("具体的な職種名"))
  );
}

// A short-form answer describes a direction to consider, without assigning an A/B score.
function readDirections(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.match(/^(.*?)\s*(?:→|⇒|->)\s*(.+)$/);
      if (!parts) return null;
      const situation = parts[1]
        .replace(/^(?:[①-⑳]|[0-9０-９]+[.．、)）])\s*/, "")
        .trim();
      return situation && parts[2].trim() ? [situation, parts[2].trim()] : null;
    });
}

function readScenes(text) {
  if (!/推奨[：:]/.test(text)) {
    return readDirections(text).map((pair) =>
      pair && { situation: pair[0], direction: pair[1] },
    );
  }
  // Both inline labels and the older three-line answers use the same markers.
  return text.trim().split(/\r?\n\s*(?=【)/).map((block) => {
    const match = block.trim().match(
      /^([\s\S]+?)\s*[→⇒]?\s*推奨[：:]\s*([\s\S]+?)\s*[→⇒]?\s*避ける(?:判断)?[：:]\s*([\s\S]+)$/,
    );
    if (!match) return null;
    const [, situation, preferred, avoided] = match.map((part) => part.trim());
    if (!situation || !preferred || !avoided || /推奨[：:]|避ける(?:判断)?[：:]/.test(avoided))
      return null;
    return { situation, preferred, avoided };
  });
}

export function hearingDay(headers, row) {
  const field = (h) => row[headers.indexOf(h)]?.trim() || "";
  const company = field("企業名");
  const division = headers.includes("事業部・部署")
    ? field("事業部・部署")
    : "部署未指定";
  const role = field("具体的な職種名") || field("職種");
  if (!company || !division || !role)
    throw Error("企業名・部署・職種が必要です。");
  const tasks = field(tasksHeader);
  if (!tasks) throw Error(company + "：「1年目の実際の仕事」の欄が空です。");
  const dilemma = field(dilemmaHeader);
  const scenes = readScenes(dilemma);
  if (!scenes.length || scenes.length > 3 || scenes.some((scene) => !scene)) {
    throw Error(
      company +
        "：「正解のない判断場面」は「場面→対応」または「場面、推奨：…、避ける判断：…」の形式で1〜3件記入してください。",
    );
  }
  const task = tasks.split(/\r?\n/)[0];
  // Some responses put the failure and interruption under headings in the task cell.
  const failure =
    field("5. トラブル・失敗の実例（3件）") ||
    tasks.match(/(?:^|\n)トラブル・失敗の実例\s*\n([^\n]+)/)?.[1];
  const interruption =
    field("6. 急な割り込みの例（3つ）") ||
    tasks.match(/(?:^|\n)急な割り込みの例\s*\n([^\n]+)/)?.[1];
  const title = (scenes[0].preferred && scenes[0].situation.match(/【([^】]+)】/)?.[1]) || role + "の一日";
  const slots = [
    [task, "まず作業の前提を確認する", "進め方を自分で整理する"],
    [
      failure || tasks.split(/\n/).filter(Boolean)[1] || task,
      "影響の範囲を確認する",
      "経緯を整理して同僚と共有する",
    ],
    [task, "依頼内容を確認する", "自分で手順を整理する"],
    [
      interruption || field("12. 就活生に先に知っておいてほしいこと") || task,
      "依頼の優先順位を確認する",
      "残作業を整理して引き継ぐ",
    ],
  ];
  // Reserve the opening slot for a real task, then play the dilemmas in CSV order.
  // When fewer than three are supplied, retain the failure or handover scene.
  const start = scenes.length === 1 ? 2 : 1;
  scenes.forEach(({ situation, preferred, avoided }, index) => {
    slots[start + index] = [
      situation,
      preferred || "判断に必要な情報を先に確かめる",
      avoided || "関係者と対応方針を相談する",
    ];
  });
  const day = {
    company,
    division,
    role,
    scenario_title: title,
    // Only work-related context is retained, never respondent identity.
    interview: {
      morning: field("1. 出社〜昼休憩まで").slice(0, 650),
      interruption: (interruption || "").split(/\r?\n/)[0].slice(0, 450),
      routine: field("4. 地味だけど必ずある作業").slice(0, 450),
    },
    time_slots: slots.map(([situation, first, second], i) => ({
      time: times[i],
      location: i === 2 ? "打合せスペース" : "自分のデスク",
      npc_name: "チームの同僚",
      situation,
      company_culture_explanation:
        scenes[i - start]?.preferred
          ? "ヒアリング回答で推奨された行動：" + first
          : scenes[i - start]?.direction
            ? "この場面でのヒアリング回答：" + scenes[i - start].direction
            : "回答に記載された業務をもとにした振り返りです。行動の適合度は採点しません。",
      choices: [first, second].map((text, j) => ({
        id: j === 0 ? "A" : "B",
        text,
        actual_culture_match: scenes[i - start]?.preferred ? j === 0 : null,
      })),
    })),
  };
  if (!validDay(day))
    throw Error(
      company +
        "：会社・部署・職種・題名は100文字以内、各場面は700文字以内にしてください。",
    );
  return day;
}
