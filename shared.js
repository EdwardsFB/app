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
      entry.firstName = o.firstName; entry.lastName = o.lastName;
      if (o.phone) entry.phone = o.phone;
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
    return { ...i, price, cost, name };
  });
  const subtotal = enrichedItems.reduce((s,i) => s + i.price*i.qty, 0);
  const costTotal = enrichedItems.reduce((s,i) => s + i.cost*i.qty, 0);
  const total = subtotal * (1 - (discountPct||0)/100);
  return { subtotal, costTotal, total, profit: total - costTotal, items: enrichedItems };
}

// Node-only export for the automated test suite (tests/shared.test.js).
// This block never executes in a browser — typeof module is undefined there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { esc, cap, normPhone, custKey, formatAddress, parseAddress, buildOrderData, getMergedCustomers, computeOrderTotals };
}
