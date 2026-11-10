# Narziss frontend requirements

This is the current authoritative requirements and correction record for the
Narziss React frontend. It consolidates the original requirements in
`CODEX_PROMPT.md` with all subsequently approved changes. If older wording
conflicts with this file, this file wins. Keep `CODEX_PROMPT.md` for its full
historical detail, QA matrix, and handoff context.

## Working rules

- Build and maintain actual React.js and Tailwind CSS source files. The project
  uses Vite and JavaScript.
- Do not publish or deploy unless the user explicitly requests it.
- Inspect the existing source before editing. Preserve functioning flows and
  unrelated user changes.
- Do not invent business policies, content, contact values, API URLs, assets,
  rankings, payment outcomes, or backend capabilities.
- Keep all incomplete authentication, payment, order, and data integrations
  clearly labelled as development mocks.
- Keep business logic and service calls out of presentation components. Use the
  replaceable adapter in `src/services/api.js`.
- Validate proportionately with automated tests, a production build, and
  available responsive/browser checks. Report anything not verified.
- Never store passwords, OTPs, or card-field values. Mock persistence may store
  demo identifiers and storefront state only.
- Do not use `npm audit fix --force`. Review advisories and obtain approval for
  semver-major dependency migrations.
- `.qa` contains local browser-verification artifacts. It is ignored by Git and
  Vite and must not be deleted unless the user approves deletion.

## Routes

- `/`: homepage.
- `/shop`: complete Shop by Categories page.
- `/shop#<category>`: sticky-header-aware category bookmarks.
- `/collections/formal`, `/collections/casual`, `/collections/trending`: one
  reusable collection layout at distinct URLs.
- `/products/:slug`: reusable product detail.
- `/cart`: authenticated cart.
- `/checkout/address`: authenticated address step for cart or Buy Now.
- `/checkout/payment`: authenticated payment selection.
- `/my-orders`: authenticated active orders plus the latest fully delivered
  order; no normal navbar on this page.
- `/order-confirmation/:orderId`: confirmed COD orders only.
- `/payment-status/:orderId`: UPI/card pending, success, and failure states.
- Unknown routes and unknown products must show useful not-found views.

Use route code splitting, useful loading/error states, direct-link recovery,
unique titles/descriptions, and browser Back/refresh-safe behavior. Document
the SPA indexing limitation and future prerender/SSR decision rather than
silently changing the React architecture.

## Brand and visual system

- Cream `#F5E6CC`: page background, light surfaces, and text/icons on green.
- Green `#2D4F1E`: navbar, footer, announcement, primary buttons, links,
  accessible focus indicators, and important borders.
- Charcoal `#313131`: headings, body copy, errors, and out-of-stock messages.
- Caramel `#C08552`: decorative accents only; it is not used for text, focus,
  control boundaries, or as the sole indicator of state because those pairings
  do not meet the required contrast.
- Success states use green. Error and out-of-stock states retain their explicit
  text and accessibility semantics while using charcoal.
- Keep the design restrained and luxurious: generous measured spacing, thin
  borders, square or slightly rounded corners, and no heavy shadows or neon.

Fonts remain Poppins 500 for headings and Google Sans 400/500 for body/UI,
self-hosted through the OFL-licensed Fontsource packages with `font-display:
swap`. Keep copyright notices and the complete SIL OFL 1.1 text in the source
archive. Preserve the responsive typography table and spacing hierarchy from
`CODEX_PROMPT.md`; inputs remain at least 16px and tap targets at least 44px.

Breakpoints:

- Mobile: below 768px.
- Tablet: 768–1023px.
- Laptop: 1024px and above.

Content must use centred max-width containers, equal grid tracks/gaps, wrapped
product names, aligned prices, no arbitrary text-section heights, and no page
horizontal overflow. Product grids are 2 columns mobile, 3 tablet, 4 at narrow
laptop widths, and 5 only where card width and gaps remain usable.

## Shared header, announcement, search, and footer

