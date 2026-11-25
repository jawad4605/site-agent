// POST /api/github — pushes the site to a GitHub repo (creates it if needed) as ONE commit.
// The user's token is used for this request only and never stored on the server.
import { exportSite, slugify } from "@/lib/export";
import { getConn, type GithubConn } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const API = "https://api.github.com";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { repo, files, message } = body;
    const token = (await getConn<GithubConn>("github"))?.token || body.token;
    if (!token) return Response.json({ error: "Connect GitHub first.", needsConnect: true }, { status: 401 });
    if (!files || !files["index.html"]) return Response.json({ error: "Build a site first." }, { status: 400 });

    const gh = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
          ...(init.headers || {}),
        },
      });
      const data: any = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    };

    const me = await gh("/user");
    if (!me.ok) return Response.json({ error: `GitHub access expired (${me.status}). Please connect GitHub again.`, needsConnect: true }, { status: 401 });
    const owner = me.data.login as string;
    const name = slugify(repo || "my-site");

    // 1. Find or create the repository
    let r = await gh(`/repos/${owner}/${name}`);
    if (r.status === 404) {
      r = await gh("/user/repos", {
        method: "POST",
        body: JSON.stringify({ name, description: "Website built by SiteAgent (AI agent)", auto_init: true, private: false }),
      });
      if (!r.ok) return Response.json({ error: `Could not create repo: ${r.data.message}` }, { status: 400 });
    } else if (!r.ok) {
      return Response.json({ error: `GitHub error: ${r.data.message}` }, { status: 400 });
    }
    const branch = r.data.default_branch || "main";

    // 2. Latest commit on the branch (a brand-new repo may need a moment)
    let ref: any = null;
    for (let i = 0; i < 6 && !ref; i++) {
      const res = await gh(`/repos/${owner}/${name}/git/ref/heads/${branch}`);
      if (res.ok) ref = res.data;
      else await new Promise((s) => setTimeout(s, 1500));
    }
    if (!ref) return Response.json({ error: "Repository is not ready yet, try again in a few seconds." }, { status: 503 });
    const baseCommit = await gh(`/repos/${owner}/${name}/git/commits/${ref.object.sha}`);

    // 3. Upload files as blobs, build a tree, commit, move the branch
    const exported = await exportSite(files, name);
    const tree = [];
    for (const f of exported) {
      const blob = await gh(`/repos/${owner}/${name}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: f.base64, encoding: "base64" }),
      });
      if (!blob.ok) return Response.json({ error: `Upload failed for ${f.path}: ${blob.data.message}` }, { status: 400 });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.data.sha });
    }
    const newTree = await gh(`/repos/${owner}/${name}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseCommit.data.tree.sha, tree }),
    });
    const commit = await gh(`/repos/${owner}/${name}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: message || "Update website (SiteAgent)", tree: newTree.data.sha, parents: [ref.object.sha] }),
    });
    const moved = await gh(`/repos/${owner}/${name}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.data.sha }),
    });
    if (!moved.ok) return Response.json({ error: `Commit failed: ${moved.data.message}` }, { status: 400 });

    return Response.json({ url: `https://github.com/${owner}/${name}`, commit: commit.data.html_url, files: exported.length });
  } catch (err: any) {
    return Response.json({ error: err.message || "GitHub push failed" }, { status: 500 });
  }
}
