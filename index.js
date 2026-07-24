// build: 2026-07-24T20:32:01Z
let products = [], orders = [], customers = [];
let settings = {};
let cQty = {};
let cOptions = {}; // cOptions[productId] = { optionName: price } for currently-checked options
let currentFulfillment = null;
let paymentMethod = null;
let appliedDiscountPct = 0;
const VENMO_HANDLE = 'edwardsfamilybakery';

async function init() {
  // Defend against the browser restoring old form values on reload/back-forward navigation.
  ['cf-phone','cf-first','cf-last','cf-email','cf-street','cf-city','cf-state','cf-zip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('has-value'); }
  });
  const phoneMatchMsgEl = document.getElementById('phoneMatchMsg');
  if (phoneMatchMsgEl) phoneMatchMsgEl.textContent = '';

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
  updateOrderTotal();
  wireLiveValidation();
  updateActionBar();
  document.getElementById('actionBar').classList.remove('d-none');
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  window.scrollTo(0, 0);
  // Measure exactly where step 1 naturally sits (distance from viewport top) right now,
  // at scroll position 0, and use that same precise number as the landing spot for every
  // future step transition - guarantees they all match instead of approximating one.
  const landingOffset = document.getElementById('step1').getBoundingClientRect().top;
  document.documentElement.style.setProperty('--step-landing-offset', landingOffset + 'px');
}

function applyLogo() {
  const logoSrc = (settings && settings.logoCustomer) || LOGO_DATA_URI;
  if (logoSrc) {
    document.getElementById('logoImg').src = logoSrc;
    document.getElementById('logoImg').classList.remove('d-none');
    document.getElementById('brandText').classList.add('d-none');
  }

  // Order Confirmation Page logo - falls back to the Passcode screen logo until a
  // dedicated one is uploaded, then to the emoji if neither exists.
  const confirmLogoSrc = (settings && (settings.logoOrderConfirmation || settings.logoPasscode)) || LOGO_DATA_URI;
  if (confirmLogoSrc) {
    document.getElementById('confirmLogo').src = confirmLogoSrc;
    document.getElementById('confirmLogo').classList.remove('d-none');
    document.getElementById('confirmEmoji').classList.add('d-none');
  }
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  // position:fixed elements anchored to top:0 can end up rendered above the
  // actually-visible area while the keyboard is up, due to the same iOS
  // visualViewport-offset quirk that affected the bottom-anchored action bar.
  // Account for the current offset directly so the toast stays visible.
  container.style.top = (window.visualViewport ? window.visualViewport.offsetTop : 0) + 'px';
  const el = document.createElement('div');
  el.className = 'toast align-items-center text-white bg-success border-0';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 3500 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  toast.show();
}

let cancelModal;
function cancelOrder() {
  if (!cancelModal) cancelModal = new bootstrap.Modal(document.getElementById('cancelModal'));
  cancelModal.show();
}

// ══════════════════════════════════════════
// STEP 1 — CONTACT INFO
// ══════════════════════════════════════════

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  el.value = value || '';
  el.classList.toggle('has-value', !!value);
}

function checkPhoneForMatch() {
  const phone = document.getElementById('cf-phone').value.trim();
  const lastName = document.getElementById('cf-last').value.trim();
  const normed = normPhone(phone);
  // Require both phone AND last name before even attempting a match - matching on
  // phone alone risks a typo'd digit landing on a different real customer and
  // exposing their name, email, and address to a stranger. Last name is required on
  // every existing order/customer record, so this works for every past customer too.
  if (normed.length !== 10 || !lastName) return;

  const match = getMergedCustomers(products, orders, customers).find(c =>
    normPhone(c.phone) === normed && (c.lastName || '').trim().toLowerCase() === lastName.toLowerCase()
  );
  if (!match) return;

  setFieldValue('cf-first', match.firstName);
  setFieldValue('cf-email', match.email || '');

  if (match.address) {
    const parts = (match.street || match.city || match.state || match.zip)
      ? { street: match.street, city: match.city, state: match.state, zip: match.zip }
      : parseAddress(match.address);
    ['cf-street','cf-city','cf-state','cf-zip'].forEach(id => {
      if (document.getElementById(id)) setFieldValue(id, parts[id.replace('cf-','')] || '');
    });
    // Address is pre-filled for convenience, but the customer still has to explicitly
    // choose Pickup or Delivery themselves each time - never auto-selected.
  }

  document.getElementById('phoneMatchMsg').textContent = `Welcome back, ${match.firstName}!`;
  updateActionBar();
  refreshReviewIfVisible();
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
          <div class="pt-2">
            <div class="input-group input-group-sm mb-1">
              <button class="btn btn-outline-secondary btn-inert" style="border-color:#ced4da;" type="button" id="qty-minus-${p.id}" onclick="changeQty('${p.id}', -1)"><i class="bi bi-dash"></i></button>
              <span class="form-control text-center px-0" id="qty-${p.id}">0</span>
              <button class="btn btn-outline-secondary" style="border-color:#ced4da;" type="button" onclick="changeQty('${p.id}', 1)"><i class="bi bi-plus"></i></button>
            </div>
            <div class="small fw-bold mt-3">$${Number(p.price).toFixed(2)} <span class="text-muted fw-normal">${esc(p.unit||'')}</span></div>
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
  updateOrderTotal();
  refreshReviewIfVisible();
}

