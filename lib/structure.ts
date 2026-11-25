// ─────────────────────────────────────────────────────────────
//  PROJECT STRUCTURE
//  The agent writes each page as one self-contained file (fast to
//  preview and test). For GitHub, Vercel and downloads we turn that
//  into a proper project:
//
//    my-site/
//    ├── index.html, about.html, contact.html …   (pages)
//    ├── css/global.css + css/<page>.css           (shared + one file per page)
//    ├── js/global.js + js/<page>.js               (shared + one file per page)
//    ├── assets/images/…                           (your uploaded images)
//    └── README.md
//
//  Pure string code, so the browser can show the same tree in the Code view.
// ─────────────────────────────────────────────────────────────
import { NAV_GUARD } from "./navguard";

export type TextFile = { path: string; content: string };

const STYLE_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
export const ASSET_URL = /https?:\/\/[^"'\s)]+?\/a\/([a-z0-9-]+\.(?:jpg|png|webp))/gi;

const isInlineJs = (attrs: string) => !/\bsrc\s*=/.test(attrs) && !/type\s*=\s*["']?(application\/(ld\+)?json|text\/template|importmap|module)/i.test(attrs);
const tidy = (s: string) => s.replace(/^\n+|\s+$/g, "").replace(/^ {2,}/gm, (m) => m) + "\n";

function extract(html: string) {
  const css: string[] = [];
  const js: string[] = [];
  let out = html.replace(STYLE_RE, (_m, attrs: string, body: string) => {
    if (/media\s*=/.test(attrs)) return _m; // keep special-purpose styles inline
    css.push(body.trim());
    return "";
  });
  out = out.replace(SCRIPT_RE, (m, attrs: string, body: string) => {
    if (!isInlineJs(attrs) || !body.trim()) return m;
    if (attrs.includes("nav-guard")) return ""; // shipped as js/nav.js
    js.push(body.trim());
    return "";
  });
  return { html: out, css: css.join("\n\n"), js: js.join("\n\n") };
}

export function buildProject(files: Record<string, string>, title = "Website"): { files: TextFile[]; assets: string[] } {
  const pages = Object.keys(files).filter((n) => /^[a-z0-9-]{1,40}\.html$/.test(n)).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
  const parts = pages.map((name) => ({ name, base: name.replace(/\.html$/, ""), ...extract(files[name]) }));
  const multi = parts.length > 1;

  // Shared parts (header, footer, colours, buttons) that are identical on every page
  // go into global.css / global.js. Everything else gets its OWN file per page.
  const pageBlocks = parts.map((p) => blocks(p.css));
  const common = multi ? pageBlocks[0].filter((b) => pageBlocks.every((list) => list.includes(b))) : [];
  const commonSet = new Set(common);
  const sameJs = multi && parts.every((p) => p.js === parts[0].js);

  const out: TextFile[] = [];
  const assets = new Set<string>();

  if (common.length) out.push({ path: "css/global.css", content: tidy(`/* Shared by every page */\n${common.join("\n\n")}`) });
  if (sameJs && parts[0].js.trim()) out.push({ path: "js/global.js", content: tidy(`// Shared by every page\n${parts[0].js}`) });
  out.push({ path: "js/nav.js", content: tidy(NAV_GUARD.replace(/^<script[^>]*>|<\/script>$/g, "")) });

  parts.forEach((p, i) => {
    const ownCss = pageBlocks[i].filter((b) => !commonSet.has(b));
    const head: string[] = [];
    if (common.length) head.push(`<link rel="stylesheet" href="css/global.css">`);
    if (ownCss.length) {
      head.push(`<link rel="stylesheet" href="css/${p.base}.css">`);
      out.push({ path: `css/${p.base}.css`, content: tidy(`/* ${p.name} */\n${ownCss.join("\n\n")}`) });
    }
    const tail: string[] = [];
    if (sameJs && p.js.trim()) tail.push(`<script src="js/global.js"></script>`);
    else if (p.js.trim()) {
      tail.push(`<script src="js/${p.base}.js"></script>`);
      out.push({ path: `js/${p.base}.js`, content: tidy(`// ${p.name}\n${p.js}`) });
    }
    tail.push(`<script src="js/nav.js"></script>`);

    let html = p.html.replace(ASSET_URL, (_m, file: string) => {
      assets.add(file);
      return `assets/images/${file}`;
    });
    if (head.length) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `  ${head.join("\n  ")}\n</head>`) : head.join("\n") + "\n" + html;
    html = /<\/body>(?![\s\S]*<\/body>)/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `  ${tail.join("\n  ")}\n</body>`) : html + tail.join("\n");
    out.push({ path: p.name, content: html.replace(/\n\s*\n\s*\n+/g, "\n\n") });
  });

  out.push({
    path: "README.md",
    content: `# ${title}

Built by **SiteAgent**, an AI agent that plans, codes, tests in a real browser and publishes websites.

## Structure

\`\`\`
${tree([...out.map((f) => f.path), ...[...assets].map((a) => `assets/images/${a}`)])}
\`\`\`

- Every page has its own stylesheet (\`css/<page>.css\`) and script (\`js/<page>.js\`).
- Parts that are identical on every page (header, footer, colours) live in \`css/global.css\` / \`js/global.js\`.

## Run locally

Open \`index.html\` in a browser, or serve the folder:

\`\`\`bash
npx serve .
\`\`\`

## Deploy

Static site: works on Vercel, Netlify, GitHub Pages or any web host. No build step.
`,
  });

  return { files: out.sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path)), assets: [...assets] };
}

