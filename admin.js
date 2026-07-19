// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let products = [], orders = [], customers = [];
let currentAdminTab = 'home';
let currentOrderFilter = 'new';
let editingOrderId = null, editingProductId = null, editingCustomerRecordId = null;
let omQty = {}, omDiscountType = 'none', omCustomerMode = 'new', omExistingList = [];
let dragProductId = null;
let customerSortCol = 'lastName', customerSortDir = 'asc';
let byProductSortCol = 'qty', byProductSortDir = 'desc';
let routeOrder = [];
let confirmCallback = null;

const ADMIN_PASSCODE = 'EFB2026';
const LOGO_DATA_URI = null; // paste a base64 data URI here later to show the logo

let orderModal, productModal, customerModal, confirmModalEl;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
async function init() {
  orderModal = new bootstrap.Modal(document.getElementById('orderModal'));
  productModal = new bootstrap.Modal(document.getElementById('productModal'));
  customerModal = new bootstrap.Modal(document.getElementById('customerModal'));
  confirmModalEl = new bootstrap.Modal(document.getElementById('confirmModal'));

  document.getElementById('qrImg').src =
    'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=' + encodeURIComponent(location.origin + location.pathname.replace('admin.html','index.html'));

  document.getElementById('loading').classList.add('d-none');

  if (sessionStorage.getItem('efb_admin_session') === '1') {
    await loadAndShowApp();
  } else {
    document.getElementById('passcodeScreen').classList.remove('d-none');
  }
}

function checkPasscode() {
  const val = document.getElementById('passcodeInput').value;
  if (val === ADMIN_PASSCODE) {
    sessionStorage.setItem('efb_admin_session', '1');
    document.getElementById('passcodeScreen').classList.add('d-none');
    loadAndShowApp();
  } else {
    document.getElementById('passcodeError').textContent = 'Incorrect passcode.';
  }
}

async function loadAndShowApp() {
  document.getElementById('loading').classList.remove('d-none');
  try {
    const data = await apiGetAll();
    products = data.products || [];
    orders = data.orders || [];
    customers = data.customers || [];
  } catch (err) {
    document.getElementById('loading').innerHTML =
      '<div class="text-center text-danger"><p>Could not load data.</p><p class="small">'+esc(err.message)+'</p></div>';
    return;
  }
  applyLogo();
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  switchTab('home');
}

async function refreshData() {
  const data = await apiGetAll();
  products = data.products || [];
  orders = data.orders || [];
  customers = data.customers || [];
}

function applyLogo() {
  if (!LOGO_DATA_URI) return;
  document.getElementById('logoImg').src = LOGO_DATA_URI;
  document.getElementById('logoImg').classList.remove('d-none');
  document.getElementById('brandText').classList.add('d-none');
}

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════
function switchTab(tab) {
  currentAdminTab = tab;
  document.querySelectorAll('#sidebarNav .nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
    el.classList.toggle('text-white', el.dataset.tab === tab);
    el.classList.toggle('text-white-50', el.dataset.tab !== tab);
  });
  ['home','orders','customers','bake','route','products'].forEach(t => {
    document.getElementById('tab-'+t).classList.toggle('d-none', t !== tab);
  });
  const titles = { home:'Home', orders:'Orders', customers:'Customers', bake:'Bake List', route:'Delivery Route', products:'Products' };
  document.getElementById('pageTitle').textContent = titles[tab];
  document.getElementById('newOrderBtn').classList.toggle('d-none', tab !== 'orders');
  document.getElementById('addCustomerBtn').classList.toggle('d-none', tab !== 'customers');
  document.getElementById('newProductBtn').classList.toggle('d-none', tab !== 'products');

  if (tab === 'home') renderHomeTab();
  if (tab === 'orders') renderOrdersTab();
  if (tab === 'customers') renderCustomersTab();
  if (tab === 'bake') renderBakeTab();
  if (tab === 'route') renderRouteTab();
  if (tab === 'products') renderProductsTab();
}

// ══════════════════════════════════════════
// GENERIC CONFIRM MODAL
// ══════════════════════════════════════════
function openConfirm(message, callback) {
  document.getElementById('confirmModalMsg').textContent = message;
  confirmCallback = callback;
  confirmModalEl.show();
}
function runConfirmCallback() {
  const cb = confirmCallback;
  confirmModalEl.hide();
  confirmCallback = null;
  if (cb) cb();
}

