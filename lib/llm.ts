// ─────────────────────────────────────────────────────────────
//  THE BRAIN: many models, automatic fallback
//  0. The model the USER connected in the app (their own key), if any
//  1. Claude            ANTHROPIC_API_KEY
//  2. ChatGPT (OpenAI)  OPENAI_API_KEY
//  3. Gemini (free)     GEMINI_API_KEY   — accepts big requests (code + screenshots)
//  4. Groq (free)       GROQ_API_KEY     — vision model, then a text-only backup
//  5. Any OpenAI-compatible API (FALLBACK_*)
//  If one fails (no credit, rate limit, outage) the next one is used.
//  The agent speaks "Anthropic format" internally; this file translates
//  to/from the OpenAI format for the other providers.
// ─────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";

type Block = any; // Anthropic content block (+ optional _oa for OpenAI-format providers)

export type ModelResult = { content: Block[]; provider: string; fallbackReason?: string };

// What the user picked in the app's "Connections" panel
export type Brain = { provider: "claude" | "openai" | "gemini" | "groq" | "openrouter"; key: string; model?: string };

type Provider = {
  name: string;
  url: string;
  key: string;
  model: string;
  vision?: boolean;
  tokenParam?: "max_tokens" | "max_completion_tokens";
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;
  maxTokens?: number;
};

export const DEFAULT_MODELS = {
  claude: "claude-sonnet-5-5",
  openai: "gpt-6.2-sol",
  gemini: "gemini-3.5-flash",
  groq: "qwen/qwen3.8-27b",
  openrouter: "anthropic/claude-sonnet-5.5",
};

const OPENROUTER_BACKUPS = ["anthropic/claude-sonnet-5.5", "openai/gpt-6.2-sol", "google/gemini-3.5-flash"];

const PRESETS = {
  openrouter: (key: string, model?: string): Provider => ({
    // One account → Claude, ChatGPT, Gemini and more (connected with one click in the app)
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    key,
    model: model || DEFAULT_MODELS.openrouter,
    vision: true,
    headers: { "HTTP-Referer": process.env.APP_URL || "https://siteagent.app", "X-Title": "SiteAgent" },
  }),
  openai: (key: string, model?: string): Provider => ({
    name: "ChatGPT",
    url: "https://api.openai.com/v1",
    key,
    model: model || DEFAULT_MODELS.openai,
    vision: true,
    tokenParam: "max_completion_tokens",
  }),
  gemini: (key: string, model?: string): Provider => ({
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    key,
    model: model || DEFAULT_MODELS.gemini,
    vision: true,
    maxTokens: 32000, // a full page inside a tool call is long; thinking also uses output tokens
    extra: { reasoning_effort: "low" },
  }),
  groq: (key: string, model?: string): Provider => ({
    name: "Groq",
    url: "https://api.groq.com/openai/v1",
    key,
    model: model || DEFAULT_MODELS.groq, // best Groq model that can SEE + use tools
    vision: !/gpt-oss|llama-3/.test(model || ""),
    extra: { reasoning_format: "hidden" },
  }),
  groqText: (key: string): Provider => ({
    // backup on Groq: strongest production model, text-only (gets QA findings instead of screenshots)
    name: "Groq",
    url: "https://api.groq.com/openai/v1",
    key,
    model: process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b",
    vision: false,
    extra: { reasoning_effort: "medium" },
  }),
};

function serverProviders(): Provider[] {
  const e = process.env;
  const list: Provider[] = [];
  if (e.OPENAI_API_KEY) list.push(PRESETS.openai(e.OPENAI_API_KEY, e.OPENAI_MODEL));
  if (e.GEMINI_API_KEY) {
    // Each Gemini model has its OWN free quota, so when one is used up we try the next.
    const models = [e.GEMINI_MODEL || DEFAULT_MODELS.gemini, ...(e.GEMINI_FALLBACK_MODELS ?? "gemini-2.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite").split(",")]
      .map((m) => m.trim())
      .filter((m, i, all) => m && all.indexOf(m) === i);
    for (const m of models) list.push(PRESETS.gemini(e.GEMINI_API_KEY, m));
  }
  if (e.GROQ_API_KEY) list.push(PRESETS.groq(e.GROQ_API_KEY, e.GROQ_MODEL), PRESETS.groqText(e.GROQ_API_KEY));
  if (e.FALLBACK_API_KEY && e.FALLBACK_BASE_URL && e.FALLBACK_MODEL)
    list.push({
      name: "Custom",
      url: e.FALLBACK_BASE_URL.replace(/\/$/, ""),
      key: e.FALLBACK_API_KEY,
      model: e.FALLBACK_MODEL,
      vision: e.FALLBACK_VISION !== "0",
    });
  return list;
}

