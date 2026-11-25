// Connected accounts are stored in encrypted, httpOnly cookies in the user's browser.
// The server never keeps tokens in a database.
import crypto from "node:crypto";
import { cookies } from "next/headers";

const secret: string =
  process.env.SESSION_SECRET ||
  ((globalThis as any).__devSecret ??= crypto.randomBytes(32).toString("hex")); // dev only: resets on restart
const KEY = crypto.createHash("sha256").update(secret).digest();

export function encrypt(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function decrypt<T = any>(token?: string): T | null {
  if (!token) return null;
  try {
    const buf = Buffer.from(token, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export type GithubConn = { token: string; login: string };
export type OpenRouterConn = { key: string };
export type VercelConn = { token: string };
export type GithubApp = { clientId: string; clientSecret: string };

// The GitHub OAuth App: from env vars, or saved from the in-app setup wizard.
export async function getGithubApp(): Promise<GithubApp | null> {
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
    return { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  return getConn<GithubApp>("ghapp");
}

const NAMES = { github: "sa_github", openrouter: "sa_openrouter", vercel: "sa_vercel", ghapp: "sa_ghapp" } as const;
type Service = keyof typeof NAMES;

export async function getConn<T>(service: Service): Promise<T | null> {
  const jar = await cookies();
  return decrypt<T>(jar.get(NAMES[service])?.value);
}

export async function setConn(service: Service, value: unknown) {
  const jar = await cookies();
  jar.set(NAMES[service], encrypt(value), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearConn(service: Service) {
  (await cookies()).set(NAMES[service], "", { maxAge: 0, path: "/" });
}

// Small page shown in the popup after authorizing: tells the app and closes itself.
export function popupDone(service: string, ok: boolean, message = "") {
  const payload = JSON.stringify({ connected: service, ok, message });
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:system-ui;background:#0b0d12;color:#e8eaf0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:40px">${ok ? "✅" : "⚠️"}</div><p>${ok ? "Connected! You can close this window." : "Connection failed: " + message.replace(/</g, "&lt;")}</p></div>
<script>try{if(window.opener){window.opener.postMessage(${payload},location.origin);setTimeout(function(){window.close()},${ok ? 600 : 4000});}else{setTimeout(function(){location.href="/"},${ok ? 800 : 4000});}}catch(e){}</script>
</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export function randomString(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
