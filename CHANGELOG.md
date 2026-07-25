# Edwards Family Bakery — Changelog

## v1.0.23 — 2026-07-25 (pending testing)

- Removed the Date column from the Orders table.
- Edit Order modal title now shows the order number (e.g., "Edit Order #208").
- Checked the option-checkbox population logic for the Edit Order modal after a reported mismatch (Sliced showing unchecked) - the code correctly reads saved selectedOptions and marks matching checkboxes, so this needs the actual saved data confirmed before treating it as a bug rather than expected unselected test data.

## v1.0.22 — 2026-07-25 (pending testing)

Found the actual cause of the missing ZZTest icon, after ruling out data, the icon function, and stale rendering one by one via direct console testing: the correct HTML (`<i class="bi bi-flask">`) was genuinely present in the page, but wasn't rendering visually, while every other icon in the same font displayed fine right next to it. Bootstrap's own icon documentation shows `bi-flask` used as an `<svg>` element rather than the icon-font `<i>` pattern used everywhere else in this app, suggesting this specific glyph doesn't work the same way in the font version being used. Swapped to `bi-bug`, a long-established icon in the same font, which should behave the same as every other icon already working correctly.

## v1.0.21 — 2026-07-25 (pending testing)

Real bug: `admin.html` never had cache-busting on its `shared.js`/`admin.js` script tags, unlike `index.html` which has had it all along. That means browsers could keep serving an old, cached copy of admin's JavaScript indefinitely, even after real updates were deployed - which is almost certainly why the ZZTest flask icon wasn't showing despite the Sheet data being completely correct. Added the same versioned cache-busting to admin.html that index.html already had, synced to the same version number going forward.

## v1.0.20 — 2026-07-25 (pending testing)

- Admin-manual icon changed to a clipboard-check.
- ZZTest orders not showing an icon: confirmed the flask icon already exists and is correctly wired for `source: 'test'`, and the current test tool file correctly sets it - likely cause is an older, previously-downloaded copy of the tool being used. Providing a fresh copy to confirm.

## v1.0.19 — 2026-07-25 (pending testing)

- Fixed icon vertical alignment in the Orders table's Type column - added explicit `vertical-align: middle` to icon elements themselves, since the cell's own centering alone didn't account for different icons having slightly different internal positioning within their glyph.
- Admin-manual icon changed from a pencil to a person-badge, to visually distinguish it more clearly from the customer icon.

## v1.0.18 — 2026-07-25 (pending testing)

- Real bug: the date-sort fix applied to the Fulfillment tab's Pickup/Delivery sections in v1.0.11 was never applied to the Production tab, which has its own separate, differently-scoped `pickups`/`deliveries` variables. Fixed - both tabs now sort consistently, soonest date first, including when viewing "All" dates on Production.
- Added Order # to the View Receipt / order detail modal.

## v1.0.17 — 2026-07-25 (pending testing)

- **Real bug fixed (Apps Script):** production tracking ("made" checkboxes) could silently fail to save for any order that started with no `madeItems` data. The backend defaulted a blank cell to an empty array, but the frontend always expected an object - since an empty array is truthy in JavaScript, the frontend's own `|| {}` fallback never kicked in, and `JSON.stringify` silently drops non-numeric properties set on an array. The result: checking off items looked like it worked, but saved as `"[]"`, losing the actual data. Fixed the default, and also normalized any order that already has the literal `"[]"` stored from hitting this bug in the past.
- Rechecked both ZZTest tools (generator and cleanup) against the recent orderNumber/source changes - both were already fully compatible, no changes needed.
- Old-tracker source icon changed from an archive box to an import-style icon (arrow into a box), better representing "this was imported" rather than "this is archived."

## v1.0.16 — 2026-07-25 (pending testing + one-time migration)

Order numbers are now permanent and stored, not recalculated live. Previously, an order's displayed number was its live chronological position - meaning deleting any order would silently shift every later order's number. Now, each order gets a permanent number assigned once at creation (server-side, avoiding race conditions between simultaneous orders) and never recalculated, so a reference like "order #193" stays accurate forever, matching how real invoice numbering works.

Requires a one-time setup: add an `orderNumber` column to the Orders sheet, then run the new `migrateOrderNumbersAndSource` function once from the Apps Script editor. That function does two things in one pass: assigns every existing order its current number (matching what's displayed today), and corrects the `source` field for orders that predate the July 18 migration from the old tracker - some had been incorrectly tagged "customer" instead of "old-tracker-v3". Everything at or before order #193 gets corrected to "old-tracker-v3"; everything after gets "admin-manual".

Also added a fourth source icon (an archive box) for old-tracker-migrated orders, which previously showed no icon at all. (Also covers spacing/UI tweaks from v1.0.13-15 not separately logged here.)

## v1.0.12 — 2026-07-25 (pending testing)

Surfaced the `source` field flagged as unused in the last audit. The Orders table's Type column now shows a second small icon next to the fulfillment icon (truck/cart), indicating how the order was created: a person icon for customer-placed, a pencil for manually entered in admin, and a flask for ZZTest tool orders. Older orders saved before this field existed show no icon rather than a guess.

## v1.0.11 — 2026-07-25 (pending testing)

- Pickup and Delivery cards on the Fulfillment tab now sort by date, soonest first (previously unsorted). Delivery route order still respects any manually-set route once you've used "Set Delivery Route" - date sorting only determines the initial/default order.
- Full write-vs-read data flow audit across the whole app, prompted by the `sortOrder` bug - traced every meaningful field to check for the same "written but never consumed" pattern, plus checked for status-value casing mismatches between files. One minor finding: orders are tagged with a `source` field (customer vs admin-entered) that's correctly saved but never displayed anywhere - not broken, just currently unused; flagged as a decision, not fixed unprompted.

## v1.0.10 — 2026-07-25 (pending testing)

Real, significant bug: reordering products saved `sortOrder` to the backend correctly, but nothing anywhere - not the customer menu, not even admin's own product list on a fresh load - actually sorted by it. The reorder only appeared to work within the same admin session because the in-memory list was mutated directly; a fresh load anywhere just showed raw backend order. Added a shared sort-by-`sortOrder` step applied at every point products get loaded, in both the customer app and admin, so the saved order now actually takes effect everywhere. If you don't already have a `sortOrder` column on your Products sheet, you'll need to add one for this to persist correctly, matching the pattern from earlier tonight.

## v1.0.9 — 2026-07-25 (pending testing)

Audited every modal in the app for the same swipe-bleed-through risk fixed in v1.0.8 for the route modal, instead of just the one reported instance. Applied `modal-dialog-scrollable` consistently to every modal with variable or potentially-long content: Product, Customer, Merge Customers, and Customer Detail/Receipt (`orderModal` and the route modal already had it). Left the two simple "Are you sure?" confirmation dialogs alone, since their content is short and fixed and will never actually overflow.

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
