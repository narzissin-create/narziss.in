# Pre-handoff verification

Date: 2026-10-08

This record covers the local mock frontend only. It does not certify a future
backend, payment provider, hosting environment, real device, or production
traffic capacity.

## Fixed

- Added deterministic mock-adapter faults for offline, slow, timeout, failed,
  malformed, and aborted operations. Reads remain cancellable and retryable;
  the harness is explicitly development/QA-only.
- Preserved search text and address form values across transient failures and
  ensured action/loading states settle after errors.
- Replaced the product page's small loading row with a geometry-matched loading
  layout that reserves the square gallery and detail column before data or
  images arrive.
- Added self-hosted Inter 400/500 and Playfair Display 500 Latin files through
  Fontsource 5.3.0. Vite bundles them locally with `font-display: swap` and no
  missing-font warnings.
- Added the font copyright notices and full SIL Open Font License 1.1 text.
- Expanded the backend handoff checklist for cancellation, stale responses,
  media dimensions, session expiry, stock conflicts, quote expiry, order
  idempotency, payment recovery, and representative error fixtures.

## Tested

- `npm test`: 21/21 passing. Coverage includes quantity/stock caps, cart merge,
  totals, filters, authentication action resumption, COD/online cart lifecycle,
  payment retry, order/review/cancellation ownership in the mock, storage
  corruption/quota handling, large catalogues, bounded review pages, transport
  failures, malformed data, retry, and aborted slow reads.
- `npm run build`: passing; 1,612 modules transformed. The output contains local
  Inter and Playfair Display font assets and no unresolved-font warning.
- `.qa/reliability-browser.mjs`: 70/70 passing in the dedicated Chrome CDP
  profile. This covers every route/direct refresh, Back/Forward, invalid IDs,
  logged-out and expired sessions, logout during checkout, filters/pagination,
  search, gallery/sizes/reviews, cart/recommendations, cross-tab changes,
  online/COD payment recovery, duplicate actions, corrupt/quota-limited storage,
  320-1440px layouts, 200% text, modal focus, reduced motion, sticky offsets,
  and uncaught exceptions.
- `.qa/network-images-accessibility.mjs`: 26/26 passing in Chrome. Offline,
  timeout, slow/cancelled, failed, and malformed reads settle to useful states;
  retry succeeds; search/address input is retained. Temporary generated images
  verify square `contain`, campaign `cover`, broken-image fallback, zero measured
  gallery-load CLS for the fixture, and stable DOM/listener counts after 90
  gallery changes. Generated images remain in browser memory and are not source
  assets.
- Chrome accessibility checks found accessible names for visible controls and
  35 interactive accessibility-tree nodes, exercised Tab order and dialog focus
  wrapping/Escape, and measured at least 4.5:1 for navbar icons/search/
  placeholder and primary/secondary buttons. Font loading and computed families
  were also verified.
- `.qa/performance-navigation.mjs`: 80 warmed SPA transitions. Documents, DOM
  nodes, JS listeners, window/document listeners, intervals, timeouts, animation
  frames, and ResizeObservers were unchanged. The second half retained about
  120 KB after forced garbage collection; this is a local browser profile, not
  a production load test.
- Responsive Chrome checks used CSS viewport widths 320, 375, 767, 768, 1023,
  1024, 1280, and 1440 with no page overflow in the audited routes.

## Dependency review

- `npm audit --omit=dev`: 0 vulnerabilities across production dependencies.
- Full `npm audit`: seven development-only findings (five high, two moderate)
  in the Tailwind 3 toolchain through `braces`, `chokidar`, `fast-glob`,
  `micromatch`, `postcss-nested`, and `postcss-selector-parser`.
- `npm audit fix --dry-run` proposed no compatible changes. npm's only offered
  remediation is Tailwind CSS 4.3.3, a semver-major migration.
- All direct dependencies are already at their currently allowed versions.
  Other available updates for Vite, its React plugin, and Lucide are also major
  versions and do not remediate this Tailwind chain.
- Tailwind 4 requires separate approval because it changes the PostCSS/build
  integration and CSS entry/configuration model, raises documented browser
  floors, and requires a complete visual/responsive/preflight regression pass.
  No forced audit fix or transitive major override was applied.

## Still blocked or unverified

- The production API does not exist yet. Real offline behavior, server timeouts,
  malformed payloads, session cookies/tokens, multi-device cart consistency,
  concurrent stock/price changes, server idempotency, ownership, persistence,
  and payment callbacks remain backend/integration responsibilities.
- Final product, campaign, collection, shop-strip, and ad images are not
  supplied. Generated QA images establish frontend geometry/fallback behavior,
  not real CDN transfer/decode performance or art-direction quality.
- Chrome was fully exercised. Microsoft Edge is installed, but its available
  headless invocation returned neither DOM nor screenshot output in this
  environment, so Edge rendering is not claimed. Firefox is not installed.
- No actual mobile device/soft keyboard or screen-reader application is
  available. Mobile viewports and the Chrome accessibility tree were tested,
  but TalkBack, VoiceOver, NVDA, JAWS, IME keyboards, touch hardware, and mobile
  browser chrome remain real-device acceptance work.
- Tailwind 4 migration awaits explicit approval and is not included in this
  handoff archive.
