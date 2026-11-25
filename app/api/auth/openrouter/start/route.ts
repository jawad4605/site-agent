// Step 1 of "Connect AI": OpenRouter's one-click authorization (PKCE).
// One OpenRouter account gives access to Claude, ChatGPT, Gemini and 300+ other models.
import { cookies } from "next/headers";
import { pkceChallenge, randomString } from "@/lib/session";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const verifier = randomString(48);
  const state = randomString();
  const jar = await cookies();
  jar.set("sa_or_verifier", verifier, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  jar.set("sa_or_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  const params = new URLSearchParams({
    callback_url: `${origin}/api/auth/openrouter/callback`,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    state,
    key_label: "SiteAgent",
  });
  return Response.redirect(`https://openrouter.ai/auth?${params}`);
}
