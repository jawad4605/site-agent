// Step 2 of "Connect GitHub": GitHub sends the user back with a code; exchange it for a token.
import { cookies } from "next/headers";
import { getGithubApp, popupDone, setConn } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("sa_gh_state")?.value;
  jar.set("sa_gh_state", "", { maxAge: 0, path: "/" });

  if (url.searchParams.get("error")) return popupDone("github", false, url.searchParams.get("error_description") || "Cancelled");
  if (!code || !state || state !== expected) return popupDone("github", false, "Invalid state, please try again.");

  const app = await getGithubApp();
  if (!app) return popupDone("github", false, "GitHub app is not set up.");
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: `${url.origin}/api/auth/github/callback`,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.access_token) return popupDone("github", false, data.error_description || "Token exchange failed");

  const me = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${data.access_token}`, accept: "application/vnd.github+json" },
  }).then((r) => r.json());

  await setConn("github", { token: data.access_token, login: me.login });
  return popupDone("github", true);
}
