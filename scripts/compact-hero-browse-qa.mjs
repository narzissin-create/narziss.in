import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.STOREFRONT_URL || "http://127.0.0.1:5174/";
const output = new URL("../.qa/compact-hero-browse/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 17000 + (Date.now() % 500);
const profile = await mkdtemp(join(tmpdir(), "narziss-compact-hero-"));
await mkdir(output, { recursive: true });
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check) => {
  for (let index = 0; index < 120; index += 1) {
    try { const value = await check(); if (value) return value; } catch {}
    await delay(100);
  }
  throw new Error("Compact hero QA timed out.");
};
let socket;
let messageId = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await call("Runtime.evaluate", { expression, returnByValue: true })).result.value;
const state = () => evaluate(`(() => ({
  roles: [...document.querySelectorAll('.product-hero-card')].map(card => [...card.classList].find(name => name.startsWith('product-hero-card--'))?.replace('product-hero-card--','')),
  visible: [...document.querySelectorAll('.product-hero-card')].filter(card => card.dataset.heroVisible === 'true').map(card => [...card.classList].find(name => name.startsWith('product-hero-card--'))?.replace('product-hero-card--','')),
  controls: getComputedStyle(document.querySelector('.product-card-hero__controls')).display,
  previousDisabled: document.querySelector('[aria-label="Previous featured cards"]')?.disabled,
  nextDisabled: document.querySelector('[aria-label="Next featured cards"]')?.disabled,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
}))()`);

try {
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    return response.ok ? response.json() : null;
  });
  socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id); pending.delete(message.id);
    message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result);
  });
  await call("Page.enable"); await call("Runtime.enable");
  const results = [];
  for (const viewport of [{ label: "mobile", width: 390, height: 844 }, { label: "tablet", width: 768, height: 900 }]) {
    await call("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 768 });
    await call("Page.navigate", { url });
    await waitFor(() => evaluate("document.querySelector('.product-card-hero')?.classList.contains('is-compact-browsing')"));
    await delay(1500);
    const initial = await state();
    if (initial.visible.join() !== "b,c,d" || initial.previousDisabled || initial.nextDisabled || initial.overflow > 1) throw new Error(`${viewport.label} initial state failed: ${JSON.stringify(initial)}`);
    const initialImage = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${viewport.label}-initial.png`, output), Buffer.from(initialImage.data, "base64"));
    await evaluate("document.querySelector('[aria-label=\"Next featured cards\"]').click(); document.querySelector('[aria-label=\"Next featured cards\"]').click();");
    await delay(350);
    const right = await state();
    if (right.visible.join() !== "b,c,d" || !right.nextDisabled || right.previousDisabled) throw new Error(`${viewport.label} right end failed: ${JSON.stringify(right)}`);
    const rightImage = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${viewport.label}-right.png`, output), Buffer.from(rightImage.data, "base64"));
    await evaluate("document.querySelector('[aria-label=\"Previous featured cards\"]').click(); document.querySelector('[aria-label=\"Previous featured cards\"]').click(); document.querySelector('[aria-label=\"Previous featured cards\"]').click();");
    await delay(350);
    const left = await state();
    if (!left.previousDisabled || left.nextDisabled) throw new Error(`${viewport.label} left end failed: ${JSON.stringify(left)}`);
    const pathnameBeforeSwipe = await evaluate("location.pathname");
    await evaluate(`(() => {
      const stage = document.querySelector('.product-card-hero__stage');
      stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: 300, clientY: 450 }));
      stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: 190, clientY: 454 }));
    })()`);
    await delay(350);
    const swiped = await state();
    const pathnameAfterSwipe = await evaluate("location.pathname");
    if (swiped.previousDisabled || swiped.nextDisabled || pathnameAfterSwipe !== pathnameBeforeSwipe) throw new Error(`${viewport.label} swipe failed: ${JSON.stringify(swiped)}`);
    results.push({ ...viewport, initial, right, left, swiped });
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url });
  await waitFor(() => evaluate("document.querySelectorAll('.product-hero-card').length === 5 && document.querySelector('.product-card-hero')?.classList.contains('is-ready')"));
  const laptop = await evaluate(`({ roles: [...document.querySelectorAll('.product-hero-card')].map(card => [...card.classList].find(name => name.startsWith('product-hero-card--'))?.replace('product-hero-card--','')), controls: document.querySelector('.product-card-hero__controls') })`);
  if (laptop.roles.join() !== "a,b,c,d,e" || laptop.controls !== null) throw new Error(`Laptop changed: ${JSON.stringify(laptop)}`);
  await writeFile(new URL("results.json", output), JSON.stringify({ results, laptop }, null, 2));
  console.log(JSON.stringify({ passed: true, results, laptop }, null, 2));
} finally {
  socket?.close(); chrome.kill(); await delay(250); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
