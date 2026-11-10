import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const output = new URL("../.qa/card-hero/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const seed = Date.now() % 500;
const port = 6400 + seed;
const debugPort = 12400 + seed;
const apiPort = 13400 + seed;
const profile = await mkdtemp(join(tmpdir(), "narziss-card-hero-qa-"));

const image = color => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><rect width="400" height="500" fill="${color}"/><circle cx="200" cy="145" r="54" fill="#f5e6cc"/><path d="M105 445 130 245 200 205 270 245 295 445Z" fill="#313131"/></svg>`).toString("base64")}`;
const fixture = [
  ["A", "#984d3d", 10],
  ["B", "#315d43", 20],
  ["C", "#c99562", 30],
  ["D", "#dfc596", 40],
  ["E", "#31394d", 50],
].map(([title, color, order], index) => ({
  id: index + 1,
  title,
  image_url: image(color),
  target_url: index % 2 === 0 ? `/products/card-${title.toLowerCase()}` : null,
  order_index: order,
  active: true,
  created_at: `2026-01-0${index + 1}T00:00:00Z`,
}));
let qaCards = fixture;

await mkdir(output, { recursive: true });
const apiServer = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${port}`);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/banners") {
    response.end(JSON.stringify(qaCards));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ detail: "QA fixture route not provided" }));
});
await new Promise(resolve => apiServer.listen(apiPort, "127.0.0.1", resolve));
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
  env: { ...process.env, VITE_API_BASE: `http://127.0.0.1:${apiPort}` },
});
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
  throw new Error("Timed out waiting for card hero QA state.");
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
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok);
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
  socket.addEventListener("message", async event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    }
  });

  await call("Page.enable");
  await call("Runtime.enable");
  const results = [];

  for (const width of [375, 768, 1023, 1024, 1440]) {
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    const expected = width < 1024 ? 3 : 5;
    try {
      await waitFor(async () => {
        const state = await call("Runtime.evaluate", { expression: `document.querySelectorAll('.product-hero-card').length === ${expected}`, returnByValue: true });
        return state.result.value;
      });
    } catch (error) {
      const diagnostic = await call("Runtime.evaluate", {
        expression: `({
          url: location.href,
          title: document.title,
          cards: document.querySelectorAll('.product-hero-card').length,
          hero: Boolean(document.querySelector('.product-card-hero')),
          text: document.body.innerText.slice(0, 700),
          html: document.querySelector('#root')?.innerHTML.slice(0, 1200)
        })`,
        returnByValue: true,
      });
      throw new Error(`${error.message} at ${width}px: ${JSON.stringify(diagnostic.result.value)}`);
    }
    await delay(1350);
    const middle = await call("Runtime.evaluate", {
      expression: `(() => {
        const center = document.querySelector('.product-hero-card--c');
        const rect = center.getBoundingClientRect();
        const top = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          .find(node => node.classList?.contains('product-hero-card'));
        return { topRole: [...top.classList].find(name => name.startsWith('product-hero-card--')) };
      })()`,
      returnByValue: true,
    });
    if (middle.result.value.topRole !== "product-hero-card--c") throw new Error(`${width}px side cards render in front of C.`);
    await delay(2450);
    const state = await call("Runtime.evaluate", {
      expression: `(() => {
        const hero = document.querySelector('.product-card-hero');
        const cream = document.querySelector('.product-card-hero__cream');
        const arrivals = document.querySelector('.home-new-arrivals-transition');
        const cards = [...document.querySelectorAll('.product-hero-card')];
        return {
          count: cards.length,
          roles: cards.map(card => [...card.classList].find(name => name.startsWith('product-hero-card--'))),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          heroHeight: hero.getBoundingClientRect().height,
          creamTransform: getComputedStyle(cream).transform,
          arrivalsOpacity: Number(getComputedStyle(arrivals).opacity),
          arrivalsVisible: arrivals.getBoundingClientRect().top < innerHeight && arrivals.getBoundingClientRect().bottom > 0,
          arrivalsMarginTop: Number.parseFloat(getComputedStyle(arrivals).marginTop),
          settledGap: arrivals.getBoundingClientRect().top - Math.max(...cards.map(card => card.getBoundingClientRect().bottom)),
          centerWidth: document.querySelector('.product-hero-card--c')?.getBoundingClientRect().width,
          sideWidth: document.querySelector('.product-hero-card--b')?.offsetWidth,
          imageRatios: cards.map(card => { const img = card.querySelector('img'); return img.naturalWidth / img.naturalHeight; }),
        };
      })()`,
      returnByValue: true,
    });
    const metrics = state.result.value;
    if (metrics.count !== expected || metrics.overflow > 1 || metrics.arrivalsOpacity < .99 || !metrics.arrivalsVisible) {
      throw new Error(`${width}px final layout failed: ${JSON.stringify(metrics)}`);
    }
    if (width >= 768 && (metrics.settledGap < 24 || metrics.settledGap > 32)) {
      throw new Error(`${width}px settled card-to-divider gap is ${metrics.settledGap}px.`);
    }
    if (width < 768 && (Math.abs(metrics.arrivalsMarginTop + 210) > 1 || metrics.centerWidth < width * .39 || metrics.sideWidth < width * .33)) {
      throw new Error(`${width}px mobile position or enlarged card size failed: ${JSON.stringify(metrics)}`);
    }
    if (metrics.imageRatios.some(ratio => Math.abs(ratio - .8) > .001)) throw new Error(`${width}px image proportions changed.`);
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${width}-settled.png`, output), Buffer.from(screenshot.data, "base64"));
    await call("Runtime.evaluate", { expression: "window.scrollTo(0, 180)" });
    await delay(700);
    const scrolling = await call("Runtime.evaluate", {
      expression: `(() => {
        const cards = [...document.querySelectorAll('.product-hero-card')];
        const arrivals = document.querySelector('.home-new-arrivals-transition');
        return {
          gap: arrivals.getBoundingClientRect().top - Math.max(...cards.map(card => card.getBoundingClientRect().bottom)),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollY
        };
      })()`,
      returnByValue: true,
    });
    if (width >= 768 && (scrolling.result.value.gap < 24 || scrolling.result.value.gap > 32)) {
      throw new Error(`${width}px scrolling card-to-divider gap changed: ${JSON.stringify(scrolling.result.value)}`);
    }
    if (scrolling.result.value.overflow > 1) throw new Error(`${width}px scrolling state has horizontal overflow.`);
    const scrolledScreenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${width}-scrolled.png`, output), Buffer.from(scrolledScreenshot.data, "base64"));
    results.push({ width, midStack: middle.result.value, ...metrics, scrolling: scrolling.result.value });
  }

  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  await waitFor(async () => {
    const state = await call("Runtime.evaluate", { expression: "document.querySelectorAll('.product-hero-card').length === 3", returnByValue: true });
    return state.result.value;
  });
  const reduced = await call("Runtime.evaluate", {
    expression: `(() => ({
      cardAnimation: getComputedStyle(document.querySelector('.product-hero-card')).animationName,
      wipeAnimation: getComputedStyle(document.querySelector('.product-card-hero__cream')).animationName,
      arrivalsOpacity: Number(getComputedStyle(document.querySelector('.home-new-arrivals-transition')).opacity)
    }))()`,
    returnByValue: true,
  });
  if (reduced.result.value.cardAnimation !== "none" || reduced.result.value.wipeAnimation !== "none" || reduced.result.value.arrivalsOpacity !== 1) {
    throw new Error(`Reduced-motion state failed: ${JSON.stringify(reduced.result.value)}`);
  }

  qaCards = fixture.slice(0, 2);
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: `http://127.0.0.1:${port}/?two-card-qa=1` });
  await waitFor(async () => {
    const state = await call("Runtime.evaluate", { expression: "document.querySelectorAll('.product-hero-card').length === 2 && Boolean(document.querySelector('.product-hero-card--c'))", returnByValue: true });
    return state.result.value;
  });
  const twoCard = await call("Runtime.evaluate", {
    expression: "[...document.querySelectorAll('.product-hero-card')].map(card => [...card.classList].find(name => name.startsWith('product-hero-card--')))",
    returnByValue: true,
  });

  await writeFile(new URL("results.json", output), JSON.stringify({ fixture: "QA-only temporary card data", results, reduced: reduced.result.value, twoCard: twoCard.result.value }, null, 2));
  console.log(JSON.stringify({ passed: true, results, reduced: reduced.result.value, twoCard: twoCard.result.value }, null, 2));
} finally {
  socket?.close();
  vite.kill();
  chrome.kill();
  apiServer.close();
  await delay(400);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
