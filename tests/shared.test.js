// ══════════════════════════════════════════
// Edwards Family Bakery — Regression Test Suite
//
// Run with: node tests/shared.test.js
//
// These tests exist specifically to catch the class of bug we found the hard
// way: "something changes later (a price, a product being deleted, a
// customer's info) and it silently corrupts something that already happened."
// If you add a new feature that stores a reference to something else (a
// product ID, a customer key, etc.), ask: what should happen if the thing
// being referenced changes or disappears? Then add a test for it here.
// ══════════════════════════════════════════

const assert = require('assert');
const {
  esc, cap, normPhone, custKey, formatAddress, parseAddress,
  buildOrderData, getMergedCustomers, computeOrderTotals
} = require('../shared.js');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err });
  }
}

// ──────────────────────────────────────────
// computeOrderTotals — the price/cost/name snapshot logic.
// This is THE regression class this suite exists to prevent.
// ──────────────────────────────────────────

test('computeOrderTotals: a brand-new item uses the CURRENT product price', () => {
  const products = [{ id: 'p1', name: 'Original Loaf', price: 14, cost: 4 }];
  const items = [{ productId: 'p1', qty: 2 }]; // no price/cost snapshot yet — this is a new item
  const totals = computeOrderTotals(products, items, 0);
  assert.strictEqual(totals.subtotal, 28);
  assert.strictEqual(totals.items[0].price, 14);
  assert.strictEqual(totals.items[0].name, 'Original Loaf');
});

test('computeOrderTotals: an EXISTING item keeps its snapshotted price even if the product price later changed', () => {
  // Simulates: order was placed when the loaf was $14. Price has since gone up to $20.
  const products = [{ id: 'p1', name: 'Original Loaf', price: 20, cost: 5 }];
  const items = [{ productId: 'p1', qty: 2, price: 14, cost: 4, name: 'Original Loaf' }];
  const totals = computeOrderTotals(products, items, 0);
  assert.strictEqual(totals.subtotal, 28, 'Must use the snapshotted $14, not the current $20');
  assert.strictEqual(totals.costTotal, 8, 'Must use the snapshotted cost, not the current cost');
});

test('computeOrderTotals: an item for a DELETED product still uses its snapshot, not zero', () => {
  const products = []; // the product no longer exists in the catalog at all
  const items = [{ productId: 'p-gone', qty: 3, price: 12, cost: 3, name: 'Discontinued Item' }];
  const totals = computeOrderTotals(products, items, 0);
  assert.strictEqual(totals.subtotal, 36, 'Deleting a product must not zero out old orders that used it');
  assert.strictEqual(totals.items[0].name, 'Discontinued Item');
});

test('computeOrderTotals: an item for a deleted product with NO snapshot falls back gracefully, not a crash', () => {
  const products = [];
  const items = [{ productId: 'p-gone', qty: 1 }]; // old-format item, no snapshot at all
  const totals = computeOrderTotals(products, items, 0);
  assert.strictEqual(totals.subtotal, 0);
  assert.strictEqual(totals.items[0].name, 'Unknown item');
});

test('computeOrderTotals: discount is applied to the subtotal correctly', () => {
  const products = [{ id: 'p1', name: 'Loaf', price: 10, cost: 2 }];
  const items = [{ productId: 'p1', qty: 2 }];
  const totals = computeOrderTotals(products, items, 50); // 50% off
  assert.strictEqual(totals.subtotal, 20);
  assert.strictEqual(totals.total, 10);
  assert.strictEqual(totals.profit, 10 - 4); // total - costTotal
});

// ──────────────────────────────────────────
// custKey / normPhone — identity matching, the root cause of the whole
// Erin/Guillermo/Virginia saga.
// ──────────────────────────────────────────

test('normPhone: strips all non-digit characters', () => {
  assert.strictEqual(normPhone('615.555.1234'), '6155551234');
  assert.strictEqual(normPhone('(615) 555-1234'), '6155551234');
  assert.strictEqual(normPhone(''), '');
  assert.strictEqual(normPhone(null), '');
});

