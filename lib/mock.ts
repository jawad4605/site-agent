// A scripted fake model so you can test the whole app without an API key.
// Enable with MOCK_LLM=1 in .env.local. It deliberately makes a mobile bug, sees it, and fixes it.
import type Anthropic from "@anthropic-ai/sdk";

const SITE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Karachi Biryani House</title>
<style>body{margin:0;font-family:system-ui;background:#fff8ef;color:#2b1a0e}
.hero{padding:80px 24px;text-align:center;background:linear-gradient(135deg,#b4441b,#f2a541);color:#fff}
.hero h1{font-size:48px;margin:0 0 12px}.menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:40px 24px}
.card{background:#fff;border-radius:14px;padding:20px;box-shadow:0 4px 14px #0001}
.banner{width:900px;margin:0 auto;padding:20px;background:#2b1a0e;color:#fff}
a.btn{display:inline-block;background:#fff;color:#b4441b;padding:12px 22px;border-radius:30px;text-decoration:none;font-weight:700}
footer{text-align:center;padding:24px;opacity:.7}</style></head><body>
<section class="hero"><h1>Karachi Biryani House</h1><p>Slow-cooked dum biryani since 1998</p><a class="btn" href="#menu">See the menu</a></section>
<div class="banner">Free delivery across Clifton and DHA on orders above Rs 2000</div>
<section id="menu" class="menu"><div class="card"><h3>Sindhi Biryani</h3><p>Rs 650</p></div><div class="card"><h3>Chicken Tikka Biryani</h3><p>Rs 720</p></div><div class="card"><h3>Mutton Dum Biryani</h3><p>Rs 950</p></div></section>
<footer><a href="tel:+922100000000">Call to order</a> · © Karachi Biryani House</footer></body></html>`;

let n = 0;
const id = () => `toolu_mock_${Date.now()}_${n++}`;

export function mockModel(history: Anthropic.MessageParam[]): { content: any[] } {
  // count model turns since the user's last own message (a new site OR a change request)
  let lastUser = 0;
  history.forEach((m, i) => {
    const isToolResult = Array.isArray(m.content) && (m.content as any[]).some((b) => b.type === "tool_result");
    if (m.role === "user" && !isToolResult) lastUser = i;
  });
  const turn = history.slice(lastUser).filter((m) => m.role === "assistant").length;
  const isChange = lastUser > 0;
  const firstText = (m: any) => (typeof m.content === "string" ? m.content : (m.content ?? []).find((b: any) => b.type === "text")?.text ?? "");
  const imageUrl = firstText(history[lastUser]).match(/https?:\/\/\S+\/a\/\S+\.(jpg|png|webp)/)?.[0];

  const build: any[][] = [
    [
      { type: "text", text: "Plan: warm food brand for families in Karachi. Sections: hero, delivery banner, menu cards, footer. Palette: saffron orange + deep brown." },
      { type: "tool_use", id: id(), name: "write_page", input: { page: "index.html", html: SITE } },
    ],
    [{ type: "tool_use", id: id(), name: "check_site", input: { page: "index.html" } }],
    [
      { type: "text", text: "The delivery banner has a fixed 900px width, so mobile scrolls sideways. Making it fluid." },
      { type: "tool_use", id: id(), name: "edit_page", input: { page: "index.html", old_text: ".banner{width:900px;", new_text: ".banner{max-width:900px;box-sizing:border-box;" } },
    ],
    [{ type: "tool_use", id: id(), name: "check_site", input: { page: "index.html" } }],
    [
      { type: "text", text: "Looks clean on desktop and mobile now. Publishing." },
      { type: "tool_use", id: id(), name: "publish_site", input: { name: "karachi-biryani-house" } },
    ],
    [{ type: "text", text: "Your site is live." }],
  ];

  const change: any[][] = [
    [
      { type: "text", text: "Adding a Menu page, linking it from the home page" + (imageUrl ? ", and putting your photo in the hero." : ".") },
      {
        type: "tool_use", id: id(), name: "write_page",
        input: { page: "menu.html", html: SITE.replace("<title>Karachi Biryani House</title>", "<title>Menu · Karachi Biryani House</title>").replace("<h1>Karachi Biryani House</h1>", "<h1>Our Menu</h1>").replace('href="#menu"', 'href="index.html"').replace("See the menu", "Back home") },
      },
      { type: "tool_use", id: id(), name: "edit_page", input: { page: "index.html", old_text: 'href="#menu"', new_text: 'href="menu.html"' } },
      ...(imageUrl
        ? [{ type: "tool_use", id: id(), name: "edit_page", input: { page: "index.html", old_text: "<p>Slow-cooked dum biryani since 1998</p>", new_text: `<p>Slow-cooked dum biryani since 1998</p><img src="${imageUrl}" alt="Our biryani" style="max-width:100%;width:420px;border-radius:16px;margin:16px auto;display:block">` } }]
        : []),
    ],
    [{ type: "tool_use", id: id(), name: "check_site", input: { page: "menu.html" } }],
    [{ type: "tool_use", id: id(), name: "publish_site", input: { name: "karachi-biryani-house" } }],
    [{ type: "text", text: "Added a Menu page and updated the live site." }],
  ];

  const script = isChange ? change : build;
  return { content: script[Math.min(turn, script.length - 1)] };
}
