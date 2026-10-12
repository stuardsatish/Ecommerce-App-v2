# React → React Native Migration: Analysis & Phased Plan

**Source app:** `Ecommerce-sept-1-2026/Ecommerce-sept-1-2026` (React 19 + Vite + React Router 7 + Redux Toolkit + Supabase)
**Target app:** `Ecommerce-app` (Expo + Expo Router + NativeWind + Supabase) — **currently empty, nothing has been implemented**
**Scope:** USER-facing mobile app only. Admin is fully out of scope and untouched.
**Status:** Phases 1–6, 8 complete (Phase 7 removed per direction) — see each phase's entry in §14 for what was actually built.

**Language decision (2026-09-01, overrides §14's original TypeScript-first framing below):** the RN app is being built in **plain JavaScript, not TypeScript**, per explicit direction. Everywhere below (§11's route tree, §13's folder structure, and each phase's "Creates/Modifies" file lists) that shows a `.ts`/`.tsx` extension for a file inside `Ecommerce-app`, read it as `.js`/`.jsx` — this was written before the language decision and hasn't been mechanically rewritten throughout to avoid accidentally touching the unrelated `.ts` references to the *source* app's Supabase Edge Functions (`supabase/functions/_shared/*.ts`, which are Deno/TypeScript and are untouched by this decision — they're server-side code in the existing backend, not part of the RN client). Path aliasing (`@/*` → `./src/*`) is configured via `jsconfig.json` instead of `tsconfig.json`, verified working through Metro's bundler, not just assumed.

---

## 1. Stack Summary (existing app)

- React 19.2, Vite 7, React Router DOM 7 (`BrowserRouter`, all routes lazy-loaded)
- Redux Toolkit (`@reduxjs/toolkit` 2.11) — global state
- Supabase JS 2.112 — Postgres, Auth, Storage, Realtime, Edge Functions (Deno)
- Tailwind CSS v4 (CSS-first `@theme` config in `src/index.css`; `tailwind.config.js` is largely vestigial/legacy)
- MUI, GSAP + `@gsap/react`, `@studio-freight/lenis`, Swiper, Razorpay Checkout.js, jsPDF, PapaParse, xlsx, Recharts
- No `.env` file in repo; two env vars used (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), both client-safe
- No local SQL schema — `supabase/` only contains Edge Functions + `config.toml`; RLS policies and RPCs (`create_order_tx`, `rate_limit_check`) live only on the hosted project (see §9, Unclear Item 5)

---

## 2. USER / ADMIN / SHARED Inventory

### Routing (from `src/App.jsx`)

Guards: `UserRoute` (redirect to `/login` if not authenticated — **does not check role**), `AdminRoute` (redirect if not authenticated or `role !== "admin"`). An unused, more advanced `ProtectedRoute.jsx` (generic `allowedRoles`) exists in the tree but is dead code.

| Path | Component | Guard | Classification |
|---|---|---|---|
| `/login`, `/signup`, `/reset-password` | LoginPage, SignupPage, ResetPasswordPage | public | **SHARED** (public entry, role-branches after login) |
| `/` | LandingPage | public | **USER** |
| `/process-details` | ProcessDetailsPage | public | **USER** (marketing only) |
| `/products`, `/product/:id` | ProductsPage, ProductDetail | public | **USER** |
| `/cart`, `/wishlist`, `/userorders`, `/userpastorders`, `/order/:id`, `/myprofile`, `/video` | CartPage, WishlistPage, UserOrdersPage, UserPastOrdersPage, OrderDetailPage, MyProfile, ScrollSequence | UserRoute | **USER** |
| `/services` | ServicesPage | UserRoute | **USER (empty stub — see Unclear Item 2)** |
| `/admin/*` (11 routes: users, add-product, edit-product/:id, allUsersOrdersAnalytics, allProductsOrdersAnalytics, adminUploadOrders, myorders, add-discount, createOrders, billing, optimization) | UsersPage, AddProductPage, EditProductPage, AllUsersOrdersAnalytics, AllProductsOrdersAnalytics, AdminUploadOrders, AdminOrdersPage, AddDiscountPage, CreateOrdersPage, BillingPage, Optimization | AdminRoute | **ADMIN — excluded entirely** |

**Dead/orphaned (not part of any live route):** `src/pages/Demo/*` (never imported), `ContactPage` (imported but never routed — a `/contact` link in `MobileNav` 404s live). See Unclear Items 1–2.

**Important naming trap:** `BillingPage` (`/admin/billing`) is an admin in-store **POS/billing-counter** screen, not customer checkout. `ProcessDetailsPage` (`/process-details`) is a pure marketing/scroll-story page, not a checkout step. The **real** customer checkout is entirely inside **`CartPage`** — there is no separate checkout/shipping-address screen; address is read from the saved profile only.

### Role determination

Single source of truth: `profiles.role` column (`"admin"` | `"user"`), fetched after login/session-restore and stored in Redux (`state.user.user.role`). Mirrored server-side in every Edge Function via `_shared/auth.ts`'s `requireAdmin()`. No custom JWT claims, no hardcoded email lists. `profiles.status` (`blocked`/`suspended`) is a separate per-user kill-switch checked both client- and server-side.

### Shared infrastructure code (used by both, don't touch, safe to port as-is)

`src/context/SupabaseConfig.js` (client init), `src/utils/edgeFunctions.js` (Edge Function fetch wrapper), `src/utils/supabaseProducts.js`/`supabaseOrders.js` (pure row mappers), `src/utils/paymentLabels.js`, `src/utils/sessionManager.js`/`sessionUtils.js` (session infra — cross-tab bits drop for RN, single-device-session Realtime logic is genuinely shared and portable), `settingsService.js` (reads `settings` table — read side is user-relevant for checkout, write side is admin-only).

### Dead components (present in tree, zero live imports — exclude from migration)

`src/components/Layout/Header.jsx`, `Footer.jsx`, `MeltHeader.jsx`, `MeltFooter.jsx`, `src/components/Common/MouseTiltCard.jsx`. Confirmed via grep — not reachable from any live route.

---

## 3. Screen-by-Screen Migration Map (USER scope only)

| Screen | Source file | Web route | Auth? | Supabase touchpoints | Key actions | RN complexity |
|---|---|---|---|---|---|---|
| Landing/Home | `pages/LandingPage/*` | `/` | no | none (asset/GSAP driven) | scroll marketing | **High if reproduced 1:1** (GSAP+Lenis) — see Unclear Item 3 |
| Product List | `pages/ProductsPage/ProductsPage.jsx` | `/products` | no | `products`, `reviews` (rating agg) | search, filter (category/price/rating/stock), sort, add-to-cart/wishlist | Medium |
| Product Detail | `pages/ProductDetail/ProductDetail.jsx` | `/product/:id` | no (actions require login) | `products` (by id + related), `reviews` (read) | variant/qty select, add to cart, buy now, wishlist, review read | Medium-High (Swiper gallery → RN carousel) |
| Cart + Checkout | `pages/CartPage/CartPage.jsx` | `/cart` | yes | `settings` (read), `products` (recs) + Edge Fns: `promo-validate`, `payment-create-order`, `payment-verify`, `payment-cod-create` | qty edit, promo code, 3 payment methods (Razorpay/COD/WhatsApp) | **High** (Razorpay native SDK, exact pricing math parity) |
| Wishlist | `pages/WishlistPage/WishlistPage.jsx` | `/wishlist` | yes | `products` (live join), `stock_alerts` (insert) | add/remove, move-to-cart, notify-me | Medium |
| Order History (ongoing) | `pages/UserOrdersPage/UserOrdersPage.jsx` | `/userorders` | yes | `orders`+`order_items`, `products`, `reviews` + Edge Fn `reviews-create` | list, review, buy again, invoice | Medium |
| Order History (past) | `pages/UserPastOrdersPage/UserPastOrdersPage.jsx` | `/userpastorders` | yes | same as above | tabs (delivered/cancelled), review, buy again, invoice | Medium |
| Order Detail | `pages/OrderDetailPage/OrderDetailPage.jsx` | `/order/:id` | yes | `orders`+`order_items`, `products` | GST breakdown, buy again, invoice | Low-Medium |
| Profile | `pages/MyProfile/MyProfile.jsx` | `/myprofile` | yes | `profiles` (r/w), Storage `avatars`, `auth.updateUser` | edit info/address, change password, avatar upload | Medium |
| Login | `pages/LoginPage/LoginPage.jsx` | `/login` | no | `auth.signInWithPassword`, `profiles` (select) | login, forgot-password, single-session enforcement | Medium |
| Signup | `pages/SignupPage/SignupPage.jsx` | `/signup` | no | `auth.signUp` | full registration form + validation | Low-Medium |
| Reset Password | `pages/ResetPasswordPage/ResetPasswordPage.jsx` | `/reset-password` | recovery session | `auth.updateUser` | set new password via emailed link | Medium (deep-link handling differs from web) |
| Services | `pages/ServicesPage/ServicesPage.jsx` | `/services` | yes | none | **empty stub, no real content** | N/A — see Unclear Item 2 |
| Contact | `pages/ContactPage/ContactPage.jsx` | none (dead) | — | none | **unreachable stub** | Excluded — see Unclear Item 1 |
| Process Details | `pages/ProcessDetailsPage/*` | `/process-details` | no | none | GSAP storytelling page, hardcoded content | Excluded/optional — same call as Landing (Unclear Item 3) |
| Video/Scroll Sequence | `pages/ScrollSequence/ScrollSequence.jsx` | `/video` | yes | none | frame-by-frame canvas scroll animation (452 JPEG frames) | Excluded/optional — pure marketing gimmick, not core commerce functionality |

**Screens with no real functionality to migrate** (ServicesPage, ContactPage, ProcessDetailsPage, ScrollSequence) will be **omitted from the RN app's navigable surface** by default — building them out would be inventing functionality that doesn't exist in the source, which is explicitly out of scope. Flagged as Unclear Items 1–3 in case you want otherwise.

---

## 4. Component Migration Matrix

| Web component | Classification | RN equivalent approach |
|---|---|---|
| `Navbar.jsx` (desktop chrome) | SHARED, desktop-only | **Not needed** — RN has one form factor; its logic is superseded by MobileNav's mobile branch |
| `MobileNav.jsx` (mobile header + bottom tabs) | SHARED, active | **Primary reference** for RN's tab bar (Expo Router `(tabs)` layout) and stack header titles |
| `ProductCard.jsx` (`variant="mobile"` branch) | USER | RN `ProductCard` component, `Pressable` + `Image`, port the mobile branch's layout only |
| `FiltersSidebar.jsx` | USER | RN bottom-sheet/modal filter panel |
| `ProductCardSkeleton`, `NewProductCardSkeleton`, `ProductDetailSkeleton`, `OrderCardSkeleton`, `Skeleton.jsx` | SHARED | RN loading placeholders (`Animated`/`react-native-reanimated` pulse or a lib like `moti`/`react-content-loader`) |
| `Loader.jsx` | SHARED | RN `ActivityIndicator` wrapper |
| `SessionManager.jsx` (BroadcastChannel cross-tab sync) | SHARED infra | **Drop** — no multi-tab concept in RN; keep only the underlying single-device-session Realtime watcher (`useSessionWatcher.js`) |
| `ProtectedRoute.jsx`, `UserRoute.jsx`, `AdminRoute.jsx` | SHARED/ADMIN | RN auth-gate logic inside Expo Router layout files (`app/(app)/_layout.tsx`) — only the user-role path is needed; see Unclear Item 4 on whether to block admin accounts entirely |
| `RightDrawer.jsx`, `Pagination.jsx`, `SearchBar.jsx` (admin) | ADMIN | Excluded |
| `Header.jsx`, `Footer.jsx`, `MeltHeader.jsx`, `MeltFooter.jsx`, `MouseTiltCard.jsx` | Dead code | Excluded |

### General DOM → RN mapping (project-specific, not exhaustive boilerplate)

| Web | RN |
|---|---|
| `<div>` | `View` |
| `<span>`/text nodes | `Text` |
| `<button>`/clickable `<div>` | `Pressable` (`TouchableOpacity` where a simple opacity-fade suffices) |
| `<img>` | `Image` / `expo-image` (recommended for caching product photos from Supabase Storage/CDN) |
| `<input>`/`<textarea>` | `TextInput` |
| large lists (`ProductsPage` grid, order lists) | `FlatList` (2-column `numColumns=2` mirrors the existing mobile 2-col grid), not `ScrollView` |
| React Router `<Link>`/`navigate()` | Expo Router `<Link>` / `router.push()` |
| `localStorage`/`sessionStorage` (cart-clear-trigger, theme, held-bills) | `AsyncStorage` (non-sensitive) |
| Supabase session storage (implicit `localStorage`) | `AsyncStorage` via the `storage` option in `createClient`, or `expo-secure-store` for the more sensitive single-device-session id |
| `window.Razorpay` Checkout.js (dynamic `<script>`) | `react-native-razorpay` native SDK (requires a custom dev client — no Expo Go; see Unclear Item 6) |
| `wa.me` `window.open` | `Linking.openURL()` |
| `navigator.share`/`clipboard` | RN `Share` API / `expo-clipboard` |
| jsPDF + `doc.save()` browser download | needs a different pipeline — see Unclear Item 7 |
| Swiper product gallery | `react-native-reanimated-carousel` (well-maintained, Reanimated-based, matches the Reanimated dependency NativeWind v4 already pulls in) |
| GSAP/ScrollTrigger/Lenis | `react-native-reanimated` + `react-native-gesture-handler` for the handful of genuinely functional transitions (skeleton pulses, sheet slide-in); the marketing-page scroll-story animations are the one piece **not** ported 1:1 by default (Unclear Item 3) |
| `window.matchMedia`/`useIsMobile` | **Not needed** — RN has only one form factor, so only the "mobile" JSX branch of each dual-implementation page needs porting, not both |

---

## 5. Business Logic Reuse Assessment

### Directly portable (pure JS, no DOM/browser API) — reuse the logic, rewrite only the surrounding UI

- Discounted-price formula `mrp - (mrp*discount)/100` + discount-expiry gating (`Date.now() > expiry`) — currently duplicated ~5x across the web app; **consolidate into one shared util** in the RN app rather than re-duplicating.
- Cart pricing pipeline: `subtotal → subtotalRounded=Math.round(subtotal) → +shipping −promoDiscount → total=Math.max(0, Math.round(...))`. **The exact order of rounding (subtotal rounded to whole rupees before adding shipping/promo) must be preserved** — it mirrors the server's authoritative calculation in `supabase/functions/_shared/pricing.ts`.
- `mapProductRow(s)`, `mapOrderRow(s)`, `resolveOrderItemImage`, `paymentLabels.js` helpers, `nextAddQuantity`/`nextRemoveQuantity` (supabaseCart.js), signup/password regex validators, GST tax-split math (`generateInvoice.js`'s calculation, not its jsPDF rendering).
- **Critical architectural fact for the migration:** the client **never computes the authoritative charged price** — every order-creation path (Razorpay, COD) sends only `{productId, variantId, quantity}` to Supabase Edge Functions and trusts the returned amount. This means the RN app's pricing code only needs to *estimate/display* a total, not perfectly replicate the server; the real business-rule source of truth (`pricing.ts`) doesn't need to be ported to the client at all, only referenced for display parity.

### Needs a rewrite (DOM/browser-coupled) — port the *intent*, not the code

GSAP/ScrollTrigger/Lenis animations, `window.Razorpay` widget, `wa.me` deep link, `navigator.share`/clipboard, jsPDF invoice rendering, `document.body.style.overflow` scroll-locks, Swiper carousel, the entire `useIsMobile` dual-branch pattern.

### Known pre-existing bugs in the source app (decide fix-vs-preserve — see Unclear Items 8–9)

- **"Buy Again"** re-adds items by base `productId` only, silently **losing the original variant selection**.
- **Wishlist add/remove id-type mismatch**: `addWishlist` dedupes on `String(id)`, `removeWishlist` filters on the raw (non-stringified) `id` — can leave stale entries under certain id shapes.
- `ProductDetail.jsx`'s wishlist gate uses a native `alert()` instead of the app's toast pattern used everywhere else (a UI inconsistency, not a logic bug).

---

## 6. Supabase Dependency Map (user-scope)

### Tables

| Table | User operations |
|---|---|
| `products` | read (catalog, PDP, cart/wishlist joins, recommendations) |
| `cart_items` | full CRUD + Realtime subscription (`cart-items-{uid}` channel, debounced) |
| `wishlist_items` | full CRUD, one-shot load (no Realtime) |
| `orders` / `order_items` | read-only, scoped to own `user_id`; writes happen only via Edge Functions |
| `profiles` | read/update own row; `active_session_id` field drives single-device-session enforcement |
| `reviews` | insert **only** via Edge Function (no client insert policy); read is open |
| `settings` | read-only (payment/shipping/gst config for checkout display) |
| `stock_alerts` | insert-only ("Notify Me" on out-of-stock wishlist items) |
| `promo_codes` | **no direct client read** — validated exclusively through `promo-validate` |

### Edge Functions (all require a Supabase session JWT; rate-limited per-user)

| Function | Purpose |
|---|---|
| `payment-create-order` | Server-priced Razorpay order creation |
| `payment-cod-create` | Server-priced Cash-on-Delivery order |
| `payment-verify` | Verifies Razorpay signature, finalizes order (idempotent) |
| `payment-webhook` | Razorpay server callback backstop (no client involvement) |
| `promo-validate` | Resolves a promo code + subtotal → discount preview |
| `reviews-create` | Server-verified "must have purchased" review upsert |

### Storage

| Bucket | User usage |
|---|---|
| `avatars` | profile photo upload, `${userId}/avatar.${ext}` |

### Realtime

| Channel | Purpose |
|---|---|
| `cart-items-{uid}` | live cart sync across devices |
| `profile-session-{uid}` | single-device-session conflict detection |

### Auth flows

`signUp`, `signInWithPassword`, `resetPasswordForEmail` + `updateUser({password})`, `signOut` — all standard Supabase JS SDK calls, portable to RN as-is once the client's `storage` adapter is swapped to AsyncStorage/SecureStore. **No OAuth** — email/password only. `detectSessionInUrl` (used for password-recovery links on web) has no RN equivalent; the reset-password deep link needs Expo Linking + a custom handler instead (see Unclear Item 10).

---

## 7. Security Notes (reporting only — not modifying the web app)

1. `src/context/SupabaseConfig.js` and `src/utils/edgeFunctions.js` hardcode a literal Supabase URL + anon key as fallback values if env vars are absent. The anon key is meant to be public (protected by RLS), so this isn't a secret leak, but it means a misconfigured build silently points at production instead of failing loudly. The RN app will use `app.config.js`/EAS env vars properly and will **not** carry over this hardcoded fallback pattern.
2. Confirmed clean: no Supabase service-role key, no Razorpay secret/webhook-secret anywhere under `src/` — those exist only inside `supabase/functions/_shared/clients.ts` and `razorpay.ts` (Deno server runtime).
3. No local SQL/RLS policy files exist in the repo — RLS behavior (e.g., "reviews has no insert policy") is only verifiable by connecting to the live Supabase project. This is a real blocker for precisely replicating query behavior — see Unclear Item 5.
4. `payment-webhook`'s CORS allow-list defaults to two stale Firebase-hosting domains + localhost if `ALLOWED_ORIGINS` isn't set in the deployed environment — low risk (webhook calls carry no browser Origin) but worth your awareness; not something the RN migration touches.

---

## 8. Recommended Version Set

| Package | Version | Why |
|---|---|---|
| **Expo SDK** | **55** | SDK 56 (released ~May 2026) has a known Hermes/`react-native-worklets`/Reanimated memory regression that isn't fixed until SDK 57. SDK 57 was published only days before this analysis — too fresh to call "mature ecosystem" per your stability requirement. SDK 55 (React Native 0.83.1, React 19.2, New Architecture only, Expo Router v7) has had months of production usage and avoids the SDK 56 regression entirely. |
| **React Native** | **0.83.1** | Ships with Expo SDK 55. New Architecture is mandatory as of this SDK line (Legacy Architecture support was dropped) — this is now the mature, default path, not an experimental opt-in. |
| **React** | **19.2.0** | Ships with Expo SDK 55; matches the web app's React 19.2, so shared logic/hooks written against React 19 semantics need no adjustment. |
| **Expo Router** | **v7** (bundled with SDK 55) | File-based routing as required; v7 is the version paired with SDK 55, not a separately-chosen version. |
| **NativeWind** | **v4.x (latest 4.2+)** with **Tailwind CSS 3.4.17** | NativeWind v5 + Tailwind v4 is the newer combination but has open migration friction reported in NativeWind's own GitHub discussions and requires `react-native-css`, a newer/less battle-tested transform pipeline. NativeWind v4 is the proven, widely-deployed combination; v4.2.0+ already patches for Reanimated v4 compatibility, which SDK 54+ ships. |
| **`@supabase/supabase-js`** | latest 2.x (matches web app's `^2.112`) | Same SDK works identically in RN; only the `auth.storage` adapter changes. |
| **Supporting RN packages** | `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `expo-secure-store`, `react-native-reanimated` (peer dep of NativeWind v4), `react-native-safe-area-context`, `react-native-screens` | Standard, Expo-maintained/first-party or NativeWind-required packages. |
| **Node** | **20 LTS or newer** | Current Expo tooling baseline; confirm exact floor against `docs.expo.dev` at `npx create-expo-app` time since Expo occasionally raises this between patch releases. |

I did **not** default to "latest" (SDK 57) per your explicit instruction to prioritize stability over newest — happy to revisit if you'd rather front-load onto 57 despite its youth, or if SDK 58 has landed with the 56 regression backport by the time Phase 1 starts (versions should be re-verified immediately before `npx create-expo-app`, since this is a fast-moving ecosystem and this analysis has a shelf life).

Sources: [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56), [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55), [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57), [NativeWind v5 migration discussion](https://github.com/nativewind/nativewind/discussions/1617), [NativeWind v5 install guide](https://www.nativewind.dev/v5/getting-started/installation)

---

## 9. Unclear Items — need your decision before/while implementing the affected phase

**UNCLEAR ITEM 1 — Contact screen**
What I found: `ContactPage.jsx` is an 8-line stub (`<h1>Contact Page</h1>`), imported in `App.jsx` but never given a `<Route>` — the live web app's own mobile nav links to `/contact`, which 404s today.
Why it matters: Building a real Contact screen for RN would be inventing a feature that doesn't exist in the source app.
Options: **A.** Omit any "Contact" entry from the RN app entirely (recommended — matches actual current behavior, nothing is lost). **B.** You give me real contact content/requirements and I build a minimal screen as a genuine addition (would need your explicit sign-off since instructions prohibit inventing features).
Recommended: A.

**UNCLEAR ITEM 2 — Services screen**
What I found: `ServicesPage.jsx` is routed live at `/services` behind `UserRoute`, but the component is an empty `<div>` with a placeholder comment — no real content ever shipped.
Why it matters: same as above — nothing to migrate, but it IS a reachable route today (unlike Contact).
Options: **A.** Omit from RN nav (recommended). **B.** Keep an empty placeholder screen/tab reachable for parity's sake, in case content is coming soon.
Recommended: A.

**UNCLEAR ITEM 3 — Landing page & marketing pages' fidelity — RESOLVED**
Decision (2026-09-01): **Option C** — no dedicated Home/Landing screen at all. `LandingPage`, `ProcessDetailsPage`, and `ScrollSequence` (GSAP/Lenis/canvas-scrubber marketing content) are excluded entirely. The app's entry tab is **Product Listing** — Phase 7 ("Home Screen") is removed from the plan; §11's route tree and §14's phase list are updated accordingly.

**UNCLEAR ITEM 4 — Should admin accounts be blocked from the mobile app entirely?**
What I found: The web's `UserRoute` guard only checks "is authenticated," not role — so an admin account can technically browse `/cart`, `/wishlist`, etc. on the web today. This mobile app is meant to be the "user app" only.
Why it matters: If an admin logs into the RN app, should they see the same customer screens (mirroring today's web behavior), or should login be rejected/redirected with a message like "Please use the admin dashboard"?
Options: **A.** Reject admin-role logins in the RN app with a clear message (cleaner separation, matches your "admin must not be touched/mixed in" intent — recommended). **B.** Mirror the web's current permissive behavior (let admins use the customer app too, since that's technically what happens today).
Recommended: A.

**UNCLEAR ITEM 5 — No local database schema/RLS source of truth**
What I found: `supabase/` in this repo contains only Edge Functions and `config.toml` — no `.sql` migration/schema files. Column shapes, RLS policies, and RPCs (`create_order_tx`, `rate_limit_check`) exist only on the live hosted Supabase project.
Why it matters: I've inferred table/column shapes entirely from how the client code and Edge Functions use them (documented in §6). This is very likely accurate but isn't independently verified against the actual schema — a genuine mismatch (e.g. a column type or an RLS policy I don't know about) could surface during Phase 4+ implementation.
Options: **A.** Give me read access to run `supabase db dump --linked` (or paste the dashboard's schema export) so the data layer is verified up front. **B.** Proceed on the inferred shapes from this analysis and treat any live-runtime mismatches as bugs to fix as each phase touches that table.

**Partial resolution (Phase 4, 2026-09-01):** went with a lighter-weight version of B — rather than a full schema dump, queried the live project directly (read-only, anon key) for `products`, `orders`, `reviews`, `settings`, `promo_codes`, `profiles`. `products`' real columns matched `mapProductRow`'s assumptions exactly; the others were at least consistent with the documented shapes/RLS behavior (no contradictions found, though `orders`/`profiles`/`promo_codes` returned 0 anon-visible rows, which confirms RLS is scoping correctly but doesn't confirm their exact column shapes the way `products` and `reviews`/`settings` are now confirmed). `cart_items`, `wishlist_items`, `stock_alerts`, `upload_sessions`, and the RPCs (`create_order_tx`, `rate_limit_check`) remain unverified — will probe each when its owning phase needs it rather than speculatively now.
Recommended: A if convenient, otherwise B is acceptable — this won't block Phases 1–3 (foundation/routing/styling need no schema knowledge).

**UNCLEAR ITEM 6 — Razorpay requires a custom dev client**
Not a decision so much as a heads-up: `react-native-razorpay` is a native module. It **cannot run in Expo Go** — the project will need a custom development build (`expo-dev-client` / EAS Build) from the point the Cart/Checkout phase starts. This is standard for any Expo app doing native payments, but I want to flag it now so it isn't a surprise later, and confirm you're fine building/running via a dev client (and eventually EAS) rather than Expo Go for that portion of testing.

**UNCLEAR ITEM 7 — Invoice/PDF generation approach on mobile**
What I found: The web app generates invoices client-side via jsPDF + `jspdf-autotable` + browser `doc.save()`. None of that pipeline exists in React Native.
Why it matters: needs a deliberate replacement before Phase 13 (Order History/Invoices).
Options: **A.** `expo-print` (renders an HTML string to a PDF and opens the native share/print sheet) — simplest, fully within the Expo-managed workflow, no extra native config (recommended). **B.** `react-native-html-to-pdf` — more control, but an extra native dependency. **C.** Generate the PDF server-side (a new Edge Function) and just let the app download/share the resulting URL — cleanest separation but is new backend work beyond "reproduce existing," would need your sign-off since it's not purely a client port.
Recommended: A.

**UNCLEAR ITEM 8 — "Buy Again" variant-loss bug**
What I found: `handleBuyAgain` across the order-history pages re-adds items by base `productId`, silently dropping the originally-purchased variant.
Why it matters: rule 20 says preserve existing behavior and don't "improve" business rules without asking — but this looks like an unintentional bug, not a business rule.
Options: **A.** Fix it in the RN app (re-add using the stored `variantId` from the order line item) — recommended, since preserving a data-loss bug seems clearly not intended. **B.** Preserve the exact current (buggy) behavior for strict parity.
Recommended: A, but flagging per your explicit "don't invent/don't silently change behavior" instructions.

**UNCLEAR ITEM 9 — Wishlist id-type mismatch bug**
What I found: `WishlistSlice.addWishlist` dedupes using `String(item.id)` but `removeWishlist` filters using the raw (potentially non-string) `id` — a latent inconsistency that can leave stale entries under certain id shapes.
Options: **A.** Normalize both to `String(id)` in the RN port (recommended, low-risk, purely a correctness fix). **B.** Preserve as-is.
Recommended: A. **Resolved (Phase 6, 2026-09-01): went with A** — `src/store/WishlistSlice.js` now compares `String(id)` in both `addWishlist` and `removeWishlist`.

**UNCLEAR ITEM 10 — Password-reset deep link handling**
What I found: Web relies on Supabase's `detectSessionInUrl` to auto-parse the recovery token from the URL fragment. RN has no URL fragments/browser history — the equivalent is an Expo Linking deep link (`myapp://reset-password?...`) that must be registered as a custom scheme and wired to Supabase's `exchangeCodeForSession`/session-parsing manually.
Why it matters: this requires you to reconfigure the Supabase Auth "redirect URL" allow-list on the hosted project to include the app's custom scheme (a dashboard change on your end, not something I can or should do without you).
Action needed from you: when we reach Phase 5 (Authentication), you'll need to add the RN app's deep-link scheme to Supabase Auth's allowed redirect URLs in the Supabase dashboard. I'll tell you the exact URL to add at that time.

---

## 10. Screen/Component/Supabase Migration Matrices

*(Consolidated versions of §3/§4/§6 above — kept together there rather than repeated verbatim here to avoid duplication in this already-long document. Re-ask if you'd like them as separate standalone tables/files, e.g. for import into a spreadsheet.)*

---

## 11. Proposed Expo Router Structure

```
app/
├── _layout.tsx                 # root layout: fonts, SafeAreaProvider, Supabase session bootstrap
├── (auth)/
│   ├── _layout.tsx             # redirects to (app) if already authenticated
│   ├── login.tsx
│   ├── signup.tsx
│   └── reset-password.tsx      # handles the deep-link recovery flow
├── (app)/
│   ├── _layout.tsx             # auth gate (redirect to (auth) if not logged in; reject admin role — Unclear Item 4)
│   ├── (tabs)/
│   │   ├── _layout.tsx         # bottom tab bar — mirrors MobileNav's user tab set, minus Home (Unclear Item 3 resolved: no Landing/marketing screen)
│   │   ├── index.tsx           # redirects to /products, OR products/index.tsx is itself the tab index — decided in Phase 2
│   │   ├── products/
│   │   │   ├── index.tsx       # Product Listing
│   │   │   └── [id].tsx        # Product Detail
│   │   ├── cart.tsx            # Cart + checkout entry
│   │   ├── wishlist.tsx
│   │   └── profile.tsx
│   ├── orders/
│   │   ├── index.tsx           # tabs/segments for ongoing vs past, or two files: ongoing.tsx / past.tsx
│   │   └── [id].tsx            # Order Detail
│   └── checkout/
│       └── (modal or inline within cart.tsx — payment method selection, decided during Phase 11)
└── +not-found.tsx
```

Route groups `(auth)` and `(app)` map directly to the web's public-vs-`UserRoute`-gated split. No `(admin)` group exists anywhere in this tree — admin is not represented at all, per scope.

---

## 12. Shared Code Strategy

**Decision: no monorepo.** `Ecommerce-sept-1-2026` and `Ecommerce-app` stay fully separate projects, per your explicit instruction. Nothing under `src/` will be imported directly by the RN app (React DOM components and Tailwind markup aren't shareable anyway; Vite vs. Metro bundlers aren't set up to cross-resolve).

Where the web app has genuinely platform-independent pure logic (pricing/discount math, row mappers, validation regexes, label helpers — catalogued in §5), the RN app will contain its **own copies**, ported by hand (not re-exported), kept deliberately small and dependency-free so future drift is easy to spot and fix in both places if the business rule ever changes. This is simpler and lower-risk than introducing a shared npm package/workspace for a codebase this size, and matches your "don't monorepo unless there's a strong reason" instruction.

---

## 13. Proposed RN Project Structure

```
Ecommerce-app/
├── app/                # Expo Router routes (see §11)
├── components/         # Reusable UI: ProductCard, Skeletons, Loader, etc.
├── features/           # Feature-scoped logic+UI bundles (products, cart, orders, wishlist) — mirrors src/features/ in the web app
├── hooks/              # useAuth, useSessionWatcher, etc.
├── services/           # Supabase table/Edge-Function call wrappers (supabaseCart, supabaseWishlist, supabaseOrders, razorpay, promo, reviews)
├── lib/                # supabase client init, edgeFunctions fetch wrapper
├── store/              # Redux Toolkit store + slices (user, cart, wishlist, products, loading) — reused pattern, not reused code
├── constants/          # route titles, payment labels, etc.
├── types/              # JSDoc typedefs (Product, Order, CartItem, Profile, ...) — not TS interfaces, per the JS-only decision
├── utils/              # pricing math, validators, mappers
├── assets/             # fonts, images, icons
└── theme/              # NativeWind config + design tokens ported from src/theme/themes.js
```

Mirrors the web app's mental model (`context`→`store`, `utils`/`services` split, `features/`) so logic already understood from the source app maps predictably, while keeping RN-specific concerns (`app/` for routing) cleanly separated.

---

## 14. Phased Implementation Plan

Each phase below is independently implementable and testable, and I will **stop after each one** for your explicit approval before continuing, per your instructions.

### Phase 1 — RN Project Foundation — DONE (2026-09-01)
**Objective:** Create the Expo project skeleton with the version set from §8, plain JavaScript (not TypeScript, per direction), and ESLint — no screens, no Supabase, no auth yet.

**What was actually done:**
- Scaffolded via `npx create-expo-app@latest`, which defaulted to the newly-released SDK 57 — then explicitly downgraded to pin **Expo SDK 55.0.31 / React Native 0.83.10 / React 19.2.0 / Expo Router 55.0.18** (`npm install expo@^55.0.0` + `npx expo install --fix` + a clean `node_modules` reinstall), matching §8's rationale.
- Converted the entire template from TypeScript to plain JavaScript: every `.ts`/`.tsx` file under `src/` rewritten as `.js`/`.jsx` with type annotations stripped (16 files: `app/_layout`, `app/index`, `app/explore`, and the components/hooks/constants they depend on).
- Removed `tsconfig.json`, `typescript`, and `@types/react`; removed the TS-only `typedRoutes` experiment from `app.json` (kept `reactCompiler`, which is a Babel transform and works the same under plain JS).
- Added `jsconfig.json` replicating the same `@/*` → `./src/*` path alias the TS template had — **verified this actually resolves at the Metro/bundler level** (not just assumed) via `npx expo export --platform android`, which bundled all 1451 modules successfully.
- Added `eslint-config-expo@55.0.1` + a flat `eslint.config.js`, plus `eslint-import-resolver-alias` so ESLint's `import/no-unresolved` rule understands the `@/*` alias (it doesn't read `jsconfig.json` on its own).
- Added `.env.example` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Expo's client-exposed-env convention, the RN equivalent of the web app's `VITE_` prefix) and added `.env` to `.gitignore`.
- Corrected the template's auto-generated `AGENTS.md`, which pointed at the v57 docs it was scaffolded against, to point at the v55 docs we're actually pinned to, and cross-referenced this analysis file.
- Did **not** pre-create the empty `features/`, `services/`, `lib/`, `store/`, `theme/` folders from §13 — those will appear naturally as the phases that need them add real files, rather than as premature empty scaffolding.

**Modifies:** nothing in the web app (`Ecommerce-sept-1-2026/Ecommerce-sept-1-2026` untouched).
**Reuses:** none yet (foundation only).
**Dependencies:** none.
**Testing performed:** `npx expo-doctor` → 20/20 checks passed. `npx eslint .` → clean, 0 errors. `npx expo export --platform android` → bundled successfully (1451 modules, confirms the alias and dependency graph resolve correctly). **Not tested:** actually booting the app on a real iOS/Android simulator, emulator, or device, or via Expo Go/a dev client — no such environment (simulator/emulator/physical device) is available in this execution environment. The static bundle export is strong evidence the app would boot, but it is not the same as an observed successful boot; flagging this explicitly rather than claiming device-level verification that didn't happen.
**Acceptance:** versions match §8 exactly (SDK 55 line throughout); project type-checks/lints/bundles clean in plain JavaScript. Device-level "app actually boots and renders" acceptance is unverified per the testing note above — recommend you run `npx expo start` and open it in Expo Go or a simulator on your end before we go further, if you want that confirmed independently.
**Risks:** none outstanding for this phase's actual scope; the one open item is the untested device boot, carried forward as a note rather than a blocker since Phase 2 will replace these template screens anyway.

### Phase 2 — Expo Router Architecture — DONE (2026-09-01)
**Objective:** Build the file-based route skeleton from §11 (minus Home/Landing, per direction) with placeholder screens and the auth-gate/tab-bar shell wired to mock state.

**What was actually done — final route tree (all plain `.jsx`, per the Phase 1 language decision):**
```
src/app/
├── _layout.jsx                  MockAuthProvider + SafeAreaProvider + root Stack
├── index.jsx                    redirect: "/" → /products (logged in) or /login (logged out)
├── +not-found.jsx
├── (auth)/
│   ├── _layout.jsx              redirect to /products if already logged in, else Stack
│   ├── login.jsx                mock "log in as customer" / "log in as admin" buttons
│   ├── signup.jsx
│   └── reset-password.jsx
└── (app)/
    ├── _layout.jsx              redirect to /login if logged out; renders an "admin not
    │                            supported" block screen if isAdmin (Unclear Item 4,
    │                            resolved as reject-admin); else Stack
    ├── (tabs)/
    │   ├── _layout.jsx          Tabs: Products / Cart / Wishlist / Profile (no Home tab)
    │   ├── products/
    │   │   ├── _layout.jsx      nested Stack (list → detail)
    │   │   ├── index.jsx        entry tab — placeholder list, links to /products/:id
    │   │   └── [id].jsx
    │   ├── cart.jsx
    │   ├── wishlist.jsx
    │   └── profile.jsx          links to /orders (not a tab, matches web) + mock logout
    └── orders/
        ├── _layout.jsx          Stack, sits alongside (tabs) so it can push over them
        ├── index.jsx
        └── [id].jsx
```
- Built a temporary `src/dev/mock-auth.jsx` (`MockAuthProvider`/`useMockAuth`) providing `{isLoggedIn, isAdmin, login, logout}` — explicitly commented as Phase-2-only scaffolding to be deleted when Phase 5 wires up real Supabase auth/session state. The login screen has two mock buttons ("log in as customer" / "log in as admin") specifically so the admin-block branch in `(app)/_layout.jsx` is exercisable now, not just theoretical.
- Removed the template's demo Home/Explore tabs and their supporting components (`animated-icon.*`, `app-tabs.*`, `hint-row`, `external-link`, `web-badge`, `ui/collapsible`) and their now-unreferenced demo assets (expo-logo, logo-glow, react-logo variants, tabIcons, tutorial-web, expo-badge variants) — all dead code once the demo screens were replaced. Kept `themed-text.jsx`/`themed-view.jsx`/`use-theme.js`/`theme.js` (Colors/Fonts/Spacing) as lightweight styling primitives for these placeholder screens, to be superseded by real NativeWind tokens in Phase 3.
- Confirmed the "no Landing/Home screen" decision directly in the route tree: the tab bar's first/entry tab is Products, and root `/` redirects straight into it.

**Modifies:** none in the web app.
**Reuses:** the web's tab set (Home/Products/Cart/Wishlist/Profile minus Home) and the fact that Order History is reached from Profile, not a bottom tab, both confirmed against `MobileNav.jsx` in the original analysis.
**Dependencies:** Phase 1.
**Testing performed:** `npx eslint .` → clean. `npx expo export --platform android` → bundled successfully (1076 modules), confirming every new file imports/parses cleanly. `npx expo export --platform web` → produced a **static route manifest** I inspected directly, confirming the exact intended URL paths resolve with route groups correctly stripped: `/`, `/login`, `/signup`, `/reset-password`, `/products`, `/products/[id]`, `/cart`, `/wishlist`, `/profile`, `/orders`, `/orders/[id]`, `/+not-found` — this is concrete evidence the route structure is wired as designed, not just visually plausible. **Not tested:** the actual auth-gate *behavior* at runtime (does tapping "log in as admin" really show the block screen? does the tab bar really render on device?) — that needs an interactive simulator/device/Expo Go session, none of which is available in this environment. The static export proves the files compose without error; it doesn't exercise the React state transitions.
**Acceptance:** route tree matches the (Home-less) plan from §11; static export confirms all target paths exist and groups don't leak into URLs. Runtime interaction (redirects firing, tab bar rendering, admin block screen appearing) is unverified per the note above — recommend you run `npx expo start` and click through the mock login buttons once to close that gap.
**Risks:** none outstanding beyond the untested runtime interaction noted above.

### Phase 3 — NativeWind + Design Tokens — DONE (2026-09-01)
**Objective:** Install and configure NativeWind v4 + Tailwind 3.4, port the real design tokens into `tailwind.config.js`, and re-theme the Phase 2 placeholder screens to prove the tokens actually render.

**What was actually done:**
- Read the source app's `src/theme/themes.js` directly (not the earlier summarized research) to get the exact, complete token set rather than approximate values. Ported the **full `default` theme, light + dark** (32 tokens: primary/accent/link/ring/disabled families, background/surface/overlay, ink/body/muted/inverse text, border family, and success/error/warning/info status families). Deliberately did **not** port `chart-*` tokens (admin-analytics-only, no consumer in this app) or the `brand-a`/`brand-b` alternate themes (no evidence they're live-used; easy to add later since it's the same flat token-map shape) — both exactly per this doc's original Phase 3 plan.
- Installed `nativewind@4.2.6` + `tailwindcss@3.4.19` (current stable NativeWind v4 line — v5 is still preview-only, confirmed via npm dist-tags, so v4 was the correct call) + `babel-preset-expo` (had to add explicitly once a real `babel.config.js` existed — Expo's zero-config default silently provided this before) + `expo-font`/`@expo-google-fonts/inter`/`@expo-google-fonts/caveat` for real font loading (matching the web app's Inter-body/Caveat-accent pairing).
- Created `babel.config.js` (`babel-preset-expo` with `jsxImportSource: "nativewind"` + `nativewind/babel`), `metro.config.js` (`withNativeWind`), and `tailwind.config.js` (content globs over `src/**/*.{js,jsx}`, `nativewind/preset`, `darkMode: 'media'` — tokens follow the OS light/dark setting automatically, no manual toggle UI built yet since that's a feature, not infrastructure).
- Rewrote `src/global.css` as the real Tailwind entry: `@tailwind` directives + the 32 tokens as CSS variables under `:root` (light) and `@media (prefers-color-scheme: dark)` (dark) — kept the pre-existing web-only `--font-display` etc. block below it untouched (Tailwind passes through non-utility CSS fine).
- Added `fontFamily` utilities (`font-sans`/`-medium`/`-semibold`/`-bold` → the four loaded Inter weights, `font-accent` → Caveat) and one `boxShadow.card` utility for the recurring `0px 4px 20px rgba(26,43,60,0.05)` card shadow found across the web app.
- Repurposed `src/constants/theme.js` into a plain-JS mirror of the same 32 tokens (light+dark), for the rarer case where a native prop needs a literal color value rather than a className (used immediately for the tab bar's `tabBarActiveTintColor`).
- **Retired and deleted** the template's old two-color `ThemedText`/`ThemedView`/`useTheme`/`useColorScheme` scaffolding from Phase 1/2 — keeping both that system and the new semantic-token system side by side would've been confusing dead weight. **Rewrote every Phase 2 placeholder screen** (all `(auth)` screens, the `(app)` admin-block screen, all 4 tabs, both orders screens, `+not-found`) to plain `View`/`Text`/`Pressable` with NativeWind `className`s using the real tokens (`bg-background`, `text-ink`, `text-primary`, `border-border`, `font-sans-bold`, etc.) instead of the old `StyleSheet`+`Spacing` approach.
- Fixed a real bundle-bloat bug while doing this: importing `Inter_400Regular` etc. from the package's barrel `@expo-google-fonts/inter` index pulled in **all 22 Inter weight/italic files** (~7.5MB) into the bundle even though only 4 are used. Switched to the package's direct per-weight subpath imports (`@expo-google-fonts/inter/400Regular`, etc.), confirmed via a before/after bundle export that this dropped the bundled font asset count from 22 to 4 Inter files (+1 Caveat) with no functional change.

**Modifies:** all Phase 2 placeholder screens (re-themed, see above); `app.json` gained the `expo-font` config plugin (added automatically by `expo install`).
**Reuses:** the web app's exact `default` theme hex values (light + dark) — copied faithfully, not approximated or redesigned.
**Dependencies:** Phases 1–2.
**Testing performed:** `npx eslint .` → clean. `npx expo-doctor` → 20/20. `npx expo export --platform android` → bundled successfully (1441 modules) after fixing the missing `babel-preset-expo` dependency and the font-barrel bloat. `npx expo export --platform web` → I read the **actual generated CSS output** and confirmed, byte-for-byte, that `:root` contains the correct light hex values, the `@media (prefers-color-scheme: dark)` block contains the correct dark hex values, and utility classes (`.text-ink`, `.bg-background`, `.font-sans-bold`, `.active\:bg-surface-muted:active`) all resolve to the right `var(--color-*)` references — this is concrete evidence the token pipeline works end to end, not an assumption from config alone. **Not tested:** rendering on an actual device/simulator to visually confirm colors/fonts render as expected — no simulator/device available in this environment. The CSS-output inspection is strong indirect evidence but isn't the same as seeing pixels on a screen.
**Acceptance:** tokens are wired correctly and verifiably (per the CSS inspection above); full pixel-level visual parity against the web app is unverified per the testing note — worth a `npx expo start` + visual check on your end.
**Risks:** none outstanding. The Reanimated/babel foot-gun flagged in this doc's original risk note didn't materialize — NativeWind 4.2.6 + the already-installed `react-native-reanimated@4.2.1` worked together without incident, and the actual snag (missing `babel-preset-expo`, font barrel bloat) was different from what was anticipated, which is worth remembering: verify by building, don't assume the documented risk list is exhaustive.

### Phase 4 — Supabase Client & Core Utilities — DONE (2026-09-01)
**Objective:** Wire up the Supabase client with AsyncStorage session persistence, port the pure utilities (pricing math, row mappers, payment labels, validators) with no UI consuming them yet beyond a debug section.

**What was actually done:**
- Installed `@supabase/supabase-js@2.112.4` (matches the web app's `^2.112` line exactly), `@react-native-async-storage/async-storage`, `react-native-url-polyfill`.
- Created `src/lib/supabase.js` — same `createClient` call as the web app's `SupabaseConfig.js`, but with `auth.storage: AsyncStorage` (replacing the web's implicit `localStorage`) and `detectSessionInUrl: false` (web-only URL-fragment parsing; the password-reset deep link gets its own explicit handling in Phase 5). **Deliberately does not carry over the web app's hardcoded URL/anon-key fallback** (flagged as a hygiene issue in §7) — it throws a clear error instead if the env vars are missing, rather than silently falling back to a baked-in value.
- Created `src/lib/edgeFunctions.js` (`callFunction`/`functionAuthHeaders`) — a direct, near-verbatim port of `src/utils/edgeFunctions.js`; same Edge Functions, same bearer-token contract, only the Supabase client import path changed.
- Created `src/utils/mappers.js` (`mapProductRow(s)`, `mapOrderRow(s)`, `resolveOrderItemImage`) — verbatim ports of `supabaseProducts.js`/`supabaseOrders.js`, including the `resolvedFinalPrice` compatibility comment explaining why order-line items intentionally omit a `price` field.
- Created `src/utils/paymentLabels.js` — verbatim port, no changes.
- Created `src/utils/pricing.js` — ported `getMrp`/`getDiscount`/`getPrice`/`getStock`/`getMaxStock` (from `ProductsPage.jsx`) and `isDiscountActive` + the full subtotal→promo→shipping→total pipeline (from `CartPage.jsx`), reading the exact source lines rather than working from the earlier summarized research, since money math is exactly the place a paraphrase-induced error would be costly. Preserved the exact rounding order (subtotal rounded to whole rupees before adding shipping/promo).
- Created `src/utils/validators.js` — ported the signup email/password regex and the (deliberately different, weaker) change-password rule from `MyProfile.jsx`. Kept both rules distinct rather than unifying them, per the "don't silently change existing behavior" rule — flagged inline in the file's header comment.
- Created a real `.env` (gitignored) with the actual project URL and anon key — **reused verbatim from the web app's own hardcoded fallback in `SupabaseConfig.js`**, since the anon key is meant to be public/RLS-protected and this is the exact, intended integration point (same backend, no new project). `.env.example` stays as the checked-in placeholder template.
- Added a temporary debug section to the Phase 2/3 Products placeholder screen (`src/app/(app)/(tabs)/products/index.jsx`) that fetches one live `products` row and renders it through `mapProductRow` — clearly commented as Phase-4-only, to be replaced entirely by the real catalog fetch in Phase 8.

**Modifies:** the Products placeholder screen (debug section only, see above).
**Reuses:** direct, line-level ports of `SupabaseConfig.js`, `supabaseProducts.js`, `supabaseOrders.js`, `paymentLabels.js`, plus the exact pricing formulas from `ProductsPage.jsx`/`CartPage.jsx` — all re-read from source for this port rather than trusted from memory.
**Dependencies:** Phase 1.
**Supabase dependencies:** connects to the same live project as the web app.
**Testing performed — this went further than "one debug screen," because schema correctness matters and a live project was reachable:**
- Wrote and ran a standalone Node script (outside the RN app, using the same `@supabase/supabase-js` install) that queried the live project directly with the real anon key. Confirmed `status: 200` and, critically, **the real `products` table's column names match `mapProductRow`'s assumptions exactly** — `short_description`, `gst_rate`, `hsn_code`, `max_stock`, `has_variants`, `variants`, every field the mapper reads is present, byte-for-byte. This directly resolves the `products`-table portion of Unclear Item 5 (no local schema file existed to verify against — now empirically confirmed against the live project instead).
- Also probed `orders`, `reviews`, `settings`, `promo_codes`, `profiles` read-only: `orders`/`profiles`/`promo_codes` correctly returned 0 rows to the anonymous key (RLS scoping working as documented — good sign, not a bug), `reviews` and `settings` columns matched the documented shapes (`settings` really is a single jsonb `data` column, as assumed in §6). Deleted the probe scripts after — they're not part of the app.
- `npx eslint .` → clean. `npx expo-doctor` → 20/20, and explicitly logged `env: load .env` / `env: export EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_SUPABASE_URL`, confirming the env vars are actually being picked up, not just present in a file nobody reads. `npx expo export --platform android` → bundled successfully (1498 modules) with the env-var guard in `lib/supabase.js` *not* throwing, which is itself proof the real credentials were inlined at build time.
- **Not tested:** actually running the debug screen on a device/simulator and watching the live product render — no simulator/device available here. The Node-script probe is strong evidence the same call would succeed inside the app, but it isn't the same as observing it happen in the app itself.
**Acceptance:** Supabase client is real (no mock), connects to the live project (verified via direct query, not assumed), and mapper shapes are confirmed correct against the actual schema for `products` (and consistent for the other probed tables). No service-role key or secret anywhere in the RN app or its bundle — confirmed by construction (never referenced) and by this phase's export succeeding without needing one.
**Risks:** none outstanding for the tables probed. Tables not yet probed (`cart_items`, `wishlist_items`, `stock_alerts`, `upload_sessions` etc.) remain unverified against the live schema — will confirm each when its owning phase (6, 12, etc.) actually needs it, rather than probing everything speculatively now.

### Phase 5 — Authentication — DONE (2026-09-01)
**Objective:** Implement Login, Signup, Reset-Password screens and the session-restore bootstrap, matching the web flows, with the admin-blocking decision from Unclear Item 4 applied.

**What was actually done:**
- Installed `@reduxjs/toolkit` + `react-redux` (matching the web app's versions) and `expo-crypto` (for `randomUUID()` — RN/Hermes doesn't reliably provide a global `crypto.randomUUID` the way browsers do).
- Re-read the actual source files (`LoginPage.jsx`, `SignupPage.jsx`, `ResetPasswordPage.jsx`, `sessionManager.js`, `sessionUtils.js`, `useSessionWatcher.js`, and the auth portion of `App.jsx`'s bootstrap effect) rather than the earlier summarized research, since auth correctness matters as much as pricing correctness.
- **`src/store/UserSlice.js` + `src/store/index.js`** — real Redux store, ported `UserSlice.js` verbatim. Registers only the `user` reducer for now; Phase 6 adds cart/wishlist/products to the same store rather than creating a second one.
- **`src/utils/sessionManager.js`** — ported the single-device-session enforcement (`registerNewSession`, `forceLogout`, the post-login grace window) with `localStorage`→`AsyncStorage` (now async), `navigator.userAgent`→`expo-device` fields, `crypto.randomUUID()`→`expo-crypto`'s, and `window.location.href`→`expo-router`'s imperative `router.replace()`.
- **`src/hooks/useSessionWatcher.js`** — ported the Realtime `profiles.active_session_id` watcher that logs a device out when another device logs in elsewhere; only change was making the local-id read async.
- **`src/hooks/useAuth.js`** — real `login`/`signup`/`requestPasswordReset`/`updatePassword`/`logout`, matching the web's exact Supabase call sequence and error-message mapping (`getAuthErrorMessage`). **Deliberately dropped** the cross-tab `BroadcastChannel` "auto-logout the other browser tab" step from `LoginPage.handleLogin` — that's a multi-tab web concept with no meaning in a single-instance mobile app, already flagged for removal in the original analysis's component matrix.
- **Root layout (`src/app/_layout.jsx`)** — now wraps everything in a real Redux `<Provider>` and runs the auth-only portion of the web's session-restore bootstrap (`getSession`/`onAuthStateChange` → fetch `profiles` row → `setUser`/`clearUser`, gated behind an `authChecked` flag exactly like the web's `Loader` gate). **Cart/wishlist loading from that same web effect was deliberately left out** — that's Phase 6, not duplicated here.
- **`(auth)/_layout.jsx`, `(app)/_layout.jsx`, `app/index.jsx`** — swapped the Phase 2 mock-auth context for real `useSelector((s) => s.user.user)` checks; the admin-block screen logic is unchanged, now driven by the real `profile.role`.
- **Real screens:** `login.jsx` (email/password, forgot-password mode toggle, the "you were logged out — session conflict" banner read from the redirect's `reason` param), `signup.jsx` (core fields — name/email/password/confirm; see scoping note below), `reset-password.jsx` (see deep-link note below). `profile.jsx` now shows the real logged-in user's name/role and calls the real `logout()`.
- **Retired** `src/dev/mock-auth.jsx` entirely — no longer needed now that real auth exists.
- **Scoping decision (flagging, not hiding):** `signup.jsx` collects only the required fields (name/email/password/confirm). The web signup form also collects optional phone/gender/DOB/address — these are still fully supported by the backend (same `signUp` metadata shape, blank defaults sent either way) and remain editable later via Profile, exactly as the web app already allows for anyone who leaves them blank at signup. Deferred rather than built now because DOB in particular needs a native date-picker component that Phase 5 (Authentication) has no other reason to install; Phase 15 (Profile) is the natural place to add it once, for both signup-if-you-want-it-later and profile-editing.
- **Reset-password deep link:** ported `Linking.createURL('reset-password')` as the `redirectTo`, and — since RN has no URL-fragment auto-parsing — wrote explicit handling for **both** shapes a Supabase recovery email can produce (`token_hash`+`type` via `verifyOtp`, or `access_token`+`refresh_token` via `setSession`), since which one this project's actual email template sends isn't verifiable without triggering a real email. This is Unclear Item 10 territory — **you'll need to add this app's redirect URL to Supabase Auth's allowed redirect list on the dashboard** before this screen can work end-to-end; I can't do that step for you.

**Modifies:** `app/_layout.jsx`, `app/index.jsx`, `(auth)/_layout.jsx`, `(app)/_layout.jsx`, `(app)/(tabs)/profile.jsx` (all switched from mock to real auth state).
**Reuses:** direct, re-verified ports of `LoginPage.jsx`/`SignupPage.jsx`/`ResetPasswordPage.jsx`/`sessionManager.js`/`sessionUtils.js`(partial)/`useSessionWatcher.js`.
**Dependencies:** Phases 1–4.
**Supabase dependencies:** `auth.signUp`, `auth.signInWithPassword`, `auth.resetPasswordForEmail`/`updateUser`, `profiles` read + the `active_session_id`/`last_login_*` update fields from Phase 4's confirmed schema probe.
**Testing performed:** `npx eslint .` → clean (fixed a duplicate-import and an exhaustive-deps warning along the way). `npx expo-doctor` → 20/20. `npx expo export --platform android` → bundled successfully (1519 modules) with the real Redux store, hooks, and all three auth screens compiled in.
**Not tested, and why — read before assuming this works:**
- **No live login/signup/logout was actually exercised.** Unlike Phase 4's read-only schema probes, actually testing signup writes a real (if disposable) user into the live project's `auth.users`/`profiles` tables, and testing login requires completing email confirmation via a real inbox I don't have access to. Creating persistent side effects in your live backend without being asked crosses a line a schema-only `SELECT` probe doesn't, so I deliberately did not do this — this is a judgment call, tell me if you'd rather I had.
- **No device/simulator was available** to click through the flows and observe the loading gate, the redirect behavior, the admin-block screen, or AsyncStorage session persistence across an app restart.
- Net effect: this phase's code is verified correct **by construction** (re-read against the real source, exports cleanly, no lint errors) but **not verified by observation**. Please run `npx expo start`, sign up with a real email you control, confirm it, log in, restart the app to confirm the session persists, and try logging in with an admin-role test account to confirm the block screen appears — then let me know what broke, if anything.
**Acceptance:** code-complete and internally consistent with the rest of the app; end-to-end functional acceptance is pending your manual pass per the note above.
**Risks:** the reset-password dual-shape handling is my best defensive guess at what Supabase's email template sends — if neither `verifyOtp` nor `setSession` succeeds against a real reset email, that's the first thing to check. Single-device-session enforcement will log out any other active session (web or mobile) for the same test account — expected, not a bug.

### Phase 6 — Global User State (Cart & Wishlist slices) — DONE (2026-09-01)
**Objective:** Port the Redux `cart`/`wishlist` slices and the cart/wishlist load-and-subscribe bootstrap (`App.jsx`'s `loadCartAndWishlist` + Realtime channel), with no product/cart UI consuming it yet beyond a debug view.

**What was actually done:**
- Re-read the actual source (`CartSlice.js`, `WishlistSlice.js`, `supabaseCart.js`, `supabaseWishlist.js`, and the cart/wishlist half of `App.jsx`'s bootstrap effect) rather than the earlier summary.
- **`src/store/CartSlice.js`** — ported verbatim; already internally consistent (every reducer compares `String(id)`), no bug to fix here.
- **`src/store/WishlistSlice.js`** — ported with the **Unclear Item 9 fix applied**: the source's `removeWishlist` compared the raw (possibly non-string) `item.id` against the payload while `addWishlist` deduped via `String(item.id)` — a real id-type mismatch that could leave stale entries. Both reducers now consistently use `String(id)`.
- **`src/services/supabaseCart.js`** / **`src/services/supabaseWishlist.js`** — verbatim ports of the CRUD functions (`upsertCartItem`, `removeCartItem`, `decrementOrRemoveCartItem`, `clearCartItems`, `parseCartIds`, `nextAddQuantity`/`nextRemoveQuantity`, `addWishlistItem`, `removeWishlistItem`).
- **`src/store/index.js`** — added `cart`/`wishlist` reducers to the same store Phase 5 created. **Deliberately did not port** `ProductSlice`/`LoadingSlice` this phase (both were in this phase's original file list) — `products` has no real consumer until Phase 8's catalog fetch exists, and a global `loading` flag doesn't map cleanly onto this app's per-screen loading-state pattern (each async action already manages its own local `loading` state, e.g. the Phase 5 login screen). Flagging this explicitly since it's a real deviation from the original file list, not a silent one — will add `ProductSlice` in Phase 8 when it has an actual consumer, and will add a loading slice later only if a genuine cross-cutting need for one shows up.
- **Root layout (`src/app/_layout.jsx`)** — extended `AuthGate`'s bootstrap effect with the full `loadCartAndWishlist` port: the debounced Realtime-subscribed cart fetch (joining `products` for live price/discount/stock), the optimistic-update merge guard (`cartItemsRef` — protects a fast tap from being rolled back by a slightly-stale DB re-fetch), the `areCartItemsEqual` dedupe-dispatch check, and the one-shot wishlist fetch. Both clear to `[]` on logout, matching the web exactly.

**Modifies:** `src/app/_layout.jsx` (bootstrap extended); `src/app/(app)/(tabs)/cart.jsx` and `wishlist.jsx` (temporary debug sections added, rendering the real Redux state — no mock data).
**Reuses:** direct, re-verified ports of `CartSlice.js`, `WishlistSlice.js` (bug fixed), `supabaseCart.js`, `supabaseWishlist.js`, and `App.jsx`'s cart/wishlist bootstrap logic.
**Dependencies:** Phases 4–5.
**Supabase dependencies:** `cart_items` (CRUD + Realtime), `wishlist_items` (CRUD).
**Testing performed:**
- Went further than a plain schema check: ran a Node probe against the live project with the **exact join query** `fetchCart` uses (`quantity, product_id, variant_id, variant_name, price, title, image, category, products(title, price, discount, discount_expiry, stock, thumbnail, image, category, variants)`). It returned `status: 200` — since PostgREST resolves column/relationship references before RLS filters rows, a wrong column or relationship name in that join would have 400'd regardless of the anon key seeing 0 rows. This is concrete evidence the join is valid against the live schema, not just plausible-looking. Also confirmed `wishlist_items`/`stock_alerts` accept the plain-select shape their respective functions assume.
- `npx eslint .` → clean. `npx expo-doctor` → 20/20. `npx expo export --platform android` → bundled successfully (1521 modules) with the extended bootstrap, both slices, and both service files compiled in.
**Not tested, and why:** as in Phase 5, no live cart/wishlist data was actually loaded through the running app, and no cross-device Realtime sync was observed. That needs a logged-in session (blocked on the same email-confirmation/no-inbox constraint as Phase 5) plus a device/simulator to watch the Realtime channel actually fire — neither is available here. The join-query probe above is strong evidence the fetch *would* succeed, but "the query is valid" and "I watched it sync live" are different claims, and I'm not conflating them.
**Acceptance:** code-complete, consistent with Phase 5's auth state, and the one known bug (Unclear Item 9) fixed during the port rather than carried forward. Live sync behavior is unverified per the note above — please confirm once you can run the app: add an item to cart/wishlist on the web app while logged in as the same test account, then check it appears in the RN app (and vice versa).
**Risks:** none newly identified. The originally-anticipated risk (RN's WebSocket/URL-polyfill setup needing extra config for Realtime) didn't need any changes beyond what Phase 4 already installed (`react-native-url-polyfill`) — RN provides `WebSocket` natively — but this is still unconfirmed by an actual live connection, so keep an eye on it during your manual pass.

### Phase 7 — ~~Home Screen~~ (removed)
Removed per your 2026-09-01 direction: no LandingPage/marketing screen is included. The app opens directly to Product Listing (Phase 8, renumbering kept as-is below to avoid needless churn in cross-references — treat "Phase 7" as skipped).

### Phase 8 — Product Listing — DONE (2026-09-01)
**Objective:** Port `ProductsPage`'s mobile-branch logic: fetch, client-side search/filter/sort, grouped 2-column grid, filter bottom sheet, add-to-cart/wishlist actions.

**What was actually done:**
- Re-read the real source (`ProductsPage.jsx`'s mobile block, `FiltersSidebar.jsx`, `ProductCard.jsx`, `ProductCardSkeleton.jsx`) rather than the earlier summary. One important discovery from that re-read: **the mobile grid's `<ProductCard variant="mobile">` is fully self-contained** — it has its own internal Redux+Supabase cart/wishlist handlers, completely independent of `ProductsPage`'s own `handleAddToCart`/`handleDecrement`/`handleToggleWishlist` (which are actually only consumed by the *desktop* card, dead code from this app's mobile-only perspective). This simplified the port: the RN `ProductCard` just needed its own self-contained handlers, no prop-drilling from the screen.
- **`src/store/ProductSlice.js`** — ported verbatim (added to the store now that it has a real consumer, per the Phase 6 deferral).
- **`src/components/ProductCard.jsx`** — ported the mobile-variant card with its cart/wishlist logic intact, and two flagged, deliberate deviations:
  1. **Skipped the source's per-card `reviews` re-fetch.** Confirmed by reading the code that this is a genuine N+1 — `ProductsPage`'s own fetch already computes `rating`/`reviewCount` for every product in one batched query and attaches them before the card ever renders, so the card's own separate fetch recomputes the exact same numbers redundantly. RN's card just reads `product.rating`/`product.reviewCount` directly. Same displayed output, one less network round-trip per card — not a behavior change, so I made this call rather than stopping to ask, but I'm flagging it here rather than letting it pass silently.
  2. **Fixed `$` → `₹`.** The source's mobile card literally hardcodes a dollar sign for the price label while every other price display in this app (FiltersSidebar, Cart, invoices, GST) uses ₹ — an isolated currency-symbol slip, not an intentional USD price, in an app that's otherwise GST/HSN/₹ throughout. Corrected for consistency.
  - Everything else (stock-label thresholds, the quantity stepper, out-of-stock disabling) is a direct, unchanged port.
- **`src/components/Skeleton.jsx` + `ProductCardSkeleton.jsx`** — checked whether NativeWind's runtime maps Tailwind's `animate-pulse` to a native animation driver before relying on it (it doesn't — confirmed by grepping the compiled interop for any handling of it), so the pulse is implemented directly with `react-native-reanimated` instead of gambling on an unsupported className.
- **`src/components/FiltersSheet.jsx`** — ported category chips, the price-range control (installed `@react-native-community/slider` — a real, needed dependency, not a premature one, since RN has no native range-slider), the rating radio options, and the sort options, as an RN `Modal` instead of a CSS bottom sheet. **One simplification, flagged:** skipped porting the source's second, redundant search input that lives inside the filter sheet bound to the exact same `search` state the screen's own top search bar already edits — same state, same behavior, just one fewer duplicate text field.
- **`src/app/(app)/(tabs)/products/index.jsx`** — replaced the Phase 4 debug placeholder with the real screen: the exact `fetchProducts` port (products + reviews queries, rating aggregation, `mapProductRows`), the exact filter/sort/group `useMemo` predicate, category/price/rating/search/sort state, `activeFilterCount`, empty/loading states. **Layout decision, flagged:** rendered the category-grouped sections via an outer `FlatList` (virtualizing at the section level) with each section's own 2-column `flex-wrap` grid, rather than fighting `FlatList`'s `numColumns` to make a header item span full width — a real RN constraint (spanning a header across columns isn't natively supported), not a shortcut. The dead `display:none` bottom-nav markup the source keeps around was skipped entirely rather than ported-and-hidden, since our real Expo Router tab bar already replaces it.

**Modifies:** `src/store/index.js` (added `products` reducer); `src/app/(app)/(tabs)/products/index.jsx` (real screen, replacing the Phase 4 debug placeholder).
**Reuses:** `getMrp`/`getDiscount`/`getPrice`/`getStock`/`getMaxStock` from `utils/pricing.js` (Phase 4), `mapProductRows` from `utils/mappers.js` (Phase 4), the cart/wishlist service functions and slices from Phase 6.
**Dependencies:** Phases 3, 4, 6.
**Supabase dependencies:** `products` (select), `reviews` (batched rating aggregation).
**Testing performed — this is the first phase with a real, observed end-to-end result, not just a schema probe:**
- Ran the **exact ported `fetchProducts` logic** (both queries, the rating-aggregation loop, `mapProductRows`) as a Node script against the live project. It returned **29 real products across 6 categories** (furniture, Super, fragrances, beauty, groceries, chienese — real seed data, typo and all, left untouched since it's database content, not app code), with 3 products carrying real reviews correctly averaged. This is concrete proof the exact logic this screen runs produces correct, sane output against live data — a stronger check than any prior phase's read-only schema probe.
- `npx eslint .` → clean. `npx expo-doctor` → 20/20. `npx expo export --platform android` → bundled successfully (1537 modules) with the new slider dependency, both new components, and the real screen compiled in.
**Not tested:** actually scrolling, tapping filters, and tapping add-to-cart in the running app — still no simulator/device available. The Node-script result proves the data layer is correct; it doesn't prove the `FlatList`/`Modal`/`Slider` UI renders and responds to touch correctly. Please run `npx expo start`, open Products, and confirm search/category chips/price slider/rating/sort all narrow the grid correctly, and that add-to-cart/wishlist taps update immediately and persist (check Supabase after).
**Acceptance:** data layer verified end-to-end against live data; UI interaction unverified per the note above.
**Risks:** the anticipated "full-catalog-fetch may be slow on a large catalog" risk didn't materialize here — 29 products is trivial — but this project's live catalog is small test/seed data, not a real production-scale catalog, so that risk is still open for whenever real inventory volume is loaded; flag it again if that changes rather than preemptively adding server-side pagination now.

### Phase 9 — Product Detail
**Objective:** Port PDP: fetch product+reviews+related, variant/quantity selection, add-to-cart/buy-now/wishlist, review list display, replacing the Swiper gallery with `react-native-reanimated-carousel`.
**Creates:** `app/(app)/(tabs)/products/[id].tsx`, `components/ImageCarousel.tsx`, `components/ProductDetailSkeleton.tsx`.
**Reuses:** variant-price/stock-resolution logic, cart-payload-building logic from `ProductDetail.jsx`.
**Dependencies:** Phases 4, 6, 8.
**Supabase dependencies:** `products` (by id + related), `reviews` (read).
**Testing:** real product with variants and reviews renders correctly; stock/out-of-stock disabling works; add-to-cart reflects in Phase 6's cart state.
**Acceptance:** functional parity with web PDP's mobile branch.
**Risks:** carousel gesture/perf tuning is the main unknown; will test on a real device, not just simulator, since scroll/gesture feel doesn't always translate from simulator.

### Phase 10 — Cart
**Objective:** Port cart list, quantity editing, promo code application, and the pricing display pipeline (§5) — checkout/payment methods deferred to Phase 11.
**Creates:** `app/(app)/(tabs)/cart.tsx`, `components/CartLineItem.tsx`.
**Reuses:** `isDiscountActive`/subtotal/promo/shipping/total pipeline (ported to `utils/pricing.ts`), `nextAddQuantity`/`nextRemoveQuantity`.
**Dependencies:** Phases 4, 6, 8.
**Supabase dependencies:** `settings` (read, for shipping threshold/fee display), edge fn `promo-validate`.
**Testing:** quantity changes persist correctly; promo code apply/remove matches web's displayed discount for a known test code; empty-cart state renders.
**Acceptance:** cart totals displayed match what the web app would show for the same cart contents (both are estimates — server remains authoritative at actual checkout, per §5's key architectural note).
**Risks:** none major — this phase deliberately excludes the payment SDK integration to keep it testable in isolation.

### Phase 11 — Checkout & Payments
**Objective:** Implement the three payment paths: Razorpay (via `react-native-razorpay`, requiring a dev client per Unclear Item 6), Cash-on-Delivery, and WhatsApp order (via `Linking`), calling the same three Edge Functions the web app uses.
**Creates:** `components/PaymentMethodSheet.tsx`, `services/razorpay.ts`, `services/promo.ts` wiring into real Edge Function calls.
**Modifies:** `cart.tsx` to wire the checkout button to this flow.
**Reuses:** the exact request/response contract with `payment-create-order`/`payment-verify`/`payment-cod-create`/`promo-validate` — zero changes needed server-side since the client already only ever sent `{productId, variantId, quantity}`.
**Dependencies:** Phases 1–10; **requires switching from Expo Go to a custom dev client build** starting this phase.
**Supabase dependencies:** the four Edge Functions listed in §6.
**Testing:** a real (test-mode, if Razorpay test keys are configured on the project) end-to-end purchase for each of the 3 payment paths against the live backend.
**Acceptance:** an order is created and verifiable in the `orders` table / visible in Order History (Phase 13) for all 3 payment methods; email verification and address-required gates behave the same as web.
**Risks:** this is the highest-risk phase — native payment SDK + dev client setup + real money-adjacent flows (even in test mode) warrant careful, deliberate testing before calling it done. Will not mark this phase complete without an actual successful test transaction.

### Phase 12 — Wishlist
**Objective:** Port wishlist list, live stock/price join, move-to-cart, remove, notify-me (`stock_alerts` insert), share.
**Creates:** `app/(app)/(tabs)/wishlist.tsx`.
**Reuses:** Phase 6's wishlist slice/service; fixes the id-type bug per Unclear Item 9's resolution.
**Dependencies:** Phases 4, 6, 8.
**Supabase dependencies:** `products` (live join), `stock_alerts` (insert).
**Testing:** live price/stock reflects current catalog state, not a stale snapshot; move-to-cart updates both wishlist and cart state correctly.
**Acceptance:** functional parity with web wishlist, bug fixed.
**Risks:** low.

### Phase 13 — Order History & Invoices
**Objective:** Port ongoing/past order lists, order detail, "Buy Again" (fixed per Unclear Item 8), and invoice generation via `expo-print` (Unclear Item 7 resolution).
**Creates:** `app/(app)/orders/index.tsx`, `[id].tsx`, `components/OrderCard.tsx`, `utils/invoice.ts`.
**Reuses:** `mapOrderRow`, status-label logic, GST-split math from Phase 4.
**Dependencies:** Phases 4, 6.
**Supabase dependencies:** `orders`+`order_items` (read, scoped to own user), `products` (thumbnail enrichment).
**Testing:** real order history renders correctly for a test account with existing orders across all statuses; invoice PDF generates and opens the native share sheet; "Buy Again" correctly restores the original variant.
**Acceptance:** functional parity plus the two bug fixes.
**Risks:** `expo-print`'s HTML-to-PDF fidelity vs. jsPDF's precise table layout may need visual tuning to look "invoice-like."

### Phase 14 — Reviews
**Objective:** Wire the review-submission modal (5-star + comment) into the Order History pages, calling `reviews-create`.
**Creates:** `components/ReviewModal.tsx`, `services/reviews.ts`.
**Modifies:** `orders/index.tsx`/order card component to add the "Review" entry point.
**Reuses:** the exact validation rules (rating required always; comment required on one page, optional on the other, per source app's actual — if inconsistent — behavior, unless you'd rather I unify it, which would be a small behavior change I'd flag before doing).
**Dependencies:** Phase 13.
**Supabase dependencies:** edge fn `reviews-create` (purchase-verified upsert).
**Testing:** submit a review against a real delivered order; confirm it appears on the corresponding Product Detail page (Phase 9) since reviews are shared read data.
**Acceptance:** functional parity.
**Risks:** low.

### Phase 15 — Profile / Account
**Objective:** Port profile view/edit (name/phone/gender/DOB/address), avatar upload, and password change.
**Creates:** `app/(app)/(tabs)/profile.tsx`, `components/EditProfileSheet.tsx`, `components/ChangePasswordModal.tsx`.
**Reuses:** `validateImageFile` (Phase 4 util), the re-auth-via-sign-in password-change pattern.
**Dependencies:** Phases 4, 5.
**Supabase dependencies:** `profiles` (read/update), Storage bucket `avatars`, `auth.updateUser`.
**Testing:** edit and save each field against the live account; upload an avatar image via `expo-image-picker`; change password and confirm re-login works with the new password.
**Acceptance:** functional parity.
**Risks:** image picker permissions (camera/library) need proper Expo config plugin entries — will verify on-device, not just simulator.

### Phase 16 — Shared Components / Polish
**Objective:** Sweep pass — consistent loading/error/empty states across all screens (web's biggest gap was inconsistent error handling — e.g. console-only errors on ProductsPage fetch failure), consistent toast/alert pattern (fixing the stray `alert()` noted in §5), safe-area/keyboard-avoiding audit, dark-mode pass if you want it (web has a dark theme — confirm if RN should too, treating as a mini Unclear Item to raise then if not already answered).
**Creates/Modifies:** touches most screens lightly; no new features.
**Dependencies:** Phases 5–15.
**Testing:** manual pass through every screen checking loading/empty/error states actually render something reasonable (not a blank screen or silent console error).
**Acceptance:** no screen silently fails; consistent visual language.
**Risks:** scope creep — will keep this phase strictly to consistency fixes, not new functionality, per your no-gold-plating instruction.

### Phase 17 — Testing Pass
**Objective:** Structured regression pass across every workflow in §3 on both platforms available to us.
**Testing:** whatever combination of iOS simulator / Android emulator / physical device(s) you have available — I will explicitly state what was and wasn't tested rather than claim untested platforms work, per your instructions.
**Acceptance:** a documented pass/fail list per workflow per platform tested.
**Risks:** none — this phase is about surfacing risk, not introducing it.

### Phase 18 — Device Compatibility / Release Prep
**Objective:** App icons, splash screen, `app.json`/EAS config, permissions manifest review (camera/photo library for avatar upload, any others), build profiles for a first internal test build (EAS Build), Supabase Auth redirect-URL production values.
**Dependencies:** all prior phases.
**Acceptance:** a distributable internal build (TestFlight/Internal Testing track or EAS-shared build) that a real device can install and run through the full purchase flow.
**Risks:** first EAS Build setup often surfaces config issues (bundle identifiers, permissions strings) — expected, will resolve iteratively.

---

## Phase Dependency Chain

```
Phase 1 (Foundation)
   ↓
Phase 2 (Expo Router)
   ↓
Phase 3 (NativeWind/Tokens) ──┐
   ↓                          │
Phase 4 (Supabase/Utils)      │  (3 & 4 can run in either order relative to
   ↓                          │   each other once 1–2 are done, but both
Phase 5 (Auth)                │   must land before any real screen work)
   ↓                          │
Phase 6 (Cart/Wishlist state)◄┘
   ↓
Phase 8 (Products, app entry point) ── Phase 9 (Product Detail)
                        ↓
                  Phase 10 (Cart) → Phase 11 (Checkout/Payments)
                        ↓
                  Phase 12 (Wishlist)
                        ↓
                  Phase 13 (Orders/Invoices) → Phase 14 (Reviews)
                        ↓
                  Phase 15 (Profile)
                        ↓
                  Phase 16 (Polish) → Phase 17 (Testing) → Phase 18 (Release prep)
```

Phase 7 (Home) is removed — no Landing/marketing screen, per your direction. Phases 8, 12, 15 are largely independent of each other once Phase 6 lands and could be reordered if you'd rather prioritize differently (e.g., Profile before Wishlist) — say so when we get there.

---

## What Happens Next

No code has been written. `Ecommerce-app/` remains empty except for this analysis file. The source app at `Ecommerce-sept-1-2026/Ecommerce-sept-1-2026` has not been touched.

Before Phase 1 starts, it would help (but isn't strictly required) to get your read on Unclear Items 1–10 above — especially **4** (admin-blocking policy), **3** (Home screen scope), and **5** (schema verification), since those shape early phases the most. Items 6, 7, 8, 9, 10 can be decided later, right before their respective phase.

---

## Mobile Parity Pass — 2026-09-29

A dedicated pass comparing **every source mobile branch against its RN
counterpart**, run against the newer source snapshot `Ecommerce-sept-29-2026`
(Phases 1–16 were built against the older `Ecommerce-sept-1-2026`). Scope was
unchanged: user role only, mobile branch only, no admin, no Landing/Process.
Tracked in `HANDOFF_MOBILE_PARITY.md`, which this section supersedes on status.

### Why the pass was needed

Five cross-cutting gaps, each present on most screens rather than one:

1. **No vector icons.** The RN port drew every icon as a text glyph or emoji
   where the source uses `lucide-react`. Font glyphs have inconsistent metrics
   across iOS/Android and can't be sized or coloured to match the source.
2. **No toast system.** The source confirms ~25 actions through
   `react-toastify`; the port either dropped the confirmation or raised a
   blocking `Alert.alert`, which is a different interaction.
3. **Tab bar** had no icons, no cart badge, and hardcoded light-mode colours.
4. **Header** was missing most of `MobileNav`'s user menu.
5. **`--color-chart-gold`** — the rating-star colour every mobile star in the
   source uses — was never ported.

### Foundation added

| File | Purpose |
|---|---|
| `src/components/Icon.jsx` | Single icon entry point. `NAMES` is keyed by the **lucide** name used in the source, so a lookup reads directly against the web file it was ported from. Feather for the stroke icons Lucide shares with it (Lucide is a Feather fork), Ionicons for the solid variants Feather lacks (`star-filled`, `heart-filled`, `whatsapp`), MaterialCommunityIcons for `banknote`. Unknown name logs a warning and renders nothing rather than crashing. |
| `src/components/Stars.jsx` | `<Stars>` (display) and `<StarPicker>` (tappable), replacing the repeated-star-character approach. The source's `onMouseEnter` hover-preview has no touch analogue and is not ported. |
| `src/lib/toast.js` + `src/components/ToastHost.jsx` | `react-toastify`-shaped emitter so ported call sites read identically, rendered as the source's **own mobile** toast treatment (MyProfile's bottom-centred dark pill), not its desktop `position="top-right"`. `pointerEvents="none"` so it can't swallow taps on a bottom action bar. |
| `src/hooks/useThemeColors.js` | Literal colour values for the active scheme, for the props that can't take a `className` — vector-icon `color`, `placeholderTextColor`, `ActivityIndicator color`, `Slider`/`tabBar` tints. These previously hardcoded light-theme hex and so ignored dark mode. |
| `global.css` / `tailwind.config.js` / `constants/theme.js` | `--color-chart-gold` (light `#d4af37`, dark `#e6c34d`) + `chartGold`. |

`@expo/vector-icons@^15.0.2` was added to `package.json`.

### Functional fixes (not cosmetic)

These changed behaviour, and are called out because the rest of the pass did not:

- **`useAuth.logout(uid)`** now clears `profiles.active_session_id` **and**
  `clearLocalSession()` **before** `signOut()`, ported from
  `MobileNav.handleLogout`. Without it the single-device-session watcher
  compares a cleared local id against a still-set `profiles` id on the next
  login and can bounce the user straight back out. The `profiles` update must
  precede `signOut()` or RLS rejects it.
- **`useAuth.signup()`** now accepts and forwards
  `phone / gender / dateOfBirth / street / city / state / pincode`. They were
  hardcoded blank, which **silently discarded** those values.
- **`(auth)/signup.jsx`** gained the source's two optional sections
  (**Personal Details**, **Delivery Address**). Previously only the Account
  section existed — and because `signup()` already forwarded the other keys,
  the effect wasn't just a shorter form: empty strings were written into a
  profile row the `on_auth_user_created` trigger creates once, at signup.
- **`(auth)/login.jsx`** session banner now branches on the source's `type`
  discriminator: `session_conflict` is a warning (accent tokens +
  `AlertTriangle`), `no_session` merely informational (info tokens + `Info`).
  Both had been collapsed onto the warning palette, so an expired session read
  as alarmingly as being kicked off by another device.
- **`orders/index.jsx`** reads `?tab=` so the header menu's **Current
  Orders** / **Past Orders** entries land on the right segment, with the title
  following it (the source's `ROUTE_TITLES` strings for `/userorders` and
  `/userpastorders`).
- **`ReviewModal`** submitting with no rating raised nothing at all — the
  button looked dead. Now reports it, as the source does.
- **`ProductCardSkeleton`** was missing the card's rating row and the stock
  label beside the price, so the placeholder was two rows shorter than the
  card it stands in for and the grid shifted when data landed.

### Deliberate deviations from source

Each is also flagged in-file, per this codebase's convention:

- **Past orders shows delivered + cancelled.** The source's mobile Past page
  lists delivered only — its All/Delivered/Cancelled tabs are a desktop-only
  control, so cancelled orders are invisible on mobile web. Kept as a
  superset: it adds reachability for orders otherwise visible nowhere in this
  app and removes nothing. **Left as-is pending a call from you** — strict
  parity here would mean deleting working functionality.
- **`Alert.alert` retained in exactly one place**: `cart.jsx`'s
  `requireVerifiedEmail`. It blocks checkout, so the message must be read, not
  glanced at as it fades. Everything else moved to `toast.*`. The photo-library
  permission dialog in `profile.jsx` also stays an `Alert` — it explains why
  nothing happened.
- **Reset-password validation stays inline**, not toasts. The source toasts
  both validation failures; inline matches every other auth screen here and
  keeps the message on screen while the user fixes the field. The success
  confirmation *is* a toast, as the source has it.
- **`PaymentMethodSheet`** keeps the source's hardcoded brand colours
  (`#25D366`, `#1E293B`, `#34D399`, `#CBD5E1`) — third-party payment branding,
  not app tokens. Note this leaves the WhatsApp/COD rows low-contrast in dark
  mode, since `inverse` inverts to near-black while those backgrounds stay
  dark. That follows from the source pinning them to brand hex; it is not a
  porting slip, and changing it would mean departing from the brand colours.
- **`statusMeta`'s `icon`** now stores an `@/components/Icon` name
  (`check-circle-2` / `x-circle` / `truck`) plus a `tone` key, instead of the
  source's short discriminators (`"check"` / `"x"` / `"truck"`) that each call
  site re-dispatches on. Same rendered glyph, one branch instead of three.
- **`OrderCard`** derives its badge glyph from the status. The source's two
  mobile pages each hardcode one (`Clock` on Ongoing, `CheckCircle2` on Past,
  which lists delivered only); one RN component covers both lists, so keying
  off the status reproduces both pages for every status they can show.
- **`ProductCardSkeleton` / `ProductDetailSkeleton`** track the RN card and
  screen, not the source's own skeletons — both of those are desktop-shaped
  (a fixed `h-[340px]` card with a `max-w-[120px]` image; a `lg:grid-cols-12`
  grid) and reused responsively on mobile. RN has one form factor.
- **`ErrorState`** has no source counterpart (a Phase 16 addition), but its
  warning glyph was replaced with a real `alert-triangle` at 44px, matching
  every other full-screen state here.

### Verification status — read this before trusting the above

**There is no Node.js, npm, or Python on this machine**, and `node_modules` is
absent in both projects. Nothing in this pass has been lint-checked,
type-checked, built, or run. It is verified **by construction only**: each
change was made against the actual source file re-read at the time (not a
summary), and the following static checks were run by hand and pass:

- no `placeholderTextColor="#…"` anywhere in `src/`
- no `Colors.light` / `Colors.dark` outside `useThemeColors.js`
- no UI glyph/emoji left outside comments
- every `<Icon name>` used — static and dynamic — resolves in `Icon.jsx`'s
  `NAMES` map (47 entries)
- every `tone` key resolves in `constants/theme.js`
- no unused or duplicated imports in the touched files; braces/parens balance

`@expo/vector-icons` is in `package.json` but **not installed** — in
`package-lock.json` it currently exists only nested under `expo/node_modules`,
so a bare `import { Feather } from '@expo/vector-icons'` will not resolve until
someone runs `npm install`. **The app will not start until then.**

Required once Node is available, in order:

```bash
npm install
```

```bash
npx expo-doctor
```

```bash
npx eslint .
```

```bash
npx expo export --platform android
```

Device-level behaviour (Razorpay needs a custom dev client; the iOS `Modal`
vs. toast layering noted in `lib/toast.js`; `DateTimePicker` on both
platforms) remains unverified and cannot be claimed from here.

---

## Audit — 2026-09-29

After the mobile-parity pass, a security / correctness / performance audit was
run over all 63 files in `src/`. Findings, severities, proof-of-concept for the
one High issue, and the remediation status of each are in
**`AUDIT_2026-09-29.md`**. Summary of what it changed in code:

- **Fixed (security):** HTML/script injection in the invoice generator
  (`utils/invoice.js` — user-controlled profile fields reached the print HTML
  unescaped; same-origin XSS on the web target). Deep-link token-`type`
  confusion in `reset-password.jsx`.
- **Fixed (correctness):** cart quantity helpers disagreed with `CartSlice` on
  item identity for `compound_id`-only items, silently persisting the wrong
  quantity. `Math.max(...products)` replaced with `reduce` (RangeError on large
  catalogs).
- **Fixed (performance):** `ProductCard` re-rendered the whole catalog on any
  cart change (narrowed selectors + `memo`); the products `FlatList`'s `data`
  was rebuilt every render; search lower-cased its needle per item.
- **Flagged, not changed** (each needs a product, legal, or schema decision):
  RLS policy tests, catalog/reviews query scalability, fire-and-forget cart
  writes, third-party IP lookup on login, `console.*` in release builds, admin
  mobile login clobbering the web admin session.

A Jest suite was added under `__tests__/` (`npm run test:logic`,
`npm run test:native`). It has **not been run** — still no Node on this machine.