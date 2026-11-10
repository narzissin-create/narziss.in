# Narziss frontend — paste this into Codex in VS Code

You are implementing the complete Narziss clothing-store frontend in React.js (JavaScript) and Tailwind CSS. I own UI/frontend; another teammate owns the backend/PRD, and a payment/security teammate owns payment integration. Build actual source files, not only snippets. Do not publish or deploy. AI integration is deferred.

## First response and permissions

Inspect the existing workspace and relevant AGENTS.md files read-only. Read Blueprint.pdf and the written requirements if attached. If the provided Narziss source ZIP is already extracted, inspect it and continue from it rather than replacing it blindly. Produce an implementation plan including routes, components, file changes, dependencies, unresolved integration points and validation. WAIT for my approval before creating/editing project files or installing dependencies. After approval, complete work within that scope. Ask again only for material scope changes. Explain changes and verification. Do not claim mocks are real production features.

The blueprint is a layout reference; its bright sketch colours are not the brand palette. Requirements below supersede older conflicting wording, prices and page counts. Preserve section order and column counts. Adapt positions responsively. Never invent business policies or final API endpoints.

## Deliverables and scope

Deliver runnable React + Tailwind source code for all pages/components, five required modals, assets placeholders, mock-first service adapter, configuration, setup README, API handoff documentation, and meaningful flow checks. Existing Vite projects should be retained; use Vite if creating a fresh project. Reuse one collection template with distinct routes. Avoid speculative libraries. Keep business logic and service calls out of presentation components. Keep state updates local where possible; split contexts if profiling shows unrelated components rerendering unnecessarily.

Source package provided with this prompt is a functioning mock implementation. Audit it against this full specification: some production service behaviours, precise blueprint alignment and additional QA may still need refinement. Preserve approved decisions.

## Routes

- `/`: homepage.
- `/shop`: full Shop by Categories page, not a drawer. Category bookmarks such as `/shop#acid-wash-tees`.
- `/collections/formal`, `/collections/casual`, `/collections/trending`: distinct URLs, same reusable collection layout.
- `/products/:slug`: reusable product-detail page.
- `/cart`: authenticated cart.
- `/checkout/address`: authenticated cart/Buy Now checkout address.
- `/checkout/payment`: authenticated payment selection.
- `/my-orders`: authenticated active orders plus latest fully delivered order.
- `/order-confirmation/:orderId`: COD Thank You; only after successful order creation.
- `/payment-status/:orderId`: UPI/card pending/success/failure UI, not COD Thank You.
- Unknown routes and unknown products: useful not-found views.

Required modals: login, registration (OTP verification stays within it), description, size chart, Terms & Conditions. Terms link replaces “User data is safe with us” in the homepage footer. No terms-acceptance checkbox. Dialogs must trap focus, restore focus, close via X/Escape, lock background scroll, fit small screens and mobile keyboards. Empty policy text stays empty until supplied.

## Brand and visual system

Narziss logo is not ready: reserve an EMPTY, unclickable centred image element; never substitute invented text/artwork for the logo.

Colours:

- Blue Coral `#083B3A`: primary, icons, links, important 1px borders.
- Cognac `#8A4E2A`: primary buttons, announcement, hover accents.
- White Sand `#E7E3DD`: page background.
- Anthracite `#1B1B1F`: headings/body.
- Sand Light `#F2EFEA`: cards and raised surfaces.
- Sand Dark `#CFC9BF`: soft 1px borders/dividers.

Approximate 60/30/10 usage: 60% Sand, 30% Coral/Anthracite, 10% Cognac. Primary buttons Cognac/Sand. Secondary buttons Coral outline, filled Coral/Sand on hover. Footer Coral/Sand. Never Cognac on dark backgrounds or Coral on Anthracite. Text on images uses Sand with dark gradient. Formal accents Anthracite, casual Coral, trending Cognac. Error messages can use accessible red despite otherwise restricted palette. Chic, restrained luxury: generous spacing, sharp/slightly rounded corners, thin borders, no heavy shadows/neon.

Fonts: Playfair Display weight 500 for headings/logo; Inter for body/UI. Use licensed/self-hosted fonts where available with swap/fallbacks; clearly document missing assets.

Breakpoints: mobile <768px; tablet 768–1023px; laptop >=1024px. Use rem/clamp appropriately without changing the intended hierarchy:

| Element                                 | Mobile | Tablet | Laptop |
| --------------------------------------- | ------ | ------ | ------ |
| Hero heading, if campaign copy supplied | 30px   | 40px   | 52px   |
| H1                                      | 26px   | 32px   | 38px   |
| H2                                      | 22px   | 26px   | 30px   |
| H3                                      | 18px   | 19px   | 20px   |
| Future logo text sizing reference       | 22px   | 24px   | 28px   |
| Product name                            | 14px   | 15px   | 15px   |
| Price, weight 500                       | 15px   | 16px   | 16px   |
| Button                                  | 13px   | 13px   | 14px   |
| Announcement                            | 12px   | 12px   | 13px   |
| Category label                          | 13px   | 13px   | 14px   |