- The navbar background is Blue Coral. Navbar icons, search text, and search
  placeholder are White Sand. Search borders and focus states must retain clear
  contrast. Search result panels stay light with dark readable content.
- The announcement bar remains Cognac. Hide it entirely when announcement copy
  is empty. When present, announcement and navbar remain sticky together.
- Announcement movement is right-to-left, pauses for hover/keyboard
  interaction, and respects reduced motion.
- Compute the combined sticky height for content and bookmark offsets.
- Hamburger links to `/shop`.
- The centred reserved logo area is now clickable and links to `/`. Until an
  asset is supplied, keep it visually empty with the accessible label
  “Narziss home.” This supersedes the original unclickable-logo wording.
- Preserve the logo artwork's proportions and centre it against the full
  visible navbar. Target approximately 90–110px wide on mobile, 120–140px on
  tablet, and 150–170px on laptop while retaining comfortable vertical space.
  At very narrow mobile widths, the logo may occupy its own centred row above
  the controls to prevent overlap; keep the navbar compact and the search and
  icon controls usable at 320px.
- Right-side controls are search, My Orders, Cart, and account. Cart remains
  visible while logged out. Cart/orders request login and resume navigation
  once after successful authentication.
- Search names and categories with debounce, stale-request cancellation,
  loading/error/no-results states, thumbnails/prices, and keyboard navigation.
- Mobile search occupies the second navbar row; tablet/laptop search is inline.

Footer order and layout remain as specified: About first on mobile, then
categories/contact side by side; three columns on larger screens. Footer uses
Blue Coral and White Sand. It includes About, category bookmarks, Contact,
copyright, and Terms & Conditions.

Contact always has Email, Instagram, and WhatsApp rows. Display text and
destinations live centrally in `src/config.js`:

- Email destination must be `mailto:` and open the email application.
- Instagram must use the supplied profile URL and open in a new tab with
  `noopener noreferrer`.
- WhatsApp must use the supplied international number in a `https://wa.me/`
  URL and open in a new tab with `noopener noreferrer`.
- Do not reuse an account email as brand contact information.
- Actual contact values are still pending. Leave destinations/display text
  empty until the user supplies them.

Terms, About, announcement, and missing contact copy stay empty until supplied.
Back-to-top thresholds remain page-specific: homepage near the ad, collections
near lower content, product near reviews, and shop after the directory.

## Images, placeholders, and hover behavior

- Product photos and product frames are square, `object-fit: contain`, never
  stretched.
- Each product supports an ordered backend-compatible image array and currently
  reserves exactly three independently configurable photo slots.
- Product detail shows one square image at a time, manual previous/next arrows,
  and three position indicators. There is no product-gallery autoplay.
- Until product images are supplied, all three positions show reserved slots.
- Hero images use approved responsive assets and `cover` cropping. Empty logo
  and content slots remain intentionally empty.
- Maintain editable configuration slots for the logo, three campaign slides,
  collection tiles/heroes, three shop-strip images, ads, and product arrays.
- Ads are read-only, unclickable, centred at 75% content width, and preserve
  their proportions.

On hover-capable fine-pointer devices, and only when reduced motion is not
requested, apply a smooth `scale(1.1)` to the image layer inside fixed,
overflow-hidden square frames for:

- Shop by Occasion pictures.
- Product cards in collections.
- Shop by Categories product grids.
- Shop More.
- You May Also Like.

Apply the same effect to placeholder visuals. Never scale the card, name,
price, label, frame, gap, or neighbouring content. Reduced-motion users get no
hover transform.

## Homepage, collections, and Shop by Categories

Homepage order remains optional announcement/header, three-slide hero,
Formal/Casual/Trending occasion tiles, centred ad, footer. Hero movement loops
right-to-left every two seconds without a reverse jump, has user pause
controls, pauses during interaction, and respects reduced motion. Occasion
tiles show 2 mobile, 3 tablet, and capacity for 4 laptop, centred when fewer;
arrows appear only on overflow.

