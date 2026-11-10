import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const storefront = process.env.STOREFRONT_URL || "http://127.0.0.1:5174";
const output = new URL("../.qa/live-backend-smoke/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 9400 + (process.pid % 400);
const browserProfile = await mkdtemp(join(tmpdir(), "narziss-live-smoke-"));
await mkdir(output, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${browserProfile}`,
  "about:blank",
], { stdio: "ignore" });

const waitFor = async (check, label, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
};

let socket;
let messageId = 0;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
const failedRequests = [];
const httpErrors = [];
const requestUrls = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const navigate = async path => {
  await call("Page.navigate", { url: `${storefront}${path}` });
  await waitFor(() => evaluate("Boolean(document.querySelector('main'))"), `main for ${path}`);
  await new Promise(resolve => setTimeout(resolve, 500));
};

try {
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    const values = await response.json();
    return values.find(value => value.type === "page" && !value.url.startsWith("chrome-extension://"));
  }, "Chrome debugging target");
  socket = new WebSocket(pages.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map(arg => arg.value || arg.description || "").join(" "));
    }
    if (message.method === "Network.requestWillBeSent") requestUrls.set(message.params.requestId, message.params.request.url);
    if (message.method === "Network.loadingFailed") failedRequests.push({ url: requestUrls.get(message.params.requestId), error: message.params.errorText });
    if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
      httpErrors.push({ url: message.params.response.url, status: message.params.response.status });
    }
  });
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await navigate("/");
  await waitFor(() => evaluate("document.querySelectorAll('.product-card').length >= 2"), "real New Arrivals products");
  const home = await evaluate(`(() => ({
    heading: [...document.querySelectorAll('h2')].find(node => node.textContent.includes('New Arrivals'))?.textContent.trim(),
    products: [...document.querySelectorAll('.product-card')].slice(0, 4).map(node => node.textContent.trim()),
    previewLabel: document.querySelector('.navigation-preview-label')?.textContent.trim()
  }))()`);

  const search = await evaluate(`(async () => {
    const input = document.querySelector('#desktop-search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Signature Relaxed Linen Shirt');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(() => evaluate("document.querySelectorAll('#desktop-search-results [role=option]').length > 0"), "real search result");
  const searchResult = await evaluate("document.querySelector('#desktop-search-results [role=option]')?.textContent.trim()");

  await navigate("/shop");
  await waitFor(() => evaluate("document.querySelectorAll('.shop-grid .product-card').length >= 3"), "real shop products");
  const shop = await evaluate(`(() => ({
    count: document.querySelectorAll('.shop-grid .product-card').length,
    names: [...document.querySelectorAll('.shop-grid .product-card')].map(node => node.textContent.trim()),
    productHref: document.querySelector('.shop-grid .product-photo')?.getAttribute('href')
  }))()`);

  await navigate(shop.productHref);
  await waitFor(() => evaluate("Boolean(document.querySelector('.product-info h1'))"), "real product detail");
  const product = await evaluate(`(() => ({
    name: document.querySelector('.product-info h1')?.textContent.trim(),
    sizeButtons: [...document.querySelectorAll('.size-options button')].map(node => node.textContent.trim()),
    price: document.querySelector('.product-info .price')?.textContent.trim()
  }))()`);

  const cartSeed = await evaluate(`(async () => {
    const { api } = await import('/src/services/api.js');
    const user = { id: 'qa-local-user', email: 'qa-local@example.test', phone: '9876543299' };
    localStorage.setItem('narziss-demo-v1', JSON.stringify({ users: [user], carts: {}, addresses: {}, orders: [], reviews: [] }));
    localStorage.setItem('narziss-user', JSON.stringify(user));
    api.restore(user);
    const result = await api.listProducts({}, 0, 10);
    const real = result.items.find(item => item.name === 'Signature Relaxed Linen Shirt') || result.items[0];
    const variant = real.variants.find(item => item.stock > 0);
    await api.add(variant.id);
    return { name: real.name, cart: await api.cart() };
  })()`);
  await navigate("/cart");
  try {
    await waitFor(() => evaluate("document.querySelectorAll('.cart-line').length > 0"), "cart line");
  } catch {
    const diagnostic = await evaluate(`(() => ({
      body: document.body.innerText.slice(0, 1000),
      user: localStorage.getItem('narziss-user'),
      database: localStorage.getItem('narziss-demo-v1'),
      errors: document.querySelectorAll('.error').length
    }))()`);
    throw new Error(`Cart did not render: ${JSON.stringify(diagnostic)}`);
  }
  const cart = await evaluate(`(() => ({
    lines: document.querySelectorAll('.cart-line').length,
    text: document.querySelector('.cart-line')?.textContent.trim()
  }))()`);

  const unexpectedHttpErrors = httpErrors.filter(error => !error.url.endsWith('/navigation'));
  const result = {
    home,
    searchTriggered: search,
    searchResult,
    shop,
    product,
    cartSeed,
    cart,
    exceptions,
    consoleErrors,
    failedRequests,
    httpErrors,
    unexpectedHttpErrors,
  };
  if (!home.heading || home.products.length < 2) throw new Error("New Arrivals did not render real products.");
  if (!home.previewLabel?.startsWith("Development-only menu preview")) throw new Error("Development preview label is missing.");
  if (!searchResult?.includes("Signature Relaxed Linen Shirt")) throw new Error("Search did not return the real backend product.");
  if (shop.count < 3 || !product.name || cart.lines < 1) throw new Error("A live storefront flow failed.");
  if (exceptions.length || consoleErrors.length || failedRequests.length || unexpectedHttpErrors.length) {
    throw new Error(`Unexpected browser diagnostics: ${JSON.stringify({ exceptions, consoleErrors, failedRequests, unexpectedHttpErrors })}`);
  }
  await writeFile(new URL("results.json", output), JSON.stringify(result, null, 2));
  const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL("cart.png", output), Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ passed: true, result }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(browserProfile, { recursive: true, force: true }).catch(() => {});
}
