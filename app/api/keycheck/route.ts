// POST /api/keycheck — checks a free Groq or Gemini key before saving it in the browser.
// The key is only used for this one test request and never stored on the server.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/models",
};
const USABLE: Record<string, RegExp> = {
  groq: /^(openai\/gpt-oss-(120b|20b)|qwen\/qwen3)/,
  gemini: /gemini-3/,
};

export async function POST(req: Request) {
  try {
    const { provider, key } = await req.json();
    if (!ENDPOINTS[provider] || typeof key !== "string" || key.length < 20 || key.length > 300)
      return Response.json({ ok: false, error: "That doesn't look like a valid key." }, { status: 400 });
    const res = await fetch(ENDPOINTS[provider], { headers: { authorization: `Bearer ${key.trim()}` } });
    if (res.status === 401 || res.status === 403 || res.status === 400)
      return Response.json({ ok: false, error: "This key was not accepted. Copy it again from the key page." });
    if (!res.ok) return Response.json({ ok: false, error: `The provider answered ${res.status}. Try again in a minute.` });
    const data: any = await res.json().catch(() => ({}));
    const ids: string[] = (data.data ?? []).map((m: any) => String(m.id).replace(/^models\//, ""));
    const models = ids.filter((id) => USABLE[provider].test(id));
    return Response.json({ ok: true, models: models.length || ids.length });
  } catch {
    return Response.json({ ok: false, error: "Couldn't check the key right now. Try again." }, { status: 500 });
  }
}