Collection pages use one template: header, collection hero/title, All/Trending
tabs, combined filters, products, Show More, ad, other-collection links,
footer. Material, colour, and wear-type filters combine; price sorting is only
low-to-high/high-to-low. There is no price range. Tabs preserve filters;
filter changes reset pagination. Initial load and each Show More batch represent
three rows at the current column count while retaining already loaded content.
Trending comes from backend bestseller ranking; the frontend never infers it.

Shop category order is fixed:

1. Acid Wash Tees
2. Printed Shirts
3. Plain Shirts
4. Trousers
5. Cargo
6. Pants
7. Bonkers Pants
8. Japanese-Cut Pants

The shop image strip loops right-to-left every two seconds, pauses during
interaction, and respects reduced motion. On mobile, all three top images are
visible side by side in three equal square columns sized within the available
content width. Frames use `aspect-ratio: 1 / 1`, equal gaps, and
`object-fit: contain` without stretching or cropping; compact mobile-only
margins keep the category directory close below. Tablet shows 2 images and
laptop shows the remaining images using their existing dimensions and behavior.
Tablet and laptop retain their square strip layout. Directory order is
row-major with 2 equal columns on mobile and 3 columns on tablet/laptop, with no
dummy entries. Mobile links retain at least 44px tap-target height and wrap
long labels without overlap or horizontal overflow. Mobile product grids also
remain 2 columns. Do not add a Men/Women toggle until
women’s catalogue data exists. Each category section owns independent
All/New/Trending, material, colour, sort, and pagination state.

## Product detail, sizes, reviews, and recommendations

Product detail is 50/50 gallery/details on laptop and stacked with a centred
gallery on tablet/mobile. Details include name, review-derived rating/count,
INR price, variants, size chart, Add to Cart, Buy Now, and description dialog.

All configured sizes remain visible. Unavailable sizes are disabled and crossed
out. Initial available launch sizes are M/L/XL for upper wear and 28/30/32 for
bottoms. Backend variant data is authoritative later. All unavailable shows
Out of Stock and disables purchase; partial unavailability disables only those
sizes. Missing selection produces an inline error.

Cart quantity is per product-and-size, minimum stored quantity 1 and maximum 3
or stock, whichever is lower. Minus at 1 removes the variant. Same variant
merges; different sizes remain separate. Buy Now uses the selected product and
the displayed selected-variant quantity, stores checkout separately, and never
changes the normal cart.

Keep the provisional upper and bottom size charts exactly as recorded in
`CODEX_PROMPT.md`; they remain subject to product-team confirmation. Only add
future jogger/track/short charts when corresponding data uses letter sizes.

Review form and customer reviews are always visible. Rating selector, comment
field, and Submit Review button remain visible but submission is enabled only
for authenticated customers with delivery of that product. Logged-out users
get “Log in to review”; signed-in ineligible users get a short explanation.
Everyone may read reviews. One review per user/product is editable and the
aggregate derives from real review data.

Review layout:

- Compact and centred.
- Laptop: Write a Review and Customer Reviews side by side with aligned headings
  and equal total heights. The writing form determines the row height; extra
  reviews scroll within the reading panel and never stretch either column.
- Tablet/mobile: stacked with a limited, internally scrollable reading panel.
- The empty “No reviews yet” state remains compact.

After reviews, retain the ad and Shop More carousel. Recommendations contain no
duplicates and exclude the current product. Product/recommendation carousels
show 2/3/4–5 cards as applicable and use manual arrows.

## Dialogs and authentication

Required dialogs are login, registration with inline OTP verification,
description, size chart, and Terms & Conditions. The account dialog is also
available after login. Dialogs trap focus, restore focus, close with X/Escape,
lock background scrolling, and fit short screens/mobile keyboards.

Account modal correction:

- Centre “Your account,” the email, and Log Out horizontally.
- Use equal 24px vertical gaps between heading/email and email/button.
- Remove interfering default margins, wrap long email addresses, and keep the
  close control.

