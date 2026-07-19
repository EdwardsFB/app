let products = [], orders = [], customers = [];
let cQty = {};
let currentFulfillment = 'pickup';
const VENMO_HANDLE = 'edwardsfamilybakery';
const LOGO_DATA_URI = null; // paste a base64 data URI here later to show the logo

async function init() {
  try {
    const data = await apiGetAll();
    products = data.products || [];
    orders = data.orders || [];
    customers = data.customers || [];
  } catch (err) {
    document.getElementById('loading').innerHTML =
      '<div class="text-center text-danger"><p>Could not load the menu right now.</p><p class="small">' + esc(err.message) + '</p></div>';
    return;
  }
  applyLogo();
  renderProducts();
  updateSummary();
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
}

function applyLogo() {
  if (!LOGO_DATA_URI) return;
  document.getElementById('logoImg').src = LOGO_DATA_URI;
  document.getElementById('logoImg').classList.remove('d-none');
  document.getElementById('brandText').classList.add('d-none');
}

function renderProducts() {
  cQty = {};
  products.forEach(p => cQty[p.id] = 0);
  document.getElementById('productsList').innerHTML = products.map(p => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-center py-2">
        <div>
          <div class="fw-bold">${esc(p.name)}</div>
          <div class="small text-muted">${esc(p.desc||'')}</div>
          <div class="small text-primary">$${Number(p.price).toFixed(2)} ${esc(p.unit||'')}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick="changeQty('${p.id}', -1)">-</button>
          <span id="qty-${p.id}" style="min-width:20px;text-align:center;">0</span>
          <button class="btn btn-outline-secondary btn-sm" onclick="changeQty('${p.id}', 1)">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

function changeQty(id, delta) {
  cQty[id] = Math.max(0, (cQty[id]||0) + delta);
  document.getElementById('qty-'+id).textContent = cQty[id];
  updateSummary();
}

function setFulfillment(type) {
  currentFulfillment = type;
  document.getElementById('addressField').classList.toggle('d-none', type !== 'delivery');
}

function updateSummary() {
  let total = 0, html = '';
  products.forEach(p => {
    const qty = cQty[p.id]||0;
    if (qty > 0) {
      const sub = qty * p.price;
      total += sub;
      html += `<div class="d-flex justify-content-between small text-white-50"><span>${qty}× ${esc(p.name)}</span><span>$${sub.toFixed(2)}</span></div>`;
    }
  });
  document.getElementById('summaryLines').innerHTML = html || '<div class="small text-white-50">No items selected yet</div>';
  document.getElementById('summaryTotal').textContent = '$' + total.toFixed(2);
}

function lookupReturningCustomer() {
  const phone = document.getElementById('lookupPhone').value.trim();
  const msg = document.getElementById('lookupMsg');
  const normed = normPhone(phone);
  if (!normed) { msg.className = 'small mt-2 text-danger'; msg.textContent = 'Please enter the phone number you used before.'; return; }

  const match = getMergedCustomers(products, orders, customers).find(c => normPhone(c.phone) === normed);
  if (!match) {
    msg.className = 'small mt-2 text-danger';
    msg.textContent = "We couldn't find an order with that phone number — no problem, just fill in your info below.";
    return;
  }
  document.getElementById('cf-first').value = match.firstName;
  document.getElementById('cf-last').value = match.lastName;
  document.getElementById('cf-phone').value = match.phone;
  if (match.address) {
    document.getElementById('cf-address').value = match.address;
    document.getElementById('rad-delivery').checked = true;
    setFulfillment('delivery');
  }
  msg.className = 'small mt-2 text-success';
  msg.textContent = `Welcome back, ${match.firstName}! We filled in your info below.`;
}

async function submitOrder() {
  const first = document.getElementById('cf-first').value.trim();
  const last = document.getElementById('cf-last').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  const date = document.getElementById('cf-date').value;
  const address = document.getElementById('cf-address').value.trim();
  const notes = document.getElementById('cf-notes').value.trim();
  const errEl = document.getElementById('formError');

  const items = products.filter(p => (cQty[p.id]||0) > 0).map(p => ({ productId: p.id, qty: cQty[p.id] }));

  if (!first || !last) { errEl.textContent = 'Please enter your first and last name.'; return; }
  if (!phone) { errEl.textContent = 'Please enter a phone number.'; return; }
  if (!items.length) { errEl.textContent = 'Please select at least one item.'; return; }
  if (currentFulfillment === 'delivery' && !address) { errEl.textContent = 'Please enter a delivery address.'; return; }
  errEl.textContent = '';

  const totals = computeOrderTotals(products, items, 0);
  const submitBtn = document.querySelector('#orderFormScreen button.btn-dark');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';

  const order = {
    id: 'o' + Date.now(),
    createdAt: Date.now(),
    firstName: first, lastName: last, phone,
    items: items,
    discountSocial: false, discountFamily: false, discountPct: 0,
    subtotal: totals.subtotal, total: totals.total, profit: totals.profit, costTotal: totals.costTotal,
    fulfillment: currentFulfillment,
    date: date || '',
    deliveryAddress: currentFulfillment === 'delivery' ? address : '',
    payment: 'venmo',
    notes,
    paymentStatus: 'unpaid',
    fulfillmentStatus: 'pending',
    source: 'customer'
  };

  try {
    await apiWrite('orders', 'add', null, order);
  } catch (err) {
    errEl.textContent = 'Something went wrong submitting your order: ' + err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
    return;
  }

  document.getElementById('confirmMsg').textContent = `Thanks, ${first}! Your order total is $${totals.total.toFixed(2)}.`;
  const note = encodeURIComponent(`Edwards Family Bakery order - ${first} ${last}`);
  document.getElementById('venmoLink').href = `https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${totals.total.toFixed(2)}&note=${note}`;
  document.getElementById('orderFormScreen').classList.add('d-none');
  document.getElementById('confirmScreen').classList.remove('d-none');
  window.scrollTo(0,0);
}

init();
