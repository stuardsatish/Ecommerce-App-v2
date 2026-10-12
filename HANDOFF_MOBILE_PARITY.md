# Handoff — React → React Native mobile-view parity pass

> ## STATUS: §5 COMPLETE (2026-09-29)
>
> Everything in **§5.1–§5.6** below has been executed. The per-item checkboxes
> are left unticked as the original record of what the pass set out to do;
> **treat `MIGRATION_ANALYSIS.md`'s "Mobile Parity Pass — 2026-09-29" section as
> the authoritative status**, including the static checks that were run and the
> list of what remains unverified.
>
> Two things carried forward rather than decided here:
> - **§5.3's open question** (mobile Past-orders showing delivered-only vs. the
>   current delivered + cancelled) was left at the recommended default — the
>   superset is kept and flagged. Still your call.
> - **Nothing is build- or lint-verified.** Still no Node on this machine;
>   `npm install` remains required before the app can start, because
>   `@expo/vector-icons` is in `package.json` but not installed.

> **Paste this whole file as your first message in the new Claude Code session.**
> It contains the task, the analysis already done (so it doesn't need re-deriving),
> exactly what has been changed, and exactly what is left, file by file.

---

## 1. The task

Two projects sit side by side in the same folder:

| Project | Stack | Role |
|---|---|---|
| `Ecommerce-sept-29-2026/` | React 19 + Vite + React Router 7 + Redux Toolkit + Supabase | **Source of truth.** Has complete desktop **and** mobile views. |
| `Ecommerce-app/` | Expo SDK 55 + Expo Router v7 + NativeWind v4 + Supabase (plain JS, no TS) | **Target.** Mobile app being built from the source's mobile view. |

**Goal:** reproduce the source app's **mobile view**, end to end, for the **USER role only**, inside `Ecommerce-app`.

**Scope rules (do not violate):**
- **Admin is entirely out of scope.** Never port anything under `src/pages/Admin*`, `UsersPage`, `AddProductPage`, `EditProductPage`, `AddDiscountPage`, `CreateOrdersPage`, `BillingPage`, `Optimization`, `AllUsersOrdersAnalytics`, `AllProductsOrdersAnalytics`, `AdminUploadOrders`.
- **Mobile view only.** Each source page has an `isMobile` branch and a desktop branch. Port the **mobile** branch only. RN has one form factor.
- **No Home/Landing screen.** `LandingPage`, `ProcessDetailsPage`, `ScrollSequence` (GSAP/Lenis/canvas marketing content) are excluded by an earlier explicit decision. The app's entry tab is **Products**.
- Don't invent features that don't exist in the source. Don't silently change business rules — flag instead.

---

## 2. Paths

```
ROOT = C:\Users\2128299\Downloads\Ecommerce-sept-29-2026\Ecommerce-sept-29-2026\Ecommerce-sept-29-2026

WEB (source)  = ROOT\Ecommerce-sept-29-2026\src
APP (target)  = ROOT\Ecommerce-app
```

Also read `ROOT\Ecommerce-app\MIGRATION_ANALYSIS.md` — the original 666-line migration
plan and phase log (Phases 1–6, 8–16 were previously completed against an older
source snapshot named `Ecommerce-sept-1-2026`). It is still accurate on architecture,
decisions, and the resolved "Unclear Items". This handoff supersedes it on current status.

---

## 3. Environment constraint — READ FIRST

**There is no Node.js on this machine.** `node` and `npm` are not on PATH, and
`node_modules` is absent in **both** projects.

Consequences:
- Nothing described in §4 has been **lint-verified, build-verified, or run**. It is
  verified by construction only (read against source, consistent imports).
- `@expo/vector-icons` was **added to `package.json` but is not installed**. In
  `package-lock.json` it currently exists only nested under `expo/node_modules`,
  so a bare `import { Feather } from '@expo/vector-icons'` will **not resolve**
  until someone runs `npm install`.

**First thing to ask the user / do if Node is available:**

```bash
npm install
```

then

```bash
npx expo-doctor
```

```bash
npx eslint .
```

```bash
npx expo export --platform android
```

Report honestly whether these passed. Do not claim device-level verification
without a simulator/emulator/device.

---

## 4. COMPLETED (all inside `Ecommerce-app`)

The work was organised around five cross-cutting gaps found by comparing every
source mobile branch against its RN counterpart:

1. **No vector icons** — the RN port drew every icon as a text glyph or emoji
   (`‹ ⋮ ⌕ ☰ ♡ ★ ✕ ✎ ⧉ ✓ ⭳ ↻ → `), while the web uses
   `lucide-react` + `react-icons`.
2. **No toast system** — the web confirms ~25 user actions through `react-toastify`;
   the RN port either dropped those confirmations or used blocking `Alert.alert`.
3. **Tab bar** had no icons, no cart badge, and hardcoded light-mode colours.
4. **Header** was missing most of `MobileNav`'s user menu.
5. **`--color-chart-gold`** (the rating-star colour, used by every mobile star in
   the source) was never ported.

### 4.1 Foundation

| File | Change |
|---|---|
| `package.json` | **Added** `"@expo/vector-icons": "^15.0.2"` to `dependencies`. |
| `src/global.css` | **Added** `--color-chart-gold` → `#d4af37` (light `:root`) and `#e6c34d` (`.dark:root`). Updated header comment explaining why this one `chart-*` token is ported (the mobile user screens use it as the star colour) while the rest stay admin-only. |
| `tailwind.config.js` | **Added** `'chart-gold': 'var(--color-chart-gold)'`. |
| `src/constants/theme.js` | **Added** `chartGold` to both `Colors.light` and `Colors.dark`. Updated header comment. |
| `src/hooks/useThemeColors.js` | **NEW.** `useThemeColors()` returns `Colors.light`/`Colors.dark` per the active NativeWind colour scheme. For props that need a literal colour (vector-icon `color`, `placeholderTextColor`, `ActivityIndicator color`, `Slider *TintColor`, `tabBar*TintColor`) — these previously hardcoded light-theme hex and so ignored dark mode. |
| `src/components/Icon.jsx` | **NEW.** Single icon entry point. `<Icon name="shopping-cart" size={22} color={c.primary} />`. A `NAMES` map keyed by the **lucide** name used in the source → `Feather` (Lucide is a Feather fork, so glyphs match), `Ionicons` for solid variants Feather lacks (`star-filled`, `heart-filled`, `whatsapp`), `MaterialCommunityIcons` for `banknote`. Unknown name → `console.warn` + renders nothing rather than crashing. |
| `src/components/Stars.jsx` | **NEW.** `<Stars rating={n} size={12} round />` — the 5-star row, filled up to `Math.round(rating)` in `chart-gold`, rest in `border-strong` (exactly what the source does). `<StarPicker value onChange />` — the tappable variant for the review sheet (the web's `onMouseEnter` hover-preview has no touch analogue and is not ported). Replaces the old `'★'.repeat(n)` string approach. |
| `src/lib/toast.js` | **NEW.** `react-toastify`-shaped module-level emitter: `toast.success/error/info(msg)` + `subscribeToToasts(fn)`. Same call shape as the web source so ported call sites read identically. |
| `src/components/ToastHost.jsx` | **NEW.** Renders emitted toasts. Reanimated in/out mirroring `MyProfile.jsx`'s GSAP toast (`{y:24, opacity:0}` → `{y:0, opacity:1}` over 400 ms, 3000 ms hold matching `autoClose={3000}`, then out). Bottom-centred dark pill above the tab bar (the source's own **mobile** toast treatment; its `position="top-right"` is a desktop placement). `pointerEvents="none"` so it can't swallow taps on the bottom action bar. One at a time; a new toast replaces the current one. |
| `src/app/_layout.jsx` | Imports and mounts `<ToastHost />` as a **sibling of `<Stack>`, outside `AuthGate`** — so toasts survive route changes and work on the auth screens too. |

### 4.2 Shell

| File | Change |
|---|---|
| `src/app/(app)/(tabs)/_layout.jsx` | **Rewritten.** Ported `MobileNav.jsx`'s `<nav>`: tab icons (`store` / `shopping-cart` / `heart` / `user`, size 22), the **cart dot badge** (`cartCount > 0`) and its **600 ms bounce** when total cart quantity increases, theme-aware `tabBarActiveTintColor`/`InactiveTintColor`/background, 16 px top corner radius, MobileNav's `0px -8px 24px -6px rgba(0,0,0,0.10)` shadow, `height: 56 + insets.bottom`, 11 px `Inter_500Medium` labels. |
| `src/components/AppHeader.jsx` | **Rewritten.** Real `chevron-left` (24) and `more-vertical` (22) icons. Menu now carries `MobileNav`'s full non-admin item list: **My Profile**, **Current Orders** (`/orders?tab=ONGOING`), **Past Orders** (`/orders?tab=PAST`), **Edit Profile**. `Process` and `Contact` are the only source items omitted — both point at routes that don't exist here (web `/contact` 404s even on web; `/process-details` is excluded marketing content). Dark Mode toggle keeps its `moon`/`sun` icon; Logout gets `log-out` + `text-error`. "Signed in as" / "Welcome" + Guest fallback ported. MobileNav's `0px 2px 12px -6px rgba(16,24,40,0.14)` header shadow. |
| `src/hooks/useAuth.js` | **Two real functional fixes** (not cosmetic): <br>• `logout(uid)` now clears `profiles.active_session_id` **and** `clearLocalSession()` **before** `signOut()` — ported from `MobileNav.handleLogout`. Without this the single-device-session watcher compares a cleared local id against a still-set profiles id on the next login and can bounce the user straight back out. The `profiles` update must precede `signOut()` or RLS rejects it. <br>• `signup()` now accepts and sends `phone / gender / dateOfBirth / street / city / state / pincode`. These were hardcoded to blank defaults, which **silently discarded** anything typed into those fields. |
| `src/app/(app)/_layout.jsx` | Admin-block screen's logout → `onPress={() => logout(user.uid)}`. |

### 4.3 Products list

| File | Change |
|---|---|
| `src/components/ProductCard.jsx` | **Rewritten.** `expo-image` (remote CDN URLs, many at once in a scrolling grid — the caching case `MIGRATION_ANALYSIS.md` §4 recommends it for). `heart`/`heart-filled` icon (16, primary/muted). Single `star-filled` in `chart-gold` at 11 px — the source's mobile rating row is one star + text, not five. `minus`/`plus` icons in the stepper. Login gate → `toast.error('Please login first')` instead of the source's native `alert()` (flagged in §5 of the analysis as the app's one inconsistency). `active:` press states. Italic stock label via `style` (NativeWind can't express conditional `font-style` inline). |
| `src/app/(app)/(tabs)/products/index.jsx` | `search` (15) and `sliders-horizontal` (18) icons. `placeholderTextColor={c.muted}`. `returnKeyType="search"`. Now threads `search`/`setSearch` down to `FiltersSheet`. |
| `src/components/FiltersSheet.jsx` | **Rewritten.** Added the source sheet wrapper's **drag handle** and **corner close `x`**. **Restored the in-sheet search input** — it IS in the source's mobile sheet (bound to the same `search` state as the top bar); the earlier port dropped it as "redundant", but it's a duplicate by design on web. Rating rows now use real `<Stars>`. Selected sort option gets a `check` icon. Slider tint colours themed. |

### 4.4 Product detail

| File | Change |
|---|---|
| `src/app/(app)/(tabs)/products/[id].jsx` | `expo-image`. `heart`/`heart-filled` (20, primary/ink). `<Stars>` for the rating row and per-review stars. Variant chip image **44×44, radius 6** (was 24×24; source is 44). `alert-triangle` on the stock warning. `truck` on the shipping box. `chevron-up`/`chevron-down` on Tech Specs. **Reviews header + "View All"** (scrolls to the reviews section via `scrollRef` + `onLayout` y, mirroring the source's `scrollIntoView('#mobile-reviews')`). `star-filled` (24, primary) in the empty-reviews state. Review avatar chips now **alternate** `bg-info-subtle` / `bg-error-subtle` by row index, as the source does. `minus`/`plus` icons in the bottom action bar with the source's 0.3 disabled opacity. Primary-coloured shadow on **Buy Now**. `arrow-left` on "Back to Products". Login gate → toast. **`toast.success('Added to cart')`** now fires (the source does this; the port had no feedback at all). |
| `src/components/ImageCarousel.jsx` | `expo-image` for the main image and thumbnails, 60×60 inner thumb (source dimension), a11y labels, `bg-surface` on thumbs. |

### 4.5 Cart — **PARTIALLY DONE, this is where work stopped**

`src/app/(app)/(tabs)/cart.jsx` — **done:**
- imports `Icon`, `useThemeColors`, `toast`; dropped the `Colors` import; `const c = useThemeColors()`
- promo apply success/failure → `toast.success` / `toast.error`
- `placeOrder` login gate → `toast.error`
- Razorpay `theme: { color: c.primary }` (was `Colors.light.primary`)
- payment success → `toast.success('Payment successful — order placed')`; failure → `toast.error`
- COD: login gate, address-required, success, and error → all `toast.*`
- WhatsApp failure → `toast.error`
- `requireVerifiedEmail` **deliberately keeps `Alert.alert`** (it blocks checkout and the message must be read, not glanced at as it fades) — comment in file explains this
- empty state → `shopping-bag` icon (44, `borderStrong`) replacing ` `
- Clear Cart → `trash-2` icon
- promo input → `placeholderTextColor={c.muted}`, `autoCorrect={false}`, `check` icon next to "Applied: CODE"

**Still pending in `cart.jsx` (2 small items):**
- [ ] The processing overlay still renders `<Text className="text-4xl"> </Text>` at **line ~460** → replace with `<Icon name="package" size={56} color={c.ink} />`
- [ ] The **Place Order** button has no shadow → add the source's primary-at-20% shadow, same shape as the Buy Now button in `[id].jsx`

---

## 5. PENDING — file by file

Ordered so each group is independently testable. Every item is a real gap found by
diffing the source mobile branch against the current RN file.

### 5.1 Finish Cart
- [ ] `src/app/(app)/(tabs)/cart.jsx` — the 2 items listed at the end of §4.5.
- [ ] `src/components/CartLineItem.jsx` — `minus`/`plus` icons (size 14, `c.primary`) in place of `−`/`+` text; `expo-image` for the thumbnail; `active:` press states.
- [ ] `src/components/PaymentMethodSheet.jsx` — port the source `paymentModal`'s icons: `credit-card` (20) on Razorpay, `whatsapp` (20) on the WhatsApp button, `banknote` (20, `#34D399`) on COD, `arrow-right` (16) on all three, and the corner close `x` (20). Keep the hardcoded brand colours (`#25D366`, `#1E293B`, `#CBD5E1`) — those are third-party branding, not app tokens.

### 5.2 Wishlist
- [ ] `src/app/(app)/(tabs)/wishlist.jsx` — empty state uses ` ` → `shopping-bag` icon (44, `borderStrong`); the source's mobile empty state uses `ShoppingBag`, not a heart.
- [ ] `src/components/WishlistCard.jsx` — the remove button uses `✕` but the **source mobile card uses `Trash2` (size 15, primary)**; add `shopping-bag` (14) inside the Add-to-Cart button (source has it); `bell` (15) on Notify Me; `expo-image`; `toast.success('Added to cart')` on add (source does this).

### 5.3 Orders
- [ ] `src/utils/orders.js` — `statusMeta()` returns emoji in its `icon` field (`'✓'`, `'✕'`, `' '`). Change to **Icon names** (`'check-circle-2'`, `'x-circle'`, `'truck'`) and update both consumers.
- [ ] `src/app/(app)/orders/index.jsx` —
  - [ ] Read the `?tab=` param (`useLocalSearchParams`) so the new header menu links **Current Orders** / **Past Orders** land on the right segment. This is required for §4.2's menu entries to work.
  - [ ] Make the header title dynamic: `Current Orders` / `Past Orders` (the source's `ROUTE_TITLES` uses exactly those strings for `/userorders` and `/userpastorders`).
  - [ ] Empty state ` ` → `package` icon for Ongoing, `archive` icon for Past (the source uses `Package` on `UserOrdersPage` and `Archive` on `UserPastOrdersPage`).
  - [ ] `toast.success('Your review has been submitted.')` after a successful review; `toast.error` on failure (currently `Alert.alert`).
  - [ ] **Decision to confirm with the user:** the source's mobile Past-orders page lists **delivered only** (cancelled orders are invisible on mobile web; the All/Delivered/Cancelled tabs are desktop-only). The RN screen currently shows **delivered + cancelled**. Strict parity means dropping cancelled — which removes working functionality. **Recommend keeping the superset and flagging it**; ask before changing.
- [ ] `src/components/OrderCard.jsx` — `download` icon (13) in place of `⭳`; status badge gets its icon (`clock` for placed/confirmed/shipped, `check-circle-2` for delivered, `x-circle` for cancelled — source uses `Clock` on ongoing and `CheckCircle2` on delivered, both size 10); review rating row → `<Stars size={10} round={false} />`; `star` icon on the "Review" entry point; `expo-image`.
- [ ] `src/app/(app)/orders/[id].jsx` — `statusMeta` icon via `<Icon>`; `rotate-ccw` (14) on Buy Again and `download` (14) on Download Invoice in place of `↻`/`⭳`; ` ` → `package` icon (44); `expo-image`; Buy Again confirmation → `toast.success('Items added to your cart')` (currently `Alert.alert`).
- [ ] `src/components/ReviewModal.jsx` — swap the hand-rolled star row for `<StarPicker>`; `x` icon for close; `placeholderTextColor={c.muted}`.
- [ ] `src/components/OrderCardSkeleton.jsx` — check against `WEB/src/features/orders/OrderCardSkeleton.jsx`.

### 5.4 Profile
- [ ] `src/app/(app)/(tabs)/profile.jsx` —
  - [ ] Icons: `pencil` (16, primary) on the section edit buttons, `lock` (14, muted) on the Email row, `copy`/`check` (15) on the User ID row, `camera` (12, inverse) on the avatar button. All are currently `✎ ⧉ ✓ `.
  - [ ] **Loading state:** currently a plain `Loading…` string. The source has a **content-aware skeleton** (`renderSkeleton()`, mobile branch): 80 px circular avatar block, 160×20 name, 200×13 email, 110×22 pill, then three cards of 4/4/1 label+value rows. Build it with the existing `<Skeleton>` component.
  - [ ] Toasts: `Profile updated successfully`, `Profile photo updated`, and the upload-failure / image-validation messages all go through `showToast` in the source; here they're silent or `Alert.alert`.
  - [ ] `logout` → `logout(user.uid)` (the `useAuth` signature changed in §4.2).
  - [ ] `expo-image` for the avatar.
- [ ] `src/components/EditProfileSheet.jsx` — `x` icon for close; **`eye`/`eye-off` icons** in place of the ` `/` ` emoji on all three password fields; `placeholderTextColor={c.muted}` on all 8 inputs; `toast` on save success.

### 5.5 Auth
- [ ] `src/app/(auth)/signup.jsx` — **biggest functional gap left.** The source `SignupPage.jsx` collects three sections; the RN screen only has the first:
  - `Account` — Full Name, Email, Password, Confirm Password *(present)*
  - `Personal Details (optional)` — **Phone, Gender (Male / Female / Prefer not to say), Date of Birth** 
  - `Delivery Address (optional)` — **Street, City, State, Pincode** 
  <br>Add the missing fields with the source's section labels, wire them into the now-extended `signup()` (see §4.2), add `eye`/`eye-off` toggles to both password fields, use `toast.error('Please fix the highlighted fields')` on validation failure and `toast.success` on success. For Gender reuse `EditProfileSheet`'s pill row; for DOB reuse its `@react-native-community/datetimepicker` pattern (already a dependency).
- [ ] `src/app/(auth)/login.jsx` — `eye`/`eye-off` password toggle (source has it); `alert-triangle` (warning) / `info` icon in the session-conflict banner (source branches on `sessionMsg.type`); `placeholderTextColor={c.muted}` ×3 (lines 116, 131, 186).
- [ ] `src/app/(auth)/reset-password.jsx` — `eye`/`eye-off` toggles; `placeholderTextColor={c.muted}` ×2 (lines 121, 134). Verify against `WEB/src/pages/ResetPasswordPage/ResetPasswordPage.jsx`.

### 5.6 Final sweep
- [ ] `grep -rn "placeholderTextColor=\"#" src/` → must return nothing.
- [ ] Grep for leftover glyph/emoji UI: `‹ ⋮ ⌕ ☰ ♡ ★ ☆ ✕ ✎ ⧉ ⭳ ↻ →`.
- [ ] `grep -rn "Colors\.light\|Colors\.dark" src/` → should only appear inside `useThemeColors.js`.
- [ ] `src/components/ErrorState.jsx`, `ProductCardSkeleton.jsx`, `ProductDetailSkeleton.jsx` — check against their web counterparts.
- [ ] Update `MIGRATION_ANALYSIS.md` with a "Mobile parity pass" section recording what this pass changed.

---

## 6. Analysis already done — don't re-derive

Facts established by reading the source directly. Each one changed a porting decision.

### Breakpoints (where each page's mobile branch starts)
| Source page | `useIsMobile(px)` | Mobile branch at |
|---|---|---|
| `ProductsPage.jsx` | 640 | line 771 |
| `ProductDetail.jsx` | 1024 | line 457 (`block lg:hidden`) |
| `CartPage.jsx` | 1024 | line 678 |
| `WishlistPage.jsx` | 1024 | line 170 |
| `UserOrdersPage.jsx` | 1024 | line 222 |
| `UserPastOrdersPage.jsx` | 1024 | line 290 |
| `MyProfile.jsx` | 640 | line 609 |
| `OrderDetailPage.jsx` | — | **no split**, one responsive layout |
| `LoginPage` / `SignupPage` / `ResetPasswordPage` | — | **no split**, one responsive layout |

### Mobile-vs-desktop facts that drive scope
- **Cart promo code + Order Summary breakdown are desktop-only.** The RN cart has them anyway (an earlier deliberate addition, flagged in `MIGRATION_ANALYSIS.md` Phase 10). Leave them — they add function, don't remove any.
- **Wishlist**: `Notify Me` / `stock_alerts`, `Share Wishlist`, `Move All to Cart`, and the MRP-strikethrough are **desktop-only**. The RN card has Notify Me grafted on (Phase 12 decision). Share/Move-All are correctly absent.
- **Product Detail related-products** and the **5/4/3/2/1 rating histogram** are desktop-only — correctly not ported.
- **Order history is two routes on web** (`/userorders` "Current Orders", `/userpastorders` "Past Orders"), consolidated into one RN screen with a segmented control. The header menu now links to both via `?tab=`.
- **Source bugs deliberately fixed, not preserved** (all flagged in-file): mobile `$` currency slips in `ProductCard` / `WishlistCard` / order cards / cart bottom bar; `ProductCard`'s per-card `reviews` N+1 re-fetch; `WishlistSlice` id-type mismatch; `buyAgain` dropping `variantId`.
- **`ProductDetail`'s Swiper import is dead** — the source mobile gallery is a static `<img>` + tap-only thumbnail strip, no swipe. The RN `ImageCarousel` adds swipe as a touch affordance (flagged in-file).
- **`mapOrderRow` never sets `taxableTotal`/`isInterState`**, so the GST breakdown block on Order Detail is dead on real data on **both** platforms. Ported verbatim anyway.

### Architecture facts
- The client **never computes the authoritative charged price.** Every order path sends only `{productId, variantId, quantity}` to a Supabase Edge Function and trusts the returned amount. Client pricing only needs to *display* an estimate.
- Cart rounding order **must** stay: `subtotal → Math.round(subtotal) → + shipping − promo → Math.max(0, Math.round(...))`. Mirrors the server's `pricing.ts`.
- Role comes from `profiles.role`. Admin logins are **rejected** in this app (resolved Unclear Item 4) — see `src/app/(app)/_layout.jsx`.
- Edge Functions used: `payment-create-order`, `payment-cod-create`, `payment-verify`, `promo-validate`, `reviews-create`.
- Razorpay needs a **custom dev client** (`react-native-razorpay` is a native module — no Expo Go).
- Expo SDK is **pinned to 55** on purpose. Do **not** run `expo upgrade` or bump `expo`/`react-native`/`react`/`expo-router` without asking. See `AGENTS.md` and `MIGRATION_ANALYSIS.md` §8.

---

## 7. Conventions to follow

- **Plain JavaScript only** (`.js` / `.jsx`). No TypeScript. Path alias `@/*` → `./src/*` via `jsconfig.json`.
- **Styling:** NativeWind `className` with the semantic tokens (`bg-surface`, `text-ink`, `text-muted`, `border-border`, `font-sans-bold`, `shadow-card`, …). Reach for `style={{}}` only for values Tailwind can't express (shadows with a dynamic colour, `aspectRatio`, conditional `fontStyle`).
- **Colours for native props:** always `const c = useThemeColors()`, never `Colors.light.*`.
- **Icons:** always `<Icon name="<lucide-name>" />` from `@/components/Icon`. If a name is missing, add it to that file's `NAMES` map rather than importing an icon set directly in a screen.
- **Stars:** always `<Stars>` / `<StarPicker>` from `@/components/Stars`.
- **Feedback:** `toast.*` for non-blocking confirmations (matching the web's `react-toastify` calls). Reserve `Alert.alert` for things that genuinely must block, like the email-verification gate in `cart.jsx`.
- **Comments:** this codebase documents *why* a port deviates from source, citing the source file. Keep that up — it's how deliberate deviations stay distinguishable from bugs.
- **Re-read the source file before porting it.** Several earlier phase notes were wrong because they worked from a summary instead of the actual file.

---

## 8. Suggested first message to Claude in the new session

> Read `Ecommerce-app/HANDOFF_MOBILE_PARITY.md` and `Ecommerce-app/MIGRATION_ANALYSIS.md`.
> Then continue the mobile-parity pass from §5, starting with §5.1 (finish Cart).
> Work group by group and stop after each group so I can review.
> Note: there's no Node on this machine — tell me if you need me to run `npm install`
> and the verification commands, and don't claim anything is verified if it wasn't.