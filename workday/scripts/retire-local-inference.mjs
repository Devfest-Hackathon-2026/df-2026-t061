import { readFile, writeFile, rename } from "node:fs/promises";
const file = ".workday-local/inference/session.json";
const session = JSON.parse(await readFile(file, "utf8"));
if (session.expiresAt !== 0) {
  await writeFile(file + ".before-cloud", JSON.stringify(session), { mode: 0o600, flag: "wx" });
  await writeFile(file + ".tmp", JSON.stringify({ ...session, expiresAt: 0 }), { mode: 0o600 });
  await rename(file + ".tmp", file);
}
console.log("New inference uses the shared Firestore quota on Cloud Run.");
