// ─────────────────────────────────────────────────────────────
//  DESIGN DIRECTIONS: why every site doesn't look the same
//  AI sites look "AI-made" because models fall back to the same
//  defaults: centered hero, purple gradient, Inter, 3 emoji cards.
//  For each new site we pick a concrete art direction (fonts,
//  palette, layout, signature details) and ban the clichés.
// ─────────────────────────────────────────────────────────────

export type Direction = {
  id: string;
  name: string;
  mood: string;
  fonts: string; // Google Fonts: display / body
  palette: string;
  layout: string;
  signature: string[];
  bestFor: RegExp;
};

export const DIRECTIONS: Direction[] = [
  {
    id: "editorial",
    name: "Editorial magazine",
    mood: "Sophisticated, story-led, like a printed magazine spread",
    fonts: "Display: 'Fraunces' or 'Playfair Display' (large, tight tracking, mix italic for emphasis). Body: 'Source Serif 4' or 'Inter Tight'",
    palette: "Warm paper #F4EFE6 background, ink #1B1A17 text, one accent like terracotta #C4552D. No gradients.",
    layout: "Left-aligned asymmetric hero: giant headline spanning 8/12 columns with a tall photo on the right that bleeds off the edge. 12-column grid, generous whitespace, thin 1px rules between sections, numbered section labels (01 — Menu).",
    signature: ["drop cap on the first paragraph", "pull-quote in large italic serif", "small caps eyebrow labels", "photo captions in small text"],
    bestFor: /restaurant|cafe|food|biryani|bakery|hotel|travel|blog|magazine|author|writer|fashion|boutique/i,
  },
  {
    id: "swiss",
    name: "Swiss / International",
    mood: "Precise, confident, grid-driven, very professional",
    fonts: "Display & body: 'Inter Tight' or 'Archivo' with strong weight contrast (800 headlines, 400 body). Numbers in 'JetBrains Mono'",
    palette: "Pure white #FFFFFF, near-black #111111, one bold signal colour like #FF3B00 or #0047FF used sparingly for accents and big numbers.",
    layout: "Strict visible grid. Hero = huge headline set across the full width, flush left, with key facts in a 3-column row underneath. Content in bordered grid cells. Big statistics.",
    signature: ["oversized numerals for stats", "hairline borders forming a grid", "arrow ↗ links", "uppercase micro-labels"],
    bestFor: /agency|consult|firm|law|finance|corporate|startup|saas|tech|software|architecture|studio/i,
  },
  {
    id: "neo-brutal",
    name: "Neo-brutalist",
    mood: "Bold, playful, loud, youthful and memorable",
    fonts: "Display: 'Space Grotesk' or 'Archivo Black'. Body: 'Space Grotesk'",
    palette: "Cream #FFF6E5 background, black #000 2-3px borders and hard offset shadows (6px 6px 0 #000), saturated blocks: #FFD23F yellow, #3BCEAC teal, #EE4266 pink.",
    layout: "Chunky cards with thick black borders and hard shadows, slightly rotated stickers/badges, a scrolling marquee strip of keywords, big buttons that shift on hover.",
    signature: ["CSS marquee ticker", "rotated sticker badges", "hard offset shadows", "hover: translate(-3px,-3px)"],
    bestFor: /society|club|student|event|festival|community|game|kids|youth|hackathon|creative/i,
  },
  {
    id: "luxury",
    name: "Quiet luxury",
    mood: "Calm, premium, expensive, restrained",
    fonts: "Display: 'Cormorant Garamond' (light 300, wide letter-spacing on small caps). Body: 'Manrope' 300/400",
    palette: "Deep #12110F or warm ivory #F7F3EC, champagne/gold accent #B8975A, muted taupe #8A8178. Lots of negative space.",
    layout: "Full-bleed photography with thin overlaid text, very wide margins, centered small-caps navigation, sections separated by space instead of boxes, slow fade-in on scroll.",
    signature: ["letter-spaced uppercase labels", "thin gold dividers", "full-bleed image sections", "IntersectionObserver fade-in"],
    bestFor: /luxury|jewel|salon|spa|wedding|perfume|real estate|interior|villa|resort|clinic|beauty/i,
  },
  {
    id: "warm-organic",
    name: "Warm & organic",
    mood: "Friendly, human, approachable, handmade",
    fonts: "Display: 'DM Serif Display' or 'Recoleta'-like 'Young Serif'. Body: 'DM Sans' or 'Nunito'",
    palette: "Soft sand #F3E9DC, olive #5B6B3A, clay #C97B4A, deep brown #3B2A20. Rounded shapes.",
    layout: "Blob/rounded image masks, overlapping photo collage in the hero, pill-shaped buttons, a testimonial with a big quote mark, wavy SVG section dividers.",
    signature: ["organic SVG blob shapes", "rounded 24px+ corners", "hand-drawn style SVG underline on a key word", "wavy dividers"],
    bestFor: /school|academy|tuition|nursery|health|yoga|farm|organic|ngo|charity|family|pet|garden/i,
  },
  {
    id: "dark-tech",
    name: "Dark product / tech",
    mood: "Modern, technical, sharp, product-focused",
    fonts: "Display: 'Geist'-like 'Sora' or 'Plus Jakarta Sans' 700. Mono accents: 'JetBrains Mono'",
    palette: "Near-black #0A0A0B, panels #141416, text #EDEDED, one electric accent (lime #C6F432 OR orange #FF6B2C, not purple), subtle 1px #222 borders.",
    layout: "Bento grid of feature tiles of different sizes, a fake product UI/terminal mockup built in HTML/CSS in the hero, logo strip, code-style tags.",
    signature: ["bento grid", "HTML/CSS product mockup", "mono font tags", "subtle dotted background"],
    bestFor: /ai|data|developer|portfolio|engineer|app|cyber|crypto|robot|machine learning|programming/i,
  },
  {
    id: "retro-print",
    name: "Retro print poster",
    mood: "Characterful, nostalgic, local, full of personality",
    fonts: "Display: 'Bricolage Grotesque' or 'Abril Fatface'. Body: 'Work Sans'",
    palette: "Off-white #F2E8D5, tomato #E4572E, mustard #F3A712, deep teal #1D4E5F. Halftone/grain texture via CSS.",
    layout: "Poster-like hero with stacked oversized type, stamped badges (EST. 1998), menu or price list styled like a printed board with dotted leaders, ticket-shaped cards.",
    signature: ["dotted leader lines in price lists", "circular stamp badge", "grain overlay", "ticket cut-out corners"],
    bestFor: /dhaba|street food|barber|bakery|coffee|vintage|music|cinema|bar|market|shop|store/i,
  },
  {
    id: "clean-corporate",
    name: "Clean & trustworthy",
    mood: "Clear, reliable, structured, easy to scan",
    fonts: "Display: 'Plus Jakarta Sans' 700. Body: 'Plus Jakarta Sans' 400",
    palette: "White #FFFFFF, cool gray #F5F7FA sections, navy #0F2A4A text, one confident accent (emerald #10B981 or royal #2563EB).",
    layout: "Split hero (text left, real photo right in a rounded frame with a floating stat card), trust bar of facts, alternating image/text rows, FAQ accordion, clear contact block with map.",
    signature: ["floating stat card over the hero image", "FAQ accordion with JS", "icon-free feature rows with numbers", "Google Maps embed"],
    bestFor: /hospital|doctor|dental|pharmacy|logistics|construction|insurance|bank|government|service|repair/i,
  },
];

