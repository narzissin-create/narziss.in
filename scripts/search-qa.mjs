import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const portSeed = Date.now() % 1000;
const port = 5600 + portSeed;
const debugPort = 10000 + portSeed;
const browserProfile = await mkdtemp(join(tmpdir(), "narziss-search-qa-"));
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

const waitFor = async (check, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for search QA state.");
};

let socket;
const pending = new Map();
let messageId = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const inspect = selector => `(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  const box = input?.closest('.search-box');
  const shell = box?.querySelector('.search-input-shell');
  const icon = shell?.querySelector('svg');
  if (!input || !box || !shell || !icon) return null;
  const shellStyle = getComputedStyle(shell);
  const inputStyle = getComputedStyle(input);
  const iconStyle = getComputedStyle(icon);
  const placeholderStyle = getComputedStyle(input, '::placeholder');
  const boxRect = box.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  const drawerTools = box.closest('.mobile-drawer-tools');
  const nearby = drawerTools?.querySelector('.mobile-tool-row') || document.querySelector('.desktop-navbar-right .nav-icons');
  const nearbyRect = nearby?.getBoundingClientRect();
  const overlap = nearbyRect
    ? (drawerTools
      ? Math.max(0, shellRect.bottom - nearbyRect.top)
      : Math.max(0, shellRect.right - nearbyRect.left))
    : 0;
  return {
    borderColor: shellStyle.borderColor,
    borderWidth: shellStyle.borderWidth,
    background: shellStyle.backgroundColor,
    iconColor: iconStyle.color,
    inputColor: inputStyle.color,
    placeholderColor: placeholderStyle.color,
    inputOutline: inputStyle.outlineStyle,
    transform: shellStyle.transform,
    boxShadow: shellStyle.boxShadow,
    keyboardFocus: box.classList.contains('keyboard-focus'),
    value: input.value,
    boxRect: { left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height },
    shellCenter: { x: shellRect.left + shellRect.width / 2, y: shellRect.top + shellRect.height / 2 },
    overlap,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok);
  const page = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    const pages = await response.json();
    return pages.find(value => value.type === "page" && !value.url.startsWith("chrome-extension://"));
  });
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) resolve();
    else {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }
  });
  socket.addEventListener("message", event => {
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
  for (const width of [375, 768, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await waitFor(async () => {
      const ready = await call("Runtime.evaluate", { expression: "Boolean(document.querySelector('.navbar'))", returnByValue: true });
      return ready.result.value;
    });

    const selector = width < 1024 ? "#mobile-search" : "#desktop-search";
    if (width < 1024) {
      await call("Runtime.evaluate", { expression: "document.querySelector('.mobile-menu-button')?.click()" });
      await waitFor(async () => {
        const ready = await call("Runtime.evaluate", { expression: "Boolean(document.querySelector('.mobile-drawer-layer.is-open'))", returnByValue: true });
        return ready.result.value;
      });
      await new Promise(resolve => setTimeout(resolve, 260));
    }
    const initial = await waitFor(async () => {
      const value = await call("Runtime.evaluate", { expression: inspect(selector), returnByValue: true });
      return value.result.value;
    });
    if (initial.borderWidth !== "1px" || initial.borderColor !== initial.inputColor || initial.inputColor !== initial.iconColor || initial.inputColor !== initial.placeholderColor) {
      throw new Error(`${width}px default search colors do not match: ${JSON.stringify(initial)}.`);
    }
    if (initial.overflow > 0) throw new Error(`${width}px default search causes horizontal overflow.`);

    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: initial.shellCenter.x, y: initial.shellCenter.y });
    await new Promise(resolve => setTimeout(resolve, 220));
    const hovered = (await call("Runtime.evaluate", { expression: inspect(selector), returnByValue: true })).result.value;
    if (width >= 768 && (hovered.transform === "none" || hovered.transform === "matrix(1, 0, 0, 1, 0, 0)")) throw new Error(`${width}px hover did not scale the search bar.`);

    if (width < 768) {
      await call("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})?.click()` });
    } else {
      await call("Input.dispatchMouseEvent", { type: "mousePressed", x: initial.shellCenter.x, y: initial.shellCenter.y, button: "left", clickCount: 1 });
      await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: initial.shellCenter.x, y: initial.shellCenter.y, button: "left", clickCount: 1 });
    }
    await new Promise(resolve => setTimeout(resolve, 40));
    const mouseFocused = (await call("Runtime.evaluate", { expression: inspect(selector), returnByValue: true })).result.value;
    if (mouseFocused.inputOutline !== "none" || mouseFocused.keyboardFocus || mouseFocused.boxShadow !== "none") {
      throw new Error(`${width}px mouse focus has an unwanted boundary: ${JSON.stringify(mouseFocused)}.`);
    }
    if (Math.abs(mouseFocused.boxRect.width - initial.boxRect.width) > 0.1 || Math.abs(mouseFocused.boxRect.height - initial.boxRect.height) > 0.1 || mouseFocused.overlap > 1 || mouseFocused.overflow > 0) {
      throw new Error(`${width}px search scaling shifted layout or overlapped controls: ${JSON.stringify(mouseFocused)}.`);
    }

    await call("Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setValue.call(input, 'N');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`,
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    const typed = (await call("Runtime.evaluate", { expression: inspect(selector), returnByValue: true })).result.value;
    if (typed.value !== "N" || typed.inputColor !== initial.inputColor) throw new Error(`${width}px typed search state is incorrect: ${JSON.stringify(typed)}.`);

    await call("Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        input.blur();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        input.focus();
      })()`,
    });
    await new Promise(resolve => setTimeout(resolve, 40));
    const keyboardFocused = (await call("Runtime.evaluate", { expression: inspect(selector), returnByValue: true })).result.value;
    if (!keyboardFocused.keyboardFocus || keyboardFocused.boxShadow === "none" || keyboardFocused.inputOutline !== "none") {
      throw new Error(`${width}px keyboard focus indicator is incorrect: ${JSON.stringify(keyboardFocused)}.`);
    }

    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await new Promise(resolve => setTimeout(resolve, 30));
    const reduced = (await call("Runtime.evaluate", { expression: inspect(selector), returnByValue: true })).result.value;
    if (reduced.transform !== "none" && reduced.transform !== "matrix(1, 0, 0, 1, 0, 0)") throw new Error(`${width}px reduced motion still scales search.`);
    results.push({ width, initial, hovered, mouseFocused, typed, keyboardFocused, reduced });
  }
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  socket?.close();
  vite.kill();
  chrome.kill();
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(browserProfile, { recursive: true, force: true }).catch(() => {});
}
