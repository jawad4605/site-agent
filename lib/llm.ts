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
  // Tokens-per-minute limit of this key (Groq free: 8,000). When set and small, requests are
  // squeezed to fit: short instructions, recent history only, the page in focus only, no screenshots.
  tpm?: number;
};

const LEAN_UNDER = 40_000; // budgets below this use lean mode

export const DEFAULT_MODELS = {
  claude: "claude-sonnet-5-5",
  openai: "gpt-6.2-sol",
  gemini: "gemini-3.5-flash",
  groq: "openai/gpt-oss-120b",
  openrouter: "anthropic/claude-sonnet-5.5",
};

// Groq chat models that can call tools. Each has its own free budget (30 requests/min, 8K tokens/min,
// 200K tokens/day), so the agent rotates through all of them. Override with GROQ_MODELS.
const GROQ_MODELS = [
  ...new Set(
    (process.env.GROQ_MODELS ?? `${process.env.GROQ_MODEL || "openai/gpt-oss-120b"},qwen/qwen3.8-27b,openai/gpt-oss-20b`)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  ),
];

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
    // Groq: very fast. Free plan per model: 30 requests/min, 8K tokens/min, 200K tokens/day,
    // so requests are squeezed into the token budget (lean mode). Developer plan: set GROQ_TPM=250000.
    name: "Groq",
    url: "https://api.groq.com/openai/v1",
    key,
    model: model || DEFAULT_MODELS.groq,
    vision: false,
    tpm: Number(process.env.GROQ_TPM || 8000),
    extra: /gpt-oss/.test(model || "") ? { reasoning_effort: "low" } : { reasoning_format: "hidden" },
  }),
};

