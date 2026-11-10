# Frontend/backend handoff

Agree the following operations; actual URLs and request schemas belong to the backend team:

| Operation           | Input                                                                        | Expected output                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Product list/search | category, collection, tab, type, material, colour, sort, query, cursor/limit | items, next cursor, total, stable IDs                                                                               |
| Product detail      | slug or product ID                                                           | name, category, collection memberships, square images, description, INR price, variants, stock, chart, rating/count |
| Trending            | cursor/limit                                                                 | backend-ranked bestselling products                                                                                 |
| Authentication      | relevant login/register/OTP fields                                           | user/session, errors, resend/expiry timings                                                                         |
| Google              | agreed OAuth flow                                                            | authenticated session                                                                                               |
| Cart                | variant ID + quantity; add/update/remove                                     | authoritative complete cart, count, prices                                                                          |
| Addresses           | validated fields/selection                                                   | saved addresses ordered by last selection, coverage result                                                          |
| Checkout quote      | cart or Buy Now items + address                                              | subtotal, shipping, GST treatment, payable total, eligibility                                                       |
| Create order        | quoted checkout, method, idempotency key                                     | order reference/payment initiation or COD confirmation                                                              |
| Payment status      | order/payment reference                                                      | pending/succeeded/failed and allowed next actions                                                                   |
| Orders              | authenticated user, pagination                                               | active + latest fully delivered order; arrival, cancellation eligibility                                            |
| Cancellation        | order/item ID                                                                | cancellation state and separate refund status                                                                       |
| Reviews             | product + rating/text                                                        | delivered-buyer eligibility, one editable review, public reviews/aggregate                                          |

Every operation needs example success and error responses. Error shape should distinguish field validation, unauthenticated/expired session, forbidden ownership, stale stock, missing resources and transient failures. Agree currency/minor-unit rounding and GST basis. Never trust frontend totals or identifiers for ownership. Confirm fully cancelled-order display policy later; current My Orders excludes them according to active/latest delivered scope.

For cart checkout, the backend must clear or convert purchased cart lines only
after COD order creation succeeds or an online payment is confirmed successful.
Pending and failed online payments retain the cart. Buy Now checkout remains
separate and never mutates the normal cart. Create/retry/status operations must
be idempotent under repeated clicks, refreshes and provider callbacks.

## Contract acceptance checklist

Before replacing the mock adapter, the backend/payment teams must provide and
the frontend team must fixture-test:

- Base URL/environment ownership, transport/auth mechanism, CORS/CSRF rules,
  session renewal/expiry semantics, logout invalidation, and clock-skew rules.
- One stable error envelope with machine-readable code, safe user message,
  optional field errors, retryability, correlation/request ID, and any
  authoritative replacement state after a conflict.
- Abort/cancellation expectations. Read responses arriving after cancellation
  must be ignored; mutations may still complete server-side and therefore need
  status lookup plus idempotency rather than client cancellation assumptions.
- Pagination cursor stability, maximum page sizes, search debounce/rate limits,
  sort/filter vocabulary, empty pages, deleted products, and ranking ownership.
- Product media objects with URL, intrinsic width/height, media type, ordering,
  thumbnail/detail variants, cache policy, and broken/expired URL behavior.
- Variant stock/version data and the stale-stock conflict response containing
  authoritative availability and allowed quantity. The server must revalidate
  every cart and checkout mutation.
- Cart versioning and merge semantics across tabs/devices, session expiry, and
  retries. The complete authoritative cart should be returned after mutation.
- Address validation, India-only coverage/PIN response, pagination/history,
  selection behavior, and how edits affect an in-progress quote.
- Checkout quote ID, expiry, line snapshots, INR minor-unit representation,
  included/additional GST, shipping, discounts if later approved, payable total,
  and the response when a quote expires or stock/price changes.
- Order-create idempotency key scope/retention and safe replay response. Specify
  how the client recovers after a timeout where creation may have succeeded.
- Payment initiation/status identifiers, allowed state transitions, polling or
  callback strategy, retry/change-method rules, terminal-state ownership, and
  exactly when cart quantities are cleared.
- Orders/cancellation/refund/review eligibility pagination and ownership rules,
  including partial cancellation and separate refund states.
- Representative success, empty, malformed-contract, unauthenticated,
  forbidden, not-found, validation, conflict, rate-limit, timeout, and server
  failure fixtures for every operation.

The frontend currently rejects malformed list/product/review data, cancels or
ignores stale reads, expires missing mock users, guards repeated submissions,
and preserves cart lines through pending/failed online payment. These are UI
behaviors demonstrated against mocks, not evidence that a future backend
enforces ownership, durability, stock, idempotency, or payment correctness.
