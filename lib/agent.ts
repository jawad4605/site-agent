// ─────────────────────────────────────────────────────────────
//  THE AGENT
//  An agent = an LLM + tools + a loop.
//    1. The LLM decides what to do next (think)
//    2. It calls a tool: write / edit / check / publish (act)
//    3. We run the tool and give it the result (observe)
//    4. Repeat until it publishes the site
//  Each call to runStep() runs ONE turn of the loop, so every
//  serverless request stays short. The browser drives the loop.
// ─────────────────────────────────────────────────────────────
import type Anthropic from "@anthropic-ai/sdk";
import { checkSite } from "./browser";
import { saveSite } from "./publish";
import { mockModel } from "./mock";
import { ANTI_GENERIC, searchImages } from "./design";
import { ensureNavGuard } from "./navguard";
import { callModel, type Brain } from "./llm";

export const SYSTEM_PROMPT = `You are an autonomous web developer agent. You build complete, beautiful websites from a short description, check your own work in a real browser, fix problems, and publish. The user may come back later with change requests.

Workflow for a NEW site:
1. Start with a plan (follow the ART DIRECTION given).
   - Short description → 3-5 lines: audience, pages, sections, colour palette, fonts.
   - Detailed requirements (a brief, a client document, a long list) → write a compact SITEMAP (each page and its sections) and a numbered REQUIREMENTS CHECKLIST extracted from the text. Follow the requirements exactly: names, prices, phone numbers, colours, pages and features they mention. Don't invent facts that contradict them.
2. Write each page with write_page. Start with "index.html". Only make extra pages (e.g. "menu.html", "about.html", "contact.html") if the user asks for them or the business clearly needs them; otherwise one great page is better.
3. Call check_site on each page you wrote. You get desktop + mobile screenshots and automatic QA findings.
4. Look at the screenshots critically like a senior designer. Fix real problems with edit_page (small targeted edits). Explain each fix in one short line before making it.
5. Check again after fixing. At most 2 checks per page.
6. Before publishing, if there was a requirements checklist, go through it: anything missing gets added now.
7. When everything looks professional on desktop AND mobile, call publish_site. Then reply with one short sentence (plus "✓ All N requirements covered" when there was a checklist).

Workflow for a CHANGE REQUEST (the site already exists):
- Make exactly the requested changes with edit_page (or write_page for a new page / a full redesign). Keep everything else the same.
- If you add a page, add links to it in the navigation of EVERY page.
- Static sites have no server: for forms (contact, booking, orders) use a mailto: link, a WhatsApp link (https://wa.me/<number>?text=...), or a form that posts to https://formsubmit.co/<email>. For maps use a Google Maps embed iframe. Small interactive features (menus, tabs, sliders, filters, calculators, dark mode) are written in inline JavaScript.
- check_site the pages you changed, fix problems, then call publish_site again (same URL is kept). Reply with one short sentence about what changed.

Design rules:
- Modern, polished, responsive (mobile-first, flexbox/grid, no fixed widths over 100%).
- Every page is a full HTML document with its own inline CSS and JS. Write clean, readable, well-indented code (one CSS rule per line block, CSS variables for colours/fonts at the top, a short /* Section */ comment before each part) because it is exported as a real project: css/global.css (parts identical on every page) + css/<page>.css and js/<page>.js for each page. Use exactly the same CSS for shared parts (header, footer, colours, buttons) on every page, and attach events with addEventListener. Pages share the same header/nav, footer and style.
- Navigation: the header/menu must stay visible while scrolling (position: sticky; top: 0; z-index: 50; solid or blurred background). Add "html{scroll-behavior:smooth}" and "section[id]{scroll-margin-top:<header height + 16px>}" so clicking a menu item lands on the section with its heading visible under the header. On mobile, use a hamburger button that opens the menu (inline JS) and closes it after a link is clicked. Highlight the current section in the menu while scrolling (IntersectionObserver).
- Links between pages are relative, e.g. href="menu.html", href="index.html#contact". Never use href="/" or absolute paths starting with "/". Every button must go to a real section (#id that exists), a page, tel:, mailto:, or a WhatsApp link.
- Images: use the USER'S IMAGES (exact URLs given) wherever they fit: logo in the header, photos in hero/gallery/cards. For other photos call search_images with specific queries (e.g. "biryani", "students classroom") and use the returned URLs. Never use picsum or unrelated photos. Give every <img> object-fit: cover and a fixed aspect ratio.
- Realistic copy for the business (no lorem ipsum). Include a hero, key sections, a contact/CTA section and a footer.
- Every link/button must point somewhere real (#section ids, other pages, tel:, mailto:, or https://wa.me/...).
- Keep each page under 40 KB.
- The first user message includes an ART DIRECTION. Commit to it fully: its fonts, palette, layout and signature details.
- When you check screenshots, also judge: does it look generic or AI-made? If yes, fix the design, not just the bugs.

${ANTI_GENERIC}`;

