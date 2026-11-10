# Narziss React + Tailwind frontend

Runnable, local-only mock frontend based on the agreed Narziss requirements. Includes home, shop, shared collections, products, cart, address, payment, orders, COD confirmation, payment status, login/registration/description/size/terms dialogs. No AI integration and no real backend/payment/authentication.

## Run in VS Code

Install Node.js 20.19+ or a supported Node 22/24 release. Extract this folder, open it in VS Code, then:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Validate with `npm run build` and `npm test`.

## Demo flow

1. Register a demo email and Indian phone; enter matching passwords (minimum 8 characters).
2. Send OTP and use **123456**. Passwords are NOT stored or verified by the mock adapter. Login with the registered demo email accepts any form-valid password; this is intentionally not real authentication.
3. Pick a size and add products; maximum three per product/size, with stock caps.
4. Cart → address → COD → Place Order → confirmation.
5. My Orders offers a clearly labelled demo-only delivery action to test buyer review eligibility.
6. UPI/card show mock processing only; no payment or external app launch. The
   card preview accepts only `TEST USER`, `4242 4242 4242 4242`, `12/34`, and
   `123`; values remain in component memory and are never sent to the mock
   order service.

Cart checkout lines remain in the cart while an online payment is pending or
failed. The mock adapter removes purchased cart lines only after simulated
online-payment success or successful COD order creation. Buy Now checkout is
stored separately and never changes the existing cart.

## Editable configuration

`src/config.js`: announcement, logo, centrally configured Email/Instagram/WhatsApp display text and destinations, About/terms content, shipping/GST sample values, and campaign/category/banner image paths. Asset paths refer to files under `public/assets`. `logo.png` remains the editable source artwork and `logo-display.png` is its optimized display derivative; regenerate that derivative after replacing the source. Product fixtures and their three image slots are in `src/services/catalog.js`.

Products use square frames. Heroes use separate mobile/desktop image paths and cover fitting. Empty hero/logo/content slots are intentional. Google Sans 400/500 and Poppins 500 are self-hosted from the OFL-licensed Fontsource packages. See `THIRD_PARTY_NOTICES.md` and `LICENSES/SIL-OFL-1.1.txt`; Arial remains the fallback font.

Shipping and GST are development values **0** and **0%**, explicitly unconfirmed; this does NOT state free shipping or zero GST as business policy. Configure `pricesIncludeGst` correctly. Totals are in `services/logic.js`. The production service must return validated payable totals.

## Files

- `src/components`: shared layout, cards/carousels, controls, dialogs, filtering/recommendations.
- `src/pages`: complete route source files.
- `src/state/Store.jsx`: mock session/cart and modal coordination.
- `src/services/api.js`: replaceable mock service. Do not enable real operation by simply flipping config.mock; replacing the service is required.
- `src/services/logic.js`: quantity, totals and filtering pure functions.
- `src/services/pendingAction.js`: one-shot authenticated-action resumption.
- `tests/cart.test.js`: meaningful stock/quantity/tax/filter checks.
- `CODEX_PROMPT.md`: full specification and plan-first approval instruction for refinement in VS Code.
- `VERIFICATION.md`: latest reliability evidence, dependency review, and blocked real-integration checks.

The mock adapter includes a development/QA-only fault harness for deterministic
offline, slow, timeout, failed, malformed, and aborted-response checks. It is
not a production networking implementation. Automated tests use the exported
`setMockTransportFault`/`clearMockTransportFaults` helpers; local browser QA can
set `window.__NARZISS_MOCK_FAULTS__` before an SPA navigation.

## Before real launch

Replace mock auth, OTP, Google, cart, addresses, orders, reviews and payment adapters. Backend must enforce ownership/stock/pricing and idempotent order creation. Real card fields must be hosted by the chosen gateway. Confirm shipping, tax, cancellation/refund/delivery rules. Supply approved content and assets. Configure hosting SPA fallback for direct routes. Evaluate prerendering/SSR for product SEO. Run real-device, accessibility and end-to-end integration checks.

Current mock uses localStorage for demonstration account identifiers, cart, addresses, reviews and orders; sessionStorage for checkout. No password/OTP/card data persisted. This is not appropriate as production identity/order storage.

Order attempts include a client-generated mock idempotency key. Production
idempotency must be enforced by the backend and payment provider, not trusted
to browser storage.

## Performance and persistence boundaries

Catalogue reads in the mock adapter use a 50-entry, 30-second LRU-style cache;
product and variant identifiers use prebuilt indexes. Product grids request one
three-row page at a time and append only the new page. Review rendering is
automatically limited to 20 records per page. These safeguards keep the local
demo bounded, but they are not a substitute for server-side cursors, query
indexes, CDN/image resizing, or production monitoring.

The mock database serializes demo users, carts, addresses, orders, and reviews
to `localStorage`. It is synchronous, origin-specific, quota-limited, and can be
cleared by the browser. Checkout context is stored in tab-scoped
`sessionStorage`, so refresh and direct checkout navigation in the same tab can
recover it, but closing the tab may discard it. A production backend must own
durable cart/order/payment state and return authoritative recovery status.

Current configured product media slots are empty. Browser QA generates
temporary in-memory square product and campaign images to check proportions,
fallbacks, layout stability, and repeated gallery changes; those images are not
brand assets and are never written to `public`. The backend/CDN contract must
still provide dimensions and appropriately resized thumbnail/detail sources.
No browser profiling in this repository demonstrates traffic or hosting
scalability.

## Known implementation boundaries

This is a working mock frontend, not a finished backend-connected storefront. Payment processing/success/failure and retry are simulated; real payment and Google integrations await the agreed service contract. Recommendation order is deterministic sample selection. Final campaign/product/ad assets are not included. See CODEX_PROMPT for the complete target behaviour to refine with Codex.
