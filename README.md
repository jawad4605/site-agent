# SiteAgent: an AI agent that builds, tests and ships websites

Type one sentence. The agent plans the site, writes the code, **opens it in a real Chrome browser**, looks at desktop and mobile screenshots, fixes what's wrong, and publishes it to a live URL with a QR code.

Everything runs on **Vercel**. It's serverless, there's no Python, and you deploy it with a git push.

```
🧠 Plan → ✍️ write_site → 📸 check_site (headless Chrome) → 🔧 edit_site → 📸 check again → 🚀 publish_site
```

## Deploy to Vercel (about 5 minutes)

1. Push this folder to a new GitHub repo.
2. On vercel.com, go to **Add New → Project** and import the repo. The framework is detected as Next.js.
3. Under **Environment Variables**, add at least one AI key (see "AI models" below). For a completely free setup, add `GROQ_API_KEY` alone.
4. Click **Deploy**.
5. In the project, go to **Storage → Create → Blob**, connect it to the project, then **redeploy**. Published sites are stored there.

Then open `https://<your-project>.vercel.app` and build a site.

## Features

- **Multi-page sites**: the agent creates Home, Menu, About, Contact pages, etc. when asked, all linked together.
- **Chat to edit**: after publishing, type changes ("add a Gallery page", "make it darker"). The agent edits, re-checks in Chrome, and updates the **same live URL**.
- **Your own images**: 📎 upload a logo or photos (resized in the browser). The agent places them on the site. Name files well, e.g. `logo.png` or `chicken-biryani.jpg`.
- **⚙️ Connections**: one-click **Connect** buttons, like signing in to Claude Code or Codex in VS Code:
  - **AI model → Connect**: opens OpenRouter in a popup. The user signs in, clicks *Authorize*, and can then pick **Claude Sonnet 5.5, ChatGPT (GPT-6.2 Sol) or Gemini 3.5 Flash**, billed to their own OpenRouter account. No setup needed. (Advanced: paste your own Claude/OpenAI/Gemini/Groq key instead.)
  - **GitHub → Connect**: opens GitHub's authorize page. After that, **⬆️ GitHub** pushes pages, images and a README to a repo in the user's account as one commit.
  - **▲ Vercel**: pushes to GitHub, then opens Vercel's import page for that repo. The user signs in, authorizes and clicks **Deploy**. Every later push re-deploys automatically. (Advanced: save a Vercel token to deploy directly.)

> Why not "Sign in with Claude/ChatGPT" like Claude Code or Codex? Those subscription logins only work inside Anthropic's and OpenAI's own tools. Third-party apps can't use them, so SiteAgent uses OpenRouter's official one-click OAuth, which gives access to the same models.

### One-time setup for "Connect GitHub" (about 2 minutes)

1. Go to **github.com → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: `http://localhost:3000`. Authorization callback URL: `http://localhost:3000/api/auth/github/callback`.
3. Copy the **Client ID**, generate a **Client secret**, and put both in `.env.local` as `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
4. Set `SESSION_SECRET` to any long random string.
5. For the deployed app, create a second OAuth App with your Vercel URL (e.g. `https://siteagent.vercel.app/api/auth/github/callback`) and add its values in Vercel's Environment Variables. GitHub allows one callback URL per OAuth App.

## Project structure of the websites it builds

While building, each page is one self-contained file (instant preview and testing). In the **Code** view, the **ZIP** download, and on **GitHub/Vercel**, it becomes a proper project:

```
my-site/
├── index.html            home page
├── contact.html          other pages
├── README.md
├── assets/images/        your uploaded images
├── css/global.css        styles shared by every page
├── css/index.css         one stylesheet per page (contact.css, about.css …)
├── js/index.js           one script per page (contact.js …)
└── js/nav.js             keeps the menu visible
```

## Why the sites don't all look the same

AI-built sites tend to look alike because models fall back to the same defaults: a centered hero, a purple gradient, Inter, and three emoji cards. SiteAgent avoids this in three ways:

1. **Art direction per site** (`lib/design.ts`): 8 directions, each with its own font pair, palette, layout and signature details (Editorial magazine, Swiss grid, Neo-brutalist, Quiet luxury, Warm & organic, Dark product, Retro print poster, Clean & trustworthy). One is picked to fit the business, with some randomness. You can also choose it with the **Style** picker.
2. **Banned clichés** in the agent's instructions: purple gradients, "Welcome to…" heroes, identical icon cards, buzzwords like "elevate" or "seamless", default fonts, and random stock photos.
3. **Matching photos**: the agent calls `search_images` with specific queries. Add a free `PEXELS_API_KEY` to get real photos; without one it uses keyword-matched placeholder photos.

