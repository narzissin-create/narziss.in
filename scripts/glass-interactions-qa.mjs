import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.STOREFRONT_URL || "http://127.0.0.1:5174/";
const output = new URL("../.qa/glass-interactions/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 17600 + (Date.now() % 300);
const profile = await mkdtemp(join(tmpdir(), "narziss-glass-qa-"));
await mkdir(output, { recursive: true });
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check) => { for (let i = 0; i < 120; i += 1) { try { const value = await check(); if (value) return value; } catch {} await delay(100); } throw new Error("Glass QA timed out"); };
let socket; let messageId = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++messageId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await call("Runtime.evaluate", { expression, returnByValue: true })).result.value;

try {
  const pages = await waitFor(async () => { const response = await fetch(`http://127.0.0.1:${debugPort}/json`); return response.ok ? response.json() : null; });
  socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return; const handler = pending.get(message.id); pending.delete(message.id); message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result); });
  await call("Page.enable"); await call("Runtime.enable");
  const results = [];
  for (const viewport of [{ label: "mobile", width: 390, height: 844 }, { label: "tablet", width: 768, height: 900 }, { label: "laptop", width: 1440, height: 900 }]) {
    await call("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 768 });
    await call("Page.navigate", { url });
    await waitFor(() => evaluate("document.querySelectorAll('.category-showcase .product-card').length > 0"));
    await delay(500);
    if (viewport.width < 1024) {
      await evaluate("document.querySelector('[aria-label=\"Open navigation menu\"]')?.click()");
      await waitFor(() => evaluate("document.querySelector('.mobile-drawer-layer')?.classList.contains('is-open')"));
      await evaluate("document.querySelector('.mobile-drawer .search-box input')?.focus()");
    } else {
      await evaluate("document.querySelector('.navbar .search-box input')?.focus()");
    }
    await delay(220);
    const focusedSearchTransform = await evaluate("getComputedStyle(document.querySelector('.search-box:focus-within .search-input-shell')).transform");
    if (!focusedSearchTransform.includes("1.02")) throw new Error(`${viewport.label} search focus scale failed: ${focusedSearchTransform}`);
    if (viewport.width < 1024) {
      await evaluate("document.querySelector('.mobile-drawer-close')?.click()");
      await delay(280);
    }
    await evaluate(`(() => { const card = document.querySelector('.category-showcase .product-card'); const header = document.querySelector('.site-header'); window.scrollTo({ top: Math.max(0, card.getBoundingClientRect().top + scrollY - (header?.offsetHeight || 0) - 20), behavior: 'instant' }); })()`);
    await delay(700);
    const metrics = await evaluate(`(() => { const card = document.querySelector('.category-showcase .product-card'); const image = card.querySelector('img, .image-placeholder'); const copy = card.querySelector('.product-card-copy'); const style = getComputedStyle(card); return { background: style.backgroundColor, backdrop: style.backdropFilter || style.webkitBackdropFilter, border: style.borderColor, shadow: style.boxShadow, imageOpacity: getComputedStyle(image).opacity, copyOpacity: getComputedStyle(copy).opacity, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
    if (metrics.imageOpacity !== "1" || metrics.copyOpacity !== "1" || metrics.overflow > 1 || !metrics.shadow.includes("rgba")) throw new Error(`${viewport.label} glass failed: ${JSON.stringify(metrics)}`);
    const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${viewport.label}.png`, output), Buffer.from(image.data, "base64"));
    results.push({ ...viewport, focusedSearchTransform, metrics });
  }
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await call("Page.navigate", { url });
  await waitFor(() => evaluate("document.querySelector('.navbar .search-box input') !== null"));
  await evaluate("document.querySelector('.navbar .search-box input').focus()");
  const reducedMotionTransform = await evaluate("getComputedStyle(document.querySelector('.navbar .search-input-shell')).transform");
  if (reducedMotionTransform !== "none") throw new Error(`Reduced-motion scaling remained active: ${reducedMotionTransform}`);
  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, reducedMotionTransform, results }, null, 2));
} finally {
  socket?.close(); chrome.kill(); await delay(250); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
