import test from "node:test";
import assert from "node:assert/strict";
import { reserveCloudAttempt } from "../lib/firestore-store.js";

test("Firestore reserves quota and digest atomically without transaction retries", async () => {
  let session = { id: "submission", project: "devfest-512005", model: "gemini-3.1-flash-lite",
    used: 6, maxCalls: 10, issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 };
  const attempts = new Map();
  const db = {
    collection: collection => ({ doc: id => ({ collection, id }) }),
    async runTransaction(run, options) {
      assert.equal(options.maxAttempts, 1);
      const writes = [];
      await run({
        get: async ref => ref.collection === "workday-config"
          ? { data: () => session } : { exists: attempts.has(ref.id) },
        update: (_, patch) => writes.push(() => { session = { ...session, ...patch }; }),
        create: (ref, audit) => writes.push(() => attempts.set(ref.id, audit)),
      });
      writes.forEach(write => write());
    },
  };
  const audit = digest => ({ project: session.project, model: session.model, digest, status: "reserved" });
  const ticket = { id: session.id };
  await reserveCloudAttempt(ticket, audit("first"), db);
  assert.equal(session.used, 7);
  await assert.rejects(reserveCloudAttempt(ticket, audit("first"), db));
  assert.equal(session.used, 7);
  for (const id of ["second", "third", "fourth"])
    await reserveCloudAttempt(ticket, audit(id), db);
  await assert.rejects(reserveCloudAttempt(ticket, audit("fifth"), db));
  assert.equal(session.used, 10);
  assert.equal(attempts.size, 4);
  session = { ...session, used: 0, expiresAt: Date.now() - 1 };
  await assert.rejects(reserveCloudAttempt(ticket, audit("expired"), db));
  assert.equal(session.used, 0);
});
