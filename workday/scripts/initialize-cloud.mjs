import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const project = "devfest-512005";
const dir = ".workday-local/inference/";
const session = JSON.parse(await readFile(dir + "session.json", "utf8"));
let used = 0;
for (let i = 0; i < session.maxCalls; i++) {
  try { await readFile(dir + session.id + "-" + i + ".json"); used++; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const config = {
  id: session.id, project, model: session.model, maxCalls: session.maxCalls,
  issuedAt: session.issuedAt, expiresAt: session.expiresAt, used,
};
const fields = Object.fromEntries(Object.entries(config).map(([key, value]) =>
  [key, typeof value === "number" ? { integerValue: String(value) } : { stringValue: value }]));
const token = execFileSync("gcloud", ["auth", "print-access-token", "--quiet"], { encoding: "utf8" }).trim();
const res = await fetch("https://firestore.googleapis.com/v1/projects/" + project +
  "/databases/(default)/documents:commit", {
  method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  signal: AbortSignal.timeout(15000),
  body: JSON.stringify({ writes: [{
    update: { name: "projects/" + project + "/databases/(default)/documents/workday-config/inference", fields },
    currentDocument: { exists: false },
  }] }),
});
if (res.status === 409) {
  console.log("Existing shared limit retained.");
} else if (!res.ok) throw Error("Cloud initialization failed with HTTP " + res.status);
else console.log("Shared inference limit initialized. Remaining calls: " + (config.maxCalls - used));
