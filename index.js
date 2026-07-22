let products = [], orders = [], customers = [];
let settings = {};
let cQty = {};
let cOptions = {}; // cOptions[productId] = { optionName: price } for currently-checked options
let currentFulfillment = null;
let currentStep = 1;
let hasOrderedBefore = null;
let paymentMethod = null;
let appliedDiscountPct = 0;
const VENMO_HANDLE = 'edwardsfamilybakery';

async function init() {
  // Defend against the browser restoring old form values on reload/back-forward navigation.
  hasOrderedBefore = null;
  ['lookupPhone','cf-first','cf-last','cf-phone','cf-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('btn-ordered-yes').classList.remove('active');
  document.getElementById('btn-ordered-no').classList.remove('active');
  document.getElementById('lookupSection').classList.add('d-none');
  document.getElementById('contactFieldsSection').classList.add('d-none');
  document.getElementById('lookupMsg').textContent = '';
  document.getElementById('foundExistingMsg').innerHTML = '';

  try {
    const data = await apiGetAll();
    products = data.products || [];
    orders = data.orders || [];
    customers = data.customers || [];
    settings = data.settings || {};
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
  const logoSrc = (settings && settings.logoCustomer) || LOGO_DATA_URI;
  if (!logoSrc) return;
  document.getElementById('logoImg').src = logoSrc;
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

  // Full reset every time — nothing carries over between Yes and No, or between repeated switches.
  const clearFields = () => {
    document.getElementById('lookupPhone').value = '';
    ['cf-first','cf-last','cf-phone','cf-email','cf-street','cf-city','cf-state','cf-zip'].forEach(id => {
      const el = document.getElementById(id);
      el.value = '';
      el.setAttribute('value', '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  clearFields();
  setTimeout(clearFields, 50); // fight Safari re-populating fields moments after we clear them
  document.getElementById('lookupMsg').textContent = '';
  document.getElementById('foundExistingMsg').innerHTML = '';

  document.getElementById('contactFieldsSection').classList.toggle('d-none', !!val);
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
  }

  msg.className = 'small mt-2 text-success';
  msg.textContent = `Welcome back, ${match.firstName}! We filled in your info below — feel free to update anything that's changed.`;
  updateContinueState(1);
}

// ══════════════════════════════════════════
// STEP 2 — PRODUCTS
// ══════════════════════════════════════════

function renderProducts() {
  const visibleProducts = products.filter(p => p.active !== false);
  cQty = {};
  cOptions = {};
  visibleProducts.forEach(p => { cQty[p.id] = 0; cOptions[p.id] = {}; });
  document.getElementById('productsList').innerHTML = visibleProducts.map(p => {
    const options = getProductOptions(p);
    const optionsHtml = options.map(opt => `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="opt-${p.id}-${esc(opt.name)}" onchange="toggleOption('${p.id}', '${esc(opt.name)}', ${opt.price}, this.checked)">
        <label class="form-check-label small" for="opt-${p.id}-${esc(opt.name)}">${esc(opt.name)} (+$${Number(opt.price).toFixed(2)} ea)</label>
      </div>
    `).join('');
    const optionsWrapHtml = options.length ? `<div id="opts-wrap-${p.id}" class="d-none mt-1">${optionsHtml}</div>` : '';
    return `
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
            ${optionsWrapHtml}
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

function toggleOption(productId, optionName, optionPrice, checked) {
  if (!cOptions[productId]) cOptions[productId] = {};
  cOptions[productId][optionName] = checked ? optionPrice : undefined;
  if (!checked) delete cOptions[productId][optionName];
  updateStickyTotal();
}

function changeQty(id, delta) {
  cQty[id] = Math.max(0, (cQty[id]||0) + delta);
  document.getElementById('qty-'+id).textContent = cQty[id];
  const optsWrap = document.getElementById('opts-wrap-'+id);
  if (optsWrap) {
    optsWrap.classList.toggle('d-none', cQty[id] === 0);
    if (cQty[id] === 0) {
      // No longer any of this item in the cart — clear and uncheck its options too.
      cOptions[id] = {};
      optsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
  }
  updateStickyTotal();
  updateContinueState(2);
}

function getSelectedOptionsFor(productId) {
  const opts = cOptions[productId] || {};
  return Object.keys(opts).map(name => ({ name, price: opts[name] }));
}

function updateStickyTotal() {
  let count = 0, total = 0;
  products.forEach(p => {
    const qty = cQty[p.id]||0;
    count += qty;
    const optionsUnitPrice = getSelectedOptionsFor(p.id).reduce((s,o) => s + o.price, 0);
    total += qty * (p.price + optionsUnitPrice);
  });
  document.getElementById('stickyItemCount').textContent = `${count} item${count!==1?'s':''}`;
  document.getElementById('stickyTotal').textContent = '$' + total.toFixed(2);
}

// ══════════════════════════════════════════
// STEP 3 — FULFILLMENT
// ══════════════════════════════════════════

function getUpcomingDatesForDays(allowedDayNames, count) {
  // Starts from tomorrow, giving at least one day of lead time.
  const dates = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  let guard = 0;
  while (dates.length < count && guard < 60) {
    const dayName = DAYS_OF_WEEK[cursor.getDay()];
    if (!allowedDayNames.length || allowedDayNames.includes(dayName)) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return dates;
}

function populateDateOptions(type) {
  const allowedDaysStr = type === 'delivery' ? (settings.deliveryDays || '') : (settings.pickupDays || '');
  const allowedDayNames = allowedDaysStr.split(',').filter(Boolean);
  const dates = getUpcomingDatesForDays(allowedDayNames, 3);
  const select = document.getElementById('cf-date');
  const label = type === 'delivery' ? 'delivery' : 'pickup';
  select.innerHTML = `<option value="" disabled selected>Choose a ${label} date</option>` +
    dates.map(d => `<option value="${d}">${esc(formatDateHuman(d))}</option>`).join('');
  select.classList.remove('has-value');
}

function setFulfillment(type) {
  currentFulfillment = type;
  document.getElementById('fulfillmentDetailsField').classList.remove('d-none');
  document.getElementById('addressField').classList.toggle('d-none', type !== 'delivery');
  document.getElementById('cf-date-label').innerHTML = (type === 'delivery' ? 'Delivery Date' : 'Pickup Date') + ' <span class="text-danger">*</span>';
  populateDateOptions(type);
  updateContinueState(3);
}

// ══════════════════════════════════════════
// STEP 4 — REVIEW & PAYMENT
// ══════════════════════════════════════════

function setPaymentMethod(method) { paymentMethod = method; updateContinueState(4); }

function formatDateHuman(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d); // local time, avoids UTC-shift-by-a-day issues
  return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function applyDiscountCode() {
  const input = document.getElementById('discountCodeInput');
  const msg = document.getElementById('discountCodeMsg');
  const code = input.value.trim().toUpperCase();
  if (!code) { appliedDiscountPct = 0; msg.className = 'small mt-1 text-danger'; msg.textContent = 'Please enter a code.'; renderReview(); return; }
  const match = (settings.discountCodes || []).find(d => (d.code||'').toUpperCase() === code);
  if (!match) {
    appliedDiscountPct = 0;
    msg.className = 'small mt-1 text-danger';
    msg.textContent = "That code isn't valid.";
  } else {
    appliedDiscountPct = Number(match.discountPct) || 0;
    msg.className = 'small mt-1 text-success';
    msg.textContent = `Code applied — ${appliedDiscountPct}% off!`;
  }
  renderReview();
}

function renderReview() {
  let html = '', total = 0;
  products.forEach(p => {
    const qty = cQty[p.id]||0;
    if (qty > 0) {
      const selected = getSelectedOptionsFor(p.id);
      const optionsUnitPrice = selected.reduce((s,o) => s + o.price, 0);
      const sub = qty * (p.price + optionsUnitPrice);
      total += sub;
      const optionsLabel = selected.length ? ` (${selected.map(o=>esc(o.name)).join(', ')})` : '';
      html += `<div class="d-flex justify-content-between small"><span>${qty}× ${esc(p.name)}${optionsLabel}</span><span>$${sub.toFixed(2)}</span></div>`;
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

  let contactHtml = `<div>${esc(first)} ${esc(last)}</div><div>${esc(phone)}</div>`;
  if (email) contactHtml += `<div>${esc(email)}</div>`;
  contactHtml += `<div class="mt-2">${typeLabel}${humanDate ? ' on ' + esc(humanDate) : ''}</div>`;
  if (currentFulfillment === 'delivery') {
    const street = document.getElementById('cf-street').value.trim();
    const city = document.getElementById('cf-city').value.trim();
    const state = document.getElementById('cf-state').value.trim();
    const zip = document.getElementById('cf-zip').value.trim();
    contactHtml += `<div>${esc(street)}, ${esc(city)}, ${esc(state)} ${esc(zip)}</div>`;
  }
  document.getElementById('reviewContact').innerHTML = contactHtml;

  const discountAmt = total * (appliedDiscountPct / 100);
  const finalTotal = total - discountAmt;
  document.getElementById('reviewDiscountRow').classList.toggle('d-none', appliedDiscountPct === 0);
  document.getElementById('reviewDiscountAmt').textContent = '-$' + discountAmt.toFixed(2);
  document.getElementById('reviewTotal').textContent = '$' + finalTotal.toFixed(2);
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
  document.getElementById('cf-phone').addEventListener('blur', checkForExistingCustomerOnNoPath);
  ['cf-street','cf-city','cf-state','cf-zip'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => updateContinueState(3));
  });
  document.getElementById('rad-pickup').addEventListener('change', () => updateContinueState(3));
  document.getElementById('rad-delivery').addEventListener('change', () => updateContinueState(3));
}

function checkForExistingCustomerOnNoPath() {
  const msgEl = document.getElementById('foundExistingMsg');
  if (hasOrderedBefore !== false) { msgEl.innerHTML = ''; return; } // only relevant on the "No" path
  const phone = document.getElementById('cf-phone').value.trim();
  const normed = normPhone(phone);
  if (!normed) { msgEl.innerHTML = ''; return; }
  const match = getMergedCustomers(products, orders, customers).find(c => normPhone(c.phone) === normed);
  if (match) {
    msgEl.innerHTML = `<span class="text-primary">Looks like we already have a record for this number under ${esc(match.firstName)} ${esc(match.lastName)}. <a href="#" onclick="useFoundExistingCustomer(); return false;">Use that info instead?</a></span>`;
  } else {
    msgEl.innerHTML = '';
  }
}

function useFoundExistingCustomer() {
  const phone = document.getElementById('cf-phone').value.trim();
  const normed = normPhone(phone);
  const match = getMergedCustomers(products, orders, customers).find(c => normPhone(c.phone) === normed);
  if (!match) return;
  document.getElementById('cf-first').value = match.firstName;
  document.getElementById('cf-last').value = match.lastName;
  document.getElementById('cf-phone').value = match.phone;
  document.getElementById('cf-email').value = match.email || '';
  document.getElementById('foundExistingMsg').innerHTML = `<span class="text-success">Got it — using ${esc(match.firstName)}'s info.</span>`;
  updateContinueState(1);
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
    if (!currentFulfillment) return 'Please choose Pickup or Delivery.';
    const date = document.getElementById('cf-date').value;
    if (!date) return `Please choose a ${currentFulfillment === 'delivery' ? 'delivery' : 'pickup'} date.`;
    if (currentFulfillment === 'delivery') {
      const street = document.getElementById('cf-street').value.trim();
      const city = document.getElementById('cf-city').value.trim();
      const state = document.getElementById('cf-state').value.trim();
      const zip = document.getElementById('cf-zip').value.trim();
      if (!street || !city || !state || !zip) return 'Please fill in your full delivery address.';
    }
  }
  if (step === 4) {
    if (!paymentMethod) return "Please choose how you'll pay.";
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

function stepCircleClick(step) {
  if (step < currentStep) goToStep(step); // only completed steps are clickable
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
  const errEl = document.getElementById('step4Error');
  const submitBtn = document.getElementById('step4-submit');
  try {
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
    const items = products.filter(p => (cQty[p.id]||0) > 0).map(p => ({ productId: p.id, qty: cQty[p.id], selectedOptions: getSelectedOptionsFor(p.id) }));

    if (!paymentMethod) { errEl.textContent = 'Please choose how you\'ll pay.'; return; }

    const { orderData, error } = buildOrderData({
      first, last, phone, items, fulfillment: currentFulfillment,
      street, city, state, zip, date, notes,
      payment: paymentMethod, paymentStatus: 'unpaid', fulfillmentStatus: 'pending',
      discountPct: appliedDiscountPct,
      products
    });
    if (error) { errEl.textContent = error; return; }
    errEl.textContent = '';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Placing order...';

    const newOrder = { id: 'o' + Date.now(), createdAt: Date.now(), source: 'customer', ...orderData };
    await persistNewOrder(newOrder, customers, email);

    const orderNum = getOrderNumber(newOrder, [...orders, newOrder]);
    document.getElementById('confirmMsg').textContent = `Thanks, ${first}!`;
    document.getElementById('confirmOrderNum').textContent = orderNum;

    if (paymentMethod === 'venmo') {
      document.getElementById('venmoAmount').textContent = '$' + newOrder.total.toFixed(2);
      const note = `Edwards-Family-Bakery-Order-${orderNum}`;
      document.getElementById('venmoLink').href = `https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${newOrder.total.toFixed(2)}&note=${note}`;
      document.getElementById('venmoConfirmCard').classList.remove('d-none');
      document.getElementById('cashConfirmCard').classList.add('d-none');
    } else {
      document.getElementById('cashAmount').textContent = '$' + newOrder.total.toFixed(2);
      document.getElementById('cashFulfillmentWord').textContent = currentFulfillment === 'delivery' ? 'delivery' : 'pickup';
      document.getElementById('cashConfirmCard').classList.remove('d-none');
      document.getElementById('venmoConfirmCard').classList.add('d-none');
    }

    document.getElementById('wizardScreen').classList.add('d-none');
    document.getElementById('stickyTotalBar').classList.add('d-none');
    document.getElementById('confirmScreen').classList.remove('d-none');
    window.scrollTo(0,0);
  } catch (err) {
    errEl.textContent = 'Something went wrong placing your order: ' + err.message + '. Please try again, or let us know if this keeps happening.';
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; }
  }
}

// Safari (and other browsers) can restore this exact page from a back-forward
// cache when returning to it, which would otherwise show whatever was typed
// before instead of a genuinely fresh page. Force a real reload in that case.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

init();
