import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const base = "http://localhost:5176";
const output = new URL("../.qa/temporary-hierarchy/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(join(tmpdir(), "narziss-temporary-hierarchy-"));
const debugPort = 9400 + (process.pid % 300);
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

const waitFor = async (check, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const result = await check(); if (result) return result; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the live storefront.");
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
const navigate = async (path, readyExpression) => {
  await call("Page.navigate", { url: `${base}${path}` });
  await waitFor(async () => evaluate(readyExpression));
  await new Promise((resolve) => setTimeout(resolve, 350));
};
const screenshot = async (name) => {
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL(name, output), Buffer.from(shot.data, "base64"));
};

try {
  await mkdir(output, { recursive: true });
  await waitFor(async () => (await fetch(base)).ok);
  const page = await waitFor(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
    return pages.find((item) => item.type === "page");
  });
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });
  await call("Page.enable");
  await call("Runtime.enable");

  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate("/", "document.querySelectorAll('.navbar-cat-link').length === 2");
  await evaluate("document.querySelector('.navbar-cat-link')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('.mega-menu.is-open'))"));
  const desktopMenu = await evaluate(`({
    sections: [...document.querySelectorAll('.navbar-cat-link')].map((node) => node.textContent.trim()),
    categories: [...document.querySelectorAll('.mega-menu-group h2')].map((node) => node.textContent.trim()),
    leaves: [...document.querySelectorAll('.mega-menu-pending-item')].map((node) => node.textContent.trim()),
    previewLabel: Boolean(document.querySelector('.navigation-preview-label'))
  })`);
  if (desktopMenu.sections.join("|") !== "Men Upper Wear|Men Bottom Wear") throw new Error("Desktop sections are incorrect.");
  if (desktopMenu.categories.join("|") !== "T-Shirts|Shirts") throw new Error("Desktop categories are incorrect.");
  if (desktopMenu.leaves.join("|") !== "Acid Wash Tees|Printed Shirts|Plain Shirts") throw new Error("Desktop subcategories are incorrect.");
  if (desktopMenu.previewLabel) throw new Error("The normal storefront must not show the old preview label.");
  await screenshot("desktop-menu.png");

  await navigate("/shop/men-upper-wear/shirts/plain-shirts", "document.querySelector('.hierarchy-listing-route h1')?.textContent === 'Plain Shirts'");
  await waitFor(async () => evaluate("document.querySelectorAll('.product-card').length === 1"));
  const plainListing = await evaluate(`({
    heading: document.querySelector('.hierarchy-listing-route h1')?.textContent,
    products: [...document.querySelectorAll('.product-card')].map((node) => node.textContent),
    links: [...document.querySelectorAll('.product-card a[href*="/products/"]')].map((node) => node.getAttribute('href')),
    images: [...document.querySelectorAll('.product-card img')].map((node) => node.src)
  })`);
  if (!plainListing.products[0]?.includes("Signature Relaxed Linen Shirt")) throw new Error("Plain Shirts did not load the mapped real product.");
  if (!plainListing.images[0]?.includes("/uploads/")) throw new Error("Plain Shirts did not use the real uploaded product image.");
  await screenshot("plain-shirts-listing.png");

  await evaluate("document.querySelector('[aria-controls=\"subcategory-level-options\"]')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('#subcategory-level-options'))"));
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  if (await evaluate("Boolean(document.querySelector('#subcategory-level-options'))")) throw new Error("Escape did not close the subcategory selector.");
  await evaluate("document.querySelector('[aria-controls=\"category-level-options\"]')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('#category-level-options'))"));
  await evaluate("document.querySelector('.hierarchy-listing-route h1')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  if (await evaluate("Boolean(document.querySelector('#category-level-options'))")) throw new Error("Outside click did not close the category selector.");

  await navigate("/shop/men-upper-wear/t-shirts/acid-wash-tees?tag=acid%20wash&price=desc", "document.querySelector('.hierarchy-listing-route h1')?.textContent === 'Acid Wash Tees'");
  const singleSubcategoryHasArrow = await evaluate("Boolean(document.querySelector('[aria-controls=\"subcategory-level-options\"]'))");
  if (singleSubcategoryHasArrow) throw new Error("A single subcategory must not show a dropdown arrow.");
  await evaluate("document.querySelector('[aria-controls=\"category-level-options\"]')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('#category-level-options'))"));
  await evaluate("[...document.querySelectorAll('#category-level-options button')].find((node) => node.textContent.trim() === 'Shirts')?.click()");
  await waitFor(async () => evaluate("location.pathname === '/shop/men-upper-wear/shirts' && document.querySelector('.hierarchy-listing-route h1')?.textContent === 'Shirts'"));
  if (await evaluate("Boolean(location.search)")) throw new Error("Changing category did not clear incompatible filters.");

  await evaluate("document.querySelector('[aria-controls=\"section-level-options\"]')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('#section-level-options'))"));
  await evaluate("[...document.querySelectorAll('#section-level-options button')].find((node) => node.textContent.trim() === 'Men Bottom Wear')?.click()");
  await waitFor(async () => evaluate("location.pathname === '/shop/men-bottom-wear' && document.querySelector('.hierarchy-listing-route h1')?.textContent === 'Men Bottom Wear'"));
  const parentChangePath = await evaluate("location.pathname + location.search");
  if (parentChangePath !== "/shop/men-bottom-wear") throw new Error(`Changing section retained incompatible state: ${parentChangePath}`);

  await navigate("/shop/men-upper-wear", "document.querySelector('.hierarchy-listing-route h1')?.textContent === 'Men Upper Wear'");
  await waitFor(async () => evaluate("document.querySelectorAll('.product-card').length === 2"));
  const sectionNames = await evaluate("[...document.querySelectorAll('.product-card')].map((node) => node.textContent)");
  if (!sectionNames.some((name) => name.includes("Signature Relaxed Linen Shirt")) || !sectionNames.some((name) => name.includes("Acid Wash Oversized Tee"))) {
    throw new Error("Section listing did not include both descendant products.");
  }

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/", "Boolean(document.querySelector('.mobile-menu-button'))");
  await evaluate("document.querySelector('.mobile-menu-button')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('.mobile-drawer-layer.is-open'))"));
  await evaluate("[...document.querySelectorAll('.mobile-drawer-row')].find((node) => node.textContent.trim() === 'Men Upper Wear')?.click()");
  await waitFor(async () => evaluate("document.querySelector('.mobile-drawer-title')?.textContent === 'Men Upper Wear'"));
  const mobileCategories = await evaluate("[...document.querySelectorAll('.mobile-drawer-row')].map((node) => node.textContent.trim())");
  if (mobileCategories.join("|") !== "T-Shirts|Shirts") throw new Error("Mobile categories are incorrect.");
  await evaluate("[...document.querySelectorAll('.mobile-drawer-row')].find((node) => node.textContent.trim() === 'Shirts')?.click()");
  await waitFor(async () => evaluate("document.querySelector('.mobile-drawer-title')?.textContent === 'Shirts'"));
  const mobileLeaves = await evaluate("[...document.querySelectorAll('.mobile-drawer-row')].map((node) => node.textContent.trim())");
  if (mobileLeaves.join("|") !== "Printed Shirts|Plain Shirts") throw new Error("Mobile Shirts leaves are incorrect.");
  await screenshot("mobile-shirts.png");

  const sortMeasurements = [];
  for (const width of [320, 375, 390]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate("/", "document.querySelectorAll('.category-showcase .filter-selects select').length >= 4");
    const measurement = await evaluate(`(() => {
      const controls = [...document.querySelectorAll('.category-showcase .filter-selects select')];
      const clothing = controls.find((node) => node.getAttribute('aria-label') === 'Wear type');
      const sort = controls.find((node) => node.getAttribute('aria-label') === 'Sort by price');
      return { clothing: clothing?.getBoundingClientRect().width, sort: sort?.getBoundingClientRect().width };
    })()`);
    if (Math.abs(measurement.clothing - measurement.sort) > 0.01) {
      throw new Error(`${width}px filter widths differ: ${JSON.stringify(measurement)}`);
    }
    sortMeasurements.push({ width, ...measurement });
  }

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/shop/men-upper-wear/shirts/plain-shirts", "document.querySelector('.hierarchy-listing-route h1')?.textContent === 'Plain Shirts'");
  await evaluate("document.querySelector('[aria-controls=\"subcategory-level-options\"]')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('#subcategory-level-options'))"));
  const mobileDropdownBounds = await evaluate(`(() => {
    const rect = document.querySelector('#subcategory-level-options').getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth };
  })()`);
  if (mobileDropdownBounds.left < 0 || mobileDropdownBounds.right > mobileDropdownBounds.viewport) throw new Error(`Mobile dropdown overflows: ${JSON.stringify(mobileDropdownBounds)}`);
  await screenshot("mobile-breadcrumb-dropdown.png");

  console.log(JSON.stringify({ passed: true, desktopMenu, plainListing, sectionProducts: sectionNames, mobileCategories, mobileLeaves, sortMeasurements, parentChangePath, mobileDropdownBounds }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