Paragraphs 16px; inputs 16px to prevent iOS zoom; navbar/footer links 14px; captions/labels 13px; status badges 12px. Heading line-height 1.2, body 1.6, small text 1.4. Heading letter-spacing -0.01em. Buttons/small labels uppercase, weight 500, tracking .08em; ordinary body weight 400. Paragraph max width 60–70ch where appropriate. Minimum tap targets 44×44px.

Use a measured spacing system (e.g. multiples of 4/8px), equal grid tracks and gaps, centred max-width content. No arbitrary percentage heights for text sections. Never truncate full product names; allow wrapping and align price areas across rows. Four laptop product columns at narrow laptop widths, five only when minimum card width/gaps are preserved. No horizontal page overflow.

## Images and asset slots

All product photos are SQUARE. Frame aspect-ratio 1:1, image object-fit contain, no stretching. Other media also preserves proportions. Hero fills its frame using approved cropping and separate mobile/desktop assets when supplied; do not promise no cropping/no whitespace across arbitrary ratios simultaneously. Empty slots are intentional. Cards may have useful development fallback placeholders; leave logo/content blank as requested.

Create editable slots for: logo, three home campaign slides, formal/casual/trending collection images, collection heroes, three shop-carousel images, ads, product image arrays. Document exact places to replace them. Ad banner occupies 75% of content width on all devices, centred with margins; preserve image proportions. Ads are read-only, unclickable.

## Shared header/footer

When announcement is empty: no announcement bar; only navbar sticky. When populated: announcement AND navbar sticky together to the page end. Right-to-left announcement motion pauses on hover, supports keyboard/motion preferences. Compute combined header height to prevent overlaying content/bookmarks.

Navbar: hamburger left opens `/shop`; centred unclickable reserved logo with balanced space; right search, My Orders, Cart, account icons. Mobile search sits on the second navbar row below icons. Tablet/laptop horizontal. Cart always visible even logged out. Clicking cart/orders while logged out opens login and resumes navigation afterward. Keep controls usable at narrow tablet widths; seek approval if a necessary layout departure is found.

Footer: About, category bookmark links, contact, copyright, Terms & Conditions. Mobile About first, then categories/contact side by side. Contact fields empty until supplied; render mailto/tel only for real configured values. About text, announcement, contact and terms copy remain empty. Do not invent shipping/returns/privacy policies. Back-to-top must avoid controls/footer: homepage begins around ad section, collection around lower content, product around reviews, shop after category directory. Use a visible threshold tied to each section, not a universal arbitrary scroll count where exact behaviour matters.

## Homepage and collections

Homepage: optional announcement/header → three-slide hero → Formal/Casual/Trending category tiles → centred ad → footer. Category tiles: 2 visible mobile, 3 tablet, capacity 4 laptop for future categories; centre if fewer exist; arrows only when overflow. Image and label clickable. Hover scale 1.1 contained in image frame, never overlap label.

Homepage slide motion right-to-left every 2 seconds in a loop, with user pause controls, pause during interaction, reduced-motion support; robust wraparound without a distracting reverse jump.

Collection page: shared navbar, one hero image, title, All/Trending tabs, filters, products, Show More, ad, links to the other collections, footer. Product card image → full name → price. Selecting image/name opens product details. Initial 3 rows on every device: 2 columns mobile, 3 tablet, 4–5 laptop. Show More loads 3 additional rows, hides at end. Keep already-loaded content while waiting. Material/colour filters combine; wear type upper/bottom on collections. NO price-range filters. Only price sort Low to High / High to Low. Tabs preserve filters. Changing filters resets batches. Empty result gives Clear Filters.

Trending comes from backend bestselling-products ranking; frontend never guesses sales. Mock designation only in development. Products may belong to casual/formal and also be trending. All initial mock products are new; use backend isNew later.

## Shop by Categories

After navbar: spaced image strip, automatic two-second right-to-left loop, pause and reduced-motion support. 1 image mobile, 2 tablet, remaining images laptop. Then category link directory and category product sections.

Categories in this order:
1 Acid Wash Tees (upper)
2 Printed Shirts (upper)
3 Plain Shirts (upper)
4 Trousers (bottom)
5 Cargo (bottom)
6 Pants (bottom)
7 Bonkers Pants (bottom)
8 Japanese-Cut Pants (bottom)