Login supports email/password, Remember me, deferred Google integration, and
WhatsApp OTP login. OTP login is labelled “Log in with OTP,” sends/verifies in
the same dialog, reports invalid/expired/failure states, and has resend timing.
Registration validates email, Indian phone, matching password, duplicate
email/phone, and verifies OTP inside the same modal. Errors are inline and
field-associated. No terms checkbox.

The website never stores passwords/OTPs. Remember me controls session
persistence and may remember email/phone only with the same explicit consent.
Pending Add, Buy Now, Cart, or Orders actions resume exactly once after login;
cancelling authentication clears the pending action while preserving selected
variant UI state.

## Cart and recommendations

Cart lines show square image, complete name, size, unit price, quantity,
remove, and stock problems. Remove deletes the whole variant. Checkout is
blocked for unavailable/excess quantities. Summary shows item quantities and
prices, subtotal, shipping, GST treatment, total, and unit count in INR.
Shipping/GST values remain clearly marked unconfirmed development values until
the backend supplies authoritative totals.

Cart layout correction supersedes earlier fixed-row wording:

- Tablet/laptop: 50/50 products and billing with equal gaps. The product panel
  exactly matches the adjacent billing column’s full height, including its
  Proceed to Buy button. Extra product rows scroll inside the product panel and
  do not stretch the billing column.
- Mobile: stack products above billing; show approximately two product rows
  before internal product scrolling.

You May Also Like appears only for a nonempty cart, uses original prices, has
up to 10 unique varied products, excludes products already in the cart across
all sizes, and leaves no dummy slots. Additions have no ₹10/₹20 discounts.

## Address, payment, confirmation, and orders

India/INR only. Address fields are full name, Indian phone, address line,
optional landmark, state/PIN where feasible side by side, and city. Show the
last two selected addresses, allow add/edit/select, and never silently delete
older stored entries. Require a valid selection. Save and Proceed persists the
address; Continue to Payment moves to payment. Backend later owns coverage and
PIN validation.

Payment retains the Address/Payment/Confirm indicator, cart cancel link,
selected address, UPI accordion (Paytm/PhonePe/BHIM), Card accordion, and More
Ways to Pay. Merely opening/selecting a payment method never places an order.

Card mock preview:

- Show visible labelled fields for cardholder name, card number, expiry, and
  CVV, followed by Continue.
- Accept only documented dummy values: `TEST USER`,
  `4242 4242 4242 4242`, `12/34`, and `123`.
- Clearly state that only dummy details are allowed.
- Keep values only in component memory; never persist, log, or send them to the
  mock order service.
- Real integration must replace them with gateway-hosted fields.

COD correction:

- More Ways to Pay contains a clearly selectable Cash on Delivery radio option.
- Selecting COD never creates an order.
- Place Order is disabled until COD is selected.
- Successful validated creation happens once using an idempotency key, then and
  only then navigates to the COD Thank You page.
- Show inline errors/loading and prevent repeated submissions.

Cart payment lifecycle:

- Pending or failed online payments retain cart items.
- Purchased cart quantities are removed only after confirmed online-payment
  success or successful COD order creation.
- Buy Now never mutates the normal cart.
- Pending payment discourages duplicate attempts; failure retains context for
  retry or method change. UPI/card never show the COD Thank You screen.

My Orders shows all active orders and the most recent fully delivered order
with all its items. Include Home/Back navigation instead of the normal navbar.
Cancellation is available only when backend/mock eligibility says so and never
for delivered items. Item/order cancellation state remains separate from
refund status and does not promise immediate refunds. Recommendations use the
same cart and retain original prices.

COD confirmation is accessible only for a confirmed COD order belonging to the
signed-in user and includes the order reference plus Explore More outside the
message box. Online status pages support pending/success/failure without a COD
Thank You state.

## Loading, failures, accessibility, and performance

- Use route spinners, action busy states, list skeletons/loading text, and
  explanations with Retry for errors.
