// POST /api/agent — runs ONE step of the agent loop (a serverless function on Vercel).
import { runStep } from "@/lib/agent";
import { hasAnyModel } from "@/lib/llm";
import { directionBrief, pickDirection } from "@/lib/design";
import { getConn, type OpenRouterConn } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300; // writing a full site can take ~30-60s
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages, files, siteId, brain: picked, style } = await req.json();
    // New site: give the agent a concrete art direction so every site looks different
    let direction: string | undefined;
    if (Array.isArray(messages) && messages.length === 1 && typeof messages[0]?.content === "string" && !messages[0].content.includes("ART DIRECTION")) {
      const d = pickDirection(messages[0].content, style);
      messages[0] = { ...messages[0], content: messages[0].content + directionBrief(d) };
      direction = d.name;
    }
    let brain = picked;
    // "Connected with OpenRouter": the key lives in an encrypted cookie, not in the browser
    if (picked?.provider === "openrouter") {
      const conn = await getConn<OpenRouterConn>("openrouter");
      brain = conn ? { provider: "openrouter", key: conn.key, model: picked.model } : undefined;
    }
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) {
      return Response.json({ error: "Invalid conversation" }, { status: 400 });
    }
    if (!hasAnyModel() && !brain?.key && !process.env.MOCK_LLM) {
      return Response.json({ error: "No AI model connected. Open ⚙️ Connections and add a key (Gemini and Groq are free), or set one in the environment variables." }, { status: 500 });
    }
    const origin = new URL(req.url).origin;
    const result = await runStep({ messages, files: files ?? {}, siteId, origin, brain: brain?.key ? brain : undefined });
    if (direction) result.events.unshift({ type: "direction", name: direction });
    return Response.json(result);
  } catch (err: any) {
    console.error(err);
    return Response.json({ error: err?.message ?? "Agent step failed" }, { status: 500 });
  }
}