Category links: 3 columns tablet/laptop; laptop initial capacity 5 rows. Mobile 2 columns, initial capacity 7 rows (14 links), then Show More Categories only if needed. Eight current categories create no empty dummy entries. Preserve row-major order, equal spacing and blueprint hierarchy. No Men/Women toggle until women's catalogue exists; structure data so it can be introduced later.

Bookmarks jump to respective section below sticky header. Each section owns independent All/New/Trending, material, colour and sort states. Upper materials cotton/lycra/polyester/linen/wool; bottom denim/cotton/wool/polyester/fleece. Colours violet/black/blue/green/yellow/orange/red/white. Each grid 2/3/4–5 columns and 3 initial rows, batches of 3 more rows.

## Product detail and sizes

Desktop: gallery left 50%, details right 50%. Tablet/mobile: centred square gallery, then details. Manual gallery navigation only; arrows only when >1 image. Name, actual rating/review count, INR price, sizes, size-chart link, Add to Cart and Buy Now, description trigger. Description and size chart use translucent modal backdrop with top-right X.

Available launch sizes upper M/L/XL; bottoms 28/30/32. Render type-appropriate selectors with unavailable sizes disabled/crossed. Backend variant data ultimately determines availability, not hardcoded assumptions. All sizes unavailable: “Out of Stock” on card/details; disable purchase. Some unavailable: disable only those sizes. Require selection with an inline message. Require login; resume intended action ONCE after successful authentication, clear pending action on cancel.

After adding selected size, Add to Cart area becomes minus/current quantity/plus. Min stored quantity 1; minus at 1 removes it and returns Add to Cart. Max 3 PER product-and-size, further capped by stock. Same product/same size merges; different size separate line. Buy Now uses chosen product and quantity only, leaves cart untouched. If already displaying quantity for selected variant, define and preserve the selected Buy Now quantity consistently.

Size chart: inches with centimetres in brackets. Provisional product-team confirmation required.
Upper columns Size/Chest/Shoulder/Length:
S: 36–38 (91–97), 17 (43), 27 (69)
M: 38–40 (97–102), 17.5 (44), 28 (71)
L: 40–42 (102–107), 18 (46), 29 (74)
XL: 42–44 (107–112), 18.5 (47), 30 (76)
XXL: 44–46 (112–117), 19 (48), 31 (79)
3XL: 46–48 (117–122), 19.5 (50), 32 (81)
Bottom columns Size/Waist/Hip/Inseam:
28: 28 (71), 35 (89), 30–32 (76–81)
30: 30 (76), 37 (94), 30–32 (76–81)
32: 32 (81), 39 (99), 31–33 (79–84)
34: 34 (86), 41 (104), 31–33 (79–84)
36: 36 (91), 43 (109), 31–33 (79–84)
38: 38 (97), 45 (114), 31–33 (79–84)
Future jogger/track/short charts, only if corresponding product data uses letter sizes:
S waist 28–30 (71–76), hip 36–38 (91–97)
M waist 30–32 (76–81), hip 38–40 (97–102)
L waist 32–34 (81–86), hip 40–42 (102–107)
XL waist 34–36 (86–91), hip 42–44 (107–112)
XXL waist 36–38 (91–97), hip 44–46 (112–117)

Reviews: writing and reading side by side desktop, stacked tablet/mobile. Roughly two reviews visible then internal scrolling; don't clip long content. Everyone reads. Only authenticated delivered-product buyers write. Required 1–5 rating + written review; one per user/product, editable. Updated rating/count derived from real review data. Then ad and Shop More carousel, 2/3/4–5 visible cards, user-controlled arrows, no duplicate products.

## Authentication UI

Login: email/password, Remember me, Google action, switch to WhatsApp OTP login, link to registration. Correct browser autofill: password manager remembers passwords; website never stores passwords/OTP. Remember me remembers session; optional remembered email/phone via consent.

OTP logs user directly in; label “Log in with OTP,” not misleading password reset. Phone linked to account; Send, Verify, invalid/expired code, resend countdown, service failure. Registration email/password/confirm/phone; verify phone OTP within same modal; valid email/Indian phone and matching password; inline red errors associated with relevant fields, duplicate-email error. No terms checkbox. Google button integration is deferred, not a fabricated URL flow.

Mock authentication explicitly labelled. Never claim fake verification authenticates real accounts. Pending Add/Buy/Cart navigation resumes exactly once; variant selection preserved.

## Cart/recommendations

Cart shared header (latest decision: keep cart icon visible). Desktop/tablet 50/50 cart products and summary, mobile stacked. Square image/name/size/unit price/quantity/remove. Internal list height ~3 standard rows tablet/laptop, ~2 mobile; short lists don't leave excessive blank height. Remove deletes entire variant line. Out-of-stock label in cart; block checkout until unavailable items removed, excessive quantities adjusted. Buttons reflect busy state and stock limit.

