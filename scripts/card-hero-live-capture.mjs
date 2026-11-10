import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const storefrontUrl = process.env.STOREFRONT_URL || "http://127.0.0.1:5175/";
const output = new URL("../.qa/card-hero-live/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 15000 + (Date.now() % 500);
const profile = await mkdtemp(join(tmpdir(), "narziss-card-hero-live-"));
await mkdir(output, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (check, attempts = 120) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for live storefront capture.");
};

let socket;
let id = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, { resolve, reject });
  socket.send(JSON.stringify({ id: messageId, method, params }));
});

try {
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    return response.ok ? response.json() : null;
  });
  const page = pages.find(item => item.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  await call("Page.enable");
  await call("Runtime.enable");
  const results = [];

  for (const { label, width, height, expected } of [
    { label: "mobile", width: 390, height: 844, expected: 3 },
    { label: "tablet", width: 768, height: 900, expected: 3 },
    { label: "laptop", width: 1440, height: 900, expected: 5 },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await call("Page.navigate", { url: storefrontUrl });
    await waitFor(async () => {
      const state = await call("Runtime.evaluate", {
        expression: `document.querySelectorAll('.product-hero-card').length === ${expected} && document.querySelector('.product-card-hero')?.classList.contains('is-ready')`,
        returnByValue: true,
      });
      return state.result.value;
    });
    await delay(4000);

    const readMetrics = async () => {
      const response = await call("Runtime.evaluate", {
        expression: `(() => {
          const cards = [...document.querySelectorAll('.product-hero-card:not(.has-image-error)')];
          const arrivals = document.querySelector('.home-new-arrivals-transition');
          const hero = document.querySelector('.product-card-hero');
          const decoration = document.querySelector('.product-card-hero__decoration');
          const wordmark = document.querySelector('.product-card-hero__wordmark');
          const heroRect = hero.getBoundingClientRect();
          const wordmarkRect = wordmark.getBoundingClientRect();
          return {
            gap: arrivals.getBoundingClientRect().top - Math.max(...cards.map(card => card.getBoundingClientRect().bottom)),
            marginTop: Number.parseFloat(getComputedStyle(arrivals).marginTop),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            centerWidth: document.querySelector('.product-hero-card--c')?.offsetWidth,
            sideWidth: document.querySelector('.product-hero-card--b')?.offsetWidth,
            decorationPointerEvents: getComputedStyle(decoration).pointerEvents,
            wordmarkInsideHero: wordmarkRect.left >= heroRect.left - 1 && wordmarkRect.right <= heroRect.right + 1,
            wordmarkColor: getComputedStyle(wordmark).color,
            architecturalLight: getComputedStyle(decoration, '::after').backgroundImage,
            centerShadow: getComputedStyle(document.querySelector('.product-hero-card--c img')).boxShadow,
            sideShadow: getComputedStyle(document.querySelector('.product-hero-card--b img')).boxShadow,
            creamBackground: getComputedStyle(document.querySelector('.product-card-hero__cream')).backgroundColor,
            scrollY
          };
        })()`,
        returnByValue: true,
      });
      return response.result.value;
    };

    const settled = await readMetrics();
    if (settled.overflow > 1) throw new Error(`${label} settled layout overflows horizontally.`);
    if (settled.decorationPointerEvents !== 'none' || !settled.wordmarkInsideHero || settled.creamBackground !== 'rgb(245, 230, 204)') {
      throw new Error(`${label} hero decoration containment or base colour failed: ${JSON.stringify(settled)}`);
    }
    if (settled.architecturalLight === 'none' || settled.centerShadow === 'none' || settled.sideShadow === 'none' || settled.centerShadow === settled.sideShadow) {
      throw new Error(`${label} architectural light or differentiated card shadows failed: ${JSON.stringify(settled)}`);
    }
    if (width >= 768 && (settled.gap < 24 || settled.gap > 32)) throw new Error(`${label} settled gap is ${settled.gap}px.`);
    if (width < 768 && Math.abs(settled.marginTop + 210) > 1) throw new Error(`Mobile New Arrivals margin changed to ${settled.marginTop}px.`);
    const settledShot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${label}-settled.png`, output), Buffer.from(settledShot.data, "base64"));

    await call("Runtime.evaluate", { expression: "window.scrollTo(0, 180)" });
    await delay(800);
    const scrolled = await readMetrics();
    if (scrolled.overflow > 1) throw new Error(`${label} scrolled layout overflows horizontally.`);
    if (width >= 768 && (scrolled.gap < 24 || scrolled.gap > 32)) throw new Error(`${label} scrolled gap is ${scrolled.gap}px.`);
    const scrolledShot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${label}-scrolled.png`, output), Buffer.from(scrolledShot.data, "base64"));
    results.push({ label, width, settled, scrolled });
  }

  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