// A failing provider is skipped for a few minutes instead of failing again on every step.
const downUntil: Record<string, { until: number; reason: string }> = ((globalThis as any).__down ??= {});
const isDown = (id: string) => (downUntil[id]?.until ?? 0) > Date.now();
// How long to skip depends on the problem: a per-minute limit clears quickly, a daily quota or a bad key doesn't.
function skipFor(err: any): number {
  const msg = String(err?.message ?? err);
  if (/per ?day|daily|PerDay/i.test(msg)) return 60 * 60_000;
  if (/\b(401|403)\b|invalid.*key|unauthori[sz]ed|permission/i.test(msg)) return 60 * 60_000;
  if (/\b(413)\b|too large/i.test(msg)) return 60_000;
  if (/\b429\b|quota|rate/i.test(msg)) return 45_000;
  return 2 * 60_000;
}
const markDown = (id: string, reason: string, ms: number) => (downUntil[id] = { until: Date.now() + ms, reason });

export const hasAnyModel = () => !!process.env.ANTHROPIC_API_KEY || serverProviders().length > 0;

async function callClaude(key: string, model: string, system: string, tools: Anthropic.Tool[], messages: Anthropic.MessageParam[]) {
  const msg = await new Anthropic({ apiKey: key }).messages
    .stream({ model, max_tokens: 16000, system, ...(tools.length ? { tools } : {}), messages: stripPrivate(messages) })
    .finalMessage();
  return msg.content as Block[];
}

export async function callModel(
  system: string,
  tools: Anthropic.Tool[],
  messages: Anthropic.MessageParam[],
  files: Record<string, string> = {},
  brain?: Brain,
): Promise<ModelResult> {
  // Build the ordered list of things to try
  type Attempt = { id: string; label: string; run: () => Promise<Block[]> };
  const attempts: Attempt[] = [];

  if (brain?.key) {
    const id = `user-${brain.provider}-${brain.key.slice(-6)}`;
    if (brain.provider === "claude") {
      const model = brain.model || DEFAULT_MODELS.claude;
      attempts.push({ id, label: `Claude · ${model} (your key)`, run: () => callClaude(brain.key, model, system, tools, messages) });
    } else {
      const p = PRESETS[brain.provider](brain.key, brain.model);
      attempts.push({ id, label: `${p.name} · ${p.model}`, run: () => callOpenAICompatible(p, system, tools, messages, files) });
      // OpenRouter: if the chosen model fails, try the other big models on the same account first
      if (brain.provider === "openrouter") {
        for (const m of OPENROUTER_BACKUPS.filter((x) => x !== p.model)) {
          const q = PRESETS.openrouter(brain.key, m);
          attempts.push({ id: `${id}-${m}`, label: `OpenRouter · ${m}`, run: () => callOpenAICompatible(q, system, tools, messages, files) });
        }
      }
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.claude;
    attempts.push({ id: "claude", label: `Claude · ${model}`, run: () => callClaude(process.env.ANTHROPIC_API_KEY!, model, system, tools, messages) });
  }
  for (const p of serverProviders()) {
    attempts.push({
      id: `${p.name}-${p.model}`,
      label: `${p.name} · ${p.model}${p.vision === false ? " (text-only)" : ""}`,
      run: () => callOpenAICompatible(p, system, tools, messages, files),
    });
  }
  if (!attempts.length) throw new Error("No AI model connected. Add a key in ⚙️ Connections, or set one in .env.local.");

  const problems: string[] = [];
  for (const a of attempts) {
    if (isDown(a.id)) {
      problems.push(`${a.label}: ${downUntil[a.id].reason} (skipping for now)`);
      continue;
    }
    try {
      const content = await a.run();
      return {
        content,
        provider: a.label,
        fallbackReason: problems.length ? `${problems.join(" | ")} → switched to ${a.label}` : undefined,
      };
    } catch (err: any) {
      const reason = shortError(err);
      markDown(a.id, reason, skipFor(err));
      problems.push(`${a.label}: ${reason}`);
    }
  }
  const quota = problems.some((x) => /429|quota|rate|too large|413/i.test(x));
  throw new Error(
    quota
      ? `The free AI models are at their limit right now (${problems.length} tried). Wait about a minute and the agent retries automatically, or connect another model in Connections. Details: ${problems.join(" | ")}`
      : `All models failed. ${problems.join(" | ")}`,
  );
}

// ── Free models: OpenAI-compatible chat completions ──────────
async function callOpenAICompatible(
  p: Provider,
  system: string,
  tools: Anthropic.Tool[],
  messages: Anthropic.MessageParam[],
  files: Record<string, string>,
) {
  const history = toOpenAI(messages, p.vision !== false, files);
  if (p.name === "Gemini" || /gemini/i.test(p.model)) addGeminiSignatures(history);
  const body = {
    model: p.model,
    [p.tokenParam ?? "max_tokens"]: Number(process.env.FALLBACK_MAX_TOKENS || p.maxTokens || 16000),
    messages: [{ role: "system", content: system }, ...history],
    ...(tools.length
      ? {
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          tool_choice: "auto",
        }
      : {}),
    ...p.extra,
  };

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${p.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}`, ...p.headers },
      body: JSON.stringify(body),
    });
    if (res.status !== 429 && res.status < 500) break;
    const errText = await res.clone().text();
    if (/too large|context|maximum|per ?day|PerDay/i.test(errText)) break; // retrying won't help
    // free tiers rate-limit per minute: wait as long as the provider asks (up to 40s), then retry
    const asked = Number(errText.match(/retry(?:Delay"?:\s*"|\s+in\s+)(\d+(?:\.\d+)?)s/i)?.[1] ?? 0);
    const wait = asked ? Math.min(asked + 1, 40) * 1000 : 3000 * (attempt + 1);
    if (attempt === 2) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  const data: any = await res!.json().catch(() => ({}));
  if (!res!.ok) {
    const e = Array.isArray(data) ? data[0]?.error : data?.error;
    throw new Error(`${res!.status} ${e?.message ?? "unknown error"}`);
  }

  const choice = data.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  if (!msg.content && !msg.tool_calls?.length)
    console.warn(`[SiteAgent] ${p.name} ${p.model} returned an empty reply (finish_reason: ${choice.finish_reason ?? "unknown"})`);
  const blocks: Block[] = [];
  const text = (typeof msg.content === "string" ? msg.content : "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (text) blocks.push({ type: "text", text });
  for (const tc of msg.tool_calls ?? []) {
    const id = String(tc.id || `call_${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, "_");
    let input: any = {};
    try {
      input = JSON.parse(tc.function?.arguments || "{}");
    } catch {
      input = {};
    }
    // keep the raw call (incl. provider extras like Gemini thought signatures) to send back later
    blocks.push({ type: "tool_use", id, name: tc.function?.name, input, _oa: { ...tc, id } });
  }
  if (blocks.length === 0) blocks.push({ type: "text", text: `(no response${choice.finish_reason ? ": " + choice.finish_reason : ""})` });
  return blocks;
}

