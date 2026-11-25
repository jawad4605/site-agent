// Storage for published sites and uploaded images.
// On Vercel: Vercel Blob. Locally (no Blob store): a .data/ folder in the project,
// so published links and images survive a server restart.
import fs from "node:fs/promises";
import nodePath from "node:path";
import { put, get } from "@vercel/blob";

type Stored = { body: Buffer; type: string };
const memory: Map<string, Stored> = ((globalThis as any).__store ??= new Map<string, Stored>());

const blobEnabled = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const diskEnabled = () => !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;
const DATA_DIR = nodePath.join(process.cwd(), ".data");
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const safe = (p: string) => {
  const full = nodePath.join(DATA_DIR, p);
  if (!full.startsWith(DATA_DIR)) throw new Error("bad path");
  return full;
};

export async function saveFile(path: string, body: Buffer | string, type: string): Promise<void> {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  if (!blobEnabled()) {
    memory.set(path, { body: buf, type });
    if (diskEnabled()) {
      const file = safe(path);
      await fs.mkdir(nodePath.dirname(file), { recursive: true });
      await fs.writeFile(file, buf);
    }
    return;
  }
  const opts = { addRandomSuffix: false, allowOverwrite: true, contentType: type };
  // Works with both private and public Blob stores.
  try {
    await put(path, buf, { ...opts, access: "private" });
  } catch {
    await put(path, buf, { ...opts, access: "public" });
  }
}

export async function loadFile(path: string): Promise<Stored | null> {
  if (!blobEnabled()) {
    const hit = memory.get(path);
    if (hit || !diskEnabled()) return hit ?? null;
    try {
      const body = await fs.readFile(safe(path));
      return { body, type: TYPES[path.split(".").pop() || ""] || "application/octet-stream" };
    } catch {
      return null;
    }
  }
  for (const access of ["private", "public"] as const) {
    try {
      const res = await get(path, { access, useCache: false });
      if (res?.stream) {
        const body = Buffer.from(await new Response(res.stream).arrayBuffer());
        return { body, type: res.headers.get("content-type") || "application/octet-stream" };
      }
    } catch {
      /* try the other access mode */
    }
  }
  return null;
}

// A site is a set of pages: { "index.html": "...", "menu.html": "..." }
export async function saveSite(id: string, files: Record<string, string>) {
  await Promise.all(
    Object.entries(files).map(([name, html]) => saveFile(`sites/${id}/${name}`, html, "text/html; charset=utf-8")),
  );
}