test('custKey: two records with the same phone (different formatting) match', () => {
  const a = { firstName: 'Ed', lastName: 'Finley', phone: '615.218.7587' };
  const b = { firstName: 'Edward', lastName: 'Finely', phone: '(615) 218-7587' };
  assert.strictEqual(custKey(a), custKey(b), 'Same phone digits must always produce the same key, regardless of name spelling or phone formatting');
});

test('custKey: falls back to name-based matching only when phone is truly blank', () => {
  const a = { firstName: 'Unknown', lastName: 'Unknown', phone: '' };
  const b = { firstName: 'Unknown', lastName: 'Unknown', phone: null };
  assert.strictEqual(custKey(a), custKey(b));
  assert.notStrictEqual(custKey(a), custKey({ firstName: 'Someone', lastName: 'Else', phone: '' }));
});

test('custKey: two different people must NOT collide just because both used a placeholder phone', () => {
  const a = { firstName: 'Abbey', lastName: 'Popplewell', phone: '555.555.5555' };
  const b = { firstName: 'Heather', lastName: 'Goodman', phone: '555.555.5555' };
  // This is intentionally documenting the known limitation, not asserting it's fixed —
  // shared placeholder phones WILL collide by design, since phone is the primary match key.
  // If this test starts failing, it means matching logic changed — worth a deliberate look.
  assert.strictEqual(custKey(a), custKey(b), 'Known limitation: identical phone numbers always match, even placeholders. Use unique placeholders per person.');
});

// ──────────────────────────────────────────
// formatAddress / parseAddress — round-trip and edge cases we've actually hit
// ──────────────────────────────────────────

test('formatAddress + parseAddress: round-trips a normal full address', () => {
  const formatted = formatAddress('123 Main St', 'Nolensville', 'TN', '37135');
  const parsed = parseAddress(formatted);
  assert.strictEqual(parsed.street, '123 Main St');
  assert.strictEqual(parsed.city, 'Nolensville');
  assert.strictEqual(parsed.state, 'TN');
  assert.strictEqual(parsed.zip, '37135');
});

test('parseAddress: handles a real historical edge case — city only, no street', () => {
  // This exact string came from real production data (Erin Gentry's most recent order)
  const parsed = parseAddress('Nolensville,');
  assert.strictEqual(parsed.street, 'Nolensville');
});

test('parseAddress: handles street + state + zip with no city (single-segment address)', () => {
  const parsed = parseAddress('612 Eagle View Dr. Eagleville, TN 37060');
  assert.strictEqual(parsed.state, 'TN');
  assert.strictEqual(parsed.zip, '37060');
});

test('parseAddress: blank input never throws, returns empty parts', () => {
  const parsed = parseAddress('');
  assert.deepStrictEqual(parsed, { street: '', city: '', state: '', zip: '' });
});

// ──────────────────────────────────────────
// buildOrderData — validation rules, the single source of truth for both
// the customer form and the admin modal
// ──────────────────────────────────────────

const testProducts = [{ id: 'p1', name: 'Loaf', price: 14, cost: 4, unit: 'per loaf' }];

test('buildOrderData: rejects missing name', () => {
  const { error } = buildOrderData({ first: '', last: '', phone: '615.555.1234', items: [{productId:'p1',qty:1}], fulfillment: 'pickup', products: testProducts });
  assert.ok(error);
});

test('buildOrderData: rejects missing phone', () => {
  const { error } = buildOrderData({ first: 'A', last: 'B', phone: '', items: [{productId:'p1',qty:1}], fulfillment: 'pickup', products: testProducts });
  assert.ok(error);
});

test('buildOrderData: rejects empty item list', () => {
  const { error } = buildOrderData({ first: 'A', last: 'B', phone: '615.555.1234', items: [], fulfillment: 'pickup', products: testProducts });
  assert.ok(error);
});