const PAGE = { type: "string", description: 'Page file name, e.g. "index.html" or "menu.html"' };

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "write_page",
    description: "Create a page or completely replace it. Provide the full HTML document.",
    input_schema: {
      type: "object",
      properties: { page: PAGE, html: { type: "string", description: "Complete HTML document" } },
      required: ["page", "html"],
    },
  },
  {
    name: "edit_page",
    description:
      "Make a small targeted change to one page. old_text must appear exactly once in that page; it is replaced with new_text.",
    input_schema: {
      type: "object",
      properties: { page: PAGE, old_text: { type: "string" }, new_text: { type: "string" } },
      required: ["page", "old_text", "new_text"],
    },
  },
  {
    name: "search_images",
    description: "Find real photos that match the business. Returns image URLs you can use in <img src>. Use short visual queries of 2-3 words. At most 3 searches per site.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: 'e.g. "karachi street food biryani"' }, count: { type: "number" } },
      required: ["query"],
    },
  },
  {
    name: "check_site",
    description:
      "Open a page in a real headless Chrome. Returns a desktop (1280px) and mobile (390px) screenshot plus automatic QA findings.",
    input_schema: { type: "object", properties: { page: PAGE } },
  },
  {
    name: "publish_site",
    description: "Publish all pages to a live public URL (or update the existing URL). Call only when you are happy.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Short site name, e.g. 'karachi-biryani-house'" } },
      required: ["name"],
    },
  },
];

// Events are what the UI shows in the live agent timeline.
export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "write"; page: string; bytes: number }
  | { type: "edit"; page: string; removed: string; added: string }
  | { type: "check"; page: string; desktop: string; mobile: string; findings: string[] }
  | { type: "publish"; url: string }
  | { type: "tool_error"; tool: string; text: string }
  | { type: "done"; text: string }
  | { type: "fallback"; text: string }
  | { type: "images"; query: string; urls: string[] }
  | { type: "direction"; name: string };

export type Files = Record<string, string>;
export type StepInput = { messages: Anthropic.MessageParam[]; files: Files; siteId?: string; origin: string; brain?: Brain };
export type StepOutput = {
  messages: Anthropic.MessageParam[];
  files: Files;
  siteId?: string;
  events: AgentEvent[];
  done: boolean;
  url?: string;
  provider?: string;
};

type State = { files: Files; siteId?: string; origin: string; url?: string };

function pageName(p: unknown): string {
  const name = String(p || "index.html").trim().toLowerCase().replace(/^\/+/, "");
  const fixed = name.endsWith(".html") ? name : `${name}.html`;
  if (!/^[a-z0-9-]{1,40}\.html$/.test(fixed)) throw new Error(`Invalid page name "${p}". Use names like "menu.html".`);
  return fixed;
}

