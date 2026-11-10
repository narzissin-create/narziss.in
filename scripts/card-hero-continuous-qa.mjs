import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const storefrontUrl = process.env.STOREFRONT_URL || "http://127.0.0.1:5175/";
const output = new URL("../.qa/card-hero-continuous/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 16300 + (Date.now() % 300);
const profile = await mkdtemp(join(tmpdir(), "narziss-continuous-scroll-"));
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
  throw new Error("Timed out during continuous hero-scroll QA.");
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
  const setViewport = async (width, height, touch = false) => {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await call("Emulation.setTouchEmulationEnabled", touch ? { enabled: true, maxTouchPoints: 1 } : { enabled: false });
    await call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
  };
  const navigate = async (width, height, expectedCards, touch = false, settle = false) => {
    await setViewport(width, height, touch);
    await call("Page.navigate", { url: storefrontUrl });
    await waitFor(() => evaluate(`document.querySelectorAll('.product-hero-card').length === ${expectedCards} && document.querySelector('.product-card-hero')?.classList.contains('is-ready') && document.querySelector('.home-new-arrivals-transition')?.classList.contains('is-scroll-stacking')`));
    await delay(settle ? 4200 : 500);
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
    await delay(500);
  };
  const readState = () => evaluate(`(() => {
    const hero = document.querySelector('.product-card-hero');
    const arrivals = document.querySelector('.home-new-arrivals-transition');
    const heroRect = hero.getBoundingClientRect();
    const arrivalsRect = arrivals.getBoundingClientRect();
    const styles = getComputedStyle(hero);
    const cards = [...document.querySelectorAll('.product-hero-card:not(.has-image-error)')];
    return {
      scrollY,
      heroY: Number.parseFloat(hero.style.getPropertyValue('--hero-stack-y')) || 0,
      arrivalsY: Number.parseFloat(arrivals.style.getPropertyValue('--hero-stack-arrivals-y')) || 0,
      scrollDistance: Number.parseFloat(styles.getPropertyValue('--hero-stack-scroll-distance')),
      overlap: Number.parseFloat(styles.getPropertyValue('--hero-stack-overlap')),
      maxShift: Number.parseFloat(styles.getPropertyValue('--hero-stack-max-shift')),
      heroDocumentTop: heroRect.top + scrollY,
      heroHeight: heroRect.height,
      arrivalsDocumentTop: arrivalsRect.top + scrollY,
      coverTop: arrivalsRect.top,
      cardBottoms: cards.map(card => card.getBoundingClientRect().bottom),
      cardWidths: cards.map(card => card.offsetWidth),
      cardCount: cards.length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      finite: [scrollY, heroRect.top, arrivalsRect.top].every(Number.isFinite)
    };
  })()`);

  const assertMonotonic = (samples, direction, label) => {
    const sign = direction === "down" ? 1 : -1;
    let maxHeroStep = 0;
    let maxArrivalsStep = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if ((current.scrollY - previous.scrollY) * sign < -0.75) throw new Error(`${label} scroll direction jumped.`);
      if ((current.heroY - previous.heroY) * sign < -0.75) throw new Error(`${label} hero progress reversed unexpectedly.`);
      if ((current.arrivalsY - previous.arrivalsY) * sign > 0.75) throw new Error(`${label} arrivals progress reversed unexpectedly.`);
      maxHeroStep = Math.max(maxHeroStep, Math.abs(current.heroY - previous.heroY));
      maxArrivalsStep = Math.max(maxArrivalsStep, Math.abs(current.arrivalsY - previous.arrivalsY));
      if (!current.finite || current.overflow > 1) throw new Error(`${label} produced invalid geometry or overflow.`);
    }
    if (maxHeroStep > 32 || maxArrivalsStep > 24) throw new Error(`${label} contains an abrupt transform step.`);
    return { sampleCount: samples.length, maxHeroStep, maxArrivalsStep };
  };

  const exerciseWheel = async () => {
    await navigate(1440, 900, 5, false, true);
    const down = [await readState()];
    for (let step = 0; step < 58; step += 1) {
      await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 450, deltaX: 0, deltaY: 7 });
      await delay(20);
      down.push(await readState());
    }
    await delay(500);
    down.push(await readState());

    const up = [down.at(-1)];
    for (let step = 0; step < 58; step += 1) {
      await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 450, deltaX: 0, deltaY: -7 });
      await delay(20);
      up.push(await readState());
    }
    await delay(600);
    up.push(await readState());

    for (let step = 0; step < 12; step += 1) {
      await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 450, deltaX: 0, deltaY: step % 2 ? -48 : 48 });
      await delay(24);
    }
    const rapidDirectionState = await readState();
    if (!rapidDirectionState.finite || rapidDirectionState.overflow > 1) throw new Error("Rapid wheel direction changes broke the transition.");

    return {
      input: "Chrome DevTools synthesized mouse-wheel deltas",
      down: assertMonotonic(down, "down", "slow wheel down"),
      up: assertMonotonic(up, "up", "slow wheel up"),
      start: down[0],
      end: down.at(-1),
      reversed: up.at(-1),
      rapidDirectionState,
    };
  };

  const dispatchTouchGesture = async (width, startY, endY, steps, samples) => {
    const x = Math.round(width / 2);
    await call("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y: startY, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let step = 1; step <= steps; step += 1) {
      const y = startY + ((endY - startY) * step) / steps;
      await call("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x, y, radiusX: 2, radiusY: 2, force: 1 }],
      });
      await delay(18);
      samples.push(await readState());
    }
    await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await delay(650);
    samples.push(await readState());
  };

  const exerciseTouch = async ({ label, width, height }) => {
    await navigate(width, height, 3, true, true);
    const down = [await readState()];
    await dispatchTouchGesture(width, Math.round(height * 0.82), Math.round(height * 0.32), 64, down);
    const up = [down.at(-1)];
    await dispatchTouchGesture(width, Math.round(height * 0.3), Math.round(height * 0.82), 64, up);
    return {
      input: "Chrome DevTools emulated single-touch drag",
      down: assertMonotonic(down, "down", `${label} touch down`),
      up: assertMonotonic(up, "up", `${label} touch up`),
      start: down[0],
      end: down.at(-1),
      reversed: up.at(-1),
    };
  };

  const boundaries = [];
  for (const viewport of [
    { width: 375, height: 812, cards: 3, distance: 180, overlap: 180 },
    { width: 390, height: 844, cards: 3, distance: 180, overlap: 180 },
    { width: 767, height: 900, cards: 3, distance: 180, overlap: 180 },
    { width: 768, height: 900, cards: 3, distance: 240, overlap: 240 },
    { width: 1023, height: 900, cards: 3, distance: 240, overlap: 240 },
    { width: 1024, height: 900, cards: 5, distance: 320, overlap: 320 },
    { width: 1440, height: 900, cards: 5, distance: 320, overlap: 320 },
  ]) {
    await navigate(viewport.width, viewport.height, viewport.cards);
    const state = await readState();
    const startGap = state.arrivalsDocumentTop - (state.heroDocumentTop + state.heroHeight);
    if (state.cardCount !== viewport.cards || state.scrollDistance !== viewport.distance || state.overlap !== viewport.overlap || Math.abs(startGap) > 1 || state.overflow > 1) {
      throw new Error(`Breakpoint ${viewport.width}px failed: ${JSON.stringify({ viewport, state, startGap })}`);
    }
    boundaries.push({ ...viewport, startGap, state });
  }

  await navigate(767, 900, 3);
  await setViewport(768, 900, false);
  await waitFor(() => evaluate("document.querySelectorAll('.product-hero-card').length === 3 && Number.parseFloat(getComputedStyle(document.querySelector('.product-card-hero')).getPropertyValue('--hero-stack-scroll-distance')) === 240"));
  const resize767to768 = await readState();
  await setViewport(1023, 900, false);
  await delay(500);
  await setViewport(1024, 900, false);
  await waitFor(() => evaluate("document.querySelectorAll('.product-hero-card').length === 5 && Number.parseFloat(getComputedStyle(document.querySelector('.product-card-hero')).getPropertyValue('--hero-stack-scroll-distance')) === 320"));
  const resize1023to1024 = await readState();
  if (resize767to768.overflow > 1 || resize1023to1024.overflow > 1) throw new Error("Breakpoint resizing caused overflow.");

  const report = {
    passed: true,
    wheel: await exerciseWheel(),
    mobileTouch: await exerciseTouch({ label: "mobile", width: 390, height: 844 }),
    tabletTouch: await exerciseTouch({ label: "tablet", width: 768, height: 900 }),
    boundaries,
    resize767to768,
    resize1023to1024,
  };
  await writeFile(new URL("results.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
