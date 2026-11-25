"use client";
// The agent's live activity feed + the stage tracker (Plan → Code → Test → Fix → Ship).
import { Icon } from "./icons";
import type { Item } from "./types";

export const STAGES = [
  { id: "plan", label: "Plan", icon: "brain" },
  { id: "code", label: "Code", icon: "code" },
  { id: "test", label: "Test", icon: "camera" },
  { id: "fix", label: "Fix", icon: "wrench" },
  { id: "ship", label: "Ship", icon: "rocket" },
] as const;

const STAGE_OF: Record<string, string> = { direction: "plan", thought: "plan", images: "code", write: "code", check: "test", edit: "fix", publish: "ship" };

export function stageState(items: Item[], running: boolean) {
  // only look at the current request (everything after the last user message)
  let start = 0;
  items.forEach((it, i) => it.type === "user" && (start = i));
  const recent = items.slice(start);
  const seen = new Set(recent.map((i) => STAGE_OF[i.type]).filter(Boolean));
  const last = [...recent].reverse().find((i) => STAGE_OF[i.type]);
  return { seen, active: running ? (last ? STAGE_OF[last.type] : "plan") : "" };
}

export function StageTracker({ items, running }: { items: Item[]; running: boolean }) {
  const { seen, active } = stageState(items, running);
  return (
    <div className="stages">
      {STAGES.map((s, i) => {
        const state = active === s.id ? "active" : seen.has(s.id) ? "done" : "";
        return (
          <div key={s.id} className={`stage ${state}`}>
            <span className="stage-dot">{state === "done" ? <Icon name="check" size={12} strokeWidth={2.6} /> : <Icon name={s.icon} size={12} />}</span>
            <span className="stage-label">{s.label}</span>
            {i < STAGES.length - 1 && <span className="stage-line" />}
          </div>
        );
      })}
    </div>
  );
}

function Row({ icon, tone, title, meta, children }: { icon: string; tone: string; title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={`tl-row tone-${tone}`}>
      <div className="tl-icon">
        <Icon name={icon} size={14} />
      </div>
      <div className="tl-body">
        <div className="tl-title">
          <span>{title}</span>
          {meta && <span className="tl-meta">{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Event({ ev, onZoom, onQr }: { ev: Item; onZoom: (s: string) => void; onQr: () => void }) {
  switch (ev.type) {
    case "user":
      return (
        <div className="tl-user">
          <div className="bubble">{ev.text}</div>
        </div>
      );
    case "thought":
      return (
        <Row icon="brain" tone="violet" title="Thinking">
          <p className="tl-text">{ev.text}</p>
        </Row>
      );
    case "write":
      return <Row icon="code" tone="blue" title={<>Wrote <code>{ev.page}</code></>} meta={`${(ev.bytes / 1024).toFixed(1)} KB`} />;
    case "edit":
      return (
        <Row icon="wrench" tone="blue" title={<>Edited <code>{ev.page}</code></>}>
          <details className="diff">
            <summary>View change</summary>
            <pre className="rm">{ev.removed}</pre>
            <pre className="add">{ev.added}</pre>
          </details>
        </Row>
      );
    case "check": {
      const d = `data:image/jpeg;base64,${ev.desktop}`;
      const m = `data:image/jpeg;base64,${ev.mobile}`;
      return (
        <Row icon="camera" tone="amber" title={<>Tested <code>{ev.page}</code> in Chrome</>} meta="desktop · mobile">
          <div className="shots">
            <button onClick={() => onZoom(d)}><img src={d} alt="Desktop screenshot" /></button>
            <button onClick={() => onZoom(m)}><img src={m} alt="Mobile screenshot" /></button>
          </div>
          {ev.findings.length ? (
            <ul className="findings">
              {ev.findings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <div className="pass"><Icon name="check" size={12} strokeWidth={2.4} /> Automatic checks passed</div>
          )}
        </Row>
      );
    }
    case "publish":
      return (
        <Row icon="rocket" tone="green" title="Published">
          <div className="tl-link">
            <a href={ev.url} target="_blank" rel="noreferrer">{ev.url.replace(/^https?:\/\//, "")}</a>
            <button className="chip-btn" onClick={onQr}><Icon name="qr" size={13} /> QR</button>
          </div>
        </Row>
      );
    case "done":
      return (
        <div className="tl-done">
          <Icon name="check" size={13} strokeWidth={2.4} /> Done. Describe a change below to keep improving it.
        </div>
      );
    case "export":
      return (
        <Row icon={ev.label.includes("GitHub") ? "github" : ev.label.includes("Vercel") ? "vercel" : "plug"} tone="green" title={ev.label.replace(/^[^\w]+/, "")} meta={ev.extra}>
          {ev.url && (
            <div className="tl-link">
              <a href={ev.url} target="_blank" rel="noreferrer">{ev.url.replace(/^https?:\/\//, "").slice(0, 60)}</a>
            </div>
          )}
        </Row>
      );
    case "direction":
      return (
        <Row icon="layers" tone="violet" title="Art direction" meta="unique look for this site">
          <p className="tl-text"><span className="dir-pill">{ev.name}</span></p>
        </Row>
      );
    case "images":
      return (
        <Row icon="image" tone="blue" title={<>Found photos · <span className="muted">“{ev.query}”</span></>}>
          {ev.urls.length ? (
            <div className="img-strip">
              {ev.urls.slice(0, 5).map((u) => (
                <img key={u} src={u} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              ))}
            </div>
          ) : (
            <p className="tl-text small">No matching photos, trying another approach.</p>
          )}
        </Row>
      );
    case "fallback":
      return (
        <Row icon="swap" tone="amber" title="Switched model">
          <p className="tl-text small">{ev.text}</p>
        </Row>
      );
    case "tool_error":
      if (ev.tool === "agent")
        return (
          <Row icon="refresh" tone="amber" title="Keeping the agent on track">
            <p className="tl-text small">{ev.text}</p>
          </Row>
        );
      return (
        <Row icon="alert" tone="amber" title={<>Tool error · <code>{ev.tool}</code></>} meta="recovering">
          <p className="tl-text small">{ev.text}</p>
        </Row>
      );
    case "error":
      return (
        <Row icon="alert" tone="red" title="Something went wrong">
          <p className="tl-text small">{ev.text}</p>
        </Row>
      );
  }
}
