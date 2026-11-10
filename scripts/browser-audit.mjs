// Run after installing Playwright separately, or set PLAYWRIGHT_MODULE to its
// module file. A local Vite server is started and stopped by this script.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL(
  `../.qa/${process.env.QA_OUTPUT || "independent-audit"}/`,
  import.meta.url,
);
await mkdir(output, { recursive: true });
const port = process.env.QA_PORT || "5180",
  base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    port,
    "--strictPort",
  ],
  { cwd: root, stdio: "ignore" },
);
let browser;
const results = [],
  exceptions = [];
let auditPage;
async function check(name, fn) {
  if (process.env.QA_ONLY && !name.includes(process.env.QA_ONLY)) return;
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
    console.log("FAIL", name, e.message);
    if (auditPage) {
      await auditPage.screenshot({
        path: fileURLToPath(new URL(`failure-${results.length}.png`, output)),
        fullPage: true,
      });
      await writeFile(
        new URL(`failure-${results.length}.txt`, output),
        await auditPage.locator("body").innerText(),
      );
    }
  }
}
try {
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: process.env.BROWSER_EXECUTABLE
      ? [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--use-gl=disabled",
          "--disable-software-rasterizer",
        ]
      : [],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    const faults = localStorage.getItem("qa-transport-faults");
    if (faults) globalThis.__NARZISS_MOCK_FAULTS__ = JSON.parse(faults);
  });
  const page = await context.newPage();
  auditPage = page;
  page.setDefaultTimeout(6000);
  page.on("pageerror", (e) =>
    exceptions.push({ url: page.url(), error: e.message }),
  );
  const fault = async (value) =>
    page.evaluate((value) => {
      if (value) {
        globalThis.__NARZISS_MOCK_FAULTS__ = value;
        localStorage.setItem("qa-transport-faults", JSON.stringify(value));
      } else {
        delete globalThis.__NARZISS_MOCK_FAULTS__;
        localStorage.removeItem("qa-transport-faults");
      }
    }, value);
  const goto = async (route) => {
    await page.goto(base + route);
    await page.locator("main").waitFor();
    await page.waitForTimeout(100);
    await page.waitForFunction(
      () => !document.querySelector("main .animate-spin"),
      null,
      { timeout: 5000 },
    );
    await page.waitForTimeout(100);
  };
  await goto("/");
  const seeded = await page.evaluate(async () => {
    const { api } = await import("/src/services/api.js");
    const { products } = await import("/src/services/catalog.js");
    const user = await api.register({
      email: "audit@example.test",
      phone: "9876543210",
      otp: "123456",
    });
    localStorage.setItem("narziss-user", JSON.stringify(user));
    const variants = products
      .slice(1, 5)
      .map((p) => p.variants.find((v) => v.stock > 0));
    for (const v of variants) await api.add(v.id);
    const address = await api.saveAddress({
      name: "Audit Fixture",
      phone: "9876543210",
      line: "Fixture address",
      city: "Indore",
      state: "Madhya Pradesh",
      pin: "452001",
    });
    const cod = await api.placeOrder({
      lines: [{ variantId: variants[0].id, quantity: 1 }],
      address,
      method: "cod",
      checkoutKind: "buy",
      idempotencyKey: "fixture-cod",
    });
    await api.demoDeliver(cod.id);
    await api.review(
      products[1].id,
      5,
      "Fixture review for layout verification.",
    );
    const online = await api.placeOrder({
      lines: [{ variantId: variants[1].id, quantity: 1 }],
      address,
      method: "upi",
      checkoutKind: "buy",
      idempotencyKey: "fixture-online",
    });
    const checkout = {
      kind: "cart",
      idempotencyKey: "fixture-checkout",
      lines: variants.map((v) => ({ variantId: v.id, quantity: 1 })),
      address,
    };
    sessionStorage.setItem("narziss-checkout", JSON.stringify(checkout));
    return {
      cod: cod.id,
      online: online.id,
      checkout,
      user,
      slug: products[1].slug,
    };
  });
  const routes = [
    "/",
    "/shop",
    "/collections/formal",
    "/collections/casual",
    "/collections/trending",
    `/products/${seeded.slug}`,
    "/products/missing",
    "/collections/missing",
    "/cart",
    "/my-orders",
    "/checkout/address",
    "/checkout/payment",
    `/order-confirmation/${seeded.cod}`,
    `/payment-status/${seeded.online}`,
    "/not-a-route",
  ];
  for (const width of process.env.QA_FAST
    ? []
    : [320, 375, 767, 768, 1023, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes)
      await check(`layout ${width} ${route}`, async () => {
        await goto(route);
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          boundary: document.body.innerText.includes("Something went wrong"),
          h1: document.querySelector("main h1")?.textContent,
        }));
        assert.ok(
          metrics.overflow <= 1,
          `horizontal overflow ${metrics.overflow}px`,
        );
        assert.equal(metrics.boundary, false);
        assert.ok(metrics.h1, "missing route heading");
        if (route === "/shop") {
          const cards = await page
            .locator(".shop-strip-track > div")
            .evaluateAll((els) =>
              els.map((e) => {
                const r = e.getBoundingClientRect();
                return { w: r.width, h: r.height };
              }),
            );
          for (const c of cards)
            assert.ok(Math.abs(c.w - c.h) < 1, "shop frame is not square");
          if (width < 768) {
            const windowWidth = await page
              .locator(".shop-strip-window")
              .evaluate((e) => e.clientWidth);
            assert.ok(
              cards[0].w * 3 <= windowWidth + 1,
              "three mobile frames do not fit",
            );
            const y = await page
              .locator(".category-directory")
              .evaluate((e) => e.getBoundingClientRect().top);
            assert.ok(y < 700, `categories too far down: ${y}`);
          }
        }
        if (route.startsWith("/products/") && !route.endsWith("missing")) {
          const r = await page.locator(".detail-photo").boundingBox();
          assert.ok(
            Math.abs(r.width - r.height) < 1,
            "gallery frame is not square",
          );
          if (width >= 1024) {
            const form = await page.locator(".review-form").boundingBox(),
              reader = await page.locator(".review-list-column").boundingBox();
            assert.ok(
              Math.abs(form.height - reader.height) < 2,
              "review panels unequal",
            );
          }
        }
        if (route === "/cart" && width >= 768) {
          const a = await page.locator(".cart-products-panel").boundingBox(),
            b = await page.locator(".cart-billing").boundingBox();
          assert.ok(
            Math.abs(a.height - b.height) < 2,
            "cart/billing height mismatch",
          );
        }
        if (
          (width === 320 &&
            ["/shop", `/products/${seeded.slug}`, "/cart"].includes(route)) ||
          (width === 1440 && route === "/cart")
        )
          await page.screenshot({
            path: fileURLToPath(
              new URL(`${width}-${route.replaceAll("/", "_")}.png`, output),
            ),
            fullPage: route !== "/shop",
          });
      });
    console.log("Completed responsive width", width);
  }
  await check("gallery three manual controls", async () => {
    await goto(`/products/${seeded.slug}`);
    await page.getByRole("button", { name: "Show product image 3" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Show product image 3" })
        .getAttribute("aria-pressed"),
      "true",
    );
  });
  await check("review failure retry preserves page", async () => {
    await fault({ reviewPage: { type: "failed", delayMs: 1 } });
    await goto(`/products/${seeded.slug}`);
    await page.getByRole("button", { name: "Retry reviews" }).waitFor();
    assert.equal(
      await page.getByText("No reviews yet.", { exact: true }).count(),
      0,
    );
    await fault(null);
    await page.getByRole("button", { name: "Retry reviews" }).click();
    await page.locator(".review").waitFor();
  });
  await check("malformed review records recover", async () => {
    await fault({
      reviewPage: {
        type: "malformed",
        value: { items: [null], total: 1, averageRating: 5 },
        delayMs: 1,
      },
    });
    await goto(`/products/${seeded.slug}`);
    await page.getByRole("button", { name: "Retry reviews" }).waitFor();
    assert.equal(
      await page.getByText("Something went wrong", { exact: true }).count(),
      0,
    );
    await fault(null);
  });
  await check("recommendations failure retry", async () => {
    await fault({ recommendations: { type: "failed", delayMs: 1 } });
    await goto("/cart");
    await page.getByRole("button", { name: "Retry recommendations" }).click();
    await fault(null);
    await page.getByRole("button", { name: "Retry recommendations" }).click();
    await page.locator(".carousel .product-card").first().waitFor();
  });
  await check("malformed cart is retryable not empty", async () => {
    await fault({ cart: { type: "malformed", value: [null], delayMs: 1 } });
    await goto("/cart");
    await page.getByRole("button", { name: "Retry cart" }).waitFor();
    assert.equal(
      await page.getByText("Your cart is empty.", { exact: true }).count(),
      0,
    );
    await fault(null);
    await page.getByRole("button", { name: "Retry cart" }).click();
    await page.locator(".cart-line").first().waitFor();
  });
  await check("malformed orders do not crash", async () => {
    await fault({
      orders: {
        type: "malformed",
        value: [{ id: "bad", items: null }],
        delayMs: 1,
      },
    });
    await goto("/my-orders");
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(
      await page.getByText("Something went wrong", { exact: true }).count(),
      0,
    );
    await fault(null);
  });
  await check("malformed address renders retry", async () => {
    await fault({
      addresses: {
        type: "malformed",
        value: [{ id: "bad", name: { bad: true } }],
        delayMs: 1,
      },
    });
    await goto("/checkout/address");
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    await fault(null);
  });
  await check("COD success survives failed cart refresh", async () => {
    await goto("/checkout/payment");
    await page.getByRole("button", { name: "More Ways to Pay" }).click();
    await page.getByRole("radio").check();
    await fault({ cart: { type: "failed", delayMs: 1 } });
    const beforeCount = await page.evaluate(async () => {
      const { api } = await import("/src/services/api.js");
      return (await api.orders()).length;
    });
    await page
      .getByRole("button", { name: "Place Order", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await page.waitForURL("**/order-confirmation/*");
    await page
      .getByRole("heading", { name: "Thank You for Shopping with Narziss" })
      .waitFor();
    assert.equal(
      await page.evaluate(async () => {
        const { api } = await import("/src/services/api.js");
        return (await api.orders()).length;
      }),
      beforeCount + 1,
    );
    await fault(null);
  });
  await check("modal initial reverse tab remains trapped", async () => {
    await goto("/");
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() =>
        Boolean(document.activeElement.closest("[role=dialog]")),
      ),
      true,
    );
    assert.equal(await page.locator("#root").evaluate((e) => e.inert), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#root").evaluate((e) => e.inert), false);
  });
  await check(
    "dynamic reduced motion stops hero without blank slide",
    async () => {
      await goto("/");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(2300);
      const transform = await page
        .locator(".hero-track")
        .evaluate((e) => getComputedStyle(e).transform);
      assert.ok(
        transform === "matrix(1, 0, 0, 1, 0, 0)" || transform === "none",
        transform,
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
    },
  );
  await check("search keyboard result navigation", async () => {
    await goto("/");
    await page
      .getByRole("combobox", { name: "Search products and categories" })
      .fill("printed shirts");
    await page.locator("[role=option]").first().waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL("**/products/printed-shirts-*");
  });
  await check("filters combine and sorting remains ordered", async () => {
    await goto("/collections/casual");
    await page
      .getByRole("combobox", { name: "Wear type" })
      .selectOption("upper");
    await page
      .getByRole("combobox", { name: "Material", exact: true })
      .selectOption("cotton");
    await page
      .getByRole("combobox", { name: "Sort by price" })
      .selectOption("desc");
    await page.waitForTimeout(500);
    const prices = await page.locator(".product-grid .price").allTextContents();
    const values = prices.map((x) => Number(x.replace(/[^0-9.]/g, "")));
    assert.ok(values.length > 0);
    assert.deepEqual(
      values,
      [...values].sort((a, b) => b - a),
    );
  });
  await check("show more appends unique product cards", async () => {
    await goto("/collections/casual");
    const count = await page.locator(".product-grid .product-card").count();
    await page.getByRole("button", { name: "Show more products" }).click();
    await page.waitForTimeout(500);
    const links = await page
      .locator(".product-grid .product-photo")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    assert.ok(links.length > count);
    assert.equal(new Set(links).size, links.length);
  });
  await check(
    "Buy Now retains existing cart and selects one product",
    async () => {
      await goto(`/products/${seeded.slug}`);
      await page.getByRole("button", { name: "M", exact: true }).click();
      const before = await page.evaluate(async () => {
        const { api } = await import("/src/services/api.js");
        return await api.cart();
      });
      await page.getByRole("button", { name: "Buy Now", exact: true }).click();
      await page.waitForURL("**/checkout/address");
      const state = await page.evaluate(async () => {
        const { api } = await import("/src/services/api.js");
        return {
          checkout: JSON.parse(sessionStorage.getItem("narziss-checkout")),
          cart: await api.cart(),
        };
      });
      assert.equal(state.checkout.kind, "buy");
      assert.equal(state.checkout.lines.length, 1);
      assert.deepEqual(state.cart, before);
    },
  );
  await check(
    "older addresses remain selectable beyond recent two",
    async () => {
      await page.evaluate(async () => {
        const { api } = await import("/src/services/api.js");
        for (let n = 0; n < 2; n++)
          await api.saveAddress({
            name: `Fixture ${n}`,
            phone: "9876543210",
            line: "Fixture address",
            city: "Indore",
            state: "Madhya Pradesh",
            pin: "452001",
          });
      });
      await goto("/checkout/address");
      assert.equal(await page.locator(".address-card").count(), 2);
      await page.getByRole("button", { name: "Other saved addresses" }).click();
      assert.equal(await page.locator(".address-card").count(), 3);
    },
  );
  await check("review edit saves a single record", async () => {
    await goto(`/products/${seeded.slug}`);
    await page
      .getByLabel("Your review", { exact: true })
      .fill("Edited fixture review");
    await page.getByRole("button", { name: "Submit Review" }).click();
    await page.getByText("Edited fixture review", { exact: true }).waitFor();
    assert.equal(await page.locator(".review").count(), 1);
  });
  await check(
    "online pending failure retry and success preserve correct cart",
    async () => {
      await goto("/");
      await page.evaluate(async (checkout) => {
        const { api } = await import("/src/services/api.js");
        for (const line of checkout.lines) await api.add(line.variantId);
        sessionStorage.setItem(
          "narziss-checkout",
          JSON.stringify({
            ...checkout,
            idempotencyKey: "second-online-attempt",
          }),
        );
      }, seeded.checkout);
      const before = await page.evaluate(async () => {
        const { api } = await import("/src/services/api.js");
        return await api.cart();
      });
      await goto("/checkout/payment");
      await page.getByRole("button", { name: "Card", exact: true }).click();
      await page
        .getByLabel("Cardholder name", { exact: true })
        .fill("TEST USER");
      await page
        .getByLabel("Card number", { exact: true })
        .fill("4242 4242 4242 4242");
      await page.getByLabel("Expiry", { exact: true }).fill("12/34");
      await page.getByLabel("CVV", { exact: true }).fill("123");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.waitForURL("**/payment-status/*");
      await page
        .getByRole("heading", { name: "Payment Processing", exact: true })
        .waitFor();
      assert.deepEqual(
        await page.evaluate(async () => {
          const { api } = await import("/src/services/api.js");
          return await api.cart();
        }),
        before,
      );
      await page.getByRole("button", { name: "Demo: failure" }).click();
      await page
        .getByRole("heading", { name: "Payment Failed", exact: true })
        .waitFor();
      assert.deepEqual(
        await page.evaluate(async () => {
          const { api } = await import("/src/services/api.js");
          return await api.cart();
        }),
        before,
      );
      await page.getByRole("button", { name: "Retry Demo Payment" }).click();
      await page.getByRole("button", { name: "Demo: success" }).click();
      await page
        .getByRole("heading", { name: "Payment Successful", exact: true })
        .waitFor();
      const stored = await page.evaluate(() =>
        localStorage.getItem("narziss-demo-v1"),
      );
      assert.ok(!stored.includes("4242 4242") && !stored.includes("TEST USER"));
    },
  );
  await check(
    "login resumes Add to Cart and quantity caps at three",
    async () => {
      const anon = await browser.newContext({
          viewport: { width: 375, height: 812 },
        }),
        p = await anon.newPage();
      p.on("pageerror", (e) =>
        exceptions.push({ url: p.url(), error: e.message }),
      );
      await p.goto(base);
      await p.waitForTimeout(400);
      await p.evaluate(async () => {
        const { api } = await import("/src/services/api.js");
        await api.register({
          email: "resume@example.test",
          phone: "9876543212",
          otp: "123456",
        });
        api.logout();
      });
      await p.goto(base + `/products/${seeded.slug}`);
      await p.getByRole("button", { name: "M", exact: true }).click();
      await p.getByRole("button", { name: "Add to Cart", exact: true }).click();
      await p.getByLabel("Email", { exact: true }).fill("resume@example.test");
      await p
        .getByLabel("Password", { exact: true })
        .fill("dummy-only-password");
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Log in", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Increase quantity", exact: true })
        .waitFor();
      await p.waitForTimeout(350);
      assert.equal(await p.locator(".quantity span").textContent(), "1");
      for (let n = 0; n < 2; n++) {
        await p
          .getByRole("button", { name: "Increase quantity", exact: true })
          .click();
        await p.waitForTimeout(350);
      }
      assert.equal(await p.locator(".quantity span").textContent(), "3");
      assert.equal(
        await p
          .getByRole("button", { name: "Increase quantity", exact: true })
          .isDisabled(),
        true,
      );
      for (let n = 0; n < 3; n++) {
        await p
          .getByRole("button", { name: "Decrease quantity", exact: true })
          .click();
        await p.waitForTimeout(350);
      }
      await p
        .getByRole("button", { name: "Add to Cart", exact: true })
        .waitFor();
      await anon.close();
    },
  );
  await check(
    "square real image and broken-image fallback keep gallery geometry",
    async () => {
      await goto(`/products/${seeded.slug}`);
      const before = await page.locator(".detail-photo").boundingBox();
      await page.evaluate(async () => {
        const { products } = await import("/src/services/catalog.js");
        const p = products[1];
        p.images[1] =
          "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="teal"/></svg>',
          );
        p.images[2] = "/qa-intentionally-missing-image.png";
      });
      await page.getByRole("button", { name: "Show product image 2" }).click();
      await page.locator(".detail-photo img").waitFor();
      assert.equal(
        await page
          .locator(".detail-photo img")
          .evaluate((e) => getComputedStyle(e).objectFit),
        "contain",
      );
      await page.getByRole("button", { name: "Show product image 3" }).click();
      await page.locator(".detail-photo .image-placeholder").waitFor();
      const after = await page.locator(".detail-photo").boundingBox();
      assert.ok(
        Math.abs(before.height - after.height) < 1 &&
          Math.abs(before.width - after.width) < 1,
      );
    },
  );
  await check("short-screen dialog focus and scrolling", async () => {
    await page.setViewportSize({ width: 320, height: 400 });
    await goto("/");
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Terms & Conditions", exact: true })
      .click();
    const box = await page.getByRole("dialog").boundingBox();
    assert.ok(box.height <= 400 && box.y >= 0);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check("200 percent root text retains usable page width", async () => {
    for (const route of [
      "/shop",
      `/products/${seeded.slug}`,
      "/checkout/address",
    ]) {
      await goto(route);
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route,
      );
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    }
  });
  await check(
    "direct category hash scroll lands below sticky header",
    async () => {
      await goto("/shop#cargo");
      await page.waitForTimeout(500);
      const metrics = await page
        .locator("#cargo")
        .evaluate((e) => ({
          top: e.getBoundingClientRect().top,
          header: document.querySelector(".site-header").getBoundingClientRect()
            .bottom,
        }));
      assert.ok(
        metrics.top >= metrics.header - 1 && metrics.top < 400,
        JSON.stringify(metrics),
      );
    },
  );
  await check(
    "browser history and product refresh retain correct route",
    async () => {
      await goto(`/products/${seeded.slug}`);
      await page.locator(".product-info .description-toggle").click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Shop all clothing" }).click();
      await page.waitForURL("**/shop");
      await page.goBack();
      await page
        .getByRole("heading", { name: "Relaxed Acid Wash Tees 2", exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", { name: "Relaxed Acid Wash Tees 2", exact: true })
        .waitFor();
    },
  );
  await check("80 SPA transitions keep DOM resources bounded", async () => {
    await goto("/");
    const cdp = await context.newCDPSession(page),
      cycle = ["/", "/shop", "/collections/casual", `/products/${seeded.slug}`];
    const transition = async (route) => {
      await page.evaluate((route) => {
        history.pushState({}, "", route);
        dispatchEvent(new PopStateEvent("popstate"));
      }, route);
      await page.waitForTimeout(150);
      await page.waitForFunction(
        () => !document.querySelector("main .animate-spin"),
        null,
        { timeout: 5000 },
      );
    };
    for (let n = 0; n < 8; n++) await transition(cycle[n % 4]);
    await cdp.send("HeapProfiler.collectGarbage");
    const before = await cdp.send("Memory.getDOMCounters");
    for (let n = 0; n < 80; n++) await transition(cycle[n % 4]);
    await cdp.send("HeapProfiler.collectGarbage");
    const after = await cdp.send("Memory.getDOMCounters");
    await writeFile(
      new URL("navigation-resources.json", output),
      JSON.stringify({ before, after, transitions: 80 }, null, 2),
    );
    assert.ok(
      after.jsEventListeners <= before.jsEventListeners + 5,
      JSON.stringify({ before, after }),
    );
    assert.ok(
      after.nodes <= before.nodes + 20,
      JSON.stringify({ before, after }),
    );
  });
  await check("bundled fonts and readable placeholder contrast", async () => {
    await goto(`/products/${seeded.slug}`);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(
        () =>
          document.fonts.check("400 16px Inter") &&
          document.fonts.check('500 20px "Playfair Display"'),
      ),
      true,
    );
    const color = await page
      .locator(".image-placeholder span")
      .first()
      .evaluate((e) => getComputedStyle(e).color);
    assert.equal(color, "rgb(82, 107, 106)");
  });
  await check("cross-tab logout clears protected checkout", async () => {
    await goto("/checkout/address");
    const second = await context.newPage();
    await second.goto(base);
    await second.getByRole("button", { name: "Account", exact: true }).click();
    await second.getByRole("button", { name: "Log out", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("narziss-checkout")),
      null,
    );
    await page.keyboard.press("Escape");
    await page
      .getByText("Please log in to continue.", { exact: true })
      .waitFor();
    await second.close();
  });
  await check("no uncaught browser exceptions", async () =>
    assert.deepEqual(exceptions, []),
  );
} finally {
  await writeFile(
    new URL("results.json", output),
    JSON.stringify(
      { date: new Date().toISOString(), results, exceptions },
      null,
      2,
    ),
  );
  await browser?.close();
  server.kill();
}
const failures = results.filter((r) => !r.passed);
console.log(
  JSON.stringify(
    {
      passed: results.length - failures.length,
      failed: failures.length,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;

