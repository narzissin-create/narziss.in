import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const output = new URL("../.qa/navigation-header/", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 5200 + (process.pid % 200);
const debugPort = 9000 + (process.pid % 400);
const browserProfile = await mkdtemp(join(tmpdir(), "narziss-navigation-qa-"));
const fixture = {
  sections: [
    {
      id: 1,
      name: "Men Upper Wear",
      slug: "men-upper-wear",
      clothing_type: "upper",
      sort_order: 0,
      categories: [
        { id: 10, section_id: 1, name: "Acid Wash Tees", slug: "acid-wash-tees", sort_order: 0, subcategories: [] },
        { id: 11, section_id: 1, name: "Printed Shirts", slug: "printed-shirts", sort_order: 1, subcategories: [] },
        { id: 12, section_id: 1, name: "Plain Shirts", slug: "plain-shirts", sort_order: 2, subcategories: [] },
      ],
    },
    {
      id: 2,
      name: "Men Bottom Wear",
      slug: "men-bottom-wear",
      clothing_type: "bottom",
      sort_order: 1,
      categories: [
        { id: 20, section_id: 2, name: "Trousers", slug: "trousers", sort_order: 0, subcategories: [] },
        { id: 21, section_id: 2, name: "Cargo", slug: "cargo", sort_order: 1, subcategories: [] },
        { id: 22, section_id: 2, name: "Pants", slug: "pants", sort_order: 2, subcategories: [] },
        { id: 23, section_id: 2, name: "Bonkers Pants", slug: "bonkers-pants", sort_order: 3, subcategories: [] },
        { id: 24, section_id: 2, name: "Japanese-Cut Pants", slug: "japanese-cut-pants", sort_order: 4, subcategories: [] },
      ],
    },
  ],
};

await mkdir(output, { recursive: true });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
});
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${browserProfile}`,
  "about:blank",
], { stdio: "ignore" });

const waitFor = async (check, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for local preview.");
};

let socket;
const pending = new Map();
let messageId = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok);
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    const values = await response.json();
    const page = values.find(value => value.type === "page" && !value.url.startsWith("chrome-extension://"));
    return page ? [page] : null;
  });
  socket = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
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
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      if (new URL(request.url).pathname === "/navigation") {
        await call("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Access-Control-Allow-Origin", value: `http://127.0.0.1:${port}` },
            { name: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
            { name: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          ],
          body: Buffer.from(JSON.stringify(fixture)).toString("base64"),
        });
      } else await call("Fetch.continueRequest", { requestId });
    }
  });

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Fetch.enable", { patterns: [{ urlPattern: "*navigation*", resourceType: "XHR", requestStage: "Request" }] });
  const results = [];

  for (const width of [320, 375, 767, 768, 1023, 1024, 1280, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    try {
      await waitFor(async () => {
        const ready = await call("Runtime.evaluate", { expression: "Boolean(document.querySelector('.navbar > .navbar-brand'))", returnByValue: true });
        return ready.result.value;
      });
    } catch {
      const diagnostic = await call("Runtime.evaluate", { expression: "({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 500), html: document.body.innerHTML.slice(0, 500) })", returnByValue: true });
      throw new Error(`Preview did not render: ${JSON.stringify(diagnostic.result.value)}`);
    }
    await waitFor(async () => {
      const loaded = await call("Runtime.evaluate", { expression: "document.querySelectorAll('.navbar-cat-link').length === 2", returnByValue: true });
      return loaded.result.value;
    });
    await new Promise(resolve => setTimeout(resolve, 250));

    if (width === 768 || width === 1023) {
      const closedHeaderScreenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(new URL(`${width}-closed.png`, output), Buffer.from(closedHeaderScreenshot.data, "base64"));
    }

    if (width < 1024) {
      await call("Runtime.evaluate", { expression: "document.querySelector('.mobile-menu-button')?.click()" });
      await new Promise(resolve => setTimeout(resolve, 260));
      await call("Runtime.evaluate", { expression: "document.querySelector('.mobile-drawer-row')?.click()" });
      await new Promise(resolve => setTimeout(resolve, 240));
    } else {
      await call("Runtime.evaluate", { expression: "(() => { const trigger = document.querySelector('.navbar-cat-link'); trigger?.click(); trigger?.focus(); })()" });
      await waitFor(async () => {
        const visible = await call("Runtime.evaluate", {
          expression: "(() => { const panel = document.querySelector('.mega-menu'); return Boolean(panel && Number(getComputedStyle(panel).opacity) === 1); })()",
          returnByValue: true,
        });
        return visible.result.value;
      });
    }

    const expression = width < 1024
      ? `(() => {
          const rows = [...document.querySelectorAll('.mobile-drawer-row')];
          const printed = rows.find(row => row.textContent.trim() === 'Printed Shirts');
          const acid = rows.find(row => row.textContent.trim() === 'Acid Wash Tees');
          const logo = document.querySelector('.navbar > .navbar-brand');
          const nav = document.querySelector('.navbar');
          const menu = document.querySelector('.mobile-menu-button');
          const cart = document.querySelector('.mobile-cart-button');
          const navRect = nav.getBoundingClientRect();
          const logoRect = logo.getBoundingClientRect();
          const menuRect = menu.getBoundingClientRect();
          const cartRect = cart.getBoundingClientRect();
          const navCenter = navRect.top + navRect.height / 2;
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            navHeight: navRect.height,
            logoOffset: Math.abs((logoRect.left + logoRect.width / 2) - (navRect.left + navRect.width / 2)),
            verticalOffset: Math.max(
              Math.abs((logoRect.top + logoRect.height / 2) - navCenter),
              Math.abs((menuRect.top + menuRect.height / 2) - navCenter),
              Math.abs((cartRect.top + cartRect.height / 2) - navCenter)
            ),
            logoWidth: logoRect.width,
            logoHeight: logoRect.height,
            drawerOpen: Boolean(document.querySelector('.mobile-drawer')),
            drawerVisible: getComputedStyle(document.querySelector('.mobile-drawer')).transform === 'matrix(1, 0, 0, 1, 0, 0)',
            printedHasArrow: Boolean(printed?.querySelector('svg')),
            acidHasArrow: Boolean(acid?.querySelector('svg')),
            bodyLocked: document.body.style.overflow === 'hidden',
            printedAvailable: Boolean(printed)
          };
        })()`
      : `(() => {
          const nav = document.querySelector('.navbar');
          const panel = document.querySelector('.mega-menu');
          const logo = document.querySelector('.navbar > .navbar-brand');
          const sectionGroup = document.querySelector('.navbar-cats');
          const controls = document.querySelector('.desktop-navbar-right');
          const logoRect = logo.getBoundingClientRect();
          const sectionRect = sectionGroup.getBoundingClientRect();
          const controlsRect = controls.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            menuOpen: Boolean(panel),
            menuVisible: panel ? Number(getComputedStyle(panel).opacity) === 1 : false,
            menuBelowHeader: Boolean(panel && panel.getBoundingClientRect().top >= nav.getBoundingClientRect().bottom - 1),
            sectionGroupOffset: Math.abs((sectionGroup.getBoundingClientRect().left + sectionGroup.getBoundingClientRect().width / 2) - (nav.getBoundingClientRect().left + nav.getBoundingClientRect().width / 2)),
            controlsOverlap: Math.max(0, logoRect.right - sectionRect.left, sectionRect.right - controlsRect.left),
            logoWidth: logo.getBoundingClientRect().width,
            logoHeight: logo.getBoundingClientRect().height,
            sections: [...document.querySelectorAll('.navbar-cat-link')].map(node => node.textContent.trim()),
            categories: [...document.querySelectorAll('.mega-menu-group h2')].map(node => node.textContent.trim())
          };
        })()`;
    const evaluated = await call("Runtime.evaluate", { expression, returnByValue: true });
    const metrics = evaluated.result.value;
    if (evaluated.exceptionDetails || !metrics) {
      throw new Error(`Browser evaluation failed at ${width}px: ${JSON.stringify(evaluated.exceptionDetails || evaluated.result)}`);
    }
    if (metrics.overflow > 1) throw new Error(`${width}px viewport has ${metrics.overflow}px horizontal overflow.`);
    if (width < 1024) {
      if (metrics.logoOffset > 1) throw new Error(`${width}px logo is not centered: ${metrics.logoOffset}px offset.`);
      if (width >= 768 && metrics.verticalOffset > 1) throw new Error(`${width}px tablet navbar controls are not vertically aligned: ${metrics.verticalOffset}px offset.`);
      if (width >= 768 && (metrics.navHeight < 88 || metrics.navHeight > 96)) throw new Error(`${width}px tablet navbar is ${metrics.navHeight}px tall.`);
      if (!metrics.drawerOpen || !metrics.drawerVisible || !metrics.bodyLocked) throw new Error(`${width}px drawer or scroll lock failed.`);
      if (metrics.printedHasArrow || metrics.acidHasArrow) throw new Error(`${width}px empty categories must not show drill-down indicators: ${JSON.stringify(metrics)}.`);
    } else {
      if (!metrics.menuOpen || !metrics.menuVisible || !metrics.menuBelowHeader) throw new Error(`${width}px mega-menu placement failed: ${JSON.stringify(metrics)}.`);
      if (metrics.sectionGroupOffset > 1) throw new Error(`${width}px section group is not centered: ${metrics.sectionGroupOffset}px offset.`);
      if (metrics.controlsOverlap > 1) throw new Error(`${width}px navbar controls overlap by ${metrics.controlsOverlap}px.`);
      if (metrics.sections.join("|") !== "Men Upper Wear|Men Bottom Wear") throw new Error(`${width}px section labels are incorrect.`);
    }
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(`${width}.png`, output), Buffer.from(screenshot.data, "base64"));
    if (width < 1024) {
      await call("Runtime.evaluate", { expression: "document.querySelector('.mobile-drawer-back')?.click()" });
      await new Promise(resolve => setTimeout(resolve, 50));
      const backState = await call("Runtime.evaluate", {
        expression: `(() => ({
          animation: getComputedStyle(document.querySelector('.mobile-drawer-content')).animationName,
          hasSearch: Boolean(document.querySelector('#mobile-search')),
          tools: [...document.querySelectorAll('.mobile-tool-row')].map(node => node.textContent.trim())
        }))()`,
        returnByValue: true,
      });
      if (backState.result.value.animation !== "drawer-view-back") throw new Error(`${width}px Back transition is not moving in the reverse direction.`);
      if (!backState.result.value.hasSearch || backState.result.value.tools.length !== 2) throw new Error(`${width}px drawer tools are missing.`);
      await call("Runtime.evaluate", { expression: "document.querySelector('.mobile-drawer-overlay')?.click()" });
      await new Promise(resolve => setTimeout(resolve, 30));
      const closingState = await call("Runtime.evaluate", {
        expression: `(() => ({
          pointerEvents: getComputedStyle(document.querySelector('.mobile-drawer-layer')).pointerEvents,
          bodyLocked: document.body.style.overflow === 'hidden'
        }))()`,
        returnByValue: true,
      });
      if (closingState.result.value.pointerEvents !== "none") throw new Error(`${width}px closing overlay still blocks the page.`);
      await new Promise(resolve => setTimeout(resolve, 260));
      const closedState = await call("Runtime.evaluate", {
        expression: "({ drawerMounted: Boolean(document.querySelector('.mobile-drawer-layer')), bodyLocked: document.body.style.overflow === 'hidden' })",
        returnByValue: true,
      });
      if (closedState.result.value.drawerMounted || closedState.result.value.bodyLocked) throw new Error(`${width}px drawer did not finish closing cleanly.`);
    } else {
      await call("Runtime.evaluate", { expression: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))" });
      await new Promise(resolve => setTimeout(resolve, 40));
      const closingMenu = await call("Runtime.evaluate", {
        expression: "(() => { const panel = document.querySelector('.mega-menu'); return { mounted: Boolean(panel), pointerEvents: panel ? getComputedStyle(panel).pointerEvents : null }; })()",
        returnByValue: true,
      });
      if (!closingMenu.result.value.mounted || closingMenu.result.value.pointerEvents !== "none") throw new Error(`${width}px mega-menu exit state is unsafe.`);
      await new Promise(resolve => setTimeout(resolve, 230));
      const menuUnmounted = await call("Runtime.evaluate", { expression: "!document.querySelector('.mega-menu')", returnByValue: true });
      if (!menuUnmounted.result.value) throw new Error(`${width}px mega-menu did not finish closing.`);
    }
    results.push({ width, ...metrics });
  }

  await writeFile(new URL("results.json", output), JSON.stringify({ fixture: "QA-only intercepted response", results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  socket?.close();
  vite.kill();
  chrome.kill();
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(browserProfile, { recursive: true, force: true }).catch(() => {});
}