function changeQty(id, delta) {
  cQty[id] = Math.max(0, (cQty[id]||0) + delta);
  document.getElementById('qty-'+id).textContent = cQty[id];
  document.getElementById('qty-'+id).classList.toggle('qty-active', cQty[id] > 0);
  document.getElementById('qty-minus-'+id).classList.toggle('btn-inert', cQty[id] === 0);
  const optsWrap = document.getElementById('opts-wrap-'+id);
  if (optsWrap) {
    optsWrap.classList.toggle('d-none', cQty[id] === 0);
    if (cQty[id] === 0) {
      // No longer any of this item in the cart — clear and uncheck its options too.
      cOptions[id] = {};
      optsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
  }
  updateOrderTotal();
  updateActionBar();
  refreshReviewIfVisible();
}

function getSelectedOptionsFor(productId) {
  const opts = cOptions[productId] || {};
  return Object.keys(opts).map(name => ({ name, price: opts[name] }));
}

function updateOrderTotal() {
  let total = 0;
  products.forEach(p => {
    const qty = cQty[p.id]||0;
    const optionsUnitPrice = getSelectedOptionsFor(p.id).reduce((s,o) => s + o.price, 0);
    total += qty * (p.price + optionsUnitPrice);
  });
  const discountAmt = total * (appliedDiscountPct / 100);
  document.getElementById('actionBarTotal').textContent = '$' + (total - discountAmt).toFixed(2);
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
  select.innerHTML = `<option value="" disabled selected>Select</option>` +
    dates.map(d => `<option value="${d}">${esc(formatDateHuman(d))}</option>`).join('');
  select.classList.remove('has-value');
}

function setFulfillment(type) {
  currentFulfillment = type;
  document.getElementById('fulfillmentDetailsField').classList.remove('d-none');
  document.getElementById('addressField').classList.toggle('d-none', type !== 'delivery');
  document.getElementById('cf-date-label').innerHTML = (type === 'delivery' ? 'Delivery Date' : 'Pickup Date') + ' <span class="text-danger">*</span>';
  populateDateOptions(type);
  updateActionBar();
  refreshReviewIfVisible();
}

// ══════════════════════════════════════════
// STEP 4 — REVIEW & PAYMENT
// ══════════════════════════════════════════

function setPaymentMethod(method) { paymentMethod = method; updateActionBar(); }

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
  if (!code) { appliedDiscountPct = 0; msg.className = 'small mt-1 text-danger'; msg.textContent = 'Please enter a code.'; renderReview(); updateOrderTotal(); return; }
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
  updateOrderTotal();
}

// Once step 4 has been reached, it stays visible and editable-from-above forever -
// unlike the old locked-step design, there's no single "moment" where review data
// gets built once and stays static. Call this after any change to contact, fulfillment,
// or item data so the review step (if already visible) always reflects the latest state.
function refreshReviewIfVisible() {
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
  document.getElementById('reviewItems').innerHTML = html || '<div class="small text-muted">Empty</div>';

  const discountAmt = total * (appliedDiscountPct / 100);
  document.getElementById('reviewDiscountRow').classList.toggle('d-none', appliedDiscountPct === 0);
  document.getElementById('reviewDiscountAmt').textContent = '-$' + discountAmt.toFixed(2);
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════

function updateActionBar() {
  document.getElementById('actionBarBtn').classList.toggle('btn-inert', !!validateOrder());
}

function wireLiveValidation() {
  ['cf-street','cf-city','cf-state','cf-zip'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { updateActionBar(); refreshReviewIfVisible(); });
  });
  document.getElementById('rad-pickup').addEventListener('change', () => updateActionBar());
  document.getElementById('rad-delivery').addEventListener('change', () => updateActionBar());
  document.getElementById('cf-notes').addEventListener('input', () => refreshReviewIfVisible());
  ['cf-first','cf-last','cf-email','cf-phone'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { updateActionBar(); refreshReviewIfVisible(); });
  });
}

