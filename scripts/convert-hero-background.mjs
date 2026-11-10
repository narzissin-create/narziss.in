import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const sourcePath = resolve(process.argv[2]);
const outputPath = resolve(process.argv[3]);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 15500 + (Date.now() % 400);
const profile = await mkdtemp(join(tmpdir(), "narziss-hero-convert-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--allow-file-access-from-files",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const waitFor = async (check, attempts = 120) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out while converting the hero background.");
};

let socket;
let messageId = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
  const id = ++messageId;
  pending.set(id, { resolve: resolveCall, reject: rejectCall });
  socket.send(JSON.stringify({ id, method, params }));
});

try {
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    return response.ok ? response.json() : null;
  });
  const page = pages.find((entry) => entry.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", rejectSocket, { once: true });
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
  await call("Page.navigate", { url: pathToFileURL(sourcePath).href });
  await waitFor(async () => {
    const state = await call("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('img')?.complete && document.querySelector('img')?.naturalWidth)",
      returnByValue: true,
    });
    return state.result.value;
  });

  const converted = await call("Runtime.evaluate", {
    expression: `(() => {
      const image = document.querySelector('img');
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        data: canvas.toDataURL('image/webp', 0.88)
      };
    })()`,
    returnByValue: true,
  });
  const { data, width, height } = converted.result.value;
  if (!data?.startsWith("data:image/webp;base64,")) throw new Error("Chrome could not encode the asset as WebP.");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(data.split(",")[1], "base64"));
  console.log(JSON.stringify({ outputPath, width, height }));
} finally {
  socket?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
