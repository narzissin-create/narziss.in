import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const base = process.env.NARZISS_QA_BASE_URL || "http://localhost:5174";
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 9800 + (process.pid % 150);
const profile = await mkdtemp(join(tmpdir(), "narziss-modal-backtop-"));
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

const waitFor = async (check, attempts = 100) => {
  for (let index = 0; index < attempts; index += 1) {
    try { const value = await check(); if (value) return value; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for live storefront state.");
};

let socket;
let id = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, { resolve, reject });
  socket.send(JSON.stringify({ id: messageId, method, params }));
});
const evaluate = async (expression) => {
  const response = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
};
const navigate = async (path, ready = "document.readyState === 'complete'") => {
  await call("Page.navigate", { url: `${base}${path}` });
  await waitFor(() => evaluate(ready));
  await new Promise((resolve) => setTimeout(resolve, 350));
};

try {
  await waitFor(async () => (await fetch(base)).ok);
  const page = await waitFor(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
    return pages.find((entry) => entry.type === "page");
  });
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
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

  const hierarchyDropdownResults = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    await call("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await navigate("/shop/men-upper-wear/t-shirts/acid-wash-tees", "Boolean(document.querySelector('[aria-controls=\"home-level-options\"]'))");
    const triggerState = await evaluate(`(() => {
      const findStatic = (label) => [...document.querySelectorAll('.hierarchy-selector-static')].find((node) => node.textContent.trim() === label);
      return {
        home: document.querySelector('[aria-controls="home-level-options"]')?.textContent.trim(),
        section: document.querySelector('[aria-controls="section-level-options"]')?.textContent.trim(),
        category: document.querySelector('[aria-controls="category-level-options"]')?.textContent.trim(),
        subcategoryStatic: Boolean(findStatic('Acid Wash Tees')),
        subcategoryTrigger: Boolean(document.querySelector('[aria-controls="subcategory-level-options"]'))
      };
    })()`);
    if (triggerState.home !== "Home" || triggerState.section !== "Men Upper Wear" || triggerState.category !== "T-Shirts" || !triggerState.subcategoryStatic || triggerState.subcategoryTrigger) throw new Error(`${viewport.name} child-discovery triggers failed: ${JSON.stringify(triggerState)}`);

    await evaluate("document.querySelector('[aria-controls=\"home-level-options\"]')?.click()");
    await waitFor(() => evaluate("document.querySelectorAll('#home-level-options button').length === 2"));
    const homeLabels = await evaluate("[...document.querySelectorAll('#home-level-options button')].map((button) => button.textContent.trim())");
    if (!homeLabels.includes("Men Upper Wear") || !homeLabels.includes("Men Bottom Wear")) throw new Error(`${viewport.name} Home did not expose sections: ${JSON.stringify(homeLabels)}`);
    await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
    await waitFor(() => evaluate("!document.querySelector('#home-level-options')"));

    await evaluate("document.querySelector('[aria-controls=\"section-level-options\"]')?.click()");
    await waitFor(() => evaluate("document.querySelectorAll('#section-level-options button').length === 2"));
    const sectionLabels = await evaluate("[...document.querySelectorAll('#section-level-options button')].map((button) => button.textContent.trim())");
    if (!sectionLabels.includes("T-Shirts") || !sectionLabels.includes("Shirts")) throw new Error(`${viewport.name} section did not expose its categories: ${JSON.stringify(sectionLabels)}`);
    await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
    await waitFor(() => evaluate("!document.querySelector('#section-level-options')"));

    await evaluate("document.querySelector('[aria-controls=\"category-level-options\"]')?.click()");
    await waitFor(() => evaluate("Boolean(document.querySelector('#category-level-options'))"));
    const menuState = await evaluate(`(() => {
      const menu = document.querySelector('#category-level-options');
      const rect = menu.getBoundingClientRect();
      const options = [...menu.querySelectorAll('button')];
      return {
        optionCount: options.length,
        selected: options.filter((option) => option.getAttribute('aria-current') === 'true').map((option) => option.textContent.trim()),
        contained: rect.left >= 0 && rect.right <= window.innerWidth
      };
    })()`);
    if (menuState.optionCount !== 1 || menuState.selected[0] !== "Acid Wash Tees" || !menuState.contained) throw new Error(`${viewport.name} subcategory menu failed: ${JSON.stringify(menuState)}`);
    await evaluate("document.querySelector('#category-level-options button')?.focus(); document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor(() => evaluate("!document.querySelector('#category-level-options')"));
    await waitFor(() => evaluate("document.activeElement === document.querySelector('[aria-controls=\"category-level-options\"]')"));
    hierarchyDropdownResults.push({ viewport: viewport.name, triggerState, menuState });
  }

  await navigate("/shop/men-upper-wear/shirts/plain-shirts", "Boolean(document.querySelector('[aria-controls=\"category-level-options\"]'))");
  await evaluate("document.querySelector('[aria-controls=\"category-level-options\"]')?.click()");
  await waitFor(() => evaluate("document.querySelectorAll('#category-level-options button').length === 2"));
  await evaluate("[...document.querySelectorAll('#category-level-options button')].find((button) => button.textContent.includes('Printed Shirts'))?.click()");
  await waitFor(() => evaluate("location.pathname.endsWith('/shop/men-upper-wear/shirts/printed-shirts') && document.querySelector('h1')?.textContent.trim() === 'Printed Shirts'"));

  await evaluate("document.querySelector('[aria-controls=\"home-level-options\"]')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('#home-level-options'))"));
  await evaluate("[...document.querySelectorAll('#home-level-options button')].find((button) => button.textContent.includes('Men Bottom Wear'))?.click()");
  await waitFor(() => evaluate("location.pathname.endsWith('/shop/men-bottom-wear') && document.querySelector('h1')?.textContent.trim() === 'Men Bottom Wear'"));
  await evaluate("document.querySelector('[aria-controls=\"section-level-options\"]')?.click()");
  await waitFor(() => evaluate("document.querySelectorAll('#section-level-options button').length === 5"));
  await evaluate("[...document.querySelectorAll('#section-level-options button')].find((button) => button.textContent.includes('Trousers'))?.click()");
  await waitFor(() => evaluate("location.pathname.endsWith('/shop/men-bottom-wear/trousers') && document.querySelector('h1')?.textContent.trim() === 'Trousers'"));
  if (await evaluate("Boolean(document.querySelector('[aria-controls=\"category-level-options\"]'))")) throw new Error("Leaf category unexpectedly rendered an empty child dropdown.");

  const viewports = [
    { name: "desktop", width: 1440, height: 900, mobile: false },
    { name: "tablet", width: 768, height: 900, mobile: true },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ];
  const modalResults = [];
  for (const viewport of viewports) {
    await call("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await navigate("/", "Boolean(document.querySelector('.footer-bottom-links button'))");
    await evaluate("[...document.querySelectorAll('.footer-bottom-links button')].find((node) => node.textContent.includes('Terms'))?.click()");
    await waitFor(() => evaluate("Boolean(document.querySelector('.auth-modal-backdrop.is-open .auth-modal'))"));
    await waitFor(() => evaluate("getComputedStyle(document.querySelector('.modal-backdrop')).opacity === '1' && getComputedStyle(document.querySelector('.modal')).transform === 'matrix(1, 0, 0, 1, 0, 0)'"));
    const openState = await evaluate(`(() => {
      const backdrop = document.querySelector('.modal-backdrop');
      const modal = document.querySelector('.modal');
      return { opacity: getComputedStyle(backdrop).opacity, transform: getComputedStyle(modal).transform, locked: getComputedStyle(document.body).overflow === 'hidden' };
    })()`);
    if (openState.opacity !== "1" || openState.transform !== "matrix(1, 0, 0, 1, 0, 0)" || !openState.locked) throw new Error(`${viewport.name} terms modal open state failed: ${JSON.stringify(openState)}`);
    await evaluate("document.querySelector('.modal-close')?.click()");
    await waitFor(() => evaluate("Boolean(document.querySelector('.auth-modal-backdrop.is-closing'))"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!await evaluate("Boolean(document.querySelector('.modal-backdrop'))")) throw new Error(`${viewport.name} modal unmounted before its closing transition finished.`);
    await waitFor(() => evaluate("!document.querySelector('.modal-backdrop') && getComputedStyle(document.body).overflow !== 'hidden'"));
    modalResults.push({ viewport: viewport.name, openState });
  }

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/products/signature-relaxed-linen-shirt-2", "Boolean(document.querySelector('.product-info'))");
  await evaluate("[...document.querySelectorAll('button')].find((node) => node.textContent.includes('Size chart'))?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.auth-modal-backdrop.is-open .auth-modal'))"));
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(() => evaluate("!document.querySelector('.modal-backdrop')"));
  await evaluate("[...document.querySelectorAll('button')].find((node) => node.textContent.includes('Product description'))?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.auth-modal-backdrop.is-open .auth-modal'))"));
  await evaluate("document.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))");
  await waitFor(() => evaluate("!document.querySelector('.modal-backdrop')"));

  const backTopResults = [];
  for (const viewport of viewports) {
    await call("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await navigate("/shop/men-upper-wear/shirts/plain-shirts", "Boolean(document.querySelector('.hierarchy-listing-route'))");
    await evaluate("document.querySelector('main').style.minHeight = '3000px'; window.scrollTo(0, 1800)");
    await waitFor(() => evaluate("Boolean(document.querySelector('.back-top'))"));
    const count = await evaluate("document.querySelectorAll('.back-top').length");
    if (count !== 1) throw new Error(`${viewport.name} rendered ${count} back-to-top controls.`);
    await evaluate("document.querySelector('.back-top').click()");
    await waitFor(() => evaluate("window.scrollY < 2"));
    backTopResults.push({ viewport: viewport.name, count });
  }

  await evaluate(`(() => {
    const user = ${JSON.stringify({ id: "qa-cart-user", email: "qa-cart@example.test" })};
    localStorage.setItem('narziss-user', JSON.stringify(user));
    localStorage.setItem('narziss-demo-v1', JSON.stringify({
      users: [user],
      carts: { [user.id]: [
        { variantId: 'v-2-M-0', quantity: 1 },
        { variantId: 'v-3-M-0', quantity: 1 },
        { variantId: 'v-4-S-0', quantity: 1 }
      ] },
      addresses: {}, orders: [], reviews: []
    }));
  })()`);
  await navigate("/cart", "document.querySelectorAll('.cart-line').length === 3");
  await waitFor(() => evaluate("[...document.querySelectorAll('.cart-product-thumbnail-frame img')].length === 3 && [...document.querySelectorAll('.cart-product-thumbnail-frame img')].every((image) => image.complete && image.naturalWidth > 0)"));
  const cartThumbnails = await evaluate(`[...document.querySelectorAll('.cart-product-thumbnail')].map((wrapper) => {
    const frame = wrapper.querySelector('.cart-product-thumbnail-frame');
    const image = frame.querySelector('img');
    const wrapperStyle = getComputedStyle(wrapper);
    const imageStyle = getComputedStyle(image);
    const wrapperRect = wrapper.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      product: image.alt,
      orientation: image.naturalWidth === image.naturalHeight ? 'square' : image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait',
      padding: [wrapperStyle.paddingTop, wrapperStyle.paddingRight, wrapperStyle.paddingBottom, wrapperStyle.paddingLeft],
      background: wrapperStyle.backgroundColor,
      objectFit: imageStyle.objectFit,
      objectPosition: imageStyle.objectPosition,
      overflow: wrapperStyle.overflow,
      squareWrapper: Math.abs(wrapperRect.width - wrapperRect.height) < 0.01,
      contained: frameRect.left >= wrapperRect.left && frameRect.right <= wrapperRect.right && frameRect.top >= wrapperRect.top && frameRect.bottom <= wrapperRect.bottom
    };
  })`);
  const orientations = new Set(cartThumbnails.map((item) => item.orientation));
  if (!["portrait", "landscape", "square"].every((orientation) => orientations.has(orientation)) || cartThumbnails.some((item) => new Set(item.padding).size !== 1 || item.objectFit !== 'contain' || item.objectPosition !== '50% 50%' || item.overflow !== 'hidden' || !item.squareWrapper || !item.contained)) {
    throw new Error(`Actual cart thumbnail containment failed: ${JSON.stringify(cartThumbnails)}`);
  }
  await evaluate(`localStorage.removeItem('narziss-user'); localStorage.removeItem('narziss-demo-v1')`);

  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("/", "Boolean(document.querySelector('.desktop-navbar-right .icon-button[aria-label=\"Log in\"]'))");
  await evaluate("document.querySelector('.desktop-navbar-right .icon-button[aria-label=\"Log in\"]')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.modal-backdrop'))"));
  const reduced = await evaluate(`(() => ({
    backdropDuration: getComputedStyle(document.querySelector('.modal-backdrop')).transitionDuration,
    modalDuration: getComputedStyle(document.querySelector('.modal')).transitionDuration
  }))()`);
  console.log(JSON.stringify({ passed: true, hierarchyDropdownResults, modalResults, backTopResults, cartThumbnails, reduced }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