// ══════════════════════════════════════════
// HOME DASHBOARD
// ══════════════════════════════════════════
function renderHomeTab() {
  const container = document.getElementById('tab-home');
  if (!orders.length) { container.innerHTML = '<div class="text-center text-muted py-5"><h5>No data yet</h5></div>'; return; }

  const totalRevenue = orders.reduce((s,o)=>s+Number(o.total),0);
  const totalProfit = orders.reduce((s,o)=>s+Number(o.profit||0),0);
  const avgOrder = totalRevenue / orders.length;
  const avgMargin = totalRevenue ? (totalProfit/totalRevenue)*100 : 0;
  const unpaidCount = orders.filter(o=>o.paymentStatus==='unpaid').length;
  const newCount = orders.filter(o=>o.fulfillmentStatus==='pending').length;
  const uniqueCustomers = getMergedCustomers(products, orders, customers).length;

  const cards = [
    ['Total Revenue', '$'+totalRevenue.toFixed(0), 'success'],
    ['Total Profit', '$'+totalProfit.toFixed(0), 'success'],
    ['Average Order', '$'+avgOrder.toFixed(2), ''],
    ['Average Margin', avgMargin.toFixed(0)+'%', ''],
    ['Total Orders', orders.length, ''],
    ['Unpaid Customers', unpaidCount, 'warning'],
    ['Needs Fulfillment', newCount, 'warning'],
    ['Unique Customers', uniqueCustomers, ''],
    ['Total Products', products.length, ''],
  ];

  const paymentStats = { venmo:0, cash:0 };
  orders.forEach(o => { paymentStats[o.payment] = (paymentStats[o.payment]||0) + Number(o.total); });
  cards.push(['Venmo / Cash', `$${(paymentStats.venmo||0).toFixed(0)} / $${(paymentStats.cash||0).toFixed(0)}`, '']);

  container.innerHTML = `
    <div class="row row-cols-2 row-cols-md-4 g-3 mb-4">
      ${cards.map(([label,val,color]) => `
        <div class="col">
          <div class="card ${color==='success'?'border-success':color==='warning'?'border-warning':''} h-100">
            <div class="card-body">
              <div class="small text-muted text-uppercase">${label}</div>
              <div class="fs-4 fw-bold ${color==='success'?'text-success':''}">${val}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="card"><div class="card-body p-0">${renderByProductTable()}</div></div>
  `;
}

function sortByProductBy(col) {
  if (byProductSortCol === col) byProductSortDir = byProductSortDir === 'asc' ? 'desc' : 'asc';
  else { byProductSortCol = col; byProductSortDir = 'desc'; }
  renderHomeTab();
}

function renderByProductTable() {
  const stats = {};
  products.forEach(p => stats[p.id] = { name:p.name, qty:0, revenue:0, cost:0 });
  orders.forEach(o => (o.items||[]).forEach(i => {
    if (stats[i.productId]) {
      const p = products.find(p=>p.id===i.productId);
      stats[i.productId].qty += i.qty;
      if (p) { stats[i.productId].revenue += p.price*i.qty; stats[i.productId].cost += p.cost*i.qty; }
    }
  }));
  let rowsData = Object.values(stats).filter(s=>s.qty>0).map(s => {
    const profit = s.revenue - s.cost;
    return { name:s.name, qty:s.qty, revenue:s.revenue, profit, margin: s.revenue ? (profit/s.revenue)*100 : 0 };
  });
  rowsData.sort((a,b) => {
    let av=a[byProductSortCol], bv=b[byProductSortCol];
    if (typeof av === 'string') { av=av.toLowerCase(); bv=(bv||'').toLowerCase(); }
    return av<bv ? (byProductSortDir==='asc'?-1:1) : av>bv ? (byProductSortDir==='asc'?1:-1) : 0;
  });
  const arrow = c => byProductSortCol===c ? (byProductSortDir==='asc'?' ▲':' ▼') : '';
  const cols = [['name','Product',''],['qty','Qty','end'],['revenue','Revenue','end'],['profit','Profit','end'],['margin','Margin','end']];
  const rows = rowsData.map(r => `<tr><td>${esc(r.name)}</td><td class="text-end">${r.qty}</td><td class="text-end">$${r.revenue.toFixed(2)}</td><td class="text-end text-success fw-bold">$${r.profit.toFixed(2)}</td><td class="text-end">${r.margin.toFixed(0)}%</td></tr>`).join('');
  return `<table class="table table-striped mb-0"><thead><tr>${cols.map(([k,l,a])=>`<th class="text-${a||'start'}" style="cursor:pointer;" onclick="sortByProductBy('${k}')">${l}${arrow(k)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ══════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════
function setOrderFilter(f) { currentOrderFilter = f; renderOrdersList(); }

function renderOrdersTab() {
  document.getElementById('tab-orders').innerHTML = `
    <div class="btn-group mb-3" id="orderFilterTabs">
      <button class="btn btn-outline-dark" data-f="new" onclick="setOrderFilter('new')">New</button>
      <button class="btn btn-outline-dark" data-f="delivered" onclick="setOrderFilter('delivered')">Delivered</button>
      <button class="btn btn-outline-dark" data-f="unpaid" onclick="setOrderFilter('unpaid')">Unpaid</button>
      <button class="btn btn-outline-dark" data-f="all" onclick="setOrderFilter('all')">All</button>
    </div>
    <div id="ordersList"></div>
  `;
  renderOrdersList();
}

function getOrderNumberMap() {
  const sorted = [...orders].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const map = new Map();
  sorted.forEach((o,i) => map.set(o.id, i+1));
  return map;
}

function renderOrdersList() {
  document.querySelectorAll('#orderFilterTabs button').forEach(b => b.classList.toggle('active', b.dataset.f===currentOrderFilter));
  let list = [...orders].sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  if (currentOrderFilter==='new') list = list.filter(o=>o.fulfillmentStatus==='pending');
  if (currentOrderFilter==='delivered') list = list.filter(o=>o.fulfillmentStatus==='delivered'||o.fulfillmentStatus==='pickedup');
  if (currentOrderFilter==='unpaid') list = list.filter(o=>o.paymentStatus==='unpaid');

  const el = document.getElementById('ordersList');
  if (!list.length) { el.innerHTML = '<div class="text-center text-muted py-5">No orders here.</div>'; return; }
  const numberMap = getOrderNumberMap();

  el.innerHTML = `<div class="table-responsive"><table class="table table-striped align-middle bg-white">
    <thead><tr><th>#</th><th>Customer</th><th>Type</th><th>Payment</th><th>Date</th><th>Payment Status</th><th>Fulfillment</th><th class="text-end">Total</th><th></th></tr></thead>
    <tbody>
      ${list.map(o => {
        const itemStr = (o.items||[]).map(i => { const p = products.find(p=>p.id===i.productId); return p ? `${i.qty}× ${p.name}` : ''; }).filter(Boolean).join(', ');
        return `<tr title="${esc(itemStr)}">
          <td class="text-muted small">#${String(numberMap.get(o.id)).padStart(3,'0')}</td>
          <td><div class="fw-bold">${esc(o.firstName)} ${esc(o.lastName)}</div><div class="small text-muted">${esc(o.phone||'')}</div></td>
          <td><span class="badge text-bg-secondary">${o.fulfillment}</span></td>
          <td>${cap(o.payment)}</td>
          <td class="small text-muted">${o.date||'—'}</td>
          <td><select class="form-select form-select-sm" onchange="updatePaymentStatus('${o.id}', this.value)">
                <option value="unpaid" ${o.paymentStatus==='unpaid'?'selected':''}>Unpaid</option>
                <option value="paid" ${o.paymentStatus==='paid'?'selected':''}>Paid</option>
              </select></td>
          <td><select class="form-select form-select-sm" onchange="updateFulfillmentStatus('${o.id}', this.value)">
                <option value="pending" ${o.fulfillmentStatus==='pending'?'selected':''}>Pending</option>
                <option value="delivered" ${o.fulfillmentStatus==='delivered'?'selected':''}>Delivered</option>
                <option value="pickedup" ${o.fulfillmentStatus==='pickedup'?'selected':''}>Picked Up</option>
              </select></td>
          <td class="text-end fw-bold">$${Number(o.total).toFixed(2)}</td>
          <td class="text-end">
            <button class="btn btn-outline-secondary btn-sm" onclick="openOrderModal('${o.id}')">Edit</button>
            <button class="btn btn-outline-danger btn-sm" onclick="deleteOrder('${o.id}')">Delete</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

async function updatePaymentStatus(id, val) {
  const o = orders.find(o=>o.id===id); if (!o) return;
  o.paymentStatus = val;
  renderOrdersTab();
  await apiWrite('orders','update',id,{paymentStatus:val});
}
async function updateFulfillmentStatus(id, val) {
  const o = orders.find(o=>o.id===id); if (!o) return;
  o.fulfillmentStatus = val;
  renderOrdersTab();
  await apiWrite('orders','update',id,{fulfillmentStatus:val});
}
function deleteOrder(id) {
  const o = orders.find(o=>o.id===id);
  openConfirm(`Delete ${o ? o.firstName+' '+o.lastName+"'s order" : 'this order'}? This cannot be undone.`, async () => {
    orders = orders.filter(o=>o.id!==id);
    renderOrdersTab();
    await apiWrite('orders','delete',id,null);
  });
}

// ══════════════════════════════════════════
// ORDER MODAL
// ══════════════════════════════════════════
function resetOmModeUI() {
  omCustomerMode = 'new';
  document.getElementById('om-customer-mode').value = 'new';
  document.getElementById('omExistingSelectField').classList.add('d-none');
}
function setOmCustomerMode(mode) {
  omCustomerMode = mode;
  document.getElementById('omExistingSelectField').classList.toggle('d-none', mode!=='existing');
  if (mode === 'existing') populateOmExistingSelect();
  else {
    document.getElementById('om-first').value='';
    document.getElementById('om-last').value='';
    document.getElementById('om-phone').value='';
    document.getElementById('om-address').value='';
  }
}
function populateOmExistingSelect() {
  omExistingList = getMergedCustomers(products, orders, customers).slice().sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''));
  document.getElementById('om-existing-select').innerHTML = '<option value="">— Choose a customer —</option>' +
    omExistingList.map((c,i) => `<option value="${i}">${esc(c.lastName)}, ${esc(c.firstName)}${c.phone?' — '+esc(c.phone):''}</option>`).join('');
}
function onOmExistingSelect() {
  const idx = document.getElementById('om-existing-select').value;
  if (idx === '') return;
  const c = omExistingList[idx]; if (!c) return;
  document.getElementById('om-first').value = c.firstName;
  document.getElementById('om-last').value = c.lastName;
  document.getElementById('om-phone').value = c.phone||'';
  if (c.address) {
    document.getElementById('om-address').value = c.address;
    document.getElementById('om-fulfillment').value = 'delivery';
    document.getElementById('om-addressField').classList.remove('d-none');
  }
}

function setOmDiscount(type) {
  omDiscountType = type;
  ['none','social','family'].forEach(t => document.getElementById('om-disc-'+t).classList.toggle('active', t===type));
  updateOMTotal();
}
function omDiscountPct() { return omDiscountType==='social'?50 : omDiscountType==='family'?25 : 0; }

function openOrderModal(id) {
  editingOrderId = id || null;
  const order = id ? orders.find(o=>o.id===id) : null;
  omQty = {};
  products.forEach(p => omQty[p.id] = order ? ((order.items||[]).find(i=>i.productId===p.id)?.qty || 0) : 0);
  const fulfillment = order ? order.fulfillment : 'pickup';

  document.getElementById('orderModalTitle').textContent = order ? 'Edit Order' : 'Add Manual Order';
  document.getElementById('om-first').value = order ? order.firstName : '';
  document.getElementById('om-last').value = order ? order.lastName : '';
  document.getElementById('om-phone').value = order ? order.phone : '';
  document.getElementById('om-date').value = order ? order.date : '';
  document.getElementById('om-fulfillment').value = fulfillment;
  document.getElementById('om-payment').value = order ? order.payment : 'venmo';
  document.getElementById('om-address').value = order ? (order.address||order.deliveryAddress||'') : '';
  document.getElementById('om-paymentStatus').value = order ? order.paymentStatus : 'unpaid';
  document.getElementById('om-fulfillmentStatus').value = order ? order.fulfillmentStatus : 'pending';
  document.getElementById('om-notes').value = order ? order.notes : '';
  document.getElementById('om-addressField').classList.toggle('d-none', fulfillment !== 'delivery');
  document.getElementById('omCustomerTypeField').classList.toggle('d-none', !!order);
  setOmDiscount(order && order.discountSocial ? 'social' : (order && order.discountFamily ? 'family' : 'none'));
  resetOmModeUI();

  document.getElementById('om-products').innerHTML = products.map(p => `
    <div class="d-flex justify-content-between align-items-center border-bottom py-2">
      <div><div class="fw-bold small">${esc(p.name)}</div><div class="small text-muted">$${Number(p.price).toFixed(2)} ${esc(p.unit||'')}</div></div>
      <input type="number" min="0" class="form-control form-control-sm" style="width:70px;" value="${omQty[p.id]}"
        oninput="omQty['${p.id}']=parseInt(this.value)||0; updateOMTotal();"/>
    </div>
  `).join('');

  updateOMTotal();
  orderModal.show();
}

function updateOMTotal() {
  let subtotal = 0;
  products.forEach(p => subtotal += (omQty[p.id]||0) * p.price);
  const pct = omDiscountPct();
  const discountAmt = subtotal * (pct/100);
  document.getElementById('om-subtotal').textContent = '$'+subtotal.toFixed(2);
  document.getElementById('om-discountRow').classList.toggle('d-none', pct===0);
  document.getElementById('om-discountAmt').textContent = '-$'+discountAmt.toFixed(2);
  document.getElementById('om-total').textContent = '$'+(subtotal-discountAmt).toFixed(2);
}

async function saveOrderFromModal() {
  const first = document.getElementById('om-first').value.trim();
  const last = document.getElementById('om-last').value.trim();
  if (!first || !last) { alert('Please enter a customer name.'); return; }
  const items = products.filter(p => (omQty[p.id]||0) > 0).map(p => ({ productId:p.id, qty:omQty[p.id] }));
  if (!items.length) { alert('Please add at least one item.'); return; }

  const discountPct = omDiscountPct();
  const totals = computeOrderTotals(products, items, discountPct);
  const fulfillment = document.getElementById('om-fulfillment').value;
  const address = document.getElementById('om-address').value.trim();

  const orderData = {
    firstName:first, lastName:last,
    phone: document.getElementById('om-phone').value.trim(),
    items,
    discountSocial: omDiscountType==='social',
    discountFamily: omDiscountType==='family',
    discountPct,
    subtotal: totals.subtotal, total: totals.total, profit: totals.profit, costTotal: totals.costTotal,
    fulfillment,
    date: document.getElementById('om-date').value,
    deliveryAddress: fulfillment==='delivery' ? address : '',
    payment: document.getElementById('om-payment').value,
    notes: document.getElementById('om-notes').value.trim(),
    paymentStatus: document.getElementById('om-paymentStatus').value,
    fulfillmentStatus: document.getElementById('om-fulfillmentStatus').value,
  };

  if (editingOrderId) {
    const idx = orders.findIndex(o=>o.id===editingOrderId);
    orders[idx] = { ...orders[idx], ...orderData };
    orderModal.hide();
    renderOrdersTab();
    await apiWrite('orders','update',editingOrderId,orderData);
  } else {
    const newOrder = { id:'o'+Date.now(), createdAt:Date.now(), source:'admin-manual', ...orderData };
    orders.push(newOrder);
    orderModal.hide();
    renderOrdersTab();
    await apiWrite('orders','add',null,newOrder);
  }
}

// ══════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════
function sortCustomersBy(col) {
  if (customerSortCol===col) customerSortDir = customerSortDir==='asc'?'desc':'asc';
  else { customerSortCol=col; customerSortDir='asc'; }
  renderCustomersTab();
}
function sortArrow(col) { return customerSortCol===col ? (customerSortDir==='asc'?' ▲':' ▼') : ''; }

function renderCustomersTab() {
  let list = getMergedCustomers(products, orders, customers);
  list.sort((a,b) => {
    let av=a[customerSortCol], bv=b[customerSortCol];
    if (typeof av==='string') { av=av.toLowerCase(); bv=(bv||'').toLowerCase(); }
    return av<bv ? (customerSortDir==='asc'?-1:1) : av>bv ? (customerSortDir==='asc'?1:-1) : 0;
  });
  const cols = [['firstName','First Name',''],['lastName','Last Name',''],['phone','Phone',''],['address','Address',''],['orderCount','Orders','end'],['totalSpent','Total Spent','end']];

  document.getElementById('tab-customers').innerHTML = `
    <div class="table-responsive"><table class="table table-striped bg-white">
      <thead><tr>${cols.map(([k,l,a])=>`<th class="text-${a||'start'}" style="cursor:pointer;" onclick="sortCustomersBy('${k}')">${l}${sortArrow(k)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${list.map(c => `<tr>
        <td>${esc(c.firstName)}</td><td>${esc(c.lastName)}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.address||'—')}</td>
        <td class="text-end">${c.orderCount}</td><td class="text-end">$${c.totalSpent.toFixed(2)}</td>
        <td class="text-end"><button class="btn btn-outline-secondary btn-sm" onclick='openCustomerModal(${JSON.stringify(c).replace(/'/g,"&apos;")})'>Edit</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${list.length===0 ? '<div class="text-center text-muted py-5">No customers yet</div>' : ''}
  `;
}

function openCustomerModal(existing) {
  editingCustomerRecordId = existing ? existing.recordId : null;
  document.getElementById('customerModalTitle').textContent = existing ? 'Edit Customer' : 'Add Customer';
  document.getElementById('cm-first').value = existing ? existing.firstName : '';
  document.getElementById('cm-last').value = existing ? existing.lastName : '';
  document.getElementById('cm-phone').value = existing ? existing.phone : '';
  if (!existing) {
    ['cm-street','cm-city','cm-state','cm-zip'].forEach(id => document.getElementById(id).value='');
  } else if (existing.street || existing.city || existing.state || existing.zip) {
    document.getElementById('cm-street').value = existing.street||'';
    document.getElementById('cm-city').value = existing.city||'';
    document.getElementById('cm-state').value = existing.state||'';
    document.getElementById('cm-zip').value = existing.zip||'';
  } else {
    const parsed = parseAddress(existing.address);
    document.getElementById('cm-street').value = parsed.street;
    document.getElementById('cm-city').value = parsed.city;
    document.getElementById('cm-state').value = parsed.state;
    document.getElementById('cm-zip').value = parsed.zip;
  }
  customerModal.show();
}

async function saveCustomerFromModal() {
  const first = document.getElementById('cm-first').value.trim();
  const last = document.getElementById('cm-last').value.trim();
  if (!first) { alert('Please enter a first name.'); return; }
  const data = {
    firstName:first, lastName:last,
    phone: document.getElementById('cm-phone').value.trim(),
    street: document.getElementById('cm-street').value.trim(),
    city: document.getElementById('cm-city').value.trim(),
    state: document.getElementById('cm-state').value.trim(),
    zip: document.getElementById('cm-zip').value.trim()
  };

  if (editingCustomerRecordId) {
    const rec = customers.find(c=>c.id===editingCustomerRecordId);
    Object.assign(rec, data);
    customerModal.hide();
    renderCustomersTab();
    await apiWrite('customers','update',editingCustomerRecordId,data);
  } else {
    const key = custKey(data);
    const existingRec = customers.find(c => custKey(c)===key);
    if (existingRec) {
      Object.assign(existingRec, data);
      customerModal.hide();
      renderCustomersTab();
      await apiWrite('customers','update',existingRec.id,data);
    } else {
      const newCust = { id:'c'+Date.now(), ...data };
      customers.push(newCust);
      customerModal.hide();
      renderCustomersTab();
      await apiWrite('customers','add',null,newCust);
    }
  }
}

// ══════════════════════════════════════════
// BAKE LIST
// ══════════════════════════════════════════
function renderBakeTab() {
  const active = orders.filter(o => o.fulfillmentStatus!=='delivered' && o.fulfillmentStatus!=='pickedup');
  const container = document.getElementById('tab-bake');
  if (!active.length) { container.innerHTML = '<div class="text-center text-muted py-5">Nothing to bake right now.</div>'; return; }
  const totals = {};
  products.forEach(p => totals[p.id]=0);
  active.forEach(o => (o.items||[]).forEach(i => totals[i.productId]=(totals[i.productId]||0)+i.qty));

  container.innerHTML = `
    <div class="row row-cols-2 row-cols-md-3 g-3 mb-4">
      ${products.filter(p=>totals[p.id]>0).map(p => `
        <div class="col"><div class="card border-warning border-3 border-start h-100"><div class="card-body">
          <div class="fs-5 fw-bold">${esc(p.name)}</div>
          <div class="display-5 fw-bold">${totals[p.id]}</div>
          <div class="text-muted">${esc((p.unit||'').replace('per ',''))}${totals[p.id]!==1?'s':''} to make</div>
        </div></div></div>
      `).join('')}
    </div>
    <h6 class="text-uppercase text-muted small">Active Orders (${active.length})</h6>
    ${active.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(o => {
      const itemStr = (o.items||[]).map(i=>{const p=products.find(p=>p.id===i.productId); return p?`${i.qty}× ${p.name}`:'';}).filter(Boolean).join(', ');
      return `<div class="card mb-2"><div class="card-body py-2"><div class="d-flex justify-content-between"><span class="fw-bold">${esc(o.firstName)} ${esc(o.lastName)}</span><span class="small text-muted">${o.date||'no date'} · ${o.fulfillment}</span></div><div class="small">${esc(itemStr)}</div></div></div>`;
    }).join('')}
  `;
}

// ══════════════════════════════════════════
// DELIVERY ROUTE
// ══════════════════════════════════════════
function renderRouteTab() {
  const deliveries = orders.filter(o => o.fulfillment==='delivery' && o.fulfillmentStatus!=='delivered' && (o.deliveryAddress||o.address));
  const container = document.getElementById('tab-route');
  if (!deliveries.length) { container.innerHTML = '<div class="text-center text-muted py-5">No deliveries pending.</div>'; return; }
  if (!routeOrder.length || routeOrder.length !== deliveries.length) routeOrder = deliveries.map(o=>o.id);
  const ordered = routeOrder.map(id => deliveries.find(o=>o.id===id)).filter(Boolean);

  container.innerHTML = `
    ${ordered.map((o,idx) => `
      <div class="card mb-2"><div class="card-body py-2 d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <span class="fw-bold text-muted">${idx+1}.</span>
          <div><div class="fw-bold small">${esc(o.firstName)} ${esc(o.lastName)}</div><div class="small text-muted">${esc(o.deliveryAddress||o.address)}</div></div>
        </div>
        <div><button class="btn btn-outline-secondary btn-sm" onclick="moveRoute(${idx},-1)">↑</button> <button class="btn btn-outline-secondary btn-sm" onclick="moveRoute(${idx},1)">↓</button></div>
      </div></div>
    `).join('')}
    <button class="btn btn-dark mt-2" onclick="openRouteMap()">Open Route in Google Maps</button>
  `;
}
function moveRoute(idx, dir) {
  const newIdx = idx+dir; if (newIdx<0 || newIdx>=routeOrder.length) return;
  [routeOrder[idx], routeOrder[newIdx]] = [routeOrder[newIdx], routeOrder[idx]];
  renderRouteTab();
}
function openRouteMap() {
  const deliveries = orders.filter(o => o.fulfillment==='delivery' && o.fulfillmentStatus!=='delivered' && (o.deliveryAddress||o.address));
  const ordered = routeOrder.map(id => deliveries.find(o=>o.id===id)).filter(Boolean);
  const addresses = ordered.map(o => encodeURIComponent(o.deliveryAddress||o.address));
  if (!addresses.length) return;
  const dest = addresses[addresses.length-1];
  const waypoints = addresses.slice(0,-1).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  window.open(url, '_blank');
}

// ══════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════
function renderProductsTab() {
  document.getElementById('tab-products').innerHTML = `
    <div class="table-responsive"><table class="table table-striped bg-white">
      <thead><tr><th></th><th>Name</th><th>Description</th><th class="text-end">Price</th><th class="text-end">Cost</th><th>Unit</th><th></th></tr></thead>
      <tbody id="productsTableBody">
        ${products.map(p => `<tr draggable="true" data-id="${p.id}"
            ondragstart="onProductDragStart(event,'${p.id}')" ondragover="onProductDragOver(event,'${p.id}')"
            ondragleave="onProductDragLeave(event)" ondrop="onProductDrop(event,'${p.id}')">
          <td class="drag-handle text-muted">⠿</td>
          <td>${esc(p.name)}</td><td>${esc(p.desc||'')}</td>
          <td class="text-end">$${Number(p.price).toFixed(2)}</td><td class="text-end">$${Number(p.cost).toFixed(2)}</td><td>${esc(p.unit||'')}</td>
          <td class="text-end"><button class="btn btn-outline-secondary btn-sm" onclick="openProductModal('${p.id}')">Edit</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  `;
}

function onProductDragStart(e,id) { dragProductId=id; e.dataTransfer.effectAllowed='move'; }
function onProductDragOver(e,id) { e.preventDefault(); if (id!==dragProductId) e.currentTarget.classList.add('table-active'); }
function onProductDragLeave(e) { e.currentTarget.classList.remove('table-active'); }
async function onProductDrop(e, targetId) {
  e.preventDefault(); e.currentTarget.classList.remove('table-active');
  if (!dragProductId || dragProductId===targetId) return;
  const fromIdx = products.findIndex(p=>p.id===dragProductId);
  const toIdx = products.findIndex(p=>p.id===targetId);
  const [moved] = products.splice(fromIdx,1);
  products.splice(toIdx,0,moved);
  dragProductId = null;
  renderProductsTab();
  const reorderData = products.map((p,i) => ({ id:p.id, sortOrder:i }));
  await apiWrite('products','reorder',null,reorderData);
}

function openProductModal(id) {
  editingProductId = id || null;
  const p = id ? products.find(p=>p.id===id) : null;
  document.getElementById('productModalTitle').textContent = p ? 'Edit Product' : 'New Product';
  document.getElementById('pm-name').value = p ? p.name : '';
  document.getElementById('pm-desc').value = p ? (p.desc||'') : '';
  document.getElementById('pm-price').value = p ? p.price : '';
  document.getElementById('pm-cost').value = p ? p.cost : '';
  document.getElementById('pm-unit').value = p ? (p.unit||'') : '';
  document.getElementById('pm-delete-btn').classList.toggle('d-none', !p);
  productModal.show();
}
function confirmDeleteProduct() {
  const p = products.find(p=>p.id===editingProductId); if (!p) return;
  openConfirm(`Delete "${p.name}" from the menu? This won't affect past orders.`, async () => {
    products = products.filter(pr=>pr.id!==editingProductId);
    productModal.hide();
    renderProductsTab();
    await apiWrite('products','delete',editingProductId,null);
  });
}
async function saveProductFromModal() {
  const name = document.getElementById('pm-name').value.trim();
  if (!name) { alert('Please enter a product name.'); return; }
  const data = {
    name, desc: document.getElementById('pm-desc').value.trim(),
    price: parseFloat(document.getElementById('pm-price').value)||0,
    cost: parseFloat(document.getElementById('pm-cost').value)||0,
    unit: document.getElementById('pm-unit').value.trim()
  };
  if (editingProductId) {
    const p = products.find(p=>p.id===editingProductId);
    Object.assign(p, data);
    productModal.hide();
    renderProductsTab();
    await apiWrite('products','update',editingProductId,data);
  } else {
    const newProduct = { id:'p'+Date.now(), sortOrder:products.length, ...data };
    products.push(newProduct);
    productModal.hide();
    renderProductsTab();
    await apiWrite('products','add',null,newProduct);
  }
}

// ══════════════════════════════════════════
// UTIL
// ══════════════════════════════════════════
function copyPublicLink() {
  const url = location.origin + location.pathname.replace('admin.html','index.html');
  navigator.clipboard.writeText(url).then(() => alert('Order page link copied!'));
}

init();
