// POST /api/upload — stores one image (already resized in the browser) and returns its URL.
import { saveFile } from "@/lib/publish";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: Request) {
  const type = req.headers.get("content-type") || "";
  const ext = TYPES[type];
  if (!ext) return Response.json({ error: "Only JPG, PNG or WebP images" }, { status: 400 });

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > 3_000_000) return Response.json({ error: "Image too large (max 3 MB)" }, { status: 400 });

  const rawName = decodeURIComponent(req.headers.get("x-filename") || "image");
  const slug = rawName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "image";
  const file = `${slug}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await saveFile(`assets/${file}`, body, type);

  const origin = new URL(req.url).origin;
  return Response.json({ url: `${origin}/a/${file}`, name: rawName });
}
