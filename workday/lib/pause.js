import { validDay, stringOk } from "./day.js";

export function validPause(p) {
  return (
    validDay(p?.day) &&
    Number.isInteger(p.step) &&
    p.step >= 0 &&
    p.step < 4 &&
    Array.isArray(p.answers) &&
    p.answers.length === p.step &&
    p.answers.every(
      (a) => ["A", "B"].includes(a?.id) && stringOk(a.why, 300),
    ) &&
    ["", "A", "B"].includes(p.id) &&
    typeof p.why === "string" &&
    p.why.length <= 300
  );
}
export function scenarioKey(day) {
  return JSON.stringify([
    day.company,
    day.division,
    day.role,
    day.scenario_title,
  ]);
}
