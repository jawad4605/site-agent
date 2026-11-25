"use client";
// SiteAgent UI. The page DRIVES the agent loop: call /api/agent → show what happened → call again
// until the agent is done. After that you keep chatting to change the site.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { AgentEvent } from "@/lib/agent";
import { deleteProject, getProject, listProjects, newProjectId, saveProject, type Project } from "@/lib/history";
import { Icon, Logo } from "@/components/icons";
import { Event, StageTracker } from "@/components/Timeline";
import SettingsPanel from "@/components/SettingsPanel";
import { STYLE_OPTIONS } from "@/lib/design";
import { ensureNavGuard } from "@/lib/navguard";
import { buildProject } from "@/lib/structure";
import { EMPTY_SETTINGS, NO_CONNS, OR_MODELS, PROVIDERS, type Conns, type Img, type Item, type Settings } from "@/components/types";

const EXAMPLES = [
  { icon: "🍛", title: "Restaurant", text: "A biryani restaurant in Karachi with home delivery, menu with prices and WhatsApp ordering" },
  { icon: "🎓", title: "Portfolio", text: "Portfolio for a final-year AI student with projects, skills, and a contact form" },
  { icon: "📚", title: "Academy", text: "A tuition academy for O/A Levels in Lahore with Home, Courses, Fees and Contact pages" },
  { icon: "🤖", title: "Society", text: "Our university's AI & Data Science society: events, team, and a join form" },
];
const CHANGE_EXAMPLES = ["Keep the menu visible while scrolling", "Add a Gallery page", "Make it darker and more premium", "Use my photo in the hero", "Add a WhatsApp order button"];
const MAX_STEPS = 30;
const MAX_PROMPT = 20000; // characters (~8 pages of requirements)
const CURRENT_KEY = "siteagent.current";
const STORAGE_KEY = "siteagent.settings.v2";
const DEVICES = { desktop: "100%", tablet: 820, mobile: 390 } as const;

// Injected into the preview only. Keeps every click INSIDE the generated site:
//  - links to other pages (menu.html) switch the preview tab
//  - #section links scroll, external/tel/mailto/WhatsApp links open in a new tab
//  - anything else (e.g. href="/") and form submits are caught, so the preview
//    never navigates away to the SiteAgent app itself.
const PREVIEW_SCRIPT = String.raw`<script>(function(){
function note(t){var d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;font:13px system-ui;z-index:2147483647;box-shadow:0 10px 30px rgba(0,0,0,.35)';document.body.appendChild(d);setTimeout(function(){d.remove()},2200);}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=(a.getAttribute('href')||'').trim();
if(!h||h==='#'){e.preventDefault();return;}
if(h.charAt(0)==='#'){e.preventDefault();var el=document.getElementById(h.slice(1));if(el){var off=0;var top=document.elementFromPoint(window.innerWidth/2,4);while(top&&top!==document.body){var ps=getComputedStyle(top).position;if(ps==='fixed'||ps==='sticky'){off=top.getBoundingClientRect().height;break;}top=top.parentElement;}window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-off-8,behavior:'smooth'});}return;}
var m=h.replace(/^\.?\//,'').match(/^([a-z0-9-]+\.html)(#.*)?$/i);if(m){e.preventDefault();parent.postMessage({sitePage:m[1].toLowerCase()},'*');return;}
if(h==='/'||h==='./'||/^\/?index\.html?$/i.test(h)){e.preventDefault();parent.postMessage({sitePage:'index.html'},'*');return;}
if(/^(https?:|mailto:|tel:|sms:)/i.test(h)){e.preventDefault();window.open(h,'_blank','noopener');return;}
e.preventDefault();note('Link: '+h);},true);
document.addEventListener('submit',function(e){e.preventDefault();var f=e.target;var act=f.getAttribute('action')||'';note(/^https?:/i.test(act)?'Form works on the live site ✓':'Form submitted (preview)');},true);
})();</script>`;