function validateOrder() {
  const anyItems = Object.values(cQty).some(q => q > 0);
  if (!anyItems) return 'Please select at least one item from the menu.';

  const first = document.getElementById('cf-first').value.trim();
  const last = document.getElementById('cf-last').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  if (normPhone(phone).length !== 10) return 'Please enter a complete 10-digit phone number.';
  if (!first || !last) return 'Please enter your first and last name.';

  if (!currentFulfillment) return 'Please choose Pickup or Delivery.';
  const date = document.getElementById('cf-date').value;
  if (!date) return `Please choose a ${currentFulfillment === 'delivery' ? 'delivery' : 'pickup'} date.`;
  if (currentFulfillment === 'delivery') {
    const street = document.getElementById('cf-street').value.trim();
    const city = document.getElementById('cf-city').value.trim();
    const state = document.getElementById('cf-state').value.trim();
    const zip = document.getElementById('cf-zip').value.trim();
    if (!street || !city || !state || !zip) return 'Please fill in your full delivery address.';
    if (zip.length !== 5) return 'Please enter a complete 5-digit ZIP code.';
  }

  if (!paymentMethod) return "Please choose how you'll pay.";
  return null;
}

// ══════════════════════════════════════════
// SUBMIT
// ══════════════════════════════════════════

async function submitOrder() {
  const errEl = document.getElementById('step2Error');
  const submitBtn = document.getElementById('actionBarBtn');
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

    submitBtn.classList.add('btn-inert');
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
    document.getElementById('confirmScreen').classList.remove('d-none');
    document.getElementById('pageHeader').classList.add('d-none');
    document.getElementById('actionBar').classList.add('d-none');
    document.getElementById('confirmScreen').scrollIntoView({ block: 'start' });
  } catch (err) {
    errEl.textContent = 'Something went wrong placing your order: ' + err.message + '. Please try again, or let us know if this keeps happening.';
    if (submitBtn) { submitBtn.classList.remove('btn-inert'); submitBtn.textContent = 'Place Order'; }
  }
}

// Safari (and other browsers) can restore this exact page from a back-forward
// cache when returning to it, which would otherwise show whatever was typed
// before instead of a genuinely fresh page. Force a real reload in that case.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

function correctViewportOffset() {
  if (window.visualViewport && window.visualViewport.offsetTop > 0) {
    window.scrollBy(0, -window.visualViewport.offsetTop);
  }
}

// position:fixed elements anchored to the bottom don't reliably track the actual
// visible screen on iOS while the keyboard is open - rather than fight that, just
// hide the pinned bar while the keyboard's up, since there's nothing useful to tap
// on it in that moment anyway.
//
// This is tied to focus state (a field is/isn't focused), not visualViewport height.
// An earlier version compared viewport height against a threshold, but height can
// fluctuate slightly during active scrolling even while the keyboard stays up
// (dynamic browser chrome, etc.), which made the bar flicker back into view
// mid-swipe instead of staying reliably hidden. Focus state doesn't have that
// problem - it's a plain yes/no that only changes when focus actually moves.
document.getElementById('wizardScreen').addEventListener('focusin', (e) => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
    document.getElementById('actionBar').classList.add('d-none');
  }
});
document.getElementById('wizardScreen').addEventListener('focusout', () => {
  setTimeout(() => {
    const active = document.activeElement;
    const stillEditing = active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName);
    if (stillEditing) return;
    correctViewportOffset();
    const stillLoading = !document.getElementById('loading').classList.contains('d-none');
    const onConfirmScreen = !document.getElementById('confirmScreen').classList.contains('d-none');
    if (!stillLoading && !onConfirmScreen) {
      document.getElementById('actionBar').classList.remove('d-none');
    }
  }, 100);
});

init();
