import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const storefrontUrl = process.env.STOREFRONT_URL || "http://127.0.0.1:5175/";
const output = new URL("../.qa/card-hero-stacking/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 15900 + (Date.now() % 400);
const profile = await mkdtemp(join(tmpdir(), "narziss-card-stack-"));
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
const waitFor = async (check, attempts = 120) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for the card hero stacking audit.");
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
  await call("Network.enable");
  const results = [];

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
    const layer = document.querySelector('.product-card-hero__scroll-layer');
    const cream = document.querySelector('.product-card-hero__cream-underlay');
    const decoration = document.querySelector('.product-card-hero__decoration');
    const architecture = document.querySelector('.product-card-hero__architecture img');
    const wordmark = document.querySelector('.product-card-hero__wordmark');
    const links = [...document.querySelectorAll('a.product-hero-card')];
    const heroRect = hero.getBoundingClientRect();
    const arrivalsRect = arrivals.getBoundingClientRect();
    const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    const coverTop = arrivals.getBoundingClientRect().top;
    const generatedBefore = getComputedStyle(decoration, '::before');
    return {
      scrollY,
      heroDocumentTop: heroRect.top + scrollY,
      heroHeight: heroRect.height,
      arrivalsDocumentTop: arrivalsRect.top + scrollY,
      transitionStart: Math.max(0, heroRect.top + scrollY - headerHeight),
      coverTop,
      cardViewportBounds: [...document.querySelectorAll('.product-hero-card:not(.has-image-error)')].map(card => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
      heroY: Number.parseFloat(hero.style.getPropertyValue('--hero-stack-y')) || 0,
      arrivalsY: Number.parseFloat(arrivals.style.getPropertyValue('--hero-stack-arrivals-y')) || 0,
      scrollDistance: Number.parseFloat(getComputedStyle(hero).getPropertyValue('--hero-stack-scroll-distance')),
      maxShift: Number.parseFloat(getComputedStyle(hero).getPropertyValue('--hero-stack-max-shift')),
      overlap: Number.parseFloat(getComputedStyle(hero).getPropertyValue('--hero-stack-overlap')),
      arrivalsMarginTop: Number.parseFloat(getComputedStyle(arrivals).marginTop),
      layerTransform: getComputedStyle(layer).transform,
      arrivalsTransform: getComputedStyle(arrivals).transform,
      stackingActive: arrivals.classList.contains('is-scroll-stacking'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cardCount: document.querySelectorAll('.product-hero-card:not(.has-image-error)').length,
      cardWidths: [...document.querySelectorAll('.product-hero-card:not(.has-image-error)')].map(card => card.offsetWidth),
      architectureLoaded: Boolean(architecture?.complete && architecture?.naturalWidth === 2098 && architecture?.naturalHeight === 749),
      architectureSource: architecture?.currentSrc || '',
      architectureFit: architecture ? getComputedStyle(architecture).objectFit : '',
      architecturePointerEvents: architecture ? getComputedStyle(architecture.closest('picture')).pointerEvents : '',
      generatedArchitectureRemoved: generatedBefore.content === 'none' && generatedBefore.backgroundImage === 'none',
      wordmarkColor: getComputedStyle(wordmark).color,
      creamBackground: getComputedStyle(cream).backgroundColor,
      arrivalsCoverColor: getComputedStyle(arrivals, '::before').backgroundColor,
      hiddenLinksInteractive: links.some(link => link.getBoundingClientRect().top >= coverTop - 1 && !link.inert),
      newArrivalsHeading: arrivals.querySelector('h2, h1, h3')?.textContent?.trim() || ''
    };
  })()`);

  for (const viewport of [
    { label: "mobile", width: 390, height: 844, expectedCards: 3, expectedWidths: [144, 172, 144] },
    { label: "tablet", width: 768, height: 900, expectedCards: 3, expectedWidths: [176, 200, 176] },
    { label: "laptop", width: 1440, height: 900, expectedCards: 5, expectedWidths: [197, 216, 240, 216, 197] },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 768,
    });
    await call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
    await call("Page.navigate", { url: storefrontUrl });
    await waitFor(() => evaluate(`document.querySelectorAll('.product-hero-card').length === ${viewport.expectedCards} && document.querySelector('.product-card-hero')?.classList.contains('is-ready')`));
    await delay(4200);
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
    await delay(500);

    const beginning = await readMetrics();
    await capture(`${viewport.label}-beginning.png`);
    const transitionStart = Math.max(0, await evaluate(`document.querySelector('.product-card-hero').getBoundingClientRect().top + scrollY - Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))`));
    const midpointTarget = transitionStart + beginning.scrollDistance / 2;
    const endTarget = transitionStart + beginning.scrollDistance + 4;

    await evaluate(`window.scrollTo({ top: ${midpointTarget}, behavior: 'instant' })`);
    await delay(700);
    const middle = await readMetrics();
    await capture(`${viewport.label}-middle.png`);

    await evaluate(`window.scrollTo({ top: ${endTarget}, behavior: 'instant' })`);
    await delay(700);
    const end = await readMetrics();
    await capture(`${viewport.label}-end.png`);

    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
    await delay(700);
    const reversed = await readMetrics();
    await capture(`${viewport.label}-reverse.png`);

    const commonFailure = [beginning, middle, end, reversed].find((metrics) =>
      metrics.overflow > 1 ||
      metrics.cardCount !== viewport.expectedCards ||
      JSON.stringify(metrics.cardWidths) !== JSON.stringify(viewport.expectedWidths) ||
      !metrics.architectureLoaded ||
      !metrics.architectureSource.endsWith('/assets/hero-architecture.webp') ||
      metrics.architectureFit !== 'cover' ||
      metrics.architecturePointerEvents !== 'none' ||
      !metrics.generatedArchitectureRemoved ||
      metrics.wordmarkColor !== 'rgba(104, 112, 75, 0.55)' ||
      metrics.creamBackground !== 'rgb(245, 230, 204)' ||
      metrics.arrivalsCoverColor !== 'rgb(245, 230, 204)' ||
      metrics.hiddenLinksInteractive ||
      metrics.newArrivalsHeading !== 'New Arrivals'
    );
    if (commonFailure) throw new Error(`${viewport.label} common stacking requirement failed: ${JSON.stringify(commonFailure)}`);
    if (Math.abs(beginning.heroY) > 1 || Math.abs(beginning.arrivalsY - beginning.overlap) > 2) {
      throw new Error(`${viewport.label} beginning state is incorrect: ${JSON.stringify(beginning)}`);
    }
    if (Math.abs(middle.heroY - middle.maxShift / 2) > 3 || Math.abs(middle.arrivalsY - middle.overlap / 2) > 4) {
      throw new Error(`${viewport.label} midpoint state is incorrect: ${JSON.stringify(middle)}`);
    }
    if (Math.abs(end.heroY - end.maxShift) > 2 || end.arrivalsY > 2) {
      throw new Error(`${viewport.label} endpoint state is incorrect: ${JSON.stringify(end)}`);
    }
    if (Math.abs(reversed.heroY) > 1 || Math.abs(reversed.arrivalsY - reversed.overlap) > 2) {
      throw new Error(`${viewport.label} reverse state is incorrect: ${JSON.stringify(reversed)}`);
    }

    await call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await call("Page.navigate", { url: storefrontUrl });
    await waitFor(() => evaluate(`document.querySelectorAll('.product-hero-card').length === ${viewport.expectedCards}`));
    await delay(1000);
    await evaluate(`window.scrollTo({ top: ${endTarget}, behavior: 'instant' })`);
    await delay(300);
    const reduced = await readMetrics();
    await capture(`${viewport.label}-reduced-motion.png`);
    if (reduced.stackingActive || Math.abs(reduced.arrivalsMarginTop) > 1 || reduced.layerTransform !== 'none' || reduced.arrivalsTransform !== 'none') {
      throw new Error(`${viewport.label} reduced-motion fallback failed: ${JSON.stringify(reduced)}`);
    }

    results.push({ ...viewport, beginning, middle, end, reversed, reduced });
  }

  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBlockedURLs", { urls: ["*hero-architecture.webp*"] });
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await call("Page.navigate", { url: storefrontUrl });
  await waitFor(() => evaluate("Boolean(document.querySelector('.product-card-hero')?.classList.contains('is-ready'))"));
  await waitFor(() => evaluate("!document.querySelector('.product-card-hero__architecture')"));
  const imageFailureFallback = await evaluate(`(() => {
    const cream = document.querySelector('.product-card-hero__cream-underlay');
    return {
      imageRemoved: !document.querySelector('.product-card-hero__architecture'),
      creamBackground: getComputedStyle(cream).backgroundColor,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  if (!imageFailureFallback.imageRemoved || imageFailureFallback.creamBackground !== "rgb(245, 230, 204)" || imageFailureFallback.overflow > 1) {
    throw new Error(`Architecture image failure fallback failed: ${JSON.stringify(imageFailureFallback)}`);
  }

  const report = { passed: true, imageFailureFallback, results };
  await writeFile(new URL("results.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