- Retain already loaded products while loading more.
- Handle empty catalogue/filter/cart/order/address/review results, image
  failures, unavailable/stale stock, expired sessions, network failures, and
  duplicate actions without silent state mutation.
- Debounce search and cancel stale requests. Avoid fetching the entire catalogue
  for production filtering/pagination/recommendations.
- Catalogue Show More requests append only the next three-row page rather than
  refetching prior pages. Mock catalogue caching stays bounded; identifier
  lookup uses prebuilt indexes; review records load in bounded pages while
  aggregate rating/count remain authoritative service results.
- Reserve media dimensions, lazy-load below-fold images, prioritize the first
  hero, cache/deduplicate requests where appropriate, and profile before blanket
  memoization.
- Verify semantic headings, accessible labels/errors/status, full keyboard
  navigation, focus traps/restoration, reduced motion, long names/emails, large
  text, small heights, and no horizontal overflow.
- Responsive acceptance widths remain 320, 375, 767, 768, 1023, 1024, 1280,
  and 1440px.
- Browser storage access is fallible. Corrupt, blocked, quota-limited, or
  outdated demo records must be rejected/sanitised without crashing. A failed
  write must not navigate or silently mutate cart/order state.
- A restored demo session is valid only while its user still exists in the
  mock database. Expiry or cross-tab logout clears checkout recovery and
  returns protected routes to login. Cross-tab demo-database changes refresh
  the visible cart.
- Async route/list/search/review/order reads must cancel or ignore stale work
  after navigation. Timers, animation frames, listeners, and observers must be
  removed on cleanup. Same-tick repeated mutations and Show More requests need
  synchronous guards in addition to disabled UI states.
- Service responses and product-card records must be shape-checked. Invalid
  records show a useful retry/unavailable state; global render failures fall
  back to a page recovery boundary instead of leaving a blank screen.
- Catalogue batch sizing must use the same CSS media-query breakpoints as the
  rendered grid so scrollbars do not incorrectly turn the 1024px four-column
  layout into a three-column request.
- Mock catalogue caches stay bounded and Show More lists cannot append duplicate
  product IDs. This does not establish backend or hosting traffic scalability.
- The mock service adapter exposes a development/QA-only fault harness for
  offline, slow, timeout, failed, malformed, and aborted requests. UI checks
  must demonstrate terminal error/retry states, cancellation of stale reads,
  and preservation of entered form/search data. This harness is not a
  production transport implementation.
- Product-detail loading reserves the square gallery and desktop column layout
  before data/images arrive to avoid image-driven layout movement.
- Representative image QA uses generated in-memory assets only. Never commit
  these temporary pictures as final product, campaign, collection, or ad art.

## Services and backend handoff

The frontend uses one replaceable service layer. Production contracts remain
unresolved and must not be guessed. The backend/payment teams must supply
request/response examples, authentication strategy, errors, pagination and
variant shapes for product list/search/detail/trending, auth/Google/OTP, cart,
addresses, checkout quote, order creation, payment status, orders,
cancellation/refunds, and reviews.

Backend authority includes identity/ownership, inventory, price, tax/shipping,
payment success, cancellation/review eligibility, rankings, and final totals.
Normal cart and Buy Now checkout state remain separate. Idempotency must be
enforced server-side for creation, retries, repeated clicks, refreshes, and
payment callbacks.

## Current unresolved inputs and integrations

- Approved logo, campaign, collection, shop-strip, ad, and product imagery.
- Announcement, About, Terms, and final brand copy.
- Email display/address, Instagram display/profile URL, and WhatsApp
  display/international number.
- Final shipping/GST rules and size-chart confirmation.
- Real backend endpoints/contracts, session strategy, Google login, OTP
  provider, payment gateway, and webhook/status behavior.
- Real-device accessibility and mobile-keyboard acceptance testing.
- Tailwind CSS 4 migration remains a separate approval item. Tailwind 3.4.19
  has no compatible audit remediation for its seven development-tooling
  advisories; do not force the semver-major upgrade without a full CSS/build/
  browser regression scope.
