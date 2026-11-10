import { addVoice, listVoices } from "../../../lib/voice-store.js";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await listVoices(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(req) {
  try {
    const text = await req.text();
    if (text.length > 20000) throw Error("回答が長すぎます。");
    const body = JSON.parse(text);
    if (body.consent !== true) throw Error("公開範囲を確認してください。");
    return Response.json(await addVoice(body), { status: 201 });
  } catch (e) {
    return Response.json({ error: e.code || e instanceof SyntaxError ? "回答を登録できませんでした。入力内容をご確認のうえ、もう一度お試しください。" : e.message }, { status: 400 });
  }
}
