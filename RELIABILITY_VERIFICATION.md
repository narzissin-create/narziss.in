# Narziss reliability candidate verification

Date: 2026-10-08

## Scope and design preservation

This folder was created separately from `Narziss-Restored`. The audited source was merged selectively at the code-hunk level; it was not overlaid wholesale.

The authoritative design files and assets remain byte-identical to `Narziss-Restored`, including:

- `src/styles.css`
- `src/config.js`
- `src/services/catalog.js`
- `public/assets/logo-narziss.png`
- all other files under `public/assets`
- `tailwind.config.js`
- `package-lock.json`

The successful home, shop, and product pages were also captured from an isolated copy of `Narziss-Restored` and from this candidate at 320, 768, and 1440 px. All nine corresponding PNG files were byte-for-byte identical. Evidence is in `.qa/appearance-comparison/`.

## Reliability changes merged

- Abortable stale requests, bounded request caching, pagination, and request deduplication.
- Cleanup for timers, listeners, observers, animation frames, and request work.
- Session-expiry guards, logout handling, and cross-tab session synchronization.
- Defensive storage reads/writes and authoritative server cart hydration.
- Nested response validation plus explicit error and retry states.
- Duplicate-submission protection and quantity enforcement.
- Checkout recovery, COD/online-payment state corrections, and partial-cancellation cart reconciliation.
- Modal focus trapping, runtime reduced-motion handling, and hash scrolling below the sticky header.
- Windows-safe Vite watcher exclusion for any `.qa` path segment.

## Verification results

- Regression tests: **28/28 passed** (`npm test`). This includes the 21 existing tests and 7 added audited reliability regressions.
- Production build: **passed** (`npm run build`), with 1,613 modules transformed.
- Browser checks: **146/147 passed**.
- Responsive route matrix: **120/120 passed** across 15 routes at 320, 375, 767, 768, 1023, 1024, 1280, and 1440 px.
- Repeated navigation: **passed** after 80 SPA transitions. Documents stayed 2 to 2, DOM nodes stayed 370 to 370, and JavaScript event listeners stayed 236 to 236 in that run.
- Browser exceptions: **none observed** by the test harness.
- Appearance comparison: **9/9 byte-identical screenshot pairs**, followed by visual inspection of representative desktop and mobile captures.

The sole browser-test failure is expected and intentionally visible: the audited placeholder-contrast assertion expects `rgb(82, 107, 106)`, while the preserved design CSS produces `rgb(8, 59, 58)`. The CSS and test were not changed to conceal this difference.

## Dependency and sensitive-data checks

- `npm audit --omit=dev`: **0 production dependency vulnerabilities reported**.
- Full `npm audit`: **7 development-only findings** (5 high, 2 moderate) in the Tailwind 3 toolchain. The available automated remediation is a major Tailwind upgrade and was not applied because it risks changing the design/build behavior.
- Static review found no console logging of credentials and no persistence of passwords, OTPs, or card details. Card input remains component state. Demo account, cart, order, review, and address data are still browser-storage data by design.

## Limits of this verification

These results verify the tested frontend behavior in the local test environment. They do not prove production security, backend correctness, payment-provider behavior, traffic capacity, compatibility with every browser/device, or zero memory leaks. The bounded repeated-navigation measurements are evidence for that test run only.

No deployment was performed. `Narziss-Restored` was not edited, renamed, or replaced.
