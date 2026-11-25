// Step 1 of "Connect GitHub": send the user to GitHub's authorize page.
import { cookies } from "next/headers";
import { getGithubApp, randomString } from "@/lib/session";

export async function GET(req: Request) {
  const app = await getGithubApp();
  if (!app) return new Response("GitHub is not set up yet. Open Connections → GitHub → Set up.", { status: 500 });
  const clientId = app.clientId;
  const origin = new URL(req.url).origin;
  const state = randomString();
  (await cookies()).set("sa_gh_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/github/callback`,
    scope: "public_repo",
    state,
    allow_signup: "true",
  });
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`);
}
