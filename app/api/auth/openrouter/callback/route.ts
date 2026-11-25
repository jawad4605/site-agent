// Step 2 of "Connect AI": exchange the code for the user's OpenRouter key.
import { cookies } from "next/headers";
import { popupDone, setConn } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const jar = await cookies();
  const verifier = jar.get("sa_or_verifier")?.value;
  const expectedState = jar.get("sa_or_state")?.value;
  jar.set("sa_or_verifier", "", { maxAge: 0, path: "/" });
  jar.set("sa_or_state", "", { maxAge: 0, path: "/" });

  const state = url.searchParams.get("state");
  if (!code || !verifier) return popupDone("openrouter", false, "Missing code, please try again.");
  if (state && expectedState && state !== expectedState) return popupDone("openrouter", false, "Invalid state.");

  const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.key) return popupDone("openrouter", false, data?.error?.message || "Key exchange failed");

  await setConn("openrouter", { key: data.key });
  return popupDone("openrouter", true);
}
