import path from "node:path";
import { readFile } from "node:fs/promises";
import { runOnce } from "../../../lib/team-once.js";
export const runtime = "nodejs";
const dir = path.join(process.cwd(), ".workday-experiment");
async function enabled() {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const ticket = JSON.parse(
      await readFile(path.join(dir, "approval.json"), "utf8"),
    );
    const now = Date.now();
    return (
      ticket.project === "devfest-512005" &&
      ticket.purpose === "one-sample" &&
      Number.isFinite(ticket.issuedAt) &&
      now >= ticket.issuedAt &&
      now - ticket.issuedAt < 30 * 60 * 1000
    );
  } catch {
    return false;
  }
}
export async function GET() {
  return Response.json(
    { enabled: await enabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req) {
  let origin;
  try {
    origin = new URL(req.headers.get("origin"));
  } catch {
    return Response.json(
      { error: "ローカルの画面から実行してください。" },
      { status: 403 },
    );
  }
  if (
    !(await enabled()) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    origin.protocol !== "http:" ||
    origin.host !== req.headers.get("host") ||
    req.headers.get("x-workday-action") !== "one-synthetic-case"
  )
    return Response.json(
      { error: "この端末ではクラウド実行を許可していません。" },
      { status: 403 },
    );
  try {
    const body = await req.json();
    const result = await runOnce({
      approved: await enabled(),
      requested: body.evidence,
      dir,
      sample: await readFile(
        path.join(process.cwd(), "public/team-experiment.csv"),
        "utf8",
      ),
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 409 });
  }
}
