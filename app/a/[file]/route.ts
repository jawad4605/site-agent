// Serves uploaded images: /a/<file>
import { loadFile } from "@/lib/publish";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[a-z0-9-]{4,60}\.(jpg|png|webp)$/.test(file)) return new Response("Not found", { status: 404 });
  const stored = await loadFile(`assets/${file}`);
  if (!stored) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(stored.body), {
    headers: { "content-type": stored.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}
