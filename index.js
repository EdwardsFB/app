let products = [], orders = [], customers = [];
let cQty = {};
let currentFulfillment = 'pickup';
let currentStep = 1;
let hasOrderedBefore = null;
let paymentMethod = 'venmo';
const VENMO_HANDLE = 'edwardsfamilybakery';

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
  wireLiveValidation();
  updateStepperUI(1);
  updateContinueState(1);
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  setTimeout(() => window.scrollTo(0, 1), 50);
}

function applyLogo() {
  if (!LOGO_DATA_URI) return;
  document.getElementById('logoImg').src = LOGO_DATA_URI;
  document.getElementById('logoImg').classList.remove('d-none');
  document.getElementById('brandText').classList.add('d-none');
}

function cancelOrder() {
  if (confirm('Cancel this order and start over? Anything you\'ve entered will be lost.')) {
    location.reload();
  }
}

// ══════════════════════════════════════════
// STEP 1 — CONTACT INFO
// ══════════════════════════════════════════

function setOrderedBefore(val) {
  hasOrderedBefore = val;
  document.getElementById('btn-ordered-yes').classList.toggle('active', val === true);
  document.getElementById('btn-ordered-no').classList.toggle('active', val === false);
  document.getElementById('lookupSection').classList.toggle('d-none', !val);
  document.getElementById('lookupMsg').textContent = '';
  if (val) {
    // Yes — wait for a lookup attempt before showing the (likely pre-filled) fields
    document.getElementById('contactFieldsSection').classList.add('d-none');
  } else {
    // No — go straight to blank required fields
    ['cf-first','cf-last','cf-phone','cf-email'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('contactFieldsSection').classList.remove('d-none');
  }
  updateContinueState(1);
}

function lookupReturningCustomer() {
  const phone = document.getElementById('lookupPhone').value.trim();
  const msg = document.getElementById('lookupMsg');
  const normed = normPhone(phone);
  if (!normed) { msg.className = 'small mt-2 text-danger'; msg.textContent = 'Please enter the phone number you used before.'; return; }

  const match = getMergedCustomers(products, orders, customers).find(c => normPhone(c.phone) === normed);
  document.getElementById('contactFieldsSection').classList.remove('d-none');

  if (!match) {
    msg.className = 'small mt-2 text-danger';
    msg.textContent = "We couldn't find a record with that phone number — no problem, just fill in your info below.";
    document.getElementById('cf-first').value = '';
    document.getElementById('cf-last').value = '';
    document.getElementById('cf-phone').value = phone;
    document.getElementById('cf-email').value = '';
    updateContinueState(1);
    return;
  }

  document.getElementById('cf-first').value = match.firstName;
  document.getElementById('cf-last').value = match.lastName;
  document.getElementById('cf-phone').value = match.phone;
  document.getElementById('cf-email').value = match.email || '';

  if (match.address) {
    const parts = (match.street || match.city || match.state || match.zip)
      ? { street: match.street, city: match.city, state: match.state, zip: match.zip }
      : parseAddress(match.address);
    document.getElementById('cf-street').value = parts.street || '';
    document.getElementById('cf-city').value = parts.city || '';
    document.getElementById('cf-state').value = parts.state || '';
    document.getElementById('cf-zip').value = parts.zip || '';
    document.getElementById('rad-delivery').checked = true;
    setFulfillment('delivery');
  }

  msg.className = 'small mt-2 text-success';
  msg.textContent = `Welcome back, ${match.firstName}! We filled in your info below — feel free to update anything that's changed.`;
  updateContinueState(1);
  updateContinueState(3);
}

// ══════════════════════════════════════════
// STEP 2 — PRODUCTS
// ══════════════════════════════════════════

function renderProducts() {
  const visibleProducts = products.filter(p => p.active !== false);
  cQty = {};
  visibleProducts.forEach(p => cQty[p.id] = 0);
  document.getElementById('productsList').innerHTML = visibleProducts.map(p => `
    <div class="col">
      <div class="card h-100">
        <img src="${p.photo || PLACEHOLDER_PHOTO_URI}" class="card-img-top product-card-img" alt="${esc(p.name)}">
        <div class="card-body p-2 d-flex flex-column">
          <div class="fw-bold small">${esc(p.name)}</div>
          ${p.desc ? `<div class="text-muted" style="font-size:0.75rem;">${esc(p.desc)}</div>` : ''}
          <div class="mt-auto pt-2">
            <div class="input-group input-group-sm mb-1">
              <button class="btn btn-outline-secondary" type="button" onclick="changeQty('${p.id}', -1)"><i class="bi bi-dash"></i></button>
              <span class="form-control text-center px-0" id="qty-${p.id}">0</span>
              <button class="btn btn-outline-secondary" type="button" onclick="changeQty('${p.id}', 1)"><i class="bi bi-plus"></i></button>
            </div>
            <div class="small fw-bold">$${Number(p.price).toFixed(2)} <span class="text-muted fw-normal">${esc(p.unit||'')}</span></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function changeQty(id, delta) {
  cQty[id] = Math.max(0, (cQty[id]||0) + delta);
  document.getElementById('qty-'+id).textContent = cQty[id];
  updateStickyTotal();
  updateContinueState(2);
}

function updateStickyTotal() {
  let count = 0, total = 0;
  products.forEach(p => {
    const qty = cQty[p.id]||0;
    count += qty;
    total += qty * p.price;
  });
  document.getElementById('stickyItemCount').textContent = `${count} item${count!==1?'s':''}`;
  document.getElementById('stickyTotal').textContent = '$' + total.toFixed(2);
}

// ══════════════════════════════════════════
// STEP 3 — FULFILLMENT
// ══════════════════════════════════════════

function setFulfillment(type) {
  currentFulfillment = type;
  document.getElementById('addressField').classList.toggle('d-none', type !== 'delivery');
  document.getElementById('cf-date-label').textContent = type === 'delivery' ? 'Delivery Date' : 'Pickup Date';
}

// ══════════════════════════════════════════
// STEP 4 — REVIEW & PAYMENT
// ══════════════════════════════════════════

function setPaymentMethod(method) { paymentMethod = method; }

function formatDateHuman(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d); // local time, avoids UTC-shift-by-a-day issues
  return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function renderReview() {
  let html = '', total = 0;
  products.forEach(p => {
    const qty = cQty[p.id]||0;
    if (qty > 0) {
      const sub = qty * p.price;
      total += sub;
      html += `<div class="d-flex justify-content-between small"><span>${qty}× ${esc(p.name)}</span><span>$${sub.toFixed(2)}</span></div>`;
    }
  });
  document.getElementById('reviewItems').innerHTML = html || '<div class="small text-muted">No items selected</div>';

  const first = document.getElementById('cf-first').value.trim();
  const last = document.getElementById('cf-last').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  const email = document.getElementById('cf-email').value.trim();
  const date = document.getElementById('cf-date').value;
  const typeLabel = currentFulfillment === 'delivery' ? 'Delivery' : 'Pickup';
  const humanDate = formatDateHuman(date);

  let contactHtml = `<div>${typeLabel}${humanDate ? ' on ' + esc(humanDate) : ''}</div>`;
  if (currentFulfillment === 'delivery') {
    const street = document.getElementById('cf-street').value.trim();
    const city = document.getElementById('cf-city').value.trim();
    const state = document.getElementById('cf-state').value.trim();
    const zip = document.getElementById('cf-zip').value.trim();
    contactHtml += `<div>${esc(street)}, ${esc(city)}, ${esc(state)} ${esc(zip)}</div>`;
  }
  contactHtml += `<div class="mt-2">${esc(first)} ${esc(last)}</div><div>${esc(phone)}</div>`;
  if (email) contactHtml += `<div>${esc(email)}</div>`;
  document.getElementById('reviewContact').innerHTML = contactHtml;

  document.getElementById('reviewTotal').textContent = '$' + total.toFixed(2);
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════

function updateContinueState(step) {
  const err = validateStep(step);
  const btnId = step === 4 ? 'step4-submit' : 'step'+step+'-continue';
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = !!err;
}

function wireLiveValidation() {
  ['cf-first','cf-last','cf-phone'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => updateContinueState(1));
  });
  ['cf-street','cf-city','cf-state','cf-zip'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => updateContinueState(3));
  });
  document.getElementById('rad-pickup').addEventListener('change', () => updateContinueState(3));
  document.getElementById('rad-delivery').addEventListener('change', () => updateContinueState(3));
}

function validateStep(step) {
  if (step === 1) {
    if (hasOrderedBefore === null) return "Please let us know if you've ordered with us before.";
    const first = document.getElementById('cf-first').value.trim();
    const last = document.getElementById('cf-last').value.trim();
    const phone = document.getElementById('cf-phone').value.trim();
    if (!first || !last) return 'Please enter your first and last name.';
    if (!phone) return 'Please enter a phone number.';
  }
  if (step === 2) {
    const anyItems = Object.values(cQty).some(q => q > 0);
    if (!anyItems) return 'Please select at least one item.';
  }
  if (step === 3) {
    if (currentFulfillment === 'delivery') {
      const street = document.getElementById('cf-street').value.trim();
      const city = document.getElementById('cf-city').value.trim();
      const state = document.getElementById('cf-state').value.trim();
      const zip = document.getElementById('cf-zip').value.trim();
      if (!street || !city || !state || !zip) return 'Please fill in your full delivery address.';
    }
  }
  return null;
}

function goToStep(step) {
  if (step > currentStep) {
    const err = validateStep(currentStep);
    if (err) {
      const errEl = document.getElementById('step'+currentStep+'Error');
      if (errEl) errEl.textContent = err;
      return;
    }
  }
  const currentErrEl = document.getElementById('step'+currentStep+'Error');
  if (currentErrEl) currentErrEl.textContent = '';

  document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('d-none'));
  document.getElementById('step'+step).classList.remove('d-none');
  document.getElementById('stickyTotalBar').classList.toggle('d-none', step !== 2);
  if (step === 2) updateStickyTotal();
  if (step === 4) renderReview();
  updateStepperUI(step);
  updateContinueState(step);
  currentStep = step;
  window.scrollTo(0,0);
}

function updateStepperUI(step) {
  const labels = ['Your Info', 'Menu', 'Pickup/Delivery', 'Review & Pay'];
  document.getElementById('stepperLabel').textContent = `Step ${step} of 4 — ${labels[step-1]}`;
  document.querySelectorAll('.step-circle').forEach(el => {
    const s = parseInt(el.dataset.step, 10);
    el.classList.remove('step-active','step-complete');
    if (s < step) el.classList.add('step-complete');
    else if (s === step) el.classList.add('step-active');
  });
}

// ══════════════════════════════════════════
// SUBMIT
// ══════════════════════════════════════════

async function submitOrder() {
  const first = document.getElementById('cf-first').value.trim();
  const last = document.getElementById('cf-last').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  const email = document.getElementById('cf-email').value.trim();
  const date = document.getElementById('cf-date').value;
  const street = document.getElementById('cf-street').value.trim();
  const city = document.getElementById('cf-city').value.trim();
  const state = document.getElementById('cf-state').value.trim();
  const zip = document.getElementById('cf-zip').value.trim();
  const notes = document.getElementById('cf-notes').value.trim();
  const errEl = document.getElementById('step4Error');
  const items = products.filter(p => (cQty[p.id]||0) > 0).map(p => ({ productId: p.id, qty: cQty[p.id] }));

  const { orderData, error } = buildOrderData({
    first, last, phone, items, fulfillment: currentFulfillment,
    street, city, state, zip, date, notes,
    payment: paymentMethod, paymentStatus: 'unpaid', fulfillmentStatus: 'pending',
    products
  });
  if (error) { errEl.textContent = error; return; }
  errEl.textContent = '';

  const submitBtn = document.querySelector('#step4 button.btn-dark');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';

  const newOrder = { id: 'o' + Date.now(), createdAt: Date.now(), source: 'customer', ...orderData };

  try {
    await persistNewOrder(newOrder, customers, email);
  } catch (err) {
    errEl.textContent = 'Something went wrong submitting your order: ' + err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
    return;
  }

  const orderNum = newOrder.id.slice(-6);
  document.getElementById('confirmMsg').textContent = `Thanks, ${first}!`;
  document.getElementById('confirmOrderNum').textContent = orderNum;

  if (paymentMethod === 'venmo') {
    document.getElementById('venmoAmount').textContent = '$' + newOrder.total.toFixed(2);
    const note = encodeURIComponent(`Edwards Family Bakery, Order #${orderNum}`);
    document.getElementById('venmoLink').href = `https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${newOrder.total.toFixed(2)}&note=${note}`;
    document.getElementById('venmoConfirmCard').classList.remove('d-none');
    document.getElementById('cashConfirmCard').classList.add('d-none');
  } else {
    document.getElementById('cashAmount').textContent = '$' + newOrder.total.toFixed(2);
    document.getElementById('cashConfirmCard').classList.remove('d-none');
    document.getElementById('venmoConfirmCard').classList.add('d-none');
  }

  document.getElementById('wizardScreen').classList.add('d-none');
  document.getElementById('stickyTotalBar').classList.add('d-none');
  document.getElementById('confirmScreen').classList.remove('d-none');
  window.scrollTo(0,0);
}

init();