Summary: line quantities/prices, subtotal, shipping, GST (included versus additional clearly distinguished), total and total unit count. INR everywhere. Shipping/GST centrally configurable development values until PRD team supplies rules; mark sample totals. Avoid double tax; production backend returns final validated totals.

“You May Also Like” cart section shown only if cart nonempty. ALL additions regular now; NO ₹10/₹20 discounts anywhere. Exclude products already in cart across ALL sizes. Up to 10 eligible varied products, original prices, no duplicates or empty slots if fewer. Clicking opens product page then selects size; same cart. If stale recommendation matches existing variant, merge within cap. Hide section if cart empty. Carousel mobile 2/tablet 3/laptop 4–5; equal gaps.

## Address/payment/orders

India only, INR. Fields full name, Indian phone, address line, optional landmark, state/PIN side by side where feasible, city. Follow blueprint spacing. Show last 2 selected addresses; edit/add; do not silently delete older saved entries. Select valid address before continuing. Save and Proceed persists address; final Continue to Payment moves to payment. Shipping coverage/PIN availability depends on backend later.

Payment: address/payment/order step indicator, cancel back to cart, selected address, UPI accordion Paytm/PhonePe/BHIM, card accordion, More Ways COD. Real card fields must be gateway-hosted, never stored by app; reserve UI until integration. Selection alone never places an order. COD Place Order → validated created order → Thank You. UPI/card show processing/success/failure based on backend status, never Thank You. In development clearly demonstrate status without pretending to launch apps/charge money. Pending payment must not invite duplicate payment; failure retains context for retry/change method. Order submission protected against repeated clicks/idempotent service contract later.

My Orders: no navbar per blueprint; include a useful Home/Back navigation link. All active orders + most recent FULLY delivered order (all its items). Images/names/size/quantity/amount/arrival or delivered status. Individual and whole-order cancellation only when backend says eligible, never delivered. Cancellation state separate from refund status; don't promise automatic immediate refunds. 10 original-price recommendations, renamed You May Also Like, link to product page then same cart, 2/3/4 visible mobile/tablet/laptop. Keep amount/cancel spacing responsive.

Thank You: bordered centred thank-you message, order reference, Explore More outside box to homepage. Only accessible for confirmed COD order belonging to signed-in user.

## Performance, failures, responsive QA

Aim for fast meaningful rendering, not “zero renders.” Route code splitting, lazy below-fold images, high priority first hero, reserved dimensions, request deduplication/caching, debounced search and stale-response cancellation. Avoid fetching entire catalogue to filter/paginate once APIs exist. Profile before blanket memo/useCallback. Development mock latency permits spinner testing.

Spinners for route loading and button actions; skeleton product frames plus loading text for lists. Keep existing products while loading more, preserve spacing. Error shows explanation/Retry, not an endless spinner. Handle empty results/cart/orders/addresses/reviews, missing images, unavailable products, network failures, stale stock, session expiry, duplicate actions. Failed requests never silently change cart/order state.

Search names + categories, dropdown names/thumbnails/prices, click opens detail, no results message + Shop link, keyboard navigation, loading and error state. Do not use placeholder prices/content as approved business values.

Verify widths 320, 375, 767, 768, 1023, 1024, 1280, 1440; long names, large text, small viewport heights, modal keyboard behaviour, no page overflow, equal gaps, complete focus navigation, accessible labels, no animation when reduced motion. Verify direct links, browser Back, refresh and checkout recovery; invalid/foreign confirmation blocked. Test cart merge, different sizes, cap 3, stock cap, tax-inclusive/exclusive totals, login resume, review eligibility, filters+sort, recommendation exclusion, COD order creation and preserved Buy Now cart.

Provide unique useful titles/descriptions and semantic heading hierarchy; readable descriptive URLs. Don't promise rankings. Document SPA indexing limitations and a future prerender/SSR decision if brand requires stronger product SEO; do not silently replace React setup.

## Integration handoff

One replaceable API/service layer. Document endpoints needed WITHOUT declaring guessed endpoints final: list/search/detail/trending, auth+Google+OTP, cart CRUD, addresses, checkout quote/order create/payment status, orders/cancel/refunds, reviews. Teammate must provide request/response examples, auth strategy, errors and pagination/variants. Client state must separate normal cart from Buy Now checkout. Mock persistence only for demo data, never secrets. Backend is authority for ownership, inventory, price, charges, eligibility and payment success.

Finish with actual changed-file summary, setup steps, checks run/results, and explicit remaining integrations/assets. Do not describe untested functionality as verified. Never modify outside approved scope.
