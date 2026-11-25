// POST /api/vercel — deploys the site to the user's own Vercel account (production).
// The user's token is used for this request only and never stored on the server.
import { exportSite, slugify } from "@/lib/export";
import { getConn, type VercelConn } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project, files } = body;
    const token = (await getConn<VercelConn>("vercel"))?.token || body.token;
    if (!token) return Response.json({ error: "No Vercel token saved.", needsConnect: true }, { status: 401 });
    if (!files || !files["index.html"]) return Response.json({ error: "Build a site first." }, { status: 400 });

    const name = slugify(project || "my-site");
    const exported = await exportSite(files, name);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const res = await fetch("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        target: "production",
        projectSettings: { framework: null },
        files: exported.map((f) => ({ file: f.path, data: f.base64, encoding: "base64" })),
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return Response.json({ error: `Vercel: ${data?.error?.message || res.status}` }, { status: 400 });

    // Wait until it's live (static sites take a few seconds)
    let dep = data;
    for (let i = 0; i < 20 && !["READY", "ERROR", "CANCELED"].includes(dep.readyState); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(`https://api.vercel.com/v13/deployments/${data.id}`, { headers });
      if (s.ok) dep = await s.json();
    }
    if (dep.readyState === "ERROR") return Response.json({ error: "Vercel deployment failed." }, { status: 400 });

    const alias = (dep.alias || []).find((a: string) => a.endsWith(".vercel.app") && !a.includes(dep.id)) || dep.alias?.[0];
    return Response.json({ url: `https://${alias || dep.url}`, deploymentUrl: `https://${dep.url}`, state: dep.readyState });
  } catch (err: any) {
    return Response.json({ error: err.message || "Vercel deploy failed" }, { status: 500 });
  }
}
