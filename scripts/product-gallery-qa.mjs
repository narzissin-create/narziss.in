import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.STOREFRONT_URL || "http://localhost:5174/";
const productUrl = new URL("products/signature-relaxed-linen-shirt-2", baseUrl).href;
const productApiUrl = "http://localhost:8000/products/signature-relaxed-linen-shirt-2";
const productResponse = await fetch(productApiUrl).then(async (response) => {
  if (!response.ok) throw new Error(`Product API returned ${response.status}.`);
  return response.text();
});
const output = new URL("../.qa/product-gallery/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 17100 + (Date.now() % 300);
const profile = await mkdtemp(join(tmpdir(), "narziss-product-gallery-"));
await mkdir(output, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-web-security",
  "--no-proxy-server",
  "--host-resolver-rules=MAP localhost 127.0.0.1",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check, attempts = 150) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for the product gallery.");
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
  socket = new WebSocket(pages.find((entry) => entry.type === "page").webSocketDebuggerUrl);
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
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const originalFetch = window.fetch.bind(window);
      const productUrl = ${JSON.stringify(productApiUrl)};
      const productBody = ${JSON.stringify(productResponse)};
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (url && url.endsWith('/products/signature-relaxed-linen-shirt-2')) {
          return Promise.resolve(new Response(productBody, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return originalFetch(input, init);
      };
    })();`,
  });
  const evaluate = async (expression) => {
    const response = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return response.result.value;
  };
  const capture = async (name) => {
    const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(name, output), Buffer.from(result.data, "base64"));
  };
  const metrics = () => evaluate(`(() => {
    const page = document.querySelector('.product-page');
    const detail = document.querySelector('.product-detail');
    const gallery = document.querySelector('.product-gallery');
    const photo = document.querySelector('.detail-photo');
    const image = photo?.querySelector('img');
    const controls = document.querySelector('.gallery-controls');
    const description = document.querySelector('.description-toggle');
    const header = document.querySelector('header');
    const back = page?.querySelector(':scope > a');
    const rect = (node) => node ? ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      header: rect(header),
      back: rect(back),
      detail: rect(detail),
      gallery: rect(gallery),
      photo: rect(photo),
      image: rect(image),
      controls: rect(controls),
      description: rect(description),
      controlsVisible: controls?.getBoundingClientRect().bottom <= innerHeight + .5,
      alignmentDelta: description && controls ? controls.getBoundingClientRect().bottom - description.getBoundingClientRect().bottom : null,
      imageFit: image ? getComputedStyle(image).objectFit : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      columns: getComputedStyle(detail).gridTemplateColumns,
    };
  })()`);

  const results = [];
  for (const viewport of [
    { label: "mobile-390x844", width: 390, height: 844, mobile: true },
    { label: "mobile-short-390x667", width: 390, height: 667, mobile: true },
    { label: "tablet-768x900", width: 768, height: 900, mobile: true },
    { label: "tablet-short-768x700", width: 768, height: 700, mobile: true },
    { label: "laptop-1440x900", width: 1440, height: 900, mobile: false },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await call("Page.navigate", { url: productUrl });
    await waitFor(() => evaluate("document.readyState === 'complete'"));
    if (viewport.label === "mobile-390x844") {
      const diagnostic = await evaluate(`Promise.race([
        fetch('http://localhost:8000/products/signature-relaxed-linen-shirt-2').then(response => response.json()).then(data => ({ ok: true, name: data.name })),
        new Promise(resolve => setTimeout(() => resolve({ ok: false, text: document.body.innerText.slice(0, 250), fetch: window.fetch.toString().slice(0, 120) }), 4000))
      ])`);
      console.log(JSON.stringify({ diagnostic }));
    }
    await waitFor(() => evaluate("document.querySelector('.description-toggle')"), 300);
    const pageState = await evaluate("({ hasGallery: Boolean(document.querySelector('.description-toggle')), url: location.href, text: document.body.innerText.slice(0, 500) })");
    if (!pageState.hasGallery) throw new Error(`Product gallery unavailable at ${pageState.url}: ${pageState.text}`);
    await waitFor(() => evaluate("!document.querySelector('.product-gallery img') || document.querySelector('.product-gallery img').complete"));
    await delay(500);
    await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
    await delay(300);
    const state = await metrics();
    await capture(`${viewport.label}.png`);
    results.push({ ...viewport, state });
  }

  const report = { productUrl, results };
  await writeFile(new URL("results.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
