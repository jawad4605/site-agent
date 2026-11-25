"use client";
import { useState } from "react";
import { EMPTY_SETTINGS, OR_MODELS, PROVIDERS, type Conns, type ProviderId, type Settings } from "./types";
import { Icon } from "./icons";

export default function SettingsPanel({
  settings, conns, onConnect, onDisconnect, onSaveVercelToken, onGithubAppSaved, onSave, onClose,
}: {
  settings: Settings;
  conns: Conns;
  onConnect: (svc: "github" | "openrouter") => void;
  onDisconnect: (svc: "github" | "openrouter" | "vercel") => void;
  onSaveVercelToken: (token: string) => void;
  onGithubAppSaved: () => void;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<Settings>(settings);
  const [vercelToken, setVercelToken] = useState("");
  const [ghSetup, setGhSetup] = useState(false);
  const setKey = (id: ProviderId, v: string) => setS({ ...s, keys: { ...s.keys, [id]: v.trim() } });
  const setModel = (id: ProviderId, v: string) => setS({ ...s, models: { ...s.models, [id]: v.trim() } });

  return (
    <div className="overlay" onClick={onClose} style={{ cursor: "default" }}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Connections</h2>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>

        {/* ── AI ───────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div className="logo-dot ai">AI</div>
            <div>
              <b>AI model</b>
              <div className="muted small">Claude, ChatGPT or Gemini with one account</div>
            </div>
            {conns.openrouter ? (
              <span className="pill ok">● Connected</span>
            ) : (
              <button className="connect" onClick={() => onConnect("openrouter")}>Connect</button>
            )}
          </div>
          {conns.openrouter && (
            <div className="card-body">
              {OR_MODELS.map((m) => (
                <label key={m.id} className="radio">
                  <input type="radio" checked={(s.brain === "openrouter" || s.brain === "auto") && s.orModel === m.id} onChange={() => setS({ ...s, brain: "openrouter", orModel: m.id })} />
                  <span><b>{m.name}</b> · <span className="muted">{m.note}</span></span>
                </label>
              ))}
              <button className="link" onClick={() => onDisconnect("openrouter")}>Disconnect</button>
            </div>
          )}
          <label className="radio" style={{ marginTop: 6 }}>
            <input type="radio" checked={conns.openrouter ? s.brain === "free" : s.brain === "auto"} onChange={() => setS({ ...s, brain: conns.openrouter ? "free" : "auto" })} />
            <span><b>{conns.openrouter ? "Free models only" : "Auto"}</b> · <span className="muted">use the server&apos;s keys (free Gemini/Groq){conns.openrouter ? ", not your OpenRouter account" : ""}</span></span>
          </label>
          <details>
            <summary>Use your own API key instead</summary>
            {PROVIDERS.map((p) => (
              <div key={p.id} className={`prov ${s.brain === p.id ? "on" : ""}`}>
                <label className="radio">
                  <input type="radio" checked={s.brain === p.id} onChange={() => setS({ ...s, brain: p.id })} />
                  <span><b>{p.name}</b> · <a href={p.link} target="_blank" rel="noreferrer">get key ↗</a></span>
                </label>
                {s.brain === p.id && (
                  <div className="fields">
                    <input type="password" placeholder={`${p.name} API key`} value={s.keys[p.id] || ""} onChange={(e) => setKey(p.id, e.target.value)} />
                    <input placeholder={`Model (default: ${p.model})`} value={s.models[p.id] || ""} onChange={(e) => setModel(p.id, e.target.value)} />
                  </div>
                )}
              </div>
            ))}
          </details>
        </div>

        {/* ── GitHub ───────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div className="logo-dot gh"><Icon name="github" size={18} /></div>
            <div>
              <b>GitHub</b>
              <div className="muted small">Push the website code to your repositories</div>
            </div>
            {conns.github ? (
              <span className="pill ok">● @{conns.github.login}</span>
            ) : conns.githubReady ? (
              <button className="connect" onClick={() => onConnect("github")}>Connect</button>
            ) : (
              <button className="connect" onClick={() => setGhSetup(!ghSetup)}>{ghSetup ? "Close" : "Set up"}</button>
            )}
          </div>
          {conns.github && <button className="link" onClick={() => onDisconnect("github")}>Disconnect</button>}
          {!conns.githubReady && ghSetup && <GithubSetup onSaved={onGithubAppSaved} />}
          {!conns.githubReady && !ghSetup && (
            <p className="muted small" style={{ margin: "8px 0 0 48px" }}>One-time setup (about 1 minute): register this app with GitHub, then every user just clicks Connect.</p>
          )}
        </div>

        {/* ── Vercel ───────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div className="logo-dot vc">▲</div>
            <div>
              <b>Vercel</b>
              <div className="muted small">The ▲ Vercel button pushes to GitHub, then opens Vercel to deploy it. You sign in and authorize on vercel.com, and every later push re-deploys automatically.</div>
            </div>
            {conns.vercelToken && <span className="pill ok">● Direct</span>}
          </div>
          <details>
            <summary>Advanced: deploy directly with a Vercel token</summary>
            {conns.vercelToken ? (
              <button className="link" onClick={() => onDisconnect("vercel")}>Remove saved token</button>
            ) : (
              <div className="row" style={{ marginTop: 6 }}>
                <input type="password" placeholder="Vercel token (vercel.com → Account → Tokens)" value={vercelToken} onChange={(e) => setVercelToken(e.target.value)} />
                <button className="ghost" onClick={() => { onSaveVercelToken(vercelToken); setVercelToken(""); }} disabled={vercelToken.length < 10}>Save</button>
              </div>
            )}
          </details>
        </div>

        <p className="muted small">Connected accounts are kept in an encrypted cookie in your browser, never in a database. Your own API keys stay in this browser only.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={() => onSave(s)}>Done</button>
        </div>
      </div>
    </div>
  );
}

// Step-by-step registration of the GitHub OAuth App, without touching .env files.
function GithubSetup({ onSaved }: { onSaved: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callback = `${origin}/api/auth/github/callback`;
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const createUrl =
    "https://github.com/settings/applications/new?" +
    new URLSearchParams({
      "oauth_application[name]": "SiteAgent",
      "oauth_application[url]": origin,
      "oauth_application[callback_url]": callback,
    }).toString();
  const copy = (label: string, v: string) => {
    navigator.clipboard?.writeText(v);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };
  async function save() {
    setSaving(true);
    setErr("");
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save-github-app", clientId, clientSecret: secret }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setErr(data.error || "Could not save");
    onSaved();
  }
  const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="copy-field">
      <span>{label}</span>
      <code>{value}</code>
      <button onClick={() => copy(label, value)}>{copied === label ? "Copied" : "Copy"}</button>
    </div>
  );
  return (
    <div className="setup">
      <div className="setup-step">
        <span className="num">1</span>
        <div>
          <b>Register the app on GitHub</b>
          <p className="muted small">Opens GitHub with these values filled in. If a field is empty, copy it from here. Then click <i>Register application</i>.</p>
          <Field label="Application name" value="SiteAgent" />
          <Field label="Homepage URL" value={origin} />
          <Field label="Callback URL" value={callback} />
          <a className="connect inline" href={createUrl} target="_blank" rel="noreferrer">Open GitHub ↗</a>
        </div>
      </div>
      <div className="setup-step">
        <span className="num">2</span>
        <div>
          <b>Paste the Client ID and a Client secret</b>
          <p className="muted small">On the app page, copy the <i>Client ID</i>, click <i>Generate a new client secret</i> and copy it.</p>
          <input placeholder="Client ID (e.g. Ov23li…)" value={clientId} onChange={(e) => setClientId(e.target.value.trim())} />
          <input type="password" placeholder="Client secret" value={secret} onChange={(e) => setSecret(e.target.value.trim())} />
          {err && <p className="err small">{err}</p>}
          <button className="connect inline" disabled={saving || !clientId || !secret} onClick={save}>{saving ? "Saving…" : "Save & connect GitHub"}</button>
        </div>
      </div>
    </div>
  );
}