When the agent reviews its screenshots, it also checks whether the design looks generic and fixes it if so.

## AI models: Claude with free fallbacks

The agent tries each brain in order and switches automatically if one fails (no credit, rate limit, outage). The UI shows which model is currently in use, plus a "Switched brain" note when it changes.

| Order | Provider | Env var | Cost | Default model |
|---|---|---|---|---|
| 1 | Claude | `ANTHROPIC_API_KEY` | Paid | `claude-sonnet-5-5` |
| 1b | ChatGPT (OpenAI) | `OPENAI_API_KEY` | Paid | `gpt-6.2-sol` |
| 2 | Groq | `GROQ_API_KEY` ([get key](https://console.groq.com/keys)) | **Free tier** | `qwen/qwen3.8-27b` (vision + tool use) |
| 3 | Gemini | `GEMINI_API_KEY` ([get key](https://aistudio.google.com/apikey)) | **Free tier** | `gemini-3.5-flash` |
| 4 | Any OpenAI-compatible API | `FALLBACK_BASE_URL`, `FALLBACK_API_KEY`, `FALLBACK_MODEL` | Varies | Your choice |

Set any combination. For the talk, we recommend **Claude + Groq + Gemini**, so if one goes down on stage, the next one takes over. Change the models with `ANTHROPIC_MODEL`, `GROQ_MODEL` or `GEMINI_MODEL`.

> Free tiers have rate and token-per-minute limits. If Groq returns "request too large" or "rate limit", the agent moves on to Gemini automatically.

> If a build step ever times out, check that **Fluid Compute** is on (Settings → Functions). It's the default for new projects and allows the 300s function duration this app uses.

## Run locally

```bash
npm install
cp .env.example .env.local   # add at least one key (GROQ_API_KEY is free)
npm run dev                  # http://localhost:3000
```

- Locally it uses the Google Chrome on your computer for screenshots. Set `CHROME_PATH` if it isn't found.
- Without a Blob store, published sites are kept in memory, which is fine for local testing.
- **No API key yet?** Put `MOCK_LLM=1` in `.env.local`. A scripted fake model then runs the full loop: it creates a mobile bug, the browser catches it, and the fake model fixes it.

## How it works (for the talk)

| File | Role |
|---|---|
| `lib/llm.ts` | **The brain.** Claude first, then free Groq → Gemini fallback (translates to the OpenAI format) |
| `lib/agent.ts` | **The agent.** System prompt, 4 tools, and `runStep()`: one think → act → observe turn |
| `lib/browser.ts` | **The agent's eyes.** Headless Chrome (`@sparticuz/chromium` on Vercel) takes 1280px and 390px screenshots plus automatic QA: horizontal overflow, broken images, tiny text, dead links, JS errors, missing h1/title |
| `lib/publish.ts` | Saves sites and uploaded images to Vercel Blob |
| `lib/export.ts` | Packs pages + images into real files for GitHub/Vercel |
| `app/api/github`, `app/api/vercel` | Push to GitHub (one commit) / deploy to the user's Vercel |
| `app/api/upload`, `app/a/[file]` | Image upload and serving |
| `app/api/auth/*`, `lib/session.ts` | One-click OAuth (GitHub, OpenRouter) stored in encrypted cookies |
| `app/api/agent/route.ts` | Serverless function that runs one agent step |
| `app/s/[id]/[[...page]]/route.ts` | Serves published sites at `/s/<id>` and `/s/<id>/menu.html` |
| `app/page.tsx` | UI that **drives the loop**: it calls `/api/agent` repeatedly and shows every step live |

**Why the browser drives the loop:** each serverless request does one step and stays short, so there are no timeouts, and the audience sees each decision appear as it happens.

**What makes it an agent, not just a code generator:**
- It **decides** which tool to use next. Nothing is hard-coded.
- It **observes** the real result (screenshots plus measured QA) rather than trusting its own code.
- It **self-corrects** with small targeted edits, then verifies the fix.
- It **knows when to stop** and publishes.

## Demo script (about 4 minutes)

1. Ask the room for a business idea and type it in.
2. Narrate the timeline: "it's planning… it wrote 14 KB… now it's *looking* at its own site in Chrome."
3. Click a screenshot to zoom in, and point at what the QA found and how the agent fixed it (the red/green diff).
4. Toggle **Mobile** in the preview.
5. Click **Show QR**, and the audience opens the live site on their phones.

Backup: record one full run beforehand in case the Wi-Fi fails.
