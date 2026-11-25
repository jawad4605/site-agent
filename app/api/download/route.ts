// POST /api/download — the site as a ZIP with a proper folder structure.
import JSZip from "jszip";
import { exportSite, slugify } from "@/lib/export";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { files, name } = await req.json();
  if (!files || !files["index.html"]) return Response.json({ error: "Build a site first." }, { status: 400 });
  const folder = slugify(name || "my-site");
  const zip = new JSZip();
  for (const f of await exportSite(files, folder)) zip.file(`${folder}/${f.path}`, f.base64, { base64: true });
  const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(data as any, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${folder}.zip"` },
  });
}
