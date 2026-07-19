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

// ── Phone/customer matching ──
function normPhone(p) { return (p || '').replace(/\D/g, ''); }
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
    return { street: raw.trim(), city: '', state: '', zip: '' };
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
function getMergedCustomers(products, orders, customers) {
  const map = new Map();

  customers.forEach(c => {
    map.set(custKey(c), {
      recordId: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone||'',
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
        recordId: null, firstName:o.firstName, lastName:o.lastName, phone:o.phone||'',
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
  const subtotal = items.reduce((s,i) => { const p = products.find(p=>p.id===i.productId); return s + (p ? p.price*i.qty : 0); }, 0);
  const costTotal = items.reduce((s,i) => { const p = products.find(p=>p.id===i.productId); return s + (p ? p.cost*i.qty : 0); }, 0);
  const total = subtotal * (1 - (discountPct||0)/100);
  return { subtotal, costTotal, total, profit: total - costTotal };
}
