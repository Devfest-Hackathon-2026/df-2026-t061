import { usesFirestore, readCloudRecord } from "./firestore-store.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = () => path.join(process.cwd(), ".workday-local", "inference");
export async function cloudSession() {
  try {
    const session = usesFirestore()
      ? await readCloudRecord("workday-config", "inference")
      : JSON.parse(await readFile(path.join(root(), "session.json"), "utf8"));
    if (!session) return null;
    if (!/^[a-z0-9-]+$/.test(session.id) || session.project !== "devfest-512005" ||
        session.model !== "gemini-3.1-flash-lite" || !Number.isInteger(session.maxCalls) || session.maxCalls < 1 || session.maxCalls > 10 ||
        !Number.isFinite(session.issuedAt) || Date.now() < session.issuedAt ||
        !Number.isFinite(session.expiresAt) || Date.now() > session.expiresAt) return null;
    if (usesFirestore()) {
      if (!Number.isInteger(session.used) || session.used < 0 || session.used > session.maxCalls) return null;
      return { ...session, remaining: session.maxCalls - session.used };
    }
    let used = 0;
    for (let i=0;i<session.maxCalls;i++) {
      try { await readFile(path.join(root(), session.id+"-"+i+".json")); used++; }
      catch (e) { if (e.code !== "ENOENT") return null; }
    }
    return {...session, remaining:session.maxCalls-used};
  } catch { return null; }
}
export async function reserveCloudSlot(session, audit) {
  await mkdir(root(), {recursive:true, mode:0o700});
  for (let i=0;i<session.maxCalls;i++) {
    const file=path.join(root(), session.id+"-"+i+".json");
    try {
      await writeFile(file, JSON.stringify(audit), {flag:"wx",mode:0o600});
      return file;
    } catch(e) { if(e.code !== "EEXIST") throw e; }
  }
  throw Error("今回の実行回数の上限に達しました。");
}
