import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const candidateRoot = fileURLToPath(new URL("../", import.meta.url));
const baselineRoot = process.env.BASELINE_ROOT;
assert.ok(baselineRoot, "BASELINE_ROOT is required");

const output = new URL("../.qa/appearance-comparison/", import.meta.url);
await mkdir(output, { recursive: true });

function start(root, port) {
  return spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"],
    { cwd: root, stdio: "ignore" },
  );
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start: ${url}`);
}

const baselinePort = "5191";
const candidatePort = "5192";
const baselineServer = start(baselineRoot, baselinePort);
const candidateServer = start(candidateRoot, candidatePort);
let browser;

const cases = [
  { route: "/", width: 320, height: 700 },
  { route: "/shop", width: 320, height: 700 },
  { route: "/products/acid-wash-tees-2", width: 320, height: 700 },
  { route: "/", width: 768, height: 800 },
  { route: "/shop", width: 768, height: 800 },
  { route: "/products/acid-wash-tees-2", width: 768, height: 800 },
  { route: "/", width: 1440, height: 900 },
  { route: "/shop", width: 1440, height: 900 },
  { route: "/products/acid-wash-tees-2", width: 1440, height: 900 },
];

async function capture(base, label, testCase) {
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: testCase.height },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${base}${testCase.route}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const slug = testCase.route === "/" ? "home" : testCase.route.slice(1).replaceAll("/", "-");
  const path = fileURLToPath(new URL(`${label}-${testCase.width}-${slug}.png`, output));
  const bytes = await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await context.close();
  return bytes;
}

const results = [];
try {
  await Promise.all([
    waitForServer(`http://127.0.0.1:${baselinePort}`),
    waitForServer(`http://127.0.0.1:${candidatePort}`),
  ]);
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: process.env.BROWSER_EXECUTABLE ? ["--no-sandbox", "--disable-gpu"] : [],
  });
  for (const testCase of cases) {
    const baseline = await capture(`http://127.0.0.1:${baselinePort}`, "baseline", testCase);
    const candidate = await capture(`http://127.0.0.1:${candidatePort}`, "candidate", testCase);
    results.push({
      route: testCase.route,
      width: testCase.width,
      byteIdentical: baseline.equals(candidate),
      baselineBytes: baseline.length,
      candidateBytes: candidate.length,
    });
  }
  await writeFile(
    new URL("results.json", output),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => !result.byteIdentical)) process.exitCode = 1;
} finally {
  await browser?.close();
  baselineServer.kill();
  candidateServer.kill();
}