function serverProviders(): Provider[] {
  const e = process.env;
  const list: Provider[] = [];
  if (e.OPENAI_API_KEY) list.push(PRESETS.openai(e.OPENAI_API_KEY, e.OPENAI_MODEL));
  if (e.GEMINI_API_KEY) {
    // Each Gemini model has its OWN free quota, so when one is used up we try the next.
    const models = [e.GEMINI_MODEL || DEFAULT_MODELS.gemini, ...(e.GEMINI_FALLBACK_MODELS ?? "gemini-3.1-flash-lite").split(",")]
      .map((m) => m.trim())
      .filter((m, i, all) => m && all.indexOf(m) === i);
    for (const m of models) list.push(PRESETS.gemini(e.GEMINI_API_KEY, m));
  }
  if (e.GROQ_API_KEY) {
    // Each Groq model has its OWN per-minute and per-day budget, so spreading work across them multiplies capacity.
    for (const m of GROQ_MODELS) list.push(PRESETS.groq(e.GROQ_API_KEY, m));
  }
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
  if (/does not fit/i.test(msg)) return 0; // only THIS request is too big; the next, smaller one may fit
  if (/\b(413)\b|too large|tokens per minute|TPM/i.test(msg)) return 60_000;
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
  brainOrBrains?: Brain | Brain[], // every key the user connected, tried in order before the server's keys
  leanSystem?: string, // short version of the instructions for small token budgets
): Promise<ModelResult> {
  // Build the ordered list of things to try
  type Attempt = { id: string; label: string; run: () => Promise<Block[]> };
  const attempts: Attempt[] = [];
  const brains = (Array.isArray(brainOrBrains) ? brainOrBrains : brainOrBrains ? [brainOrBrains] : []).filter((b) => b?.key);

  for (const brain of brains) {
    const id = `user-${brain.provider}-${brain.key.slice(-6)}`;
    if (brain.provider === "claude") {
      const model = brain.model || DEFAULT_MODELS.claude;
      attempts.push({ id, label: `Claude · ${model} (your key)`, run: () => callClaude(brain.key, model, system, tools, messages) });
    } else {
      const p = PRESETS[brain.provider](brain.key, brain.model);
      attempts.push({ id, label: `${p.name} · ${p.model}${brain.provider === "openrouter" ? "" : " (your key)"}`, run: () => callOpenAICompatible(p, system, tools, messages, files, leanSystem) });
      // A student's own Groq or Gemini key: use EVERY free model on that key (each has its own
      // per-minute and per-day budget) before touching the server's shared keys.
      const sameKeyModels =
        brain.provider === "groq" ? GROQ_MODELS : brain.provider === "gemini" ? [DEFAULT_MODELS.gemini, "gemini-3.1-flash-lite"] : [];
      for (const m of sameKeyModels.filter((x) => x !== p.model)) {
        const q = PRESETS[brain.provider as "groq" | "gemini"](brain.key, m);
        attempts.push({ id: `${id}-${m}`, label: `${q.name} · ${m} (your key)`, run: () => callOpenAICompatible(q, system, tools, messages, files, leanSystem) });
      }
      // OpenRouter: if the chosen model fails, try the other big models on the same account first
      if (brain.provider === "openrouter") {
        for (const m of OPENROUTER_BACKUPS.filter((x) => x !== p.model)) {
          const q = PRESETS.openrouter(brain.key, m);
          attempts.push({ id: `${id}-${m}`, label: `OpenRouter · ${m}`, run: () => callOpenAICompatible(q, system, tools, messages, files, leanSystem) });
        }
      }
    }
  }
  // The server's own keys are ONLY for people who haven't connected a key of their own.
  // Anyone with their own key never uses (or uses up) the server's limits.
  const serverKeys = brains.length === 0;
  if (serverKeys && process.env.ANTHROPIC_API_KEY) {
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.claude;
    attempts.push({ id: "claude", label: `Claude · ${model}`, run: () => callClaude(process.env.ANTHROPIC_API_KEY!, model, system, tools, messages) });
  }
  for (const p of serverKeys ? serverProviders() : []) {
    attempts.push({
      id: `${p.name}-${p.model}`,
      label: `${p.name} · ${p.model}${p.vision === false ? " (text-only)" : ""}`,
      run: () => callOpenAICompatible(p, system, tools, messages, files, leanSystem),
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
      ? brains.length
        ? `Your free keys are at their limit right now (${problems.length} models tried). Wait about a minute and the agent retries automatically, or add your other free key (Groq or Gemini) in Connections. Details: ${problems.join(" | ")}`
        : `The free AI models are at their limit right now (${problems.length} tried). Wait about a minute and the agent retries automatically, or connect your own free key in Connections. Details: ${problems.join(" | ")}`
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
  leanSystem?: string,
) {
  // LEAN_MODE=1 keeps requests small even on a paid plan, so many more students fit in the same per-minute budget
  const lean = !!p.tpm && (p.tpm < LEAN_UNDER || process.env.LEAN_MODE === "1");
  if (lean) ({ system, tools, messages, files } = squeeze(system, leanSystem, tools, messages, files));
  const history = toOpenAI(messages, p.vision !== false, files);
  if (p.name === "Gemini" || /gemini/i.test(p.model)) addGeminiSignatures(history);
  const body = {
    model: p.model,
    [p.tokenParam ?? "max_tokens"]: lean ? 0 : Number(process.env.FALLBACK_MAX_TOKENS || p.maxTokens || 16000),
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
  if (lean) {
    // The provider counts input + requested output against the per-minute budget.
    const input = estimateTokens(body);
    const room = p.tpm! - input - 300;
    if (room < 1200) throw new Error(`request does not fit ${p.name}'s ${p.tpm} tokens/min (≈${input} tokens needed)`);
    (body as any)[p.tokenParam ?? "max_tokens"] = Math.min(room, 12000);
  }

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

// ── Lean mode: fit a request into a small tokens-per-minute budget ──
const estimateTokens = (x: unknown) => Math.ceil(JSON.stringify(x).length / 3.6);

function squeeze(system: string, leanSystem: string | undefined, tools: Anthropic.Tool[], messages: Anthropic.MessageParam[], files: Record<string, string>) {
  // 1. short instructions and one-line tool descriptions
  const shortTools = tools.map((t) => ({ ...t, description: String(t.description).split(/(?<=\.)\s/)[0] }));
  // 2. the original request + only the latest steps (cut before an assistant turn so tool results stay paired)
  const first = messages[0];
  let start = Math.max(1, messages.length - 4);
  while (start < messages.length && messages[start].role !== "assistant") start--;
  if (start < 1) start = 1;
  const recent = messages.slice(start).map((m) =>
    Array.isArray(m.content)
      ? {
          ...m,
          content: (m.content as any[]).map((b) =>
            b.type === "tool_result" && Array.isArray(b.content)
              ? { ...b, content: b.content.filter((c: any) => c.type !== "image").map((c: any) => (c.type === "text" ? { ...c, text: String(c.text).slice(0, 1500) } : c)) }
              : b,
          ),
        }
      : m,
  );
  const skipped = start > 1 ? [{ role: "user" as const, content: `(${start - 1} earlier steps omitted to save tokens. Pages so far: ${Object.keys(files).join(", ") || "none"}.)` }] : [];
  // keep roles alternating: the note merges into the request when needed
  const head: Anthropic.MessageParam[] = skipped.length && typeof first.content === "string" ? [{ role: "user", content: first.content + "\n\n" + skipped[0].content }] : [first];
  // 3. only the page being worked on is sent in full
  const lastText = JSON.stringify(messages.slice(-3));
  const focus = Object.keys(files).filter((n) => lastText.includes(n));
  const keep = focus.length ? focus.slice(-1) : Object.keys(files).slice(0, 1);
  const slim: Record<string, string> = {};
  for (const n of keep) slim[n] = files[n];
  return { system: leanSystem || system, tools: shortTools, messages: [...head, ...recent], files: slim };
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
