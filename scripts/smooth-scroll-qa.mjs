import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const chromePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const portSeed = Date.now() % 1000;
const port = 6200 + portSeed;
const debugPort = 12000 + portSeed;
const browserProfile = await mkdtemp(join(tmpdir(), "narziss-scroll-qa-"));
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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (check, attempts = 120) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for smooth-scroll QA state.");
};

let socket;
let messageId = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression =>
  (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const wheel = deltaY => call("Input.dispatchMouseEvent", {
  type: "mouseWheel",
  x: 10,
  y: 100,
  deltaX: 0,
  deltaY,
});
const key = async keyName => {
  const virtualKey = keyName === "PageDown" ? 34 : undefined;
  const params = {
    key: keyName,
    code: keyName,
    windowsVirtualKeyCode: virtualKey,
    nativeVirtualKeyCode: virtualKey,
  };
  await call("Input.dispatchKeyEvent", { type: "keyDown", ...params });
  await call("Input.dispatchKeyEvent", { type: "keyUp", ...params });
};
const touchSwipeUp = async (x = 700) => {
  await call("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: 760, id: 0 }],
  });
  for (const y of [680, 600, 520, 440, 360, 280, 200]) {
    await call("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, id: 0 }],
    });
    await delay(20);
  }
  await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const touchSwipeLeft = async ({ x, y }) => {
  await call("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 0 }],
  });
  for (const nextX of [x - 40, x - 80, x - 120, x - 160, x - 200]) {
    await call("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: Math.max(20, nextX), y, id: 0 }],
    });
    await delay(20);
  }
  await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const navigate = async path => {
  await call("Page.navigate", { url: `http://127.0.0.1:${port}${path}` });
  await waitFor(() => evaluate("document.readyState === 'complete' && Boolean(document.querySelector('.site-header'))"));
  await delay(500);
};
const setViewport = async (width, reducedMotion = false, mobile = false) => {
  await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile });
  await call(
    "Emulation.setTouchEmulationEnabled",
    mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
  );
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
  });
};

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
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  await call("Page.enable");
  await call("Runtime.enable");

  await setViewport(1280);
  await navigate("/");
  const desktopInitial = await evaluate(`(() => {
    const sticky = document.querySelector('.sticky');
    const header = document.querySelector('.site-header');
    const hero = document.querySelector('.hero, .hero-carousel, [class*="hero"]');
    return {
      eligible: matchMedia(${JSON.stringify("(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)")}).matches,
      lenis: document.documentElement.classList.contains('lenis'),
      headerHeight: header.getBoundingClientRect().height,
      stickyTop: sticky.getBoundingClientRect().top,
      headerTransform: getComputedStyle(header).transform,
      heroTransform: hero ? getComputedStyle(hero).transform : 'none',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  if (!desktopInitial.eligible || !desktopInitial.lenis) throw new Error(`Desktop smoothing did not activate: ${JSON.stringify(desktopInitial)}`);
  if (desktopInitial.headerTransform !== "none" || desktopInitial.heroTransform !== "none" || desktopInitial.overflow > 0) {
    throw new Error(`Desktop layout was transformed or overflowed: ${JSON.stringify(desktopInitial)}`);
  }

  await wheel(700);
  await delay(35);
  const earlyWheelY = await evaluate("window.scrollY");
  await delay(450);
  const settledWheelY = await evaluate("window.scrollY");
  if (!(earlyWheelY > 0 && settledWheelY > earlyWheelY)) {
    throw new Error(`Mouse wheel was not smoothly progressive: ${earlyWheelY} -> ${settledWheelY}`);
  }
  const desktopScrolled = await evaluate(`(() => {
    const sticky = document.querySelector('.sticky');
    const header = document.querySelector('.site-header');
    return {
      headerHeight: header.getBoundingClientRect().height,
      stickyTop: sticky.getBoundingClientRect().top,
      headerTransform: getComputedStyle(header).transform,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  if (Math.abs(desktopScrolled.headerHeight - desktopInitial.headerHeight) > 0.1 || Math.abs(desktopScrolled.stickyTop) > 0.1 || desktopScrolled.headerTransform !== "none" || desktopScrolled.overflow > 0) {
    throw new Error(`Sticky header geometry changed while scrolling: ${JSON.stringify({ desktopInitial, desktopScrolled })}`);
  }

  await evaluate("window.scrollTo(0, 0)");
  await delay(120);
  await key("PageDown");
  await delay(120);
  const keyboardY = await evaluate("window.scrollY");
  if (keyboardY <= 0) throw new Error("Keyboard PageDown did not retain native vertical scrolling.");

  await evaluate("document.querySelector('.desktop-navbar-right button[aria-label=\"Log in\"]')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.modal')) && getComputedStyle(document.body).overflow === 'hidden'"));
  await delay(300);
  const lockedY = await evaluate("window.scrollY");
  await wheel(600);
  await delay(350);
  const lockedAfterWheelY = await evaluate("window.scrollY");
  if (Math.abs(lockedAfterWheelY - lockedY) > 1) throw new Error(`Modal did not lock background scrolling: ${lockedY} -> ${lockedAfterWheelY}`);
  await evaluate("document.querySelector('.modal-close')?.click()");
  await waitFor(() => evaluate("!document.querySelector('.modal') && getComputedStyle(document.body).overflow !== 'hidden'"));
  await wheel(300);
  await delay(350);
  const unlockedY = await evaluate("window.scrollY");
  if (unlockedY <= lockedAfterWheelY) throw new Error("Desktop scrolling did not resume after closing the modal.");

  await setViewport(768, false, true);
  await navigate("/");
  const tabletState = await evaluate("({ lenis: document.documentElement.classList.contains('lenis'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })");
  if (!tabletState.lenis || tabletState.overflow > 0) throw new Error(`Tablet Lenis did not activate cleanly: ${JSON.stringify(tabletState)}`);
  await touchSwipeUp();
  await delay(400);
  const touchY = await evaluate("window.scrollY");
  if (touchY <= 0) {
    const dimensions = await evaluate("({ scrollHeight: document.documentElement.scrollHeight, innerHeight })");
    throw new Error(`Emulated tablet touch scrolling did not move the page: ${JSON.stringify(dimensions)}`);
  }
  await evaluate("window.scrollTo(0, 0); document.querySelector('.mobile-menu-button')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.mobile-drawer-layer.is-open')) && getComputedStyle(document.body).overflow === 'hidden'"));
  const drawerLockedY = await evaluate("window.scrollY");
  await touchSwipeUp(740);
  await delay(250);
  const drawerLockedAfterY = await evaluate("window.scrollY");
  if (Math.abs(drawerLockedAfterY - drawerLockedY) > 1) throw new Error("Tablet drawer did not retain background scroll locking.");

  await setViewport(375, false, true);
  await navigate("/");
  const mobileState = await evaluate(`(() => {
    const header = document.querySelector('.site-header');
    return {
      lenis: document.documentElement.classList.contains('lenis'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerTransform: getComputedStyle(header).transform,
    };
  })()`);
  if (!mobileState.lenis || mobileState.overflow > 0 || mobileState.headerTransform !== "none") {
    throw new Error(`Mobile Lenis activation changed layout: ${JSON.stringify(mobileState)}`);
  }
  await touchSwipeUp(320);
  await delay(400);
  const mobileTouchY = await evaluate("window.scrollY");
  if (mobileTouchY <= 0) throw new Error("Mobile Lenis touch scrolling did not move the page.");

  await navigate("/shop");
  const horizontalControl = await evaluate(`(() => {
    const track = [...document.querySelectorAll('.carousel-track, .quick-cats-scroll, .shop-tags-strip, .shop-filter-bar')]
      .find(element => element.scrollWidth > element.clientWidth + 2);
    if (!track) return null;
    track.scrollIntoView({ block: 'center' });
    track.dataset.scrollQaTarget = 'true';
    const rect = track.getBoundingClientRect();
    return { x: Math.min(innerWidth - 20, rect.right - 20), y: rect.top + rect.height / 2, before: track.scrollLeft };
  })()`);
  if (!horizontalControl) throw new Error("No overflow horizontal control was available for touch verification.");
  await delay(150);
  await touchSwipeLeft(horizontalControl);
  await delay(300);
  const horizontalAfter = await evaluate("document.querySelector('[data-scroll-qa-target]')?.scrollLeft || 0");
  if (horizontalAfter <= horizontalControl.before) {
    throw new Error(`Horizontal touch control was blocked: ${horizontalControl.before} -> ${horizontalAfter}`);
  }

  await evaluate("document.activeElement?.blur(); window.scrollTo(0, 0)");
  await delay(180);
  await key("PageDown");
  await delay(180);
  const mobileKeyboardY = await evaluate("window.scrollY");
  if (mobileKeyboardY <= 0) throw new Error("Keyboard scrolling was blocked with touch Lenis active.");

  const pinchScaleBefore = await evaluate("visualViewport.scale");
  await call("Input.synthesizePinchGesture", {
    x: 180,
    y: 400,
    scaleFactor: 1.25,
    relativeSpeed: 800,
    gestureSourceType: "touch",
  });
  await delay(250);
  const pinchScaleAfter = await evaluate("visualViewport.scale");
  let pinchZoom = { before: pinchScaleBefore, after: pinchScaleAfter, emulationSupported: true };
  if (pinchScaleAfter <= pinchScaleBefore) {
    await setViewport(375, true, true);
    await navigate("/shop");
    const nativePinchBefore = await evaluate("visualViewport.scale");
    await call("Input.synthesizePinchGesture", {
      x: 180,
      y: 400,
      scaleFactor: 1.25,
      relativeSpeed: 800,
      gestureSourceType: "touch",
    });
    await delay(250);
    const nativePinchAfter = await evaluate("visualViewport.scale");
    if (nativePinchAfter > nativePinchBefore) {
      throw new Error(`Pinch zoom worked natively but was blocked by Lenis: ${pinchScaleBefore} -> ${pinchScaleAfter}`);
    }
    pinchZoom = {
      before: pinchScaleBefore,
      after: pinchScaleAfter,
      emulationSupported: false,
      nativeControl: { before: nativePinchBefore, after: nativePinchAfter },
    };
  }
  await call("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  await setViewport(375, false, true);
  await navigate("/shop");
  await evaluate("window.scrollTo(0, 0); document.querySelector('.mobile-menu-button')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.mobile-drawer-layer.is-open'))"));
  await evaluate("document.querySelector('#mobile-search')?.focus()");
  const mobileInput = await evaluate(`(() => {
    const input = document.querySelector('#mobile-search');
    const rect = input?.getBoundingClientRect();
    return {
      focused: document.activeElement === input,
      visible: Boolean(rect && rect.top >= 0 && rect.bottom <= visualViewport.height),
      bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
    };
  })()`);
  if (!mobileInput.focused || !mobileInput.visible || !mobileInput.bodyLocked) {
    throw new Error(`Mobile input or drawer lock regressed: ${JSON.stringify(mobileInput)}`);
  }

  const boundaryStates = {};
  for (const width of [1023, 1024]) {
    await setViewport(width, false, false);
    await navigate("/");
    boundaryStates[width] = await evaluate("document.documentElement.classList.contains('lenis')");
  }
  if (!boundaryStates[1023] || !boundaryStates[1024]) {
    throw new Error(`All-device activation is incorrect: ${JSON.stringify(boundaryStates)}`);
  }

  await setViewport(1280, true, false);
  await navigate("/");
  const reducedState = await evaluate("({ lenis: document.documentElement.classList.contains('lenis'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches })");
  if (!reducedState.reduced || reducedState.lenis) throw new Error(`Reduced-motion mode did not disable Lenis: ${JSON.stringify(reducedState)}`);

  console.log(JSON.stringify({
    passed: true,
    desktop: {
      mouseWheel: { earlyY: earlyWheelY, settledY: settledWheelY },
      keyboardPageDownY: keyboardY,
      modalLockY: lockedAfterWheelY,
      resumedY: unlockedY,
      stickyHeaderStable: true,
      transformedElements: false,
    },
    tablet: { lenisActive: true, touchScrollY: touchY, drawerLockY: drawerLockedAfterY },
    mobile: {
      lenisActive: true,
      touchScrollY: mobileTouchY,
      horizontalControlScrollLeft: horizontalAfter,
      keyboardScrollY: mobileKeyboardY,
      input: mobileInput,
      pinchZoom,
    },
    breakpoints: boundaryStates,
    reducedMotion: { lenisDisabled: true },
  }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  vite.kill();
  await delay(150);
  await rm(browserProfile, { recursive: true, force: true });
}