test('buildOrderData: delivery requires a full address (street/city/state/zip all required)', () => {
  const base = { first: 'A', last: 'B', phone: '615.555.1234', items: [{productId:'p1',qty:1}], fulfillment: 'delivery', products: testProducts };
  assert.ok(buildOrderData({ ...base, street: '', city: 'X', state: 'TN', zip: '37135' }).error, 'missing street should fail');
  assert.ok(buildOrderData({ ...base, street: 'X', city: '', state: 'TN', zip: '37135' }).error, 'missing city should fail');
  assert.ok(buildOrderData({ ...base, street: 'X', city: 'X', state: '', zip: '37135' }).error, 'missing state should fail');
  assert.ok(buildOrderData({ ...base, street: 'X', city: 'X', state: 'TN', zip: '' }).error, 'missing zip should fail');
});

test('buildOrderData: pickup does NOT require an address', () => {
  const { orderData, error } = buildOrderData({ first: 'A', last: 'B', phone: '615.555.1234', items: [{productId:'p1',qty:1}], fulfillment: 'pickup', products: testProducts });
  assert.strictEqual(error, undefined);
  assert.strictEqual(orderData.deliveryAddress, '');
});

test('buildOrderData: a valid order computes correct totals and stores snapshotted items', () => {
  const { orderData, error } = buildOrderData({ first: 'A', last: 'B', phone: '615.555.1234', items: [{productId:'p1',qty:2}], fulfillment: 'pickup', products: testProducts });
  assert.strictEqual(error, undefined);
  assert.strictEqual(orderData.total, 28);
  assert.strictEqual(orderData.items[0].price, 14);
  assert.strictEqual(orderData.items[0].name, 'Loaf');
});

// ──────────────────────────────────────────
// getMergedCustomers — dedup, address "most recent wins", explicit vs
// order-derived records
// ──────────────────────────────────────────

test('getMergedCustomers: two orders with the same phone merge into ONE customer', () => {
  const orders = [
    { id:'o1', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 14, createdAt: 1 },
    { id:'o2', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 20, createdAt: 2 },
  ];
  const merged = getMergedCustomers([], orders, []);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].orderCount, 2);
  assert.strictEqual(merged[0].totalSpent, 34);
});

test('getMergedCustomers: address comes from the MOST RECENT order that actually has one', () => {
  const orders = [
    { id:'o1', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 14, createdAt: 1, deliveryAddress: '1 Old St, Nolensville, TN 37135' },
    { id:'o2', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 14, createdAt: 2, fulfillment: 'pickup' }, // pickup, no address — must NOT wipe the known one
    { id:'o3', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 14, createdAt: 3, deliveryAddress: '2 New St, Nolensville, TN 37135' },
  ];
  const merged = getMergedCustomers([], orders, []);
  assert.strictEqual(merged[0].address, '2 New St, Nolensville, TN 37135', 'Most recent delivery address should win');
});

test('getMergedCustomers: a pickup-only order (no address ever) does not wipe a real address from an earlier order', () => {
  const orders = [
    { id:'o1', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 14, createdAt: 1, deliveryAddress: '1 Old St, Nolensville, TN 37135' },
    { id:'o2', firstName:'Jane', lastName:'Doe', phone:'615.555.1234', total: 14, createdAt: 2, fulfillment: 'pickup' },
  ];
  const merged = getMergedCustomers([], orders, []);
  assert.strictEqual(merged[0].address, '1 Old St, Nolensville, TN 37135');
});

test('getMergedCustomers: an explicit customer record with no matching orders still shows 0 orders, not crash', () => {
  const customers = [{ id:'c1', firstName:'Solo', lastName:'Customer', phone:'615.555.9999' }];
  const merged = getMergedCustomers([], [], customers);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].orderCount, 0);
});

// ──────────────────────────────────────────
// esc / cap — basic sanity
// ──────────────────────────────────────────

test('esc: escapes HTML-dangerous characters', () => {
  assert.strictEqual(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(esc(`O'Brien`), 'O&#39;Brien');
});

test('esc: handles null/undefined without throwing', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
});

test('cap: capitalizes the first letter only', () => {
  assert.strictEqual(cap('delivery'), 'Delivery');
  assert.strictEqual(cap(''), '');
});

// ──────────────────────────────────────────
// Report results
// ──────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  failures.forEach(({ name, err }) => {
    console.log(`❌ ${name}`);
    console.log(`   ${err.message}\n`);
  });
  process.exit(1);
} else {
  console.log('✅ All tests passed.');
}
