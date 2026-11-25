// Small inline icon set (stroke icons, 24px grid) so the app has no icon dependency.
const P: Record<string, React.ReactNode> = {
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  brain: <><path d="M9 4a3 3 0 0 0-3 3v.2A3 3 0 0 0 4 10a3 3 0 0 0 1 2.2A3 3 0 0 0 6 17a3 3 0 0 0 3 3V4z" /><path d="M15 4a3 3 0 0 1 3 3v.2A3 3 0 0 1 20 10a3 3 0 0 1-1 2.2A3 3 0 0 1 18 17a3 3 0 0 1-3 3V4z" /><path d="M9 4h6M9 20h6" /></>,
  code: <><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>,
  wrench: <><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 1-5-5L13 2z" transform="translate(-1 0)" /></>,
  rocket: <><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 15l-3-3c1-4 5-9 13-9 0 8-5 12-9 13z" /><circle cx="15" cy="9" r="1.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  swap: <><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  plug: <><path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>,
  github: <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
  vercel: <path d="M12 4l9 16H3z" fill="currentColor" stroke="none" />,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  desktop: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  tablet: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M11 18h2" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.8-3.5L3 10" /><path d="M3 4v6h6M4 13a8 8 0 0 0 14.8 3.5L21 14" /><path d="M21 20v-6h-6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  zap: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className = "", strokeWidth = 1.8 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ic ${className}`}
      aria-hidden
    >
      {P[name] ?? P.sparkles}
    </svg>
  );
}

// SiteAgent mark: a cube of building blocks with one block sliding into place
// (the agent assembling a website). The block animates while the agent works.
export function Logo({ size = 28, building = false }: { size?: number; building?: boolean }) {
  return (
    <svg className={`logo-cube ${building ? "building" : ""}`} viewBox="6 2 60 60" width={size} height={size} aria-label="SiteAgent">
      <defs>
        <linearGradient id="sa-t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <linearGradient id="sa-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        <linearGradient id="sa-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#60a5fa" /><stop offset="1" stopColor="#2563eb" /></linearGradient>
      </defs>
      <g stroke="#09090b" strokeWidth="1.4" strokeLinejoin="round">
        <polygon points="10,20 32,32 32,56 10,44" fill="url(#sa-l)" />
        <polygon points="43,26 32,32 32,56 54,44 54,32 43,38" fill="url(#sa-r)" />
        <polygon points="32,8 43,14 32,20 43,26 32,32 10,20" fill="url(#sa-t)" />
        <polygon points="43,26 54,32 43,38 32,32" fill="#0e7490" />
        <polygon points="43,14 32,20 32,32 43,26" fill="#1e3a8a" />
        <g className="logo-block">
          <polygon points="32,20 43,26 43,38 32,32" fill="url(#sa-l)" />
          <polygon points="54,20 43,26 43,38 54,32" fill="url(#sa-r)" />
          <polygon points="43,14 54,20 43,26 32,20" fill="url(#sa-t)" />
        </g>
      </g>
    </svg>
  );
}