// ── The tools: plain functions the model can call ────────────
async function runTool(
  name: string,
  input: any,
  state: State,
  events: AgentEvent[],
): Promise<Anthropic.ToolResultBlockParam["content"]> {
  switch (name) {
    case "write_page": {
      const page = pageName(input.page);
      if (typeof input.html !== "string" || input.html.length < 50) throw new Error("html is empty");
      if (input.html.length > 200_000) throw new Error("html is too large (max 200 KB)");
      if (!state.files[page] && Object.keys(state.files).length >= 8) throw new Error("Maximum 8 pages.");
      state.files[page] = ensureNavGuard(input.html);
      events.push({ type: "write", page, bytes: input.html.length });
      return `Saved ${page} (${input.html.length} characters). Pages: ${Object.keys(state.files).join(", ")}.`;
    }
    case "edit_page": {
      const page = pageName(input.page);
      const html = state.files[page];
      if (!html) throw new Error(`${page} does not exist. Pages: ${Object.keys(state.files).join(", ") || "none"}.`);
      const { old_text, new_text } = input;
      const count = old_text ? html.split(old_text).length - 1 : 0;
      if (count === 0) throw new Error(`old_text not found in ${page}. Copy it exactly.`);
      if (count > 1) throw new Error(`old_text appears ${count} times in ${page}. Include more surrounding text.`);
      state.files[page] = ensureNavGuard(html.replace(old_text, () => new_text));
      events.push({ type: "edit", page, removed: old_text, added: new_text });
      return `Edit applied to ${page}.`;
    }
    case "search_images": {
      const imgs = await searchImages(String(input.query || ""), Math.min(Math.max(Number(input.count) || 6, 1), 10));
      if (!imgs.length) {
        events.push({ type: "images", query: String(input.query || ""), urls: [] });
        return `No photos found for "${input.query}". Try a shorter, simpler query (2-3 words), or design without photos (illustrated SVG shapes, typography, colour blocks).`;
      }
      events.push({ type: "images", query: String(input.query || ""), urls: imgs.map((i) => i.url) });
      return `Verified working images for "${input.query}":\n` + imgs.map((i, n) => `${n + 1}. ${i.url}  (${i.alt})`).join("\n") + `\nNow continue: write the page(s).`;
    }
    case "check_site": {
      const page = pageName(input.page);
      const html = state.files[page];
      if (!html) throw new Error(`${page} does not exist. Write it first.`);
      const qa = await checkSite(html);
      const missing = [...html.matchAll(/href="([a-z0-9-]+\.html)/gi)]
        .map((m) => m[1].toLowerCase())
        .filter((p) => !state.files[p]);
      if (missing.length) qa.findings.push(`Links to pages that don't exist yet: ${[...new Set(missing)].join(", ")}`);
      events.push({ type: "check", page, desktop: qa.desktop, mobile: qa.mobile, findings: qa.findings });
      return [
        { type: "text", text: `${page} DESKTOP screenshot (1280px wide):` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: qa.desktop } },
        { type: "text", text: `${page} MOBILE screenshot (390px wide):` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: qa.mobile } },
        {
          type: "text",
          text: qa.findings.length
            ? `Automatic QA findings:\n- ${qa.findings.join("\n- ")}`
            : "Automatic QA findings: none. Still review the screenshots visually.",
        },
      ];
    }
    case "publish_site": {
      if (!state.files["index.html"]) throw new Error("index.html is required before publishing.");
      if (!state.siteId) {
        const slug =
          String(input.name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) ||
          "site";
        state.siteId = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      }
      await saveSite(state.siteId, state.files);
      state.url = `${state.origin}/s/${state.siteId}`;
      events.push({ type: "publish", url: state.url });
      return `Published ${Object.keys(state.files).length} page(s) at ${state.url}`;
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// Old screenshots are replaced by a note, so requests stay small and cheap.
function dropOldScreenshots(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  let lastWithImage = -1;
  messages.forEach((m, i) => {
    if (Array.isArray(m.content) && JSON.stringify(m.content).includes('"type":"image"')) lastWithImage = i;
  });
  return messages.map((m, i) => {
    if (i === lastWithImage || m.role !== "user" || !Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map((block: any) =>
        block.type === "tool_result" && Array.isArray(block.content)
          ? {
              ...block,
              content: block.content.map((c: any) =>
                c.type === "image" ? { type: "text", text: "[older screenshot removed]" } : c,
              ),
            }
          : block,
      ),
    };
  });
}

function nudgeCount(messages: Anthropic.MessageParam[]): number {
  return messages.slice(lastUserIndex(messages)).filter((m) => typeof m.content === "string" && m.content.startsWith("[continue]")).length;
}

// Turn ```html code blocks in a text reply into write_page calls.
function salvageHtml(content: any[]): any[] {
  const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const out: any[] = [];
  const re = /```html\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const html = m[1].trim();
    if (!/<html|<!doctype/i.test(html)) continue;
    const page = html.match(/<!--\s*page:\s*([a-z0-9-]+\.html)\s*-->/i)?.[1]?.toLowerCase() || (out.length ? `page-${out.length + 1}.html` : "index.html");
    out.push({ type: "tool_use", id: `auto_${Date.now().toString(36)}_${out.length}`, name: "write_page", input: { page, html } });
  }
  return out;
}

// Plan B for writing the page: one plain request ("reply with the HTML"), no tools.
async function writeHtmlDirectly(history: Anthropic.MessageParam[], brain?: Brain): Promise<string> {
  const firstUser = history.find((m) => m.role === "user" && typeof m.content === "string");
  const request = String(firstUser?.content ?? "").replace(/^\[continue\].*$/gm, "");
  const toolText = JSON.stringify(history);
  const images = [...new Set(toolText.match(/https?:\/\/[^\s"\\)]+?\.(?:jpe?g|png|webp)(?:\?[^\s"\\)]*)?/gi) ?? [])].slice(0, 12);
  const prompt =
    `${request}\n\n` +
    (images.length ? `Verified photo URLs you can use:\n${images.map((u) => "- " + u).join("\n")}\n\n` : "") +
    "Write the COMPLETE index.html for this website now: one file with inline CSS and JS, following the art direction. " +
    "Reply with ONLY the code inside one ```html code block. Keep it under 30 KB.";
  const res = await callModel(SYSTEM_PROMPT, [], [{ role: "user", content: prompt }], {}, brain);
  const blocks = salvageHtml(res.content as any[]);
  if (blocks.length) return blocks[0].input.html as string;
  const raw = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const start = raw.search(/<!doctype html|<html/i);
  const end = raw.lastIndexOf("</html>");
  return start >= 0 && end > start ? raw.slice(start, end + 7) : "";
}

// Index of the user's latest own message (not a tool result and not an automatic nudge)
function lastUserIndex(messages: Anthropic.MessageParam[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string" && !m.content.startsWith("[continue]")) return i;
  }
  return 0;
}

// ── One turn of the agent loop ───────────────────────────────
export async function runStep({ messages, files, siteId, origin, brain }: StepInput): Promise<StepOutput> {
  const events: AgentEvent[] = [];
  const state: State = { files: { ...files }, siteId, origin };
  const history = dropOldScreenshots(messages);

  // 1. THINK — ask the model what to do next
  const response = process.env.MOCK_LLM
    ? { ...mockModel(history), provider: "Mock model (test mode)", fallbackReason: undefined }
    : await callModel(SYSTEM_PROMPT, TOOLS, history, files, brain);
  if (response.fallbackReason) events.push({ type: "fallback", text: response.fallbackReason });

  for (const block of response.content as any[]) {
    if (block.type === "text" && block.text.trim() && !block.text.startsWith("(no response")) events.push({ type: "thought", text: block.text.replace(/```[a-z]*\n[\s\S]*?(```|$)/gi, "[code]").trim() || "Writing code…" });
  }
  // Some models write the page as a code block instead of calling write_page: use it anyway.
  if (!(response.content as any[]).some((b) => b.type === "tool_use")) {
    const salvaged = salvageHtml(response.content as any[]);
    if (salvaged.length) response.content = [...(response.content as any[]), ...salvaged];
  }
  const newMessages: Anthropic.MessageParam[] = [...history, { role: "assistant", content: response.content as any }];

  // 2. ACT + OBSERVE — run every tool the model asked for
  const toolUses = (response.content as any[]).filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (toolUses.length === 0 && !state.files["index.html"] && !process.env.MOCK_LLM) {
    // The model couldn't produce the page through a tool call (common with free models:
    // the page is too long for one tool call). Ask for the HTML directly, with no tools.
    const html = await writeHtmlDirectly(history, brain).catch(() => "");
    if (html) {
      state.files["index.html"] = ensureNavGuard(html);
      events.push({ type: "write", page: "index.html", bytes: html.length });
      newMessages.push({
        role: "user",
        content: `[continue] index.html has been written (${html.length} characters, shown under CURRENT PAGES). Now call check_site on it, fix any problems with edit_page, then call publish_site.`,
      });
      return { messages: newMessages, files: state.files, siteId: state.siteId, events, done: false, provider: response.provider };
    }
  }
  if (toolUses.length === 0) {
    // Some models stop too early (e.g. right after searching photos). If the job
    // isn't finished, push them to continue instead of ending the run.
    const sinceUser = newMessages.slice(lastUserIndex(newMessages));
    const nudges = sinceUser.filter((m) => typeof m.content === "string" && m.content.startsWith("[continue]")).length;
    const published = JSON.stringify(sinceUser).includes('"name":"publish_site"');
    const missing = !state.files["index.html"]
      ? nudgeCount(newMessages) === 0
        ? "You have not written index.html yet. Call write_page now with the complete page."
        : "You still have not written the page. Reply now with the COMPLETE HTML of index.html inside one ```html code block (no tool call needed). Keep it under 30 KB."
      : !published
        ? "The work is not published yet. If the pages are ready, call check_site and then publish_site."
        : "";
    if (missing && nudges < 3) {
      events.push({ type: "tool_error", tool: "agent", text: "The model stopped early. Asking it to continue…" });
      newMessages.push({ role: "user", content: `[continue] ${missing}` });
      return { messages: newMessages, files: state.files, siteId: state.siteId, events, done: false, provider: response.provider };
    }
    const last = events.filter((e) => e.type === "thought").pop() as { text: string } | undefined;
    events.push({ type: "done", text: last?.text ?? "Finished." });
    return { messages: newMessages, files: state.files, siteId: state.siteId, events, done: true, provider: response.provider };
  }

  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const tu of toolUses) {
    try {
      results.push({ type: "tool_result", tool_use_id: tu.id, content: await runTool(tu.name, tu.input, state, events) });
    } catch (err: any) {
      events.push({ type: "tool_error", tool: tu.name, text: err.message });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: ${err.message}`, is_error: true });
    }
  }
  newMessages.push({ role: "user", content: results });

  // 3. LOOP — the browser calls runStep again until done
  return { messages: newMessages, files: state.files, siteId: state.siteId, events, done: false, url: state.url, provider: response.provider };
}
