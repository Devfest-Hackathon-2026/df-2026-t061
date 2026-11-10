import { usesFirestore, database } from "./firestore-store.js";
import { readFile, mkdir, readdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateVoice } from "./voices.js";
const dir = () => path.join(process.cwd(), ".workday-local", "voices");
export async function listVoices() {
  const seeds = JSON.parse(
    await readFile(path.join(process.cwd(), "data/voices.json"), "utf8"),
  );
  if (usesFirestore()) {
    const snapshot = await database().collection("workday-voices").limit(300).get();
    return seeds.concat(snapshot.docs.map(doc => doc.data()));
  }
  let files;
  try {
    files = await readdir(dir());
  } catch (e) {
    if (e.code === "ENOENT") return seeds;
    throw e;
  }
  return seeds.concat(
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map(async (f) =>
          JSON.parse(await readFile(path.join(dir(), f), "utf8")),
        ),
    ),
  );
}
export async function addVoice(body) {
  const voice = {
    ...validateVoice(body),
    id: "R-" + randomUUID(),
    sample: false,
  };
  if (usesFirestore()) {
    await database().collection("workday-voices").doc(voice.id).create(voice);
    return voice;
  }
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  const file = path.join(dir(), voice.id + ".json");
  await writeFile(file + ".tmp", JSON.stringify(voice), { mode: 0o600 });
  await rename(file + ".tmp", file);
  return voice;
}
