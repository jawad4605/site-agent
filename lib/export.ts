// Turns the site into a real project for GitHub, Vercel and ZIP downloads:
// pages + css/ + js/ + assets/images/ + README (see lib/structure.ts).
import { loadFile } from "./publish";
import { buildProject } from "./structure";

export type ExportFile = { path: string; base64: string };

export async function exportSite(files: Record<string, string>, title = "Website"): Promise<ExportFile[]> {
  const project = buildProject(files, title);
  const out: ExportFile[] = project.files.map((f) => ({ path: f.path, base64: Buffer.from(f.content, "utf8").toString("base64") }));
  for (const file of project.assets) {
    const stored = await loadFile(`assets/${file}`);
    if (stored) out.push({ path: `assets/images/${file}`, base64: stored.body.toString("base64") });
  }
  return out;
}

export function slugify(s: string, fallback = "my-site") {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || fallback;
}
