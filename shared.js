// build: 2026-07-24T19:56:16Z
// ══════════════════════════════════════════
// Edwards Family Bakery — Shared utilities
// Used by both index.html (customer) and admin.html (admin)
// ══════════════════════════════════════════

const API_URL = 'https://script.google.com/macros/s/AKfycbwzF3yeOcyd8mka2nhKD0hKaENMH5ek7RqW3hPSAPMTgKPfX1S9IBQscis7Yk9wMw-frw/exec';

// ── Read everything (products, orders, customers) ──
async function apiGetAll() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Network error loading data');
  return await res.json();
}

// ── Write: add / update / delete / reorder ──
async function apiWrite(entity, action, id, data) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight with Apps Script
    body: JSON.stringify({ entity, action, id, data })
  });
  const result = await res.json();
  if (result.status !== 'success') throw new Error(result.message || 'Save failed');
  return result;
}

// ── HTML escaping ──
// Simple grey placeholder shown for any product without a real photo yet.
const PLACEHOLDER_PHOTO_URI = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="400" height="240" fill="#e9ecef"/><text x="200" y="120" font-family="sans-serif" font-size="18" fill="#adb5bd" text-anchor="middle" dominant-baseline="middle">Photo coming soon</text></svg>`);
const LOGO_DATA_URI = 'data:image/png;base64,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';

const DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getOrderNumberMap(allOrders) {
  const sorted = [...allOrders].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const map = new Map();
  sorted.forEach((o,i) => map.set(o.id, i+1));
  return map;
}

function getOrderNumber(order, allOrders) {
  const n = getOrderNumberMap(allOrders).get(order.id);
  return n === undefined ? '???' : String(n).padStart(3, '0');
}

function getProductOptions(product) {
  if (!product || !Array.isArray(product.options)) return [];
  return product.options;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ── Force phone inputs into ###.###.#### as the user types ──
function formatPhoneInput(el) {
  const digits = el.value.replace(/\D/g, '').slice(0, 10);
  let formatted = digits;
  if (digits.length > 6) formatted = digits.slice(0,3) + '.' + digits.slice(3,6) + '.' + digits.slice(6);
  else if (digits.length > 3) formatted = digits.slice(0,3) + '.' + digits.slice(3);
  el.value = formatted;
}

function formatZipInput(el) {
  el.value = el.value.replace(/\D/g, '').slice(0, 5);
}

// ── Phone/customer matching ──
function normPhone(p) { return String(p == null ? '' : p).replace(/\D/g, ''); }
function custKey(c) { const np = normPhone(c.phone); return np ? 'p:' + np : 'n:' + ((c.firstName||'')+' '+(c.lastName||'')).trim().toLowerCase(); }

function formatAddress(street, city, state, zip) {
  const line2 = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, line2].filter(Boolean).join(', ');
}

function parseAddress(raw) {
  if (!raw) return {street:'', city:'', state:'', zip:''};
  const parts = raw.split(',').map(s=>s.trim()).filter(Boolean);
  if (parts.length === 1) {
    const m = raw.match(/^(.*?)[,]?\s+([A-Za-z]{2})\s+(\d{5}(-\d{4})?)\s*$/);
    if (m) return { street: m[1].trim(), city: '', state: m[2].toUpperCase(), zip: m[3] };
    return { street: parts[0] || raw.trim(), city: '', state: '', zip: '' };
  }
  const street = parts.length >= 3 ? parts.slice(0, parts.length-2).join(', ') : parts[0];
  const cityPart = parts.length >= 3 ? parts[parts.length-2] : '';
  const stateZipPart = parts[parts.length-1];
  let state = '', zip = '', city = cityPart;
  const m2 = stateZipPart.match(/^([A-Za-z]{2})\s*(\d{5}(-\d{4})?)?$/);
  if (m2) {
    state = m2[1].toUpperCase();
    zip = m2[2] || '';
  } else {
    const tokens = stateZipPart.split(/\s+/);
    if (tokens.length >= 2 && /^\d{5}/.test(tokens[tokens.length-1])) {
      zip = tokens.pop();
      state = tokens.pop();
      if (tokens.length) city = (city ? city+' ' : '') + tokens.join(' ');
    } else {
      state = stateZipPart;
    }
  }
  return { street, city, state, zip };
}

// ── Merge customers (explicit records + order history), deduped by phone ──
// Validates raw form field values and computes a complete order data object.
// Returns { orderData } on success or { error } on validation failure.
// This is the single source of truth for "what makes a valid order" — used by
// both the customer-facing form and the admin manual-entry modal.
function buildOrderData({ first, last, phone, items, fulfillment, street, city, state, zip, date, notes, payment, paymentStatus, fulfillmentStatus, discountSocial, discountFamily, discountPct, products }) {
  first = (first||'').trim(); last = (last||'').trim(); phone = (phone||'').trim();
  if (!first || !last) return { error: 'Please enter a customer name.' };
  if (!phone) return { error: 'Please enter a phone number — this keeps orders correctly matched to the right customer.' };
  if (!items || !items.length) return { error: 'Please add at least one item.' };
  street = (street||'').trim(); city = (city||'').trim(); state = (state||'').trim(); zip = (zip||'').trim();
  if (fulfillment === 'delivery') {
    if (!street) return { error: 'Please enter a delivery street address.' };
    if (!city) return { error: 'Please enter a delivery city.' };
    if (!state) return { error: 'Please enter a delivery state.' };
    if (!zip) return { error: 'Please enter a delivery ZIP code.' };
  }
  const totals = computeOrderTotals(products, items, discountPct || 0);
  const address = formatAddress(street, city, state, zip);
  return {
    orderData: {
      firstName: first, lastName: last, phone, items: totals.items,
      discountSocial: !!discountSocial, discountFamily: !!discountFamily, discountPct: discountPct || 0,
      subtotal: totals.subtotal, total: totals.total, profit: totals.profit, costTotal: totals.costTotal,
      fulfillment, date: date || '',
      deliveryAddress: fulfillment === 'delivery' ? address : '',
      payment: payment || 'venmo', notes: notes || '',
      paymentStatus: paymentStatus || 'unpaid',
      fulfillmentStatus: fulfillmentStatus || 'pending',
    }
  };
}

// Persists a brand-new order to the server and keeps the customer record in sync.
// Caller owns local array mutation + UI update timing (optimistic vs wait-then-show).
async function persistNewOrder(newOrder, customers, email) {
  await apiWrite('orders', 'add', null, newOrder);
  try { await upsertCustomerFromOrder(customers, newOrder, email); } catch (err) { console.error('Could not sync customer record', err); }
}

// Creates or updates a real customer record to reflect this order's info.
// Name and phone always take the order's values. Address only updates if this
// order actually has one (a pickup order won't wipe out a known delivery address).
// Only acts on orders with a real phone number — no record for phone-less orders.
async function upsertCustomerFromOrder(customers, order, email) {
  if (!order.phone) return null;
  const key = custKey({firstName: order.firstName, lastName: order.lastName, phone: order.phone});
  const existingRec = customers.find(c => custKey(c) === key);
  const rawAddr = order.deliveryAddress || order.address || '';
  const addrParts = rawAddr ? parseAddress(rawAddr) : null;

  const data = {
    firstName: order.firstName,
    lastName: order.lastName,
    phone: order.phone,
  };
  if (addrParts) {
    data.street = addrParts.street; data.city = addrParts.city; data.state = addrParts.state; data.zip = addrParts.zip;
  } else if (existingRec) {
    data.street = existingRec.street||''; data.city = existingRec.city||''; data.state = existingRec.state||''; data.zip = existingRec.zip||'';
  } else {
    data.street=''; data.city=''; data.state=''; data.zip='';
  }
  if (email) data.email = email;
  else if (existingRec) data.email = existingRec.email || '';
  else data.email = '';

  if (existingRec) {
    Object.assign(existingRec, data);
    await apiWrite('customers','update',existingRec.id,data);
    return existingRec;
  } else {
    const newRec = { id:'c'+Date.now()+Math.floor(Math.random()*1000), ...data };
    customers.push(newRec);
    await apiWrite('customers','add',null,newRec);
    return newRec;
  }
}

function getMergedCustomers(products, orders, customers) {
  const map = new Map();

  customers.forEach(c => {
    map.set(custKey(c), {
      recordId: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone||'', email: c.email||'',
      street: c.street||'', city: c.city||'', state: c.state||'', zip: c.zip||'',
      address: formatAddress(c.street, c.city, c.state, c.zip),
      orderCount: 0, totalSpent: 0
    });
  });

  [...orders].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).forEach(o => {
    const k = custKey({firstName:o.firstName, lastName:o.lastName, phone:o.phone});
    let entry = map.get(k);
    if (!entry) {
      entry = {
        recordId: null, firstName:o.firstName, lastName:o.lastName, phone:o.phone||'', email: '',
        street: '', city: '', state: '', zip: '',
        address: o.address||o.deliveryAddress||'',
        orderCount:0, totalSpent:0
      };
      map.set(k, entry);
    } else {
      if (!entry.recordId) { entry.firstName = o.firstName; entry.lastName = o.lastName; }
      if (!entry.recordId && o.phone) entry.phone = o.phone;
      if (!entry.recordId && (o.address || o.deliveryAddress)) entry.address = o.address || o.deliveryAddress;
    }
    entry.orderCount += 1;
    entry.totalSpent += Number(o.total) || 0;
  });

  return [...map.values()];
}

function computeOrderTotals(products, items, discountPct) {
  const enrichedItems = items.map(i => {
    const p = products.find(p=>p.id===i.productId);
    // Use the item's own snapshotted values if it already has them (an existing order),
    // otherwise look up current product data (a brand-new item being added right now).
    const price = (i.price !== undefined) ? i.price : (p ? p.price : 0);
    const cost = (i.cost !== undefined) ? i.cost : (p ? p.cost : 0);
    const name = (i.name !== undefined) ? i.name : (p ? p.name : 'Unknown item');
    const selectedOptions = i.selectedOptions || [];
    return { ...i, price, cost, name, selectedOptions };
  });
  const lineUnitPrice = i => i.price + i.selectedOptions.reduce((s,o) => s + (Number(o.price)||0), 0);
  const subtotal = enrichedItems.reduce((s,i) => s + lineUnitPrice(i)*i.qty, 0);
  const costTotal = enrichedItems.reduce((s,i) => s + i.cost*i.qty, 0);
  const total = subtotal * (1 - (discountPct||0)/100);
  return { subtotal, costTotal, total, profit: total - costTotal, items: enrichedItems };
}

// Node-only export for the automated test suite (tests/shared.test.js).
// This block never executes in a browser — typeof module is undefined there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { esc, cap, normPhone, custKey, formatAddress, parseAddress, buildOrderData, getMergedCustomers, computeOrderTotals };
}
