import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const storefrontUrl = process.env.STOREFRONT_URL || "http://127.0.0.1:5175/";
const output = new URL("../.qa/card-hero-live-inspection/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 16700 + (Date.now() % 250);
const profile = await mkdtemp(join(tmpdir(), "narziss-live-inspection-"));
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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (check, attempts = 140) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out inspecting the live hero.");
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
  const page = pages.find((entry) => entry.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  await call("Page.enable");
  await call("Runtime.enable");
  const evaluate = async (expression) => {
    const response = await call("Runtime.evaluate", { expression, returnByValue: true });
    return response.result.value;
  };
  const capture = async (name) => {
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(name, output), Buffer.from(screenshot.data, "base64"));
  };
  const readMetrics = () => evaluate(`(() => {
    const hero = document.querySelector('.product-card-hero');
    const arrivals = document.querySelector('.home-new-arrivals-transition');
    const wordmark = document.querySelector('.product-card-hero__wordmark');
    const cards = [...document.querySelectorAll('.product-hero-card:not(.has-image-error)')];
    const architecture = document.querySelector('.product-card-hero__architecture');
    const scrollLayer = document.querySelector('.product-card-hero__scroll-layer');
    const compositionLayer = document.querySelector('.product-card-hero__composition-layer');
    const stage = document.querySelector('.product-card-hero__stage');
    const heroRect = hero.getBoundingClientRect();
    const arrivalsRect = arrivals.getBoundingClientRect();
    const wordmarkRect = wordmark.getBoundingClientRect();
    return {
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollY,
      heroDocumentTop: heroRect.top + scrollY,
      heroHeight: heroRect.height,
      arrivalsDocumentTop: arrivalsRect.top + scrollY,
      arrivalsViewportTop: arrivalsRect.top,
      scrollDistance: Number.parseFloat(getComputedStyle(hero).getPropertyValue('--hero-stack-scroll-distance')),
      overlap: Number.parseFloat(getComputedStyle(hero).getPropertyValue('--hero-stack-overlap')),
      heroShift: Number.parseFloat(getComputedStyle(hero).getPropertyValue('--hero-stack-max-shift')),
      architectureParent: architecture?.parentElement?.className || '',
      architectureTransform: architecture ? getComputedStyle(architecture).transform : '',
      scrollLayerTransform: getComputedStyle(scrollLayer).transform,
      compositionLayerTransform: getComputedStyle(compositionLayer).transform,
      stageTransform: getComputedStyle(stage).transform,
      wordmark: { top: wordmarkRect.top, bottom: wordmarkRect.bottom },
      cards: cards.map(card => {
        const rect = card.getBoundingClientRect();
        return { role: card.className, top: rect.top, bottom: rect.bottom, width: rect.width };
      }),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);

  const results = [];
  for (const viewport of [
    { label: "mobile", width: 390, height: 844, cards: 3 },
    { label: "tablet", width: 768, height: 900, cards: 3 },
    { label: "laptop", width: 1440, height: 900, cards: 5 },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 768 });
    await call("Page.navigate", { url: storefrontUrl });
    await waitFor(() => evaluate(`document.querySelectorAll('.product-hero-card').length === ${viewport.cards} && document.querySelector('.product-card-hero')?.classList.contains('is-ready')`));
    await delay(4200);
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
    await delay(600);
    const beginning = await readMetrics();
    await capture(`${viewport.label}-beginning.png`);
    await evaluate(`window.scrollTo({ top: ${beginning.scrollDistance / 2}, behavior: 'instant' })`);
    await delay(700);
    const middle = await readMetrics();
    await capture(`${viewport.label}-middle.png`);
    await evaluate(`window.scrollTo({ top: ${beginning.scrollDistance + 4}, behavior: 'instant' })`);
    await delay(700);
    const end = await readMetrics();
    await capture(`${viewport.label}-end.png`);
    results.push({ ...viewport, beginning, middle, end });
  }

  const report = { inspectedUrl: storefrontUrl, source: "live Vite page; no media or style overrides", results };
  await writeFile(new URL("results.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