async function resizeImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg"; // keep PNG for logos (transparency)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), type, 0.85));
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [activePage, setActivePage] = useState("index.html");
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState("");
  const [view, setView] = useState<keyof typeof DEVICES>("desktop");
  const [zoom, setZoom] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [images, setImages] = useState<Img[]>([]);
  const [uploading, setUploading] = useState(0);
  const stopRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const convo = useRef<{ messages: any[]; files: Record<string, string>; siteId?: string }>({ messages: [], files: {} });
  const announced = useRef<Set<string>>(new Set());
  const lastFallback = useRef("");
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState<"" | "github" | "vercel">("");
  const [conns, setConns] = useState<Conns>(NO_CONNS);
  const [repoUrl, setRepoUrl] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [style, setStyle] = useState("auto");
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [openFile, setOpenFile] = useState("index.html");
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: "ok" | "err" }[]>([]);
  const [frameKey, setFrameKey] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const toast = (text: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [importing, setImporting] = useState(false);
  const project = useRef<{ id: string; title: string; createdAt: number } | null>(null);
  const reqInput = useRef<HTMLInputElement>(null);

  // ── History: autosave the current project whenever something changes ──
  useEffect(() => {
    const p = project.current;
    if (!p) return;
    const t = setTimeout(() => {
      saveProject({
        ...p,
        updatedAt: Date.now(),
        convo: convo.current,
        items,
        url,
        images,
        activePage,
        provider,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [items, files, url, images, activePage, provider]);

  // Re-open the last project after a refresh
  useEffect(() => {
    const id = localStorage.getItem(CURRENT_KEY);
    if (id) getProject(id).then((p) => p && openProject(p));
    listProjects().then(setProjects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openProject(p: Project) {
    project.current = { id: p.id, title: p.title, createdAt: p.createdAt };
    localStorage.setItem(CURRENT_KEY, p.id);
    convo.current = p.convo;
    announced.current = new Set(p.images.map((i) => i.url));
    lastFallback.current = "";
    setItems(p.items);
    setFiles(p.convo.files);
    setActivePage(p.convo.files[p.activePage] ? p.activePage : "index.html");
    setImages(p.images);
    setProvider(p.provider || "");
    setUrl(p.url);
    setQr(p.url ? await QRCode.toDataURL(p.url, { width: 600, margin: 1 }) : "");
    setRepoUrl("");
    setShowHistory(false);
  }

  async function removeProject(id: string) {
    if (!confirm("Delete this project from history? (The published link keeps working.)")) return;
    await deleteProject(id);
    if (project.current?.id === id) newSite();
    setProjects(await listProjects());
  }

  // Files dropped or pasted into the message box: images are uploaded, documents become requirements.
  function handleFiles(list: FileList | File[] | null) {
    if (!list || running) return;
    const all = Array.from(list);
    const imgs = all.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type));
    const docs = all.filter((f) => /\.(docx|txt|md)$/i.test(f.name));
    const other = all.filter((f) => !imgs.includes(f) && !docs.includes(f));
    if (imgs.length) upload(imgs as unknown as FileList);
    docs.forEach((d) => importRequirements(d));
    if (other.length) toast(`Not supported: ${other.map((o) => o.name).join(", ")}. Use PNG/JPG/WebP images or .docx/.txt/.md documents.`, "err");
  }

  async function importRequirements(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const res = await fetch("/api/extract", { method: "POST", headers: { "x-filename": encodeURIComponent(file.name) }, body: file });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrompt((prev) => ((prev ? prev + "\n\n" : "") + `REQUIREMENTS (${file.name}):\n` + data.text).slice(0, MAX_PROMPT));
      if (data.chars > MAX_PROMPT) toast(`The document is ${data.chars.toLocaleString()} characters; only the first ${MAX_PROMPT.toLocaleString()} were used.`, "err");
      else toast(`Imported ${file.name} (${data.chars.toLocaleString()} characters)`);
      textRef.current?.focus();
    } catch (e: any) {
      toast(`Requirements file: ${e.message}`, "err");
    } finally {
      setImporting(false);
    }
  }
  const afterConnect = useRef<null | (() => void)>(null);

  async function refreshConns() {
    try {
      setConns(await fetch("/api/connections", { cache: "no-store" }).then((r) => r.json()));
    } catch {}
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings({ ...EMPTY_SETTINGS, ...JSON.parse(saved) });
    } catch {}
    refreshConns();
    // the OAuth popup tells us when it's done
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== location.origin || !e.data?.connected) return;
      await refreshConns();
      if (e.data.ok) {
        toast(`Connected ${e.data.connected === "openrouter" ? "AI models (OpenRouter). Using Claude Sonnet 5.5" : "GitHub"}`);
        if (e.data.connected === "openrouter") setSettings((st) => { const next = { ...st, brain: "openrouter" as const }; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {} return next; });
        const next = afterConnect.current;
        afterConnect.current = null;
        next?.();
      } else toast(`Connection failed: ${e.data.message}`, "err");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveSettings(next: Settings) {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  // Opens the provider's own authorize page in a popup ("Connect" button)
  function connect(service: "github" | "openrouter", then?: () => void) {
    afterConnect.current = then ?? null;
    const w = window.open(`/api/auth/${service}/start`, "siteagent-connect", "width=620,height=760");
    if (!w) toast("Your browser blocked the popup. Allow popups for this site and try again.", "err");
  }

  // A connected OpenRouter account is used automatically (unless you picked something else).
  const useOpenRouter = conns.openrouter && (settings.brain === "auto" || settings.brain === "openrouter");
  function brainForRequest() {
    if (useOpenRouter) return { provider: "openrouter", key: "", model: settings.orModel };
    if (settings.brain === "auto" || settings.brain === "free") return undefined;
    if (settings.brain === "openrouter") return conns.openrouter ? { provider: "openrouter", key: "", model: settings.orModel } : undefined;
    const key = settings.keys[settings.brain];
    return key ? { provider: settings.brain, key, model: settings.models[settings.brain] || undefined } : undefined;
  }
  // Every key the student connected (Groq, Gemini…) is used automatically, before the server's shared keys.
  function ownKeys() {
    const picked = brainForRequest()?.provider;
    return PROVIDERS.filter((p) => settings.keys[p.id] && p.id !== picked).map((p) => ({ provider: p.id, key: settings.keys[p.id]!, model: settings.models[p.id] || undefined }));
  }
  const siteName = () => (convo.current.siteId || "my-site").replace(/-[a-z0-9]{4}$/, "");

  async function pushToGithub(): Promise<string | null> {
    setExporting("github");
    try {
      const res = await fetch("/api/github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: siteName(), files: convo.current.files, message: "Update website (SiteAgent)" }),
      });
      const data = await res.json();
      if (res.status === 401 && data.needsConnect) {
        await refreshConns();
        connect("github", () => pushToGithub());
        return null;
      }
      if (!res.ok) throw new Error(data.error || "Failed");
      setRepoUrl(data.url);
      push([{ type: "export", label: "⬆️ Pushed to GitHub", url: data.url, extra: `${data.files} files in one commit` }]);
      return data.url;
    } catch (e: any) {
      push([{ type: "error", text: `GitHub: ${e.message}` }]);
      return null;
    } finally {
      setExporting("");
    }
  }

  async function downloadZip() {
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: convo.current.files, name: siteName() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${siteName()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast("Project downloaded as ZIP");
    } catch (e: any) {
      toast(e.message, "err");
    }
  }

  async function onGithub() {
    if (!conns.github) {
      if (!conns.githubReady) return setShowSettings(true); // shows setup instructions
      return connect("github", () => pushToGithub());
    }
    await pushToGithub();
  }

  async function onVercel() {
    // Advanced: direct deploy with a saved Vercel token
    if (conns.vercelToken) {
      setExporting("vercel");
      try {
        const res = await fetch("/api/vercel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project: siteName(), files: convo.current.files }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        push([{ type: "export", label: "▲ Deployed to Vercel", url: data.url, extra: "Live on your Vercel account" }]);
      } catch (e: any) {
        push([{ type: "error", text: `Vercel: ${e.message}` }]);
      } finally {
        setExporting("");
      }
      return;
    }
    // Default: code goes to GitHub, then Vercel imports the repo (you sign in & authorize on vercel.com)
    const openVercel = (repo: string) => {
      const url = `https://vercel.com/new/import?s=${encodeURIComponent(repo)}`;
      window.open(url, "_blank");
      push([{ type: "export", label: "▲ Deploy on Vercel", url, extra: "Sign in, press Deploy. After that every GitHub push re-deploys automatically." }]);
    };
    if (repoUrl) return openVercel(repoUrl);
    if (!conns.github) {
      if (!conns.githubReady) return setShowSettings(true);
      return connect("github", async () => {
        const r = await pushToGithub();
        if (r) openVercel(r);
      });
    }
    const r = await pushToGithub();
    if (r) openVercel(r);
  }

  const hasSite = Object.keys(files).length > 0;
  const editMode = hasSite && !running;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const p = e.data?.sitePage;
      if (typeof p === "string") setActivePage((cur) => (convo.current.files[p] ? p : cur));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const push = (evs: Item[]) => {
    // show a "switched brain" note only when it changes, not on every step
    evs = evs.filter((e) => {
      if (e.type !== "fallback") return true;
      const key = e.text.replace(/\(skipping for now\)/, "").split("→ switched to")[1] ?? e.text;
      if (key === lastFallback.current) return false;
      lastFallback.current = key;
      return true;
    });
    setItems((prev) => [...prev, ...evs]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  async function upload(list: FileList | null) {
    if (!list) return;
    for (const f of Array.from(list).slice(0, 8)) {
      if (!f.type.startsWith("image/")) continue;
      setUploading((n) => n + 1);
      try {
        const blob = await resizeImage(f);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "content-type": blob.type, "x-filename": encodeURIComponent(f.name) },
          body: blob,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setImages((prev) => [...prev, data]);
      } catch (e: any) {
        toast(`Image upload failed: ${e.message}`, "err");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function imagesNote(): string {
    const fresh = images.filter((i) => !announced.current.has(i.url));
    fresh.forEach((i) => announced.current.add(i.url));
    if (!fresh.length) return "";
    return (
      "\n\nUSER'S IMAGES (use these exact URLs where they fit; the file name says what each shows):\n" +
      fresh.map((i) => `- ${i.name}: ${i.url}`).join("\n")
    );
  }

  function newSite() {
    project.current = null;
    localStorage.removeItem(CURRENT_KEY);
    setImages([]);
    setRepoUrl("");
    setShowHistory(false);
    convo.current = { messages: [], files: {} };
    announced.current = new Set();
    setItems([]);
    setFiles({});
    setActivePage("index.html");
    setUrl("");
    setQr("");
    setProvider("");
    setPrompt("");
  }

  // Adds a user message without breaking the conversation (two user turns in a row are merged).
  function appendUser(text: string) {
    const msgs = convo.current.messages;
    const last = msgs[msgs.length - 1];
    if (last?.role === "user" && typeof last.content === "string") {
      last.content = `${last.content}\n\n${text}`;
    } else if (last?.role === "user" && Array.isArray(last.content)) {
      last.content = [...last.content, { type: "text", text }];
    } else {
      msgs.push({ role: "user", content: text });
    }
  }

  // Runs the agent loop. Never clears what's already on screen except when starting a brand-new site.
  async function loop() {
    stopRef.current = false;
    setRunning(true);
    let retries = 0;
    try {
      for (let i = 1; i <= MAX_STEPS && !stopRef.current; i++) {
        setStep(i);
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...convo.current, brain: brainForRequest(), brains: ownKeys(), style }),
        });
        const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        if (!res.ok || data.error) {
          // retry the same step automatically (temporary model/network problems) before giving up
          if (retries < 2 && !stopRef.current) {
            retries++;
            push([{ type: "tool_error", tool: "agent", text: /limit|quota|429|413/i.test(data.error || "") ? `Free AI limit reached. Waiting ${30 * retries}s, then retrying automatically (${retries}/2)…` : `${data.error || "Request failed"}. Retrying automatically (${retries}/2)…` }]);
            const limited = /limit|quota|429|413/i.test(data.error || "");
            await new Promise((r) => setTimeout(r, limited ? 30000 * retries : 2500 * retries));
            i--;
            continue;
          }
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        retries = 0;

        convo.current = { messages: data.messages, files: data.files, siteId: data.siteId };
        setFiles(data.files);
        if (data.provider) setProvider(data.provider);
        push(data.events);

        // follow the agent: show the page it just worked on
        const touched = [...data.events].reverse().find((e: any) => e.page)?.page;
        if (touched && data.files[touched]) setActivePage(touched);

        const published = data.events.find((e: AgentEvent) => e.type === "publish");
        if (published) {
          setUrl(published.url);
          setQr(await QRCode.toDataURL(published.url, { width: 600, margin: 1 }));
        }
        if (data.done) break;
        if (i === MAX_STEPS) push([{ type: "error", text: `Paused after ${MAX_STEPS} steps. Click Continue to keep going.` }]);
      }
      if (stopRef.current) push([{ type: "error", text: "Paused by you. Click Continue to resume." }]);
    } catch (e: any) {
      // Keep everything (conversation, pages, timeline) so the run can be resumed.
      push([{ type: "error", text: `${e.message} Your progress is saved. Click Continue to resume.` }]);
    } finally {
      setRunning(false);
      setTimeout(() => listProjects().then(setProjects), 600);
    }
  }

  async function run(override?: string) {
    const text = (override ?? prompt).trim();
    if (!text || running) return;
    const isChange = hasSite || convo.current.messages.length > 0;
    setPrompt("");

    if (!isChange) {
      const first = text.split("\n").find((l) => l.trim() && !/^REQUIREMENTS/.test(l)) || text;
      project.current = { id: newProjectId(), title: first.trim().slice(0, 70), createdAt: Date.now() };
      localStorage.setItem(CURRENT_KEY, project.current.id);
      convo.current = { messages: [], files: {} };
      announced.current = new Set();
      lastFallback.current = "";
      setItems([]);
      setFiles({});
      setUrl("");
      setQr("");
    }
    const userMsg = (isChange ? (hasSite ? `CHANGE REQUEST: ${text}` : text) : `Build a website for: ${text}`) + imagesNote();
    if (isChange) appendUser(userMsg);
    else convo.current.messages = [{ role: "user", content: userMsg }];
    push([{ type: "user", text: text.length > 600 ? text.slice(0, 600) + `… (${text.length.toLocaleString()} characters)` : text }]);
    await loop();
  }

  // Resume exactly where the agent stopped: same conversation, same pages, same timeline.
  async function resume() {
    if (running || !convo.current.messages.length) return;
    const last = convo.current.messages[convo.current.messages.length - 1];
    const unanswered = last?.role === "user" && typeof last.content === "string";
    if (!unanswered) {
      appendUser(
        convo.current.files["index.html"]
          ? "[continue] Continue from where you stopped. Finish the remaining work, check the pages, then publish_site."
          : "[continue] Continue from where you stopped. Write index.html now with write_page (or reply with the full HTML in a ```html code block).",
      );
    }
    push([{ type: "user", text: "Continue" }]);
    await loop();
  }



  // The user's original description (without the art direction / image notes we add)
  function originalPrompt(): string {
    const first = convo.current.messages.find((m: any) => m.role === "user" && typeof m.content === "string");
    if (!first) return "";
    return String(first.content)
      .replace(/^Build a website for:\s*/, "")
      .split(/\n\nART DIRECTION|\n\nUSER'S IMAGES/)[0]
      .trim();
  }

  const project_ = mode === "code" && hasSite ? buildProject(files, siteName()) : null;
  const codeFiles = project_ ? [...project_.files.map((f) => f.path), ...project_.assets.map((a) => `assets/images/${a}`)] : [];
  const codeContent = project_?.files.find((f) => f.path === openFile)?.content ?? (openFile.startsWith("assets/") ? "(image file)" : "");
  const lastItem = items[items.length - 1];
  const needsResume =
    !running &&
    convo.current.messages.length > 0 &&
    (lastItem?.type === "error" || (!hasSite && items.length > 0) || (hasSite && !url && lastItem?.type === "done"));

  const pages = Object.keys(files).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
  const previewHtml = files[activePage] ? ensureNavGuard(files[activePage]).replace(/<\/body>/i, `${PREVIEW_SCRIPT}</body>`) : "";
  const workspace = hasSite || running || items.length > 0;
  const modelLabel =
    useOpenRouter || settings.brain === "openrouter"
      ? OR_MODELS.find((m) => m.id === settings.orModel)?.name ?? "OpenRouter"
      : settings.brain === "auto" || settings.brain === "free"
        ? settings.brain === "free" ? "Free models" : "Auto"
        : PROVIDERS.find((p) => p.id === settings.brain)?.name ?? "Custom";
  const status = running ? { tone: "run", text: `Building · step ${step}` } : url ? { tone: "live", text: "Live" } : hasSite ? { tone: "draft", text: "Draft" } : null;
  const pageLabel = (p: string) => (p === "index.html" ? "Home" : p.replace(".html", "").replace(/-/g, " "));

  const composer = (big: boolean) => (
    <div
      className={`composer ${big ? "big" : ""} ${running ? "busy" : ""} ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
    >
      {dragging && <div className="drop-hint">Drop images (PNG, JPG, WebP) or a requirements doc (.docx, .txt, .md)</div>}
      {(images.length > 0 || uploading > 0) && (
        <div className="thumbs">
          {images.map((img) => (
            <div className="thumb" key={img.url} title={img.name}>
              <img src={img.url} alt={img.name} />
              <button onClick={() => setImages((prev) => prev.filter((i) => i.url !== img.url))} aria-label="Remove image">
                <Icon name="x" size={10} strokeWidth={2.4} />
              </button>
              {announced.current.has(img.url) && <span className="sent">sent</span>}
            </div>
          ))}
          {uploading > 0 && <div className="thumb loading"><span className="spinner" /></div>}
        </div>
      )}
      <textarea
        ref={textRef}
        value={prompt}
        maxLength={MAX_PROMPT}
        rows={big ? 4 : 2}
        onChange={(e) => setPrompt(e.target.value)}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData.files);
          if (pasted.length) {
            e.preventDefault();
            handleFiles(pasted);
          }
        }}
        placeholder={
          editMode
            ? "Describe a change… paste or drop images and docs here"
            : big
              ? "Describe a business in one line, or paste the client's full requirements. Paste or drop images and documents here…"
              : "Describe the website…"
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey || !big)) {
            e.preventDefault();
            run();
          }
        }}
      />
      <div className="composer-bar">
        <div className="tools">
          <button className="tool" title="Add your logo or photos" onClick={() => fileInput.current?.click()} disabled={running}>
            <Icon name="image" size={16} />
            {big && <span>Images</span>}
          </button>
          <button className="tool" title="Attach requirements (.docx, .txt, .md)" onClick={() => reqInput.current?.click()} disabled={running || importing}>
            {importing ? <span className="spinner" /> : <Icon name="doc" size={16} />}
            {big && <span>Requirements doc</span>}
          </button>
          {!editMode && (
            <label className="tool style-pick" title="Design style">
              <Icon name="layers" size={15} />
              <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={running}>
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.id === "auto" ? "Style: Auto" : o.name}</option>
                ))}
              </select>
            </label>
          )}
          <button className="tool model" title="Choose the AI model" onClick={() => setShowSettings(true)}>
            <Icon name="sparkles" size={14} />
            <span>{modelLabel}</span>
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          <input ref={reqInput} type="file" accept=".docx,.txt,.md" hidden onChange={(e) => { importRequirements(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="send-wrap">
          {prompt.length > 200 && (
            <span className={`counter ${prompt.length > MAX_PROMPT * 0.9 ? "warn" : ""}`}>
              {prompt.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()}
            </span>
          )}
          {running ? (
            <button className="send stop" onClick={() => (stopRef.current = true)} title="Stop the agent">
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button className="send" disabled={!prompt.trim() || uploading > 0} onClick={() => run()} title={editMode ? "Apply change" : "Build"}>
              <Icon name="arrowUp" size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const navButtons = (
    <>
      <button className="nav-btn" onClick={() => { listProjects().then(setProjects); setShowHistory(true); }}>
        <Icon name="history" size={15} />
        <span>History</span>
        {projects.length > 0 && <span className="badge">{projects.length}</span>}
      </button>
      <button className="nav-btn" onClick={() => setShowSettings(true)}>
        <Icon name="plug" size={15} />
        <span>Connections</span>
        {(conns.openrouter || conns.github) && <span className="dot-ok" />}
      </button>
    </>
  );

  return (
    <div className="shell">
      {!workspace ? (
        /* ─────────────── LANDING ─────────────── */
        <div className="landing">
          <div className="bg-grid" />
          <div className="bg-glow" />
          <nav className="topnav">
            <div className="brand"><Logo size={30} /><b>SiteAgent</b></div>
            <div className="nav-right">{navButtons}</div>
          </nav>

          <section className="hero">
            <div className="eyebrow"><span className="pulse" /> Agentic AI · plans, codes, tests and ships</div>
            <h1>
              Describe it.<br />
              <span className="grad">Watch an agent build it.</span>
            </h1>
            <p className="lead">
              SiteAgent writes the website, opens it in a real browser to check its own work, fixes what&apos;s wrong, and publishes it live in about a minute.
            </p>

            <div className="composer-glow">{composer(true)}</div>

            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button key={ex.title} className="example" onClick={() => { setPrompt(ex.text); textRef.current?.focus(); }}>
                  <span className="ex-icon">{ex.icon}</span>
                  <span className="ex-title">{ex.title}</span>
                  <span className="ex-text">{ex.text}</span>
                </button>
              ))}
            </div>

            <div className="how">
              {[
                ["brain", "Plan", "Pages, sections, style"],
                ["code", "Code", "Full HTML, CSS & JS"],
                ["camera", "Test", "Real Chrome, desktop + mobile"],
                ["wrench", "Fix", "Targeted self-repairs"],
                ["rocket", "Ship", "Live link + QR code"],
              ].map(([icon, t, d], i) => (
                <div key={t} className="how-step" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="how-icon"><Icon name={icon} size={16} /></span>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* ─────────────── WORKSPACE ─────────────── */
        <div className="ws">
          <header className="topbar">
            <div className="brand clickable" onClick={() => !running && newSite()} title="New site">
              <Logo size={28} building={running} />
              <b>SiteAgent</b>
            </div>
            <span className="sep" />
            <div className="proj-title">
              <span className="title-text">{project.current?.title || "New website"}</span>
              {status && <span className={`status ${status.tone}`}><span className="status-dot" />{status.text}</span>}
            </div>
            <div className="nav-right">
              {navButtons}
              <span className="sep" />
              <button className="nav-btn" disabled={!hasSite || running} onClick={downloadZip} title="Download the project as a ZIP (proper folder structure)">
                <Icon name="doc" size={15} />
                <span>ZIP</span>
              </button>
              <button className="nav-btn" disabled={!hasSite || running || !!exporting} onClick={onGithub} title={conns.github ? `Push to github.com/${conns.github.login}` : "Connect GitHub and push"}>
                {exporting === "github" ? <span className="spinner" /> : <Icon name="github" size={15} />}
                <span>GitHub</span>
              </button>
              <button className="nav-btn" disabled={!hasSite || running || !!exporting} onClick={onVercel} title="Deploy on Vercel">
                {exporting === "vercel" ? <span className="spinner" /> : <Icon name="vercel" size={13} />}
                <span>Deploy</span>
              </button>
              <button className="btn-primary" disabled={!url} onClick={() => setShowQr(true)}>
                <Icon name="qr" size={15} />
                <span>Share</span>
              </button>
              <button className="nav-btn icon-only" onClick={() => !running && newSite()} disabled={running} title="New site">
                <Icon name="plus" size={16} />
              </button>
            </div>
          </header>

          <div className="ws-body">
            <aside className="panel">
              <StageTracker items={items} running={running} />
              <div className="feed">
                {items.map((ev, i) => (
                  <Event key={i} ev={ev} onZoom={setZoom} onQr={() => setShowQr(true)} />
                ))}
                {running && (
                  <div className="thinking">
                    <span className="dots"><i /><i /><i /></span>
                    {step <= 1 ? "Planning the website" : "Working on the next step"}
                  </div>
                )}
                <div ref={endRef} />
              </div>
              <div className="panel-foot">
                {needsResume && (
                  <div className="retry">
                    <span>{hasSite ? "The agent stopped before finishing." : "The agent stopped before writing the site."} Progress is saved.</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="nav-btn" title="Start this site again from scratch" onClick={() => { const t = originalPrompt(); if (t && confirm("Start this site again from scratch? The current attempt stays in History.")) { newSite(); setTimeout(() => run(t), 0); } }}>
                        Start over
                      </button>
                      <button className="btn-primary" onClick={resume}>
                        <Icon name="refresh" size={14} /> Continue
                      </button>
                    </div>
                  </div>
                )}
                {editMode && (
                  <div className="suggest">
                    {CHANGE_EXAMPLES.map((ex) => (
                      <button key={ex} onClick={() => { setPrompt(ex); textRef.current?.focus(); }}>{ex}</button>
                    ))}
                  </div>
                )}
                {composer(false)}
              </div>
            </aside>

            <main className="preview">
              <div className="browser">
                <div className="browser-bar">
                  <div className="lights"><i /><i /><i /></div>
                  <div className="page-tabs">
                    {(pages.length ? pages : ["index.html"]).map((p) => (
                      <button key={p} className={`page-tab ${p === activePage ? "on" : ""}`} onClick={() => setActivePage(p)}>
                        <Icon name="globe" size={12} /> <span>{pageLabel(p)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="devices mode-toggle">
                    <button className={mode === "preview" ? "on wide" : "wide"} onClick={() => setMode("preview")} title="Preview"><Icon name="globe" size={14} /> Preview</button>
                    <button className={mode === "code" ? "on wide" : "wide"} onClick={() => setMode("code")} disabled={!hasSite} title="Project files"><Icon name="code" size={14} /> Code</button>
                  </div>
                  <div className="devices">
                    {(["desktop", "tablet", "mobile"] as const).map((d) => (
                      <button key={d} className={view === d ? "on" : ""} onClick={() => setView(d)} title={d}>
                        <Icon name={d === "mobile" ? "phone" : d} size={15} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="address">
                  <Icon name={url ? "lock" : "globe"} size={12} />
                  <span className="addr-text">
                    {url ? `${url.replace(/^https?:\/\//, "")}${activePage === "index.html" ? "" : "/" + activePage}` : `preview / ${activePage}`}
                  </span>
                  <button onClick={() => setFrameKey((k) => k + 1)} title="Reload preview"><Icon name="refresh" size={13} /></button>
                  {url && (
                    <a href={url + (activePage === "index.html" ? "" : "/" + activePage)} target="_blank" rel="noreferrer" title="Open live site">
                      <Icon name="external" size={13} />
                    </a>
                  )}
                </div>
                {mode === "code" && project_ ? (
                  <div className="code-view">
                    <div className="file-tree">
                      <div className="tree-title">{siteName()}/</div>
                      {treeRows(codeFiles).map((r) =>
                        r.dir ? (
                          <div key={"d:" + r.path} className="tree-dir" style={{ paddingLeft: 12 + r.depth * 14 }}>▾ {r.name}/</div>
                        ) : (
                          <button key={r.path} className={`tree-file ${openFile === r.path ? "on" : ""}`} style={{ paddingLeft: 12 + r.depth * 14 }} onClick={() => setOpenFile(r.path)}>
                            <span className={`ext ext-${r.name.split(".").pop()}`}>{r.name.split(".").pop()}</span> {r.name}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="code-pane">
                      <div className="code-head"><code>{openFile}</code></div>
                      {openFile.startsWith("assets/") ? (
                        <div className="code-img"><img src={`/a/${openFile.split("/").pop()}`} alt="" /></div>
                      ) : (
                        <pre className="code-body">
                          {codeContent.split("\n").map((line, i) => (
                            <div key={i} className="code-line"><span className="ln">{i + 1}</span><span>{line || " "}</span></div>
                          ))}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                <div className="canvas">
                  {previewHtml ? (
                    <div className={`frame ${view}`} style={{ width: DEVICES[view] }}>
                      <iframe key={frameKey} srcDoc={previewHtml} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" title="Live preview" />
                      {running && <span className="live-badge"><span className="pulse" /> updating live</span>}
                    </div>
                  ) : (
                    <div className="skeleton">
                      <div className="sk-nav"><i /><i /><i /><i /></div>
                      <div className="sk-hero"><i className="sk-h1" /><i className="sk-p" /><i className="sk-btn" /></div>
                      <div className="sk-cards"><i /><i /><i /></div>
                      <div className="sk-caption">
                        {running ? <><span className="spinner" /> The agent is designing your site…</> : "Preview appears here"}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            </main>
          </div>
        </div>
      )}

      {/* ─────────────── OVERLAYS ─────────────── */}
      <div className={`drawer-backdrop ${showHistory ? "open" : ""}`} onClick={() => setShowHistory(false)} />
      <aside className={`drawer ${showHistory ? "open" : ""}`}>
        <div className="drawer-head">
          <h3><Icon name="history" size={16} /> History</h3>
          <button className="icon-btn" onClick={() => setShowHistory(false)}><Icon name="x" size={16} /></button>
        </div>
        <button className="new-site" onClick={() => { if (!running) { newSite(); setShowHistory(false); } }} disabled={running}>
          <Icon name="plus" size={15} /> New website
        </button>
        <div className="proj-list">
          {projects.length === 0 && <div className="muted small center">Everything you build is saved here automatically.</div>}
          {projects.map((p) => {
            const n = Object.keys(p.convo.files).length;
            return (
              <div key={p.id} className={`proj ${project.current?.id === p.id ? "on" : ""}`} onClick={() => !running && openProject(p)}>
                <div className="proj-thumb">{p.title.slice(0, 1).toUpperCase()}</div>
                <div className="proj-info">
                  <b>{p.title || "Untitled"}</b>
                  <span>
                    {n} page{n === 1 ? "" : "s"} · {timeAgo(p.updatedAt)}
                    {p.url && <em className="live-tag">live</em>}
                  </span>
                </div>
                <div className="proj-actions" onClick={(e) => e.stopPropagation()}>
                  {p.url && <a className="icon-btn" href={p.url} target="_blank" rel="noreferrer" title="Open live site"><Icon name="external" size={14} /></a>}
                  <button className="icon-btn danger" onClick={() => removeProject(p.id)} disabled={running} title="Delete"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          conns={conns}
          onConnect={(svc) => connect(svc)}
          onDisconnect={async (svc) => {
            await fetch("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disconnect", service: svc }) });
            refreshConns();
          }}
          onSaveVercelToken={async (token) => {
            await fetch("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save-vercel-token", token }) });
            refreshConns();
            toast("Vercel token saved");
          }}
          onGithubAppSaved={async () => {
            await refreshConns();
            toast("GitHub app saved, now authorize it");
            connect("github");
          }}
          onSave={(s) => { saveSettings(s); setShowSettings(false); }}
          onKeysChange={(keys) => saveSettings({ ...settings, keys })}
          onClose={() => setShowSettings(false)}
        />
      )}
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <img className="zoom-img" src={zoom} alt="Screenshot" />
        </div>
      )}
      {showQr && qr && (
        <div className="modal-backdrop" onClick={() => setShowQr(false)}>
          <div className="qr-card" onClick={(e) => e.stopPropagation()}>
            <img src={qr} alt="QR code" />
            <b>Scan to open the live site</b>
            <a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, "")}</a>
            <div className="row">
              <button className="nav-btn" onClick={() => { navigator.clipboard?.writeText(url); toast("Link copied"); }}>Copy link</button>
              <button className="btn-primary" onClick={() => setShowQr(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === "ok" ? "check" : "alert"} size={14} strokeWidth={2.2} /> {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// Flat list of folder + file rows for the Code view's file tree
function treeRows(paths: string[]) {
  const rows: { path: string; name: string; depth: number; dir: boolean }[] = [];
  const seen = new Set<string>();
  const sorted = [...paths].sort((a, b) => {
    const da = a.includes("/"), db = b.includes("/");
    return da === db ? (da ? a.localeCompare(b) : 0) : da ? 1 : -1;
  });
  for (const p of sorted) {
    const parts = p.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join("/");
      if (!seen.has(dir)) {
        seen.add(dir);
        rows.push({ path: dir, name: parts[i], depth: i, dir: true });
      }
    }
    rows.push({ path: p, name: parts[parts.length - 1], depth: parts.length - 1, dir: false });
  }
  return rows;
}

function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}
