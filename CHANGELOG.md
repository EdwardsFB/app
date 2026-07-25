# Edwards Family Bakery — Changelog

## v1.0.8 — 2026-07-25 (pending testing)

- Fixed the delivery route modal letting swipe gestures bleed through to the page behind it - added Bootstrap's `modal-dialog-scrollable`, which was missing.
- Reorder buttons (route modal and Products table) now use Bootstrap's actual button-group component with the "justified" pattern from their docs, instead of a custom flex container.
- Test order generator (`Generate_Test_Orders.html`, not part of the deployed site) now uses real addresses borrowed from actual existing customers instead of a hardcoded fake list, and delivery test orders default to "Ready" status most of the time - so a batch of generated orders is immediately useful for testing the Google Maps route feature. Also audited against the current order data structure - no other gaps found.

## v1.0.7 — 2026-07-25 (pending testing)

Fixed a misread of the original request: v1.0.4 changed the button layout from side-by-side to stacked, which was never asked for - the ask was only to fix how the edge-row single button looked, not to change the middle-row layout. Reverted to side-by-side for normal rows; the edge-row single button now spans the combined width (not height) of both buttons, at normal size.

## v1.0.6 — 2026-07-25 (pending testing)

- "This cannot be undone" now on its own line in the order delete confirmation.
- Switched the confirm modal to support line breaks, which meant escaping customer/product names in the other two delete confirmations that reuse it, to stay safe from special characters.

## v1.0.5 — 2026-07-25 (pending testing)

Real bug fix: the "Delete Order #221?" confirmation text added in v1.0.1 was showing "Delete Order #undefined?" instead. Order numbers were never a stored property on the order itself (`o.number` doesn't exist) - they're computed on the fly from creation order via a helper function. Fixed to use that existing helper (`getOrderNumber`) instead.

## v1.0.4 — 2026-07-25 (pending testing)

Delivery route modal polish, following confirmation that the v1.0.3 up/down arrows work correctly on iPhone.

- Fixed address formatting — was missing ZIP code and used an odd em-dash separator; now shows proper "Street, City, State ZIP" format.
- Same proper address format is now what's actually sent to Google Maps (previously used the raw stored string) — should improve navigation accuracy too, not just display.
- Edge rows (first/last) now show a single arrow button spanning the full space, instead of one active button next to a visually disabled one.
- Same edge-row button treatment applied to the Products table for consistency.

## v1.0.3 — 2026-07-25 (pending testing)

Replaced HTML5 drag-and-drop with up/down arrow buttons in both places it was used, after confirming native drag doesn't fire from finger touch on iOS Safari (it only works via a Bluetooth mouse, trackpad, or Apple Pencil) - a real reliability problem given both features are meant to be used on a phone, often on the go.

- Products table reordering (Products tab): drag handles → up/down arrow buttons.
- Delivery route ordering (new in v1.0.2): drag handles → up/down arrow buttons.
- Removed all now-dead drag-related code (`onProductDrag*`, `onRouteDrag*`, `dragProductId`, `dragRouteId`, `.drag-handle` CSS).

## v1.0.2 — 2026-07-25

Finished the delivery route feature flagged as half-built in v1.0.1's audit.

- New "Set Delivery Route" button on the Fulfillment tab (replaces the old direct "Open Route in Google Maps" button).
- Opens a modal listing all ready-for-delivery orders, reorderable by drag-and-drop (same interaction pattern as the Products table's manual reordering).
- "Open Route in Google Maps" now lives inside that modal, launching with stops in whatever order was just set.
- Removed `moveRoute()` (the old, never-wired-up up/down reorder logic) in favor of the new drag-based approach.

## v1.0.1 — 2026-07-25

Code hardening pass — no user-facing feature changes, just cleanup and consistency fixes found during a full audit.

- Removed a duplicated `theme-color` meta tag in `admin.html`.
- Removed dead CSS (`.btn:disabled` rule, no longer used anywhere after the `.btn-inert` pattern replaced native `disabled` attributes app-wide).
- Removed a dead/unused function (`refreshData()` in admin.js — fully superseded by `refreshAndRenderTab()`).
- Fixed inconsistent spacing: the confirmation screen's emoji fallback now matches its logo's spacing exactly (they're mutually exclusive, so they should look identical whichever one shows); the Passcode screen logo now matches the admin sidebar logo's top margin.
- **Found but not fixed — needs a decision:** `moveRoute()` in admin.js (delivery route reordering) is fully implemented but has no button wired to it anywhere in the UI. Right now deliveries render in whatever order they were first added, with no way to manually reorder them for an efficient route. Worth deciding whether to finish this (add up/down buttons) or remove the unused logic.
- Verified clean: no missing closing tags, no unused CSS classes elsewhere, no orphaned functions elsewhere, no leftover diagnostic comments, all button/spacing patterns for Edit/Delete pairs and card sections are consistent, all logo sizes are contextually appropriate.

## v1.0 — 2026-07-25


First complete release. Full admin + customer ordering system, ready for real use.

### Customer ordering page (`index.html` / `index.js`)
- Single-page ordering flow: Menu first, then a continuous Checkout section (contact info, pickup/delivery, cart review, discount code, payment method) — no multi-step wizard, everything visible and editable at once.
- Pinned bottom bar with running total, Cancel, and Place Order — hides automatically while the keyboard is open.
- Returning-customer lookup by phone + last name together (never phone alone), auto-fills contact/address info without auto-selecting Pickup or Delivery.
- Venmo or Cash payment, with a dedicated Order Confirmation screen after placing an order.
- Static, instant-loading header (logo + welcome text) separate from the live menu/checkout data, which loads behind a spinner.
- iOS-specific fixes: keyboard/viewport correction, double-tap-zoom prevention on interactive buttons, safe-area padding.

### Admin (`admin.html` / `admin.js`)
- Home dashboard, Orders, Production, Fulfillment, Customers, Products, and Settings tabs.
- Manual order entry with new/existing customer lookup.
- Product management with photos, options/upcharges, drag-to-reorder.
- Settings: pickup/delivery days, five separate logo slots (admin sidebar, admin mobile, passcode screen, customer order page, order confirmation page), discount codes.
- Passcode-gated access.

### Backend (Google Apps Script + Google Sheets)
- Sheets tabs: Products, Orders, Customers, Settings.
- `doPost`/`doGet` API for reading/writing all data.
- Header-row and ID-column protection (Orders, Products, Customers, Settings tabs) via `onEdit` trigger, toggleable with `disableProtection()` / `enableProtection()`.
- Contact-form email support (`MailApp.sendEmail`) - currently unused by the frontend but available.

### Infrastructure
- Hosted on GitHub Pages, static files only.
- Every file carries a `version:` and `build:` header comment for tracking.
- Cache-busting version query parameters on script tags, bumped with every release.

---

## Future releases

Add new entries above this line as changes ship, e.g.:

## v1.1 — YYYY-MM-DD
- ...