// Anthropic message history → OpenAI message list
// Free tiers limit request size, so old copies of the full HTML are removed
// and the CURRENT PAGES are sent once at the end.
function compactCall(call: any) {
  if (call.function?.name !== "write_page") return call;
  let page = "";
  try {
    page = JSON.parse(call.function.arguments || "{}").page ?? "";
  } catch {}
  return { ...call, function: { ...call.function, arguments: JSON.stringify({ page, html: "[omitted: see CURRENT PAGES at the end]" }) } };
}

// Gemini 3 needs a "thought signature" on each tool call. Calls made by
// another model (Claude/Groq) don't have one, so we use Google's documented bypass value.
function addGeminiSignatures(history: any[]) {
  for (const m of history) {
    if (m.role !== "assistant" || !m.tool_calls) continue;
    m.tool_calls = m.tool_calls.map((tc: any) =>
      tc.extra_content?.google?.thought_signature
        ? tc
        : { ...tc, extra_content: { ...tc.extra_content, google: { ...tc.extra_content?.google, thought_signature: "skip_thought_signature_validator" } } },
    );
  }
}

function toOpenAI(messages: Anthropic.MessageParam[], vision = true, files: Record<string, string> = {}): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = m.content as Block[];

    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const calls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => compactCall(b._oa ?? { id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }

    // user turn: tool results become "tool" messages; their screenshots follow as one user message
    const images: any[] = [];
    const userText: string[] = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const parts = typeof b.content === "string" ? [{ type: "text", text: b.content }] : (b.content ?? []);
        const texts: string[] = [];
        for (const p of parts) {
          if (p.type === "text") texts.push(p.text);
          if (p.type === "image") {
            images.push({ type: "text", text: texts[texts.length - 1] ?? "Screenshot:" });
            images.push({ type: "image_url", image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } });
          }
        }
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: texts.join("\n") || "done" });
      } else if (b.type === "text") {
        userText.push(b.text);
      }
    }
    if (images.length && !vision)
      out.push({ role: "user", content: "(Screenshots unavailable for this model: rely on the automatic QA findings above.)" });
    if (images.length && vision) out.push({ role: "user", content: [{ type: "text", text: "Screenshots from check_site:" }, ...images] });
    if (userText.length) out.push({ role: "user", content: userText.join("\n") });
  }
  const pages = Object.entries(files);
  if (pages.length)
    out.push({
      role: "user",
      content:
        "CURRENT PAGES of the site. For edit_page, copy old_text exactly from here:\n\n" +
        pages.map(([name, html]) => `===== ${name} =====\n${html}`).join("\n\n"),
    });
  return out;
}

// Remove fallback-only fields before sending history to Claude
function stripPrivate(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((m) =>
    Array.isArray(m.content)
      ? { ...m, content: (m.content as Block[]).map(({ _oa, ...rest }) => rest) as any }
      : m,
  );
}

function shortError(err: any): string {
  const s = err?.status ? `${err.status}` : "";
  const msg = err?.error?.error?.message || err?.message || "error";
  return `${s} ${msg}`.trim().slice(0, 120);
}