export const ANTI_GENERIC = `AVOID THE "AI-GENERATED" LOOK. These are banned:
- Purple/indigo/violet gradients, gradient text, glassmorphism cards, glowing blobs (unless the direction says so).
- A centered hero with "Welcome to X" + two buttons + a blurry background.
- Three identical cards with emoji or generic icons ("Fast", "Reliable", "Quality").
- Generic copy: "unlock", "elevate", "seamless", "cutting-edge", "your journey", "we are passionate". Write like a real local business: concrete details, prices, names, places, hours.
- Default fonts (Arial, Inter-only, Poppins-only, Roboto). Use the direction's Google Fonts pair.
- Everything the same size and spacing. Create HIERARCHY: one huge element, contrasting scales, varied section layouts (no two consecutive sections with the same structure).
- Random stock photos. Every image must match the business (use search_images).
Make it look like a skilled human designer made it for THIS specific business.`;

export function pickDirection(prompt: string, style?: string): Direction {
  if (style && style !== "auto") {
    const chosen = DIRECTIONS.find((d) => d.id === style);
    if (chosen) return chosen;
  }
  const fits = DIRECTIONS.filter((d) => d.bestFor.test(prompt));
  // some randomness so two similar businesses don't get identical designs
  const pool = fits.length && Math.random() < 0.75 ? fits : DIRECTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function directionBrief(d: Direction): string {
  return `\n\nART DIRECTION FOR THIS SITE: "${d.name}"
- Mood: ${d.mood}
- Fonts: ${d.fonts}
- Palette: ${d.palette}
- Layout: ${d.layout}
- Signature details (use at least 3): ${d.signature.join("; ")}
Follow this direction unless the user's own brand colours/fonts are given (then adapt it to them).`;
}

export const STYLE_OPTIONS = [{ id: "auto", name: "Auto" }, ...DIRECTIONS.map((d) => ({ id: d.id, name: d.name }))];

// ── Images that match the business ──────────────────────────
// 1. Pexels (if PEXELS_API_KEY is set, free at pexels.com/api): best quality.
// 2. Openverse (no key needed): free, openly licensed photos.
// Every URL is checked before it's given to the agent, so no broken images.
async function reachable(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { method: "GET", headers: { range: "bytes=0-1023" }, signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    const type = res.headers.get("content-type") || "";
    res.body?.cancel().catch(() => {});
    return res.ok && type.startsWith("image/");
  } catch {
    return false;
  }
}

async function fromPexels(q: string, count: number) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${count}&orientation=landscape`, {
      headers: { authorization: key },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.photos || []).map((p: any) => ({ url: p.src.large2x || p.src.large, alt: p.alt || q }));
  } catch {
    return [];
  }
}

async function fromOpenverse(q: string, count: number) {
  try {
    const params = new URLSearchParams({ q, page_size: String(Math.min(count * 2, 20)), license_type: "commercial", mature: "false" });
    const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, { headers: { "user-agent": "SiteAgent/1.0" } });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.results || [])
      .filter((r: any) => !r.width || r.width >= 600)
      .map((r: any) => ({ url: r.url as string, alt: (r.title as string) || q, thumb: r.thumbnail as string }));
  } catch {
    return [];
  }
}

export async function searchImages(query: string, count = 6): Promise<{ url: string; alt: string }[]> {
  // short, visual queries work best
  const q = query.trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 60) || "business";
  let found: { url: string; alt: string; thumb?: string }[] = await fromPexels(q, count);
  if (!found.length) found = await fromOpenverse(q, count);
  if (!found.length && q.includes(" ")) found = await fromOpenverse(q.split(" ").slice(0, 2).join(" "), count);

  const checked = await Promise.all(
    found.slice(0, count * 2).map(async (img) => {
      if (await reachable(img.url)) return { url: img.url, alt: img.alt };
      if (img.thumb && (await reachable(img.thumb))) return { url: img.thumb, alt: img.alt };
      return null;
    }),
  );
  return checked.filter(Boolean).slice(0, count) as { url: string; alt: string }[];
}
