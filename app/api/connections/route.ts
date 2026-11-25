// GET: which accounts are connected (never returns the secrets themselves)
// POST: { action: "disconnect", service } or { action: "save-vercel-token", token }
import { clearConn, getConn, getGithubApp, setConn, type GithubConn, type OpenRouterConn, type VercelConn } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gh = await getConn<GithubConn>("github");
  const or = await getConn<OpenRouterConn>("openrouter");
  const vc = await getConn<VercelConn>("vercel");
  return Response.json({
    github: gh ? { login: gh.login } : null,
    githubReady: !!(await getGithubApp()),
    openrouter: !!or,
    vercelToken: !!vc,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const service = body.service as "github" | "openrouter" | "vercel" | "ghapp";
  if (body.action === "disconnect" && ["github", "openrouter", "vercel", "ghapp"].includes(service)) {
    await clearConn(service);
    return Response.json({ ok: true });
  }
  if (body.action === "save-github-app") {
    const clientId = String(body.clientId || "").trim();
    const clientSecret = String(body.clientSecret || "").trim();
    if (clientId.length < 10 || clientSecret.length < 20)
      return Response.json({ error: "That doesn't look like a Client ID and Client secret." }, { status: 400 });
    await setConn("ghapp", { clientId, clientSecret });
    return Response.json({ ok: true });
  }
  if (body.action === "save-vercel-token" && typeof body.token === "string" && body.token.length > 10) {
    await setConn("vercel", { token: body.token.trim() });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Bad request" }, { status: 400 });
}
