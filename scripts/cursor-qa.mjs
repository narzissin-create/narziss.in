import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const seed = Date.now() % 1000;
const port = 6900 + seed;
const debugPort = 14000 + seed;
const profile = await mkdtemp(join(tmpdir(), "narziss-cursor-qa-"));
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
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
      const result = await check();
      if (result) return result;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for cursor QA state.");
};

let socket;
let id = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, { resolve, reject });
  socket.send(JSON.stringify({ id: messageId, method, params }));
});
const evaluate = async expression =>
  (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const move = async (x, y) => {
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await delay(100);
};
const cursorState = () => evaluate(`(() => {
  const cursor = document.querySelector('[data-narziss-cursor]');
  const ring = cursor?.querySelector('.narziss-custom-cursor-ring');
  return {
    exists: Boolean(cursor),
    active: document.documentElement.classList.contains('narziss-cursor-active'),
    visible: cursor?.classList.contains('is-visible') || false,
    editable: cursor?.classList.contains('is-over-editable') || false,
    interactive: cursor?.classList.contains('is-interactive') || false,
    color: cursor ? getComputedStyle(cursor).color : null,
    opacity: cursor ? getComputedStyle(cursor).opacity : null,
    ringTransform: ring ? getComputedStyle(ring).transform : null,
  };
})()`);
const navigate = async (path, width = 1280, mobile = false, reduced = false) => {
  await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile });
  await call("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  await call("Page.navigate", { url: `http://127.0.0.1:${port}${path}` });
  await waitFor(() => evaluate("document.readyState === 'complete' && Boolean(document.querySelector('.site-header'))"));
  await delay(400);
};

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok);
  const page = await waitFor(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
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
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  await call("Page.enable");
  await call("Runtime.enable");

  await navigate("/");
  await waitFor(() => evaluate("Boolean(document.querySelector('[data-narziss-cursor]'))"));
  await move(20, 20);
  const permanentInitial = await cursorState();
  if (!permanentInitial.exists || !permanentInitial.active || !permanentInitial.visible) {
    throw new Error(`Permanent cursor did not activate without parameters: ${JSON.stringify(permanentInitial)}`);
  }
  const swatches = await evaluate(`(() => {
    const board = document.createElement('div');
    board.id = 'cursor-qa-board';
    Object.assign(board.style, { position: 'fixed', inset: '0 0 auto 0', height: '240px', display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', zIndex: '2000000000' });
    const values = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#f4c2c2', '#35105c', 'linear-gradient(to right, #ffffff, #000000)'];
    values.forEach((value, index) => {
      const item = document.createElement('div');
      item.dataset.cursorQa = String(index);
      item.style.background = value;
      board.append(item);
    });
    const transparentBase = document.createElement('div');
    transparentBase.dataset.cursorQa = '8';
    Object.assign(transparentBase.style, { position: 'relative', background: '#000' });
    const transparentOverlay = document.createElement('div');
    Object.assign(transparentOverlay.style, { position: 'absolute', inset: '0', background: 'rgba(255, 255, 255, 0.2)' });
    transparentBase.append(transparentOverlay);
    board.append(transparentBase);
    document.body.append(board);
    return [...board.children].map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  })()`);
  const expected = ["rgb(49, 49, 49)", "rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgb(49, 49, 49)", "rgb(255, 255, 255)", "rgb(49, 49, 49)", "rgb(255, 255, 255)"];
  const detected = [];
  for (let index = 0; index < expected.length; index += 1) {
    await move(swatches[index].x, swatches[index].y);
    const state = await cursorState();
    detected.push(state.color);
    if (!state.active || !state.visible || state.color !== expected[index]) {
      throw new Error(`Color detection failed for swatch ${index}: ${JSON.stringify(state)}`);
    }
  }
  const gradientRect = await evaluate(`(() => {
    const rect = document.querySelector('[data-cursor-qa="7"]').getBoundingClientRect();
    return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
  })()`);
  await move(gradientRect.left + 5, gradientRect.y);
  const gradientLight = await cursorState();
  await move(gradientRect.right - 5, gradientRect.y);
  const gradientDark = await cursorState();
  if (gradientLight.color !== "rgb(49, 49, 49)" || gradientDark.color !== "rgb(255, 255, 255)") {
    throw new Error(`Gradient detection failed: ${JSON.stringify({ gradientLight, gradientDark })}`);
  }
  await move(swatches[8].x, swatches[8].y);
  const transparentLayer = await cursorState();
  if (transparentLayer.color !== "rgb(255, 255, 255)") {
    throw new Error(`Transparent-layer compositing failed: ${JSON.stringify(transparentLayer)}`);
  }

  const imageRect = await evaluate(`(async () => {
    document.querySelector('#cursor-qa-board').remove();
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 100;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000'; context.fillRect(0, 0, 100, 100);
    context.fillStyle = '#fff'; context.fillRect(100, 0, 100, 100);
    const image = new Image();
    image.id = 'cursor-qa-image';
    image.src = canvas.toDataURL();
    Object.assign(image.style, { position: 'fixed', left: '100px', top: '100px', width: '200px', height: '200px', objectFit: 'cover', objectPosition: '50% 50%', zIndex: '2000000000' });
    document.body.append(image);
    await image.decode();
    const rect = image.getBoundingClientRect();
    return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
  })()`);
  await move(imageRect.left + 30, imageRect.y);
  const imageDark = await cursorState();
  await move(imageRect.right - 30, imageRect.y);
  const imageLight = await cursorState();
  if (imageDark.color !== "rgb(255, 255, 255)" || imageLight.color !== "rgb(49, 49, 49)") {
    throw new Error(`Image/object-fit sampling failed: ${JSON.stringify({ imageDark, imageLight })}`);
  }

  const control = await evaluate(`(() => {
    document.querySelector('#cursor-qa-image').remove();
    const button = document.createElement('button');
    button.id = 'cursor-qa-button';
    button.textContent = 'QA button';
    Object.assign(button.style, { position: 'fixed', left: '100px', top: '100px', width: '160px', height: '60px', background: '#fff', color: '#000', zIndex: '2000000000' });
    document.body.append(button);
    const input = document.createElement('input');
    input.id = 'cursor-qa-input';
    Object.assign(input.style, { position: 'fixed', left: '300px', top: '100px', width: '180px', height: '60px', background: '#fff', zIndex: '2000000000' });
    document.body.append(input);
    const buttonRect = button.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return {
      button: { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2, width: buttonRect.width, height: buttonRect.height, transform: getComputedStyle(button).transform, background: getComputedStyle(button).backgroundColor },
      input: { x: inputRect.left + inputRect.width / 2, y: inputRect.top + inputRect.height / 2 },
    };
  })()`);
  await move(control.button.x, control.button.y);
  const buttonCursor = await cursorState();
  const buttonAfter = await evaluate(`(() => {
    const button = document.querySelector('#cursor-qa-button');
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height, transform: getComputedStyle(button).transform, background: getComputedStyle(button).backgroundColor };
  })()`);
  if (!buttonCursor.interactive || buttonCursor.ringTransform === "none" || JSON.stringify(buttonAfter) !== JSON.stringify({ width: control.button.width, height: control.button.height, transform: control.button.transform, background: control.button.background })) {
    throw new Error(`Clickable hover changed its target or did not enlarge only the ring: ${JSON.stringify({ buttonCursor, buttonAfter, before: control.button })}`);
  }
  await move(control.input.x, control.input.y);
  const inputCursor = await cursorState();
  const inputStyle = await evaluate("getComputedStyle(document.querySelector('#cursor-qa-input')).cursor");
  if (!inputCursor.editable || inputCursor.opacity !== "0" || inputStyle !== "text") {
    throw new Error(`Editable field did not retain its text cursor: ${JSON.stringify({ inputCursor, inputStyle })}`);
  }

  await evaluate(`(() => {
    document.querySelector('#cursor-qa-button').remove();
    document.querySelector('#cursor-qa-input').remove();
    const spacer = document.createElement('div');
    spacer.id = 'cursor-qa-scroll';
    Object.assign(spacer.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '2200px', zIndex: '2000000000', background: 'linear-gradient(to bottom, #fff 0%, #fff 45%, #000 55%, #000 100%)', pointerEvents: 'none' });
    document.body.append(spacer);
    document.body.style.minHeight = '2200px';
    window.scrollTo(0, 0);
  })()`);
  await move(600, 400);
  const beforeScroll = await cursorState();
  await evaluate("window.scrollTo(0, 1200)");
  await delay(180);
  const afterScroll = await cursorState();
  if (beforeScroll.color !== "rgb(49, 49, 49)" || afterScroll.color !== "rgb(255, 255, 255)") {
    throw new Error(`Stationary-pointer scroll contrast did not update: ${JSON.stringify({ beforeScroll, afterScroll })}`);
  }

  await evaluate(`(() => {
    document.querySelector('#cursor-qa-scroll').remove();
    document.body.style.minHeight = '';
    window.scrollTo(0, 0);
    const canvas = document.createElement('canvas');
    canvas.id = 'cursor-qa-unsupported';
    Object.assign(canvas.style, { position: 'fixed', left: '100px', top: '100px', width: '200px', height: '100px', background: '#fff', zIndex: '2000000000' });
    document.body.append(canvas);
  })()`);
  await move(150, 150);
  const unsupported = await cursorState();
  if (unsupported.active || unsupported.visible) throw new Error(`Unsupported sampling did not restore the native cursor: ${JSON.stringify(unsupported)}`);
  await evaluate("document.querySelector('#cursor-qa-unsupported').remove()");

  const trigger = await waitFor(() => evaluate(`(() => {
    const element = document.querySelector('.desktop-navigation .navbar-cat-link');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`));
  await move(trigger.x, trigger.y);
  await waitFor(() => evaluate("Boolean(document.querySelector('.mega-menu.is-open'))"));
  const menuPoint = await evaluate(`(() => {
    const rect = document.querySelector('.mega-menu.is-open').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + Math.min(40, rect.height / 2) };
  })()`);
  await move(menuPoint.x, menuPoint.y);
  const menuCursor = await cursorState();
  if (!menuCursor.active || !menuCursor.visible) throw new Error(`Cursor was not visible over the mega-menu: ${JSON.stringify(menuCursor)}`);

  await evaluate("document.querySelector('.desktop-navbar-right button[aria-label=\"Log in\"]')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.modal'))"));
  const modalPoint = await evaluate(`(() => {
    const rect = document.querySelector('.modal').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await move(modalPoint.x, modalPoint.y);
  const modalCursor = await cursorState();
  if (!modalCursor.active || !modalCursor.visible) throw new Error(`Cursor was not visible over a modal: ${JSON.stringify(modalCursor)}`);

  await navigate("/", 375, true, false);
  const touchState = await cursorState();
  if (!touchState.exists || touchState.active || touchState.visible) throw new Error(`Touch/coarse mode activated the custom cursor: ${JSON.stringify(touchState)}`);

  await navigate("/", 1280, false, true);
  await move(20, 20);
  const reducedState = await cursorState();
  if (!reducedState.exists || reducedState.active || reducedState.visible) throw new Error(`Reduced motion activated the custom cursor: ${JSON.stringify(reducedState)}`);

  console.log(JSON.stringify({
    passed: true,
    permanentWithoutParameters: true,
    detectedColors: detected,
    gradient: { light: gradientLight.color, dark: gradientDark.color },
    transparency: transparentLayer.color,
    image: { dark: imageDark.color, light: imageLight.color },
    clickableTargetUnchanged: true,
    editableNativeCursor: true,
    stationaryScrollRecheck: true,
    unsupportedFallback: true,
    menuAndModalVisibility: true,
    touchDisabled: true,
    reducedMotionDisabled: true,
  }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  vite.kill();
  await delay(150);
  await rm(profile, { recursive: true, force: true });
}
