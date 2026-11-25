// The agent's "eyes": a real headless Chrome that opens the generated site,
// takes desktop + mobile screenshots and runs automatic QA checks.
// On Vercel it uses @sparticuz/chromium (Chrome built for serverless).
// Locally it uses the Chrome installed on your computer.
import fs from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (!isServerless) {
    const localPath =
      process.env.CHROME_PATH || LOCAL_CHROME_PATHS.find((p) => fs.existsSync(p));
    if (!localPath) {
      throw new Error("Chrome not found. Install Google Chrome or set CHROME_PATH in .env.local");
    }
    return puppeteer.launch({ executablePath: localPath, headless: true, args: ["--no-sandbox"] });
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// Reuse one browser across requests while the function instance stays warm.
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.connected) return b;
  }
  browserPromise = launch();
  return browserPromise;
}

export type QAReport = {
  desktop: string; // base64 JPEG
  mobile: string; // base64 JPEG
  findings: string[]; // automatic problems found by code, not by the LLM
};

const MAX_HEIGHT = 2400; // keep screenshots readable for the model

async function shoot(html: string, width: number, height: number, mobile: boolean) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(String((e as Error).message ?? e)));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    // slow external fonts/images shouldn't kill the check
    await page.setContent(html, { waitUntil: "load", timeout: 12000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 6000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400)); // let CSS animations settle

    const checks = await page.evaluate((viewportWidth: number) => {
      const doc = document.documentElement;
      const brokenImages = Array.from(document.images)
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.src.slice(0, 80));
      const deadLinks = Array.from(document.querySelectorAll("a"))
        .filter((a) => !a.getAttribute("href") || a.getAttribute("href") === "#")
        .length;
      const tinyText = Array.from(document.querySelectorAll("p, li, a, span"))
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12 && el.textContent?.trim())
        .length;
      return {
        overflowX: doc.scrollWidth > viewportWidth + 1,
        scrollWidth: doc.scrollWidth,
        pageHeight: doc.scrollHeight,
        brokenImages,
        deadLinks,
        tinyText,
        hasH1: !!document.querySelector("h1"),
        title: document.title,
      };
    }, width);

    // Is the navigation still reachable after scrolling down? (sticky/fixed header)
    const navAfterScroll = await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      if (h < window.innerHeight * 1.6) return true; // short page, nothing to check
      window.scrollTo(0, Math.round(h * 0.55));
      await new Promise((r) => setTimeout(r, 150));
      const pinned = Array.from(document.querySelectorAll<HTMLElement>("header, nav, [class*=nav], [class*=header], [id*=nav], [id*=header]")).some((el) => {
        const pos = getComputedStyle(el).position;
        const r = el.getBoundingClientRect();
        return (pos === "fixed" || pos === "sticky") && r.top <= 2 && r.bottom > 0 && r.height > 0;
      });
      const xs = [0.15, 0.5, 0.85].map((f) => Math.round(window.innerWidth * f));
      const ok = pinned || xs.some((x) => {
        let el = document.elementFromPoint(x, 12) as HTMLElement | null;
        while (el && el !== document.body) {
          const pos = getComputedStyle(el).position;
          if ((pos === "fixed" || pos === "sticky") && el.getBoundingClientRect().top <= 2) return true;
          el = el.parentElement;
        }
        return false;
      });
      window.scrollTo(0, 0);
      return ok;
    });

    const clipHeight = Math.min(checks.pageHeight, MAX_HEIGHT);
    const shot = await page.screenshot({
      type: "jpeg",
      quality: 60,
      clip: { x: 0, y: 0, width, height: clipHeight },
      captureBeyondViewport: true,
      encoding: "base64",
    });

    return { shot: shot as string, checks: { ...checks, navAfterScroll }, consoleErrors };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function checkSite(html: string): Promise<QAReport> {
  const d = await shoot(html, 1280, 800, false);
  const m = await shoot(html, 390, 844, true);

  const findings: string[] = [];
  if (m.checks.overflowX)
    findings.push(`MOBILE: page is ${m.checks.scrollWidth}px wide on a 390px screen (horizontal scroll).`);
  if (d.checks.overflowX) findings.push(`DESKTOP: horizontal overflow (${d.checks.scrollWidth}px).`);
  if (d.checks.brokenImages.length)
    findings.push(`Broken images: ${d.checks.brokenImages.join(", ")}`);
  if (m.checks.tinyText > 0) findings.push(`MOBILE: ${m.checks.tinyText} text elements smaller than 12px.`);
  if (d.checks.deadLinks > 0) findings.push(`${d.checks.deadLinks} links/buttons point nowhere (href="#" or empty).`);
  if (!d.checks.hasH1) findings.push("No <h1> heading (bad for SEO/accessibility).");
  if (!d.checks.title) findings.push("Missing <title>.");
  if (!d.checks.navAfterScroll)
    findings.push("NAVIGATION: after scrolling down, the header/menu is gone. Make the header sticky (position: sticky; top: 0; z-index: 50; with a solid or blurred background) and add scroll-margin-top to sections so anchor links don't hide headings under it.");
  const errors = [...new Set([...d.consoleErrors, ...m.consoleErrors])];
  if (errors.length) findings.push(`JavaScript errors: ${errors.slice(0, 3).join(" | ")}`);
  if (d.checks.pageHeight > MAX_HEIGHT)
    findings.push(`(Note: page is ${d.checks.pageHeight}px tall; screenshot shows the first ${MAX_HEIGHT}px.)`);

  return { desktop: d.shot, mobile: m.shot, findings };
}
