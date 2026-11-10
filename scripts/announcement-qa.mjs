import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const seed = Date.now() % 1000;
const port = 7600 + seed;
const debugPort = 12000 + seed;
const profile = await mkdtemp(join(tmpdir(), "narziss-announcement-qa-"));
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
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const waitFor = async (check, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for announcement QA state.");
};

let socket;
let messageId = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = await call("Runtime.evaluate", { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
};
const metrics = `(() => {
  const announcement = document.querySelector('.announcement');
  const marquee = announcement?.querySelector('.announcement-marquee');
  const track = announcement?.querySelector('.announcement-track');
  const items = [...(announcement?.querySelectorAll('.announcement-item') || [])];
  const animation = track?.getAnimations()[0];
  const start = parseFloat(track?.style.getPropertyValue('--announcement-start')) || 0;
  const end = parseFloat(track?.style.getPropertyValue('--announcement-end')) || 0;
  const duration = parseFloat(track?.style.getPropertyValue('--announcement-duration')) || 0;
  return {
    exists: Boolean(announcement),
    height: announcement?.getBoundingClientRect().height || 0,
    width: announcement?.clientWidth || 0,
    start,
    end,
    duration,
    speed: duration ? (start - end) / (duration * 0.92) : 0,
    copies: items.length,
    trackWidth: track?.scrollWidth || 0,
    itemWidths: items.map(item => item.getBoundingClientRect().width),
    duplicateTextMatches: items.every(item => item.textContent === announcement.getAttribute('aria-label')),
    marqueeAriaHidden: marquee?.getAttribute('aria-hidden'),
    focusablesInDuplicates: marquee?.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])').length || 0,
    mask: marquee ? (getComputedStyle(marquee).maskImage || getComputedStyle(marquee).webkitMaskImage) : 'none',
    animationName: track ? getComputedStyle(track).animationName : 'none',
    playState: animation?.playState || 'none',
    currentTime: Number(animation?.currentTime || 0),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    staticDisplay: getComputedStyle(announcement.querySelector('.announcement-static')).display,
    marqueeDisplay: marquee ? getComputedStyle(marquee).display : 'none',
    overflowX: getComputedStyle(announcement).overflowX,
    center: announcement ? {
      x: announcement.getBoundingClientRect().left + announcement.getBoundingClientRect().width / 2,
      y: announcement.getBoundingClientRect().top + announcement.getBoundingClientRect().height / 2,
    } : null,
  };
})()`;

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok);
  const page = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    const pages = await response.json();
    return pages.find(item => item.type === "page" && !item.url.startsWith("chrome-extension://"));
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
    await waitFor(async () => evaluate("Boolean(document.querySelector('.announcement-track')?.getAnimations().length)"));
    await evaluate("document.fonts?.ready");
    await new Promise(resolve => setTimeout(resolve, 150));
    const running = await evaluate(metrics);

    if (Math.abs(running.height - 28) > 0.5 || Math.abs(running.speed - 48) > 0.1) throw new Error(`${width}px height or speed changed: ${JSON.stringify(running)}.`);
    if (running.copies !== 1 || running.start < running.width || running.end > -running.trackWidth + 0.5) throw new Error(`${width}px announcement does not fully enter and exit as one copy.`);
    if (running.mask === "none" || running.animationName !== "announcement-marquee" || running.overflow > 0) throw new Error(`${width}px mask, animation, or page overflow failed.`);
    if (running.marqueeAriaHidden !== "true" || running.focusablesInDuplicates || !running.duplicateTextMatches) throw new Error(`${width}px duplicate accessibility failed.`);

    let pauseResume = { checked: false };
    if (width >= 768) {
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: running.center.x, y: running.center.y });
      await new Promise(resolve => setTimeout(resolve, 80));
      const hoverStart = await evaluate(metrics);
      await new Promise(resolve => setTimeout(resolve, 220));
      const hoverEnd = await evaluate(metrics);
      if (hoverEnd.playState !== "paused" || Math.abs(hoverEnd.currentTime - hoverStart.currentTime) > 5) throw new Error(`${width}px hover did not pause in place.`);
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: width / 2, y: 500 });
      await new Promise(resolve => setTimeout(resolve, 220));
      const resumed = await evaluate(metrics);
      if (resumed.playState !== "running" || resumed.currentTime <= hoverEnd.currentTime + 100) throw new Error(`${width}px hover did not resume from its paused position.`);
      pauseResume = { checked: true, hoverStart, hoverEnd, resumed };
    }

    await evaluate("document.querySelector('.announcement').focus()");
    await new Promise(resolve => setTimeout(resolve, 80));
    const focusStart = await evaluate(metrics);
    await new Promise(resolve => setTimeout(resolve, 180));
    const focusEnd = await evaluate(metrics);
    if (focusEnd.playState !== "paused" || Math.abs(focusEnd.currentTime - focusStart.currentTime) > 5) throw new Error(`${width}px keyboard focus did not pause in place.`);
    await evaluate("document.querySelector('.announcement').blur()");

    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await waitFor(async () => evaluate("Boolean(document.querySelector('.announcement'))"));
    const reduced = await evaluate(metrics);
    if (reduced.marqueeDisplay !== "none" || reduced.staticDisplay === "none" || Math.abs(reduced.height - 28) > 0.5 || reduced.overflowX === "hidden") {
      throw new Error(`${width}px reduced-motion announcement is not static and readable: ${JSON.stringify(reduced)}.`);
    }

    results.push({ width, running, pauseResume, focusStart, focusEnd, reduced });
  }

  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  socket?.close();
  vite.kill();
  chrome.kill();
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
