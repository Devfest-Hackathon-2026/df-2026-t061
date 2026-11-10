import { handleWorkday } from "../../../lib/workday-server.js";

// The running application has a zero-call budget, independent of credentials.
export async function GET() {
  return Response.json({ enabled: false });
}
export async function POST(req) {
  return handleWorkday(req, false);
}
