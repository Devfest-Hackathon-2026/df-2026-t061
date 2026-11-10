import { Firestore } from "@google-cloud/firestore";

export const usesFirestore = () => process.env.WORKDAY_STORE === "firestore";
let client;
export function database() {
  client ??= new Firestore({ projectId: "devfest-512005" });
  return client;
}
export async function readCloudRecord(collection, id) {
  const doc = await database().collection(collection).doc(id).get();
  return doc.exists ? doc.data() : null;
}
export async function reserveCloudAttempt(ticket, audit, db = database()) {
  const control = db.collection("workday-config").doc("inference");
  const attempt = db.collection("workday-attempts").doc(audit.digest);
  await db.runTransaction(async transaction => {
    const [config, previous] = await Promise.all([
      transaction.get(control), transaction.get(attempt),
    ]);
    const session = config.data();
    if (!session || session.id !== ticket.id || session.project !== audit.project ||
        session.model !== audit.model || !Number.isInteger(session.used) ||
        session.used < 0 || session.used >= session.maxCalls ||
        !Number.isInteger(session.maxCalls) || session.maxCalls < 1 || session.maxCalls > 10 ||
        !Number.isFinite(session.expiresAt) || !Number.isFinite(session.issuedAt) || Date.now() > session.expiresAt ||
        Date.now() < session.issuedAt || previous.exists)
      throw Error("今回の生成枠を利用できません。");
    transaction.update(control, { used: session.used + 1 });
    transaction.create(attempt, audit);
  }, { maxAttempts: 1 });
}