function prelude(block: string) {
  const i = block.indexOf("{");
  return (i < 0 ? block : block.slice(0, i)).replace(/\s+/g, " ").trim();
}
function scope(block: string, page: string) {
  const sel = prelude(block);
  const body = block.slice(block.indexOf("{"));
  const scoped = sel
    .split(",")
    .map((s) => {
      const t = s.trim();
      if (/^(html|:root)$/.test(t)) return t;
      if (/^body\b/.test(t)) return t.replace(/^body/, `body[data-page="${page}"]`);
      return `body[data-page="${page}"] ${t}`;
    })
    .join(", ");
  return `${scoped} ${body}`;
}
function indent(code: string) {
  return code.split("\n").map((l) => (l ? "  " + l : l)).join("\n");
}

function order(p: string) {
  if (p === "index.html") return 0;
  if (p.endsWith(".html")) return 1;
  if (p.startsWith("css/")) return 2;
  if (p.startsWith("js/")) return 3;
  if (p.startsWith("assets/")) return 4;
  return 5;
}

// Split CSS into top-level blocks and keep the ones that appear in every page.
function blocks(css: string): string[] {
  const res: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        res.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (css[i] === ";" && depth === 0) {
      res.push(css.slice(start, i + 1).trim()); // @import / @charset
      start = i + 1;
    }
  }
  return res.filter(Boolean);
}

export function tree(paths: string[]): string {
  const root: any = {};
  for (const p of paths) p.split("/").reduce((node, part) => (node[part] ??= {}), root);
  const lines: string[] = ["./"];
  const walk = (node: any, prefix: string) => {
    const keys = Object.keys(node).sort((a, b) => {
      const da = Object.keys(node[a]).length > 0, db = Object.keys(node[b]).length > 0;
      return da === db ? order(a) - order(b) || a.localeCompare(b) : da ? 1 : -1;
    });
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const isDir = Object.keys(node[k]).length > 0;
      lines.push(`${prefix}${last ? "└── " : "├── "}${k}${isDir ? "/" : ""}`);
      if (isDir) walk(node[k], prefix + (last ? "    " : "│   "));
    });
  };
  walk(root, "");
  return lines.join("\n");
}
