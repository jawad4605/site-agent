// Serves a published site: /s/<id> (home page) and /s/<id>/<page>.html
import { loadFile } from "@/lib/publish";
import { ensureNavGuard } from "@/lib/navguard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; page?: string[] }> }) {
  const { id, page } = await ctx.params;
  const name = page?.[0] || "index.html";
  if (!/^[a-z0-9-]{4,40}$/.test(id) || !/^[a-z0-9-]{1,40}\.html$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }
  const file = await loadFile(`sites/${id}/${name}`);
  if (!file) return new Response("Page not found", { status: 404 });

  // <base> makes links like href="menu.html" work no matter how the URL ends
  const html = ensureNavGuard(file.body.toString("utf8"))
    .replace(/<head([^>]*)>/i, `<head$1><base href="/s/${id}/">`)
    // href="/" or "/about.html" would leave the site and open the SiteAgent app; keep them inside it
    .replace(/href="\/(#[^"]*)?"/g, (_m, hash) => `href="index.html${hash ?? ""}"`)
    .replace(/href="\/([a-z0-9-]+\.html(?:#[^"]*)?)"/gi, 'href="$1"');
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
  });
}
