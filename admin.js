// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }

let products = [], orders = [], customers = [], settings = {};
let currentAdminTab = 'home';
let currentOrderFilter = 'all';
let editingOrderId = null, editingProductId = null, editingCustomerRecordId = null;
let omQty = {}, omOptions = {}, omDiscountPctSelected = 0, omCustomerMode = 'new', omExistingList = [];
let dragProductId = null;
let customerSortCol = 'lastName', customerSortDir = 'asc';
let byProductSortCol = 'qty', byProductSortDir = 'desc';
let routeOrder = [];
let confirmCallback = null;

const ADMIN_PASSCODE = 'EFB2026';

function openCustomerDetail(orderId) {
  const o = orders.find(o=>o.id===orderId); if (!o) return;
  document.getElementById('customerDetailTitle').textContent = `${o.firstName} ${o.lastName}`;

  const merged = getMergedCustomers(products, orders, customers);
  const match = merged.find(c => custKey(c) === custKey({firstName:o.firstName, lastName:o.lastName, phone:o.phone}));

  const addr = o.fulfillment==='delivery' ? parseAddress(o.deliveryAddress||o.address||'') : null;
  const addressHtml = addr
    ? `${esc(addr.street)}<br>${esc([addr.city, [addr.state, addr.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '))}`
    : '—';

  const rows = [
    ['Phone', esc(o.phone || '—')],
    ['Email', esc((match && match.email) || '—')],
    ['Address', addressHtml],
    ['Fulfillment', esc(cap(o.fulfillment))],
    ['Total Spent', esc('$'+Number(o.total).toFixed(2))],
  ];

  document.getElementById('customerDetailBody').innerHTML = rows.map(([label,val]) =>
    `<div class="row mb-2"><div class="col-5 text-muted">${label}</div><div class="col-7">${val}</div></div>`
  ).join('');
  customerDetailModal.show();
}

let mergeModeOn = false;
let reorderModeOn = false;
let orderModal, productModal, customerModal, confirmModalEl, mergeModal, customerDetailModal;

function setMergeMode(on) {
  mergeModeOn = on;
  if (!on) { clearCustomerSelection(); }
  renderCustomersTab();
}
function setReorderMode(on) {
  reorderModeOn = on;
  renderProductsTab();
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
async function init() {
  orderModal = new bootstrap.Modal(document.getElementById('orderModal'));
  productModal = new bootstrap.Modal(document.getElementById('productModal'));
  customerModal = new bootstrap.Modal(document.getElementById('customerModal'));
  confirmModalEl = new bootstrap.Modal(document.getElementById('confirmModal'));
  mergeModal = new bootstrap.Modal(document.getElementById('mergeModal'));
  customerDetailModal = new bootstrap.Modal(document.getElementById('customerDetailModal'));

  ['orderModal','productModal','customerModal','confirmModal','mergeModal'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('shown.bs.modal', () => { document.getElementById('mergeBar').classList.add('d-none'); });
    el.addEventListener('hidden.bs.modal', () => { updateMergeBar(); });
  });

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
    settings = data.settings || {};
  } catch (err) {
    document.getElementById('loading').innerHTML =
      '<div class="text-center text-danger"><p>Could not load data.</p><p class="small">'+esc(err.message)+'</p></div>';
    return;
  }
  applyLogo();
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  document.getElementById('mobileTopbar').classList.remove('d-none');

  const validTabs = ['home','orders','production','fulfillment','customers','products','settings'];
  const hashTab = location.hash.replace('#','');
  switchTab(validTabs.includes(hashTab) ? hashTab : 'home');
  setTimeout(() => window.scrollTo(0, 0), 50);
}

async function refreshData() {
  const data = await apiGetAll();
  products = data.products || [];
  orders = data.orders || [];
  customers = data.customers || [];
  settings = data.settings || {};
}

// Simple grey placeholder shown for any product without a real photo yet.
// PLACEHOLDER_PHOTO_URI now lives in shared.js so index.js can use it too

let pmPhotoDataUri = null; // holds the current product-modal photo (base64), or null/'' for no photo

function compressImageFile(file, maxWidth) {
  const CELL_LIMIT = 45000; // stay safely under Google Sheets' 50,000-char cell limit
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like a valid image."));
      img.onload = () => {
        let width = maxWidth, quality = 0.8, dataUri = '';
        for (let attempt = 0; attempt < 8; attempt++) {
          const scale = Math.min(1, width / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          dataUri = canvas.toDataURL('image/jpeg', quality);
          if (dataUri.length <= CELL_LIMIT) break;
          if (quality > 0.4) quality -= 0.15; else width = Math.round(width * 0.8);
        }
        if (dataUri.length > CELL_LIMIT) {
          reject(new Error('This photo is too detailed to compress small enough — try a simpler or smaller source photo.'));
        } else {
          resolve(dataUri);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleProductPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('pm-photo-status');
  statusEl.textContent = 'Compressing photo...';
  try {
    const compressed = await compressImageFile(file, 800);
    pmPhotoDataUri = compressed;
    document.getElementById('pm-photo-preview').src = compressed;
    statusEl.textContent = 'Photo ready — click Save to keep it.';
  } catch (err) {
    statusEl.textContent = 'Could not process that photo: ' + err.message;
  }
  event.target.value = ''; // allow re-selecting the same file later
}

function removeProductPhoto() {
  pmPhotoDataUri = '';
  document.getElementById('pm-photo-preview').src = PLACEHOLDER_PHOTO_URI;
  document.getElementById('pm-photo-status').textContent = 'Photo will be removed on Save.';
}

function applyLogo() {
  const s = settings || {};
  const sidebarSrc = s.logoAdminSidebar || LOGO_DATA_URI;
  const mobileSrc = s.logoAdminMobile || LOGO_DATA_URI;
  const passcodeSrc = s.logoPasscode || LOGO_DATA_URI;
  if (sidebarSrc) {
    document.getElementById('logoImg').src = sidebarSrc;
    document.getElementById('logoImg').classList.remove('d-none');
    document.getElementById('brandText').classList.add('d-none');
  }
  if (mobileSrc) {
    document.getElementById('mobileLogoImg').src = mobileSrc;
    document.getElementById('mobileLogoImg').classList.remove('d-none');
    document.getElementById('mobileBrandText').classList.add('d-none');
  }
  const passcodeLogo = document.getElementById('passcodeLogoImg');
  if (passcodeLogo && passcodeSrc) passcodeLogo.src = passcodeSrc;
}

function toggleMobileSidebar() {
  const isOpen = document.querySelector('.sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarBackdrop').classList.toggle('show', isOpen);
  document.querySelector('#mobileTopbar .hamburger-btn i').className = isOpen ? 'bi bi-x-lg' : 'bi bi-list';
}
function closeMobileSidebar() {
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
  const icon = document.querySelector('#mobileTopbar .hamburger-btn i');
  if (icon) icon.className = 'bi bi-list';
}

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════
function switchTab(tab) {
  currentAdminTab = tab;
  location.hash = tab;
  window.scrollTo(0, 0);
  closeMobileSidebar();
  document.querySelectorAll('#sidebarNav .nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
    el.classList.toggle('text-white', el.dataset.tab === tab);
    el.classList.toggle('text-white-50', el.dataset.tab !== tab);
  });
  ['home','orders','production','fulfillment','customers','products','settings'].forEach(t => {
    document.getElementById('tab-'+t).classList.toggle('d-none', t !== tab);
  });
  const titles = { home:'Home', orders:'Orders', production:'Production', fulfillment:'Fulfillment', customers:'Customers', products:'Products', settings:'Settings' };
  document.getElementById('pageTitle').textContent = titles[tab];
  document.getElementById('newOrderBtn').classList.toggle('d-none', tab !== 'orders');
  document.getElementById('addCustomerBtn').classList.toggle('d-none', tab !== 'customers');
  document.getElementById('newProductBtn').classList.toggle('d-none', tab !== 'products');
  if (tab !== 'customers') { selectedCustomerKeys.clear(); mergeModeOn = false; document.getElementById('mergeBar').classList.add('d-none'); }
  if (tab !== 'products') { reorderModeOn = false; }

  if (tab === 'home') refreshAndRenderTab('home', renderHomeTab);
  if (tab === 'orders') refreshAndRenderTab('orders', renderOrdersTab);
  if (tab === 'customers') refreshAndRenderTab('customers', renderCustomersTab);
  if (tab === 'production') { productionDateFilter = null; refreshAndRenderTab('production', renderProductionTab); }
  if (tab === 'fulfillment') refreshAndRenderTab('fulfillment', renderFulfillmentTab);
  if (tab === 'products') refreshAndRenderTab('products', renderProductsTab);
  if (tab === 'settings') refreshAndRenderTab('settings', renderSettingsTab);
}

async function refreshAndRenderTab(tab, renderFn) {
  renderFn(); // show existing data immediately so navigation feels instant
  try {
    const fresh = await apiGetAll();
    products = fresh.products || products;
    // Merge fresh orders, but keep the LOCAL version of any order that still has an
    // unsaved debounced write in flight — otherwise a refetch landing mid-typing/clicking
    // can silently revert changes that haven't reached the server yet.
    if (fresh.orders) {
      const freshById = new Map(fresh.orders.map(o => [o.id, o]));
      const pendingIds = new Set(Object.keys(madeItemsWriteTimers || {}));
      orders = orders.filter(o => pendingIds.has(o.id) && freshById.has(o.id))
        .concat(fresh.orders.filter(o => !pendingIds.has(o.id)));
    }
    customers = fresh.customers || customers;
    settings = fresh.settings || settings;
  } catch (err) {
    console.error('Could not refresh data for ' + tab, err);
    return;
  }
  if (currentAdminTab === tab) renderFn(); // only re-render if still on this tab (avoids stomping a newer tab's content)
}

// ══════════════════════════════════════════
// GENERIC CONFIRM MODAL
// ══════════════════════════════════════════
function openConfirm(message, callback) {
  document.getElementById('confirmModalMsg').textContent = message;
  confirmCallback = callback;
  confirmModalEl.show();
}
async function runConfirmCallback() {
  const cb = confirmCallback;
  if (!cb) { confirmModalEl.hide(); return; }
  const btn = document.getElementById('confirmModalDeleteBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Deleting...';
  try {
    await cb();
    confirmModalEl.hide();
    confirmCallback = null;
  } catch (err) {
    alert('Delete failed: ' + err.message + '\n\nNothing was deleted. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ══════════════════════════════════════════
// HOME DASHBOARD
// ══════════════════════════════════════════
function renderHomeTab() {
  const container = document.getElementById('tab-home');
  if (!orders.length) { container.innerHTML = '<div class="text-center text-muted py-5"><h5>No data yet</h5></div>'; return; }

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
  const totalRevenue = paidOrders.reduce((s,o)=>s+Number(o.total),0);
  const totalProfit = paidOrders.reduce((s,o)=>s+Number(o.profit||0),0);
  const avgOrder = paidOrders.length ? totalRevenue / paidOrders.length : 0;
  const avgMargin = totalRevenue ? (totalProfit/totalRevenue)*100 : 0;
  const unpaidCount = orders.filter(o=>o.paymentStatus==='unpaid').length;
  const newCount = orders.filter(o=>o.fulfillmentStatus==='pending').length;
  const uniqueCustomers = getMergedCustomers(products, orders, customers).length;

  const newOrderColor = newCount > 0 ? 'success' : '';
  const unpaidColor = unpaidCount > 0 ? 'warning' : '';

  const cards = [
    ['New Orders', newCount, newOrderColor],
    ['Unpaid Orders', unpaidCount, unpaidColor],
    ['Total Profit', '$'+totalProfit.toFixed(0), ''],
    ['Average Order', '$'+avgOrder.toFixed(2), ''],
    ['Average Margin', avgMargin.toFixed(0)+'%', ''],
    ['Total Orders', orders.length, ''],
    ['Unique Customers', uniqueCustomers, ''],
    ['Active Products', products.filter(p => p.active !== false).length, ''],
  ];

  const paymentStats = { venmo:0, cash:0 };
  paidOrders.forEach(o => { paymentStats[o.payment] = (paymentStats[o.payment]||0) + Number(o.total); });
  cards.push(['Total Revenue', '$'+totalRevenue.toFixed(0), '']);
  cards.push(['Venmo', '$'+(paymentStats.venmo||0).toFixed(0), '']);
  cards.push(['Cash', '$'+(paymentStats.cash||0).toFixed(0), '']);

  function borderClass(c) {
    return c==='success' ? 'border-success' : c==='warning' ? 'border-warning' : c==='danger' ? 'border-danger' : c==='secondary' ? 'border-secondary' : '';
  }

  container.innerHTML = `
    <div class="row row-cols-2 row-cols-md-4 g-3 mb-4">
      ${cards.map(([label,val,color]) => `
        <div class="col">
          <div class="card ${borderClass(color)} h-100 shadow-sm efb-bg-light" ${label==='New Orders' ? `role="button" style="cursor:pointer;" onclick="switchTab('production')"` : ''}>
            <div class="card-body">
              <div class="small text-muted text-uppercase">${label}</div>
              <div class="fs-4 fw-bold">${val}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    ${renderByProductTable()}
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
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => (o.items||[]).forEach(i => {
    if (stats[i.productId]) {
      const p = products.find(p=>p.id===i.productId);
      const price = i.price !== undefined ? i.price : (p ? p.price : 0);
      const cost = i.cost !== undefined ? i.cost : (p ? p.cost : 0);
      stats[i.productId].qty += i.qty;
      stats[i.productId].revenue += price*i.qty;
      stats[i.productId].cost += cost*i.qty;
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
  const cols = [['name','Product',''],['qty','Qty','end'],['revenue','Revenue','end'],['margin','Margin','end'],['profit','Profit','end']];
  const rows = rowsData.map(r => `<tr><td>${esc(r.name)}</td><td class="text-end">${r.qty}</td><td class="text-end">$${r.revenue.toFixed(2)}</td><td class="text-end">${r.margin.toFixed(0)}%</td><td class="text-end">$${r.profit.toFixed(2)}</td></tr>`).join('');
  return `<div class="table-responsive"><table class="table table-striped table-bordered mb-0"><thead><tr>${cols.map(([k,l,a])=>`<th class="text-${a||'start'}" style="cursor:pointer;" onclick="sortByProductBy('${k}')">${l}${arrow(k)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ══════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════
function setOrderFilter(f) { currentOrderFilter = f; renderOrdersList(); }

function renderOrdersTab() {
  document.getElementById('tab-orders').innerHTML = `
    <div class="btn-group mb-3" id="orderFilterTabs" role="group" aria-label="Filter orders">
      <button class="btn btn-outline-secondary" data-f="all" onclick="setOrderFilter('all')">All</button>
      <button class="btn btn-outline-secondary" data-f="unpaid" onclick="setOrderFilter('unpaid')">Unpaid</button>
    </div>
    <div id="ordersList"></div>
  `;
  renderOrdersList();
}

// getOrderNumberMap now lives in shared.js so index.js can use the same numbering

let orderSortCol = 'createdAt', orderSortDir = 'desc';
function sortOrdersBy(col) {
  if (orderSortCol===col) orderSortDir = orderSortDir==='asc'?'desc':'asc';
  else { orderSortCol=col; orderSortDir='asc'; }
  renderOrdersList();
}
function orderSortArrow(col) { return orderSortCol===col ? (orderSortDir==='asc'?' ▲':' ▼') : ''; }
function getOrderSortValue(o, col, numberMap) {
  switch(col) {
    case 'number': return numberMap.get(o.id);
    case 'customer': return ((o.lastName||'')+' '+(o.firstName||'')).toLowerCase();
    case 'type': return o.fulfillment||'';
    case 'payment': return o.payment||'';
    case 'date': return o.date||'';
    case 'paymentStatus': return o.paymentStatus||'';
    case 'fulfillmentStatus': return o.fulfillmentStatus||'';
    case 'total': return Number(o.total)||0;
    default: return o.createdAt||0;
  }
}

function renderOrdersList() {
  document.querySelectorAll('#orderFilterTabs button').forEach(b => b.classList.toggle('active', b.dataset.f===currentOrderFilter));
  let list = [...orders];
  if (currentOrderFilter==='new') list = list.filter(o=>o.fulfillmentStatus==='pending');
  if (currentOrderFilter==='delivered') list = list.filter(o=>o.fulfillmentStatus==='delivered'||o.fulfillmentStatus==='pickedup');
  if (currentOrderFilter==='unpaid') list = list.filter(o=>o.paymentStatus==='unpaid');

  const el = document.getElementById('ordersList');
  if (!list.length) { el.innerHTML = '<div class="text-center text-muted py-5">No orders here.</div>'; return; }
  const numberMap = getOrderNumberMap(orders);

  list.sort((a,b) => {
    const av = getOrderSortValue(a, orderSortCol, numberMap), bv = getOrderSortValue(b, orderSortCol, numberMap);
    return av<bv ? (orderSortDir==='asc'?-1:1) : av>bv ? (orderSortDir==='asc'?1:-1) : 0;
  });

  const cols = [['number','#'],['customer','Customer'],['type','Type'],['payment','Payment'],['date','Date'],['paymentStatus','Payment Status'],['fulfillmentStatus','Fulfillment'],['total','Total']];

  el.innerHTML = `<div class="table-responsive"><table class="table table-striped table-bordered align-middle bg-white">
    <thead><tr>${cols.map(([k,l]) => `<th class="${k==='total'?'text-end':''}" style="cursor:pointer;" onclick="sortOrdersBy('${k}')">${l}${orderSortArrow(k)}</th>`).join('')}<th></th></tr></thead>
    <tbody>
      ${list.map(o => {
        const itemStr = (o.items||[]).map(i => {
          const name = i.name || (products.find(p=>p.id===i.productId)||{}).name;
          const opts = (i.selectedOptions||[]).map(o=>o.name).join(', ');
          return name ? `${i.qty}× ${name}${opts ? ' ('+opts+')' : ''}` : '';
        }).filter(Boolean).join(', ');
        return `<tr title="${esc(itemStr)}">
          <td>#${String(numberMap.get(o.id)).padStart(3,'0')}</td>
          <td>${esc(o.firstName)} ${esc(o.lastName)}</td>
          <td><i class="bi ${o.fulfillment==='delivery' ? 'bi-truck' : 'bi-cart4'}" title="${cap(o.fulfillment)}"></i></td>
          <td>${cap(o.payment)}</td>
          <td>${o.date||'—'}</td>
          <td><select class="form-select form-select-sm" onchange="updatePaymentStatus('${o.id}', this.value)">
                <option value="unpaid" ${o.paymentStatus==='unpaid'?'selected':''}>Unpaid</option>
                <option value="paid" ${o.paymentStatus==='paid'?'selected':''}>Paid</option>
              </select></td>
          <td><select class="form-select form-select-sm" onchange="updateFulfillmentStatus('${o.id}', this.value)">
                <option value="pending" ${o.fulfillmentStatus==='pending'?'selected':''}>Pending</option>
                <option value="ready" ${o.fulfillmentStatus==='ready'?'selected':''}>Ready</option>
                <option value="delivered" ${o.fulfillmentStatus==='delivered'?'selected':''}>Delivered</option>
                <option value="pickedup" ${o.fulfillmentStatus==='pickedup'?'selected':''}>Picked Up</option>
              </select></td>
          <td class="text-end">$${Number(o.total).toFixed(2)}</td>
          <td class="text-end"><button class="btn btn-outline-secondary btn-sm me-2 mb-2" onclick="openOrderModal('${o.id}')">Edit</button><button class="btn btn-outline-danger btn-sm mb-2" onclick="deleteOrder('${o.id}')">Delete</button></td>
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
    await apiWrite('orders','delete',id,null);
    orders = orders.filter(o=>o.id!==id);
    renderOrdersTab();
    showToast('Order deleted.');
  });
}

// ══════════════════════════════════════════
// ORDER MODAL
// ══════════════════════════════════════════
function setOrderModalReadOnly(readOnly) {
  applyOmReadOnlyStyling([...OM_CUSTOMER_FIELD_IDS, 'om-street','om-city','om-state','om-zip','om-date','om-notes','om-payment','om-fulfillment'], readOnly);
  document.querySelectorAll('#om-products input, #om-products button').forEach(el => { el.disabled = readOnly; });
  document.querySelectorAll('#om-disc-none, #om-disc-social, #om-disc-family').forEach(el => {
    el.style.pointerEvents = readOnly ? 'none' : '';
    el.style.opacity = readOnly ? '0.6' : '';
  });
}

function resetOmModeUI() {
  omCustomerMode = 'new';
  document.getElementById('om-customer-mode').value = 'new';
  document.getElementById('omExistingSelectField').classList.add('d-none');
  setOmFieldsReadOnly(false);
}
const OM_CUSTOMER_FIELD_IDS = ['om-first','om-last','om-phone'];
function applyOmReadOnlyStyling(ids, readOnly) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = readOnly;
    el.style.backgroundColor = readOnly ? '#f8f9fa' : '';
    el.style.border = readOnly ? '1px solid #ced4da' : '';
    el.style.color = readOnly ? '#495057' : '';
    el.style.webkitAppearance = readOnly ? 'none' : '';
    el.style.appearance = readOnly ? 'none' : '';
    el.style.borderRadius = readOnly ? '0.375rem' : '';
    const wrapper = el.closest('.form-floating');
    if (wrapper) wrapper.classList.toggle('efb-locked-field', readOnly);
  });
}
function setOmFieldsReadOnly(readOnly) {
  applyOmReadOnlyStyling(OM_CUSTOMER_FIELD_IDS, readOnly);
}

function clearOmCustomerFields() {
  document.getElementById('om-first').value='';
  document.getElementById('om-last').value='';
  document.getElementById('om-phone').value='';
  ['om-street','om-city','om-state','om-zip'].forEach(id => document.getElementById(id).value='');
  document.getElementById('om-fulfillment').value = 'pickup';
  document.getElementById('om-addressField').classList.add('d-none');
}

function setOmCustomerMode(mode) {
  omCustomerMode = mode;
  document.getElementById('omExistingSelectField').classList.toggle('d-none', mode!=='existing');
  clearOmCustomerFields();
  if (mode === 'existing') {
    document.getElementById('om-existing-select').value = '';
    populateOmExistingSelect();
    setOmFieldsReadOnly(true);
  } else {
    setOmFieldsReadOnly(false);
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
    const parts = (c.street || c.city || c.state || c.zip) ? c : parseAddress(c.address);
    document.getElementById('om-street').value = parts.street || '';
    document.getElementById('om-city').value = parts.city || '';
    document.getElementById('om-state').value = parts.state || '';
    document.getElementById('om-zip').value = parts.zip || '';
    document.getElementById('om-fulfillment').value = 'delivery';
    document.getElementById('om-addressField').classList.remove('d-none');
  }
  setOmFieldsReadOnly(true);
}

function setOmDiscount(pct) {
  omDiscountPctSelected = parseFloat(pct) || 0;
  updateOMTotal();
}
function omDiscountPct() { return omDiscountPctSelected; }

function populateOmDiscountSelect(selectedPct) {
  const select = document.getElementById('om-discount-select');
  const codes = settings.discountCodes || [];
  select.innerHTML = '<option value="0">No Discount</option>' +
    codes.map(d => `<option value="${d.discountPct}">${esc(d.code)} — ${d.discountPct}% off</option>`).join('');
  // If the order's existing discount doesn't match any current code (e.g. an old order,
  // or a code that's since been removed from Settings), add it as its own option so the
  // real value is never silently lost or misrepresented when editing.
  if (selectedPct && !codes.some(d => Number(d.discountPct) === Number(selectedPct))) {
    select.innerHTML += `<option value="${selectedPct}">${selectedPct}% off</option>`;
  }
  select.value = String(selectedPct || 0);
  omDiscountPctSelected = selectedPct || 0;
}

function openOrderModal(id) {
  editingOrderId = id || null;
  const order = id ? orders.find(o=>o.id===id) : null;
  omQty = {};
  omOptions = {};
  products.forEach(p => {
    const existingItem = order ? (order.items||[]).find(i=>i.productId===p.id) : null;
    omQty[p.id] = existingItem ? (existingItem.qty || 0) : 0;
    omOptions[p.id] = {};
    if (existingItem && existingItem.selectedOptions) {
      existingItem.selectedOptions.forEach(o => omOptions[p.id][o.name] = o.price);
    }
  });
  const fulfillment = order ? order.fulfillment : 'pickup';

  document.getElementById('orderModalTitle').textContent = order ? 'Edit Order' : 'Add Order';
  document.getElementById('om-first').value = order ? order.firstName : '';
  document.getElementById('om-last').value = order ? order.lastName : '';
  document.getElementById('om-phone').value = order ? order.phone : '';
  const cleanDate = order && order.date ? (String(order.date).match(/\d{4}-\d{2}-\d{2}/) || [''])[0] : '';
  document.getElementById('om-date').value = cleanDate;
  document.getElementById('om-date').classList.toggle('has-value', !!cleanDate);
  document.getElementById('om-fulfillment').value = fulfillment;
  document.getElementById('om-payment').value = order ? order.payment : 'venmo';
  if (order) {
    const parsed = parseAddress(order.deliveryAddress || order.address || '');
    document.getElementById('om-street').value = parsed.street || '';
    document.getElementById('om-city').value = parsed.city || '';
    document.getElementById('om-state').value = parsed.state || '';
    document.getElementById('om-zip').value = parsed.zip || '';
  } else {
    ['om-street','om-city','om-state','om-zip'].forEach(id => document.getElementById(id).value='');
  }
  document.getElementById('om-paymentStatus').value = order ? order.paymentStatus : 'unpaid';
  document.getElementById('om-fulfillmentStatus').value = order ? order.fulfillmentStatus : 'pending';
  document.getElementById('om-notes').value = order ? order.notes : '';
  document.getElementById('om-addressField').classList.toggle('d-none', fulfillment !== 'delivery');
  document.getElementById('omCustomerTypeField').classList.toggle('d-none', !!order);
  const existingDiscountPct = order ? (order.discountPct !== undefined ? Number(order.discountPct) : (order.discountSocial ? 50 : (order.discountFamily ? 25 : 0))) : 0;
  populateOmDiscountSelect(existingDiscountPct);
  resetOmModeUI();

  const isCompleted = order && (order.fulfillmentStatus === 'delivered' || order.fulfillmentStatus === 'pickedup');
  setOrderModalReadOnly(isCompleted);
  // Customer contact info (name/phone/address) stays locked on ANY existing order, completed or not —
  // fix a customer's real info via the Customers table instead, so it stays correct everywhere.
  applyOmReadOnlyStyling([...OM_CUSTOMER_FIELD_IDS, 'om-street','om-city','om-state','om-zip'], !!order);
  document.getElementById('om-locked-banner').classList.toggle('d-none', !isCompleted);
  const orphanedOrderItems = order ? (order.items||[]).filter(i => !products.find(p=>p.id===i.productId)) : [];
  const orphanedHtml = orphanedOrderItems.map(i => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div><div class="fw-bold">${esc(i.name || 'Deleted item')}</div><div class="small text-muted">$${Number(i.price||0).toFixed(2)} — no longer in your product list</div></div>
      <div class="fw-bold text-end" style="width:130px;">${i.qty}</div>
    </li>
  `).join('');
  document.getElementById('om-products').innerHTML = `<ul class="list-group">` + orphanedHtml + products.map(p => {
    const existingItem = order ? (order.items||[]).find(i=>i.productId===p.id) : null;
    const displayPrice = (existingItem && existingItem.price !== undefined) ? existingItem.price : p.price;
    const qty = omQty[p.id] || 0;
    const options = getProductOptions(p);
    const optionsHtml = options.map(opt => `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="om-opt-${p.id}-${esc(opt.name)}" ${omOptions[p.id] && omOptions[p.id][opt.name] !== undefined ? 'checked' : ''}
          onchange="toggleOmOption('${p.id}', '${esc(opt.name)}', ${opt.price}, this.checked)" ${isCompleted ? 'disabled' : ''}>
        <label class="form-check-label small" for="om-opt-${p.id}-${esc(opt.name)}">${esc(opt.name)} (+$${Number(opt.price).toFixed(2)} ea)</label>
      </div>
    `).join('');
    const optionsWrapHtml = options.length ? `<div id="om-opts-wrap-${p.id}" class="${qty ? '' : 'd-none'} mt-1">${optionsHtml}</div>` : '';
    const qtyControl = isCompleted
      ? `<div class="fw-bold text-end" style="width:130px;">${qty}</div>`
      : `<div class="input-group" style="width:130px;">
          <button class="btn btn-outline-secondary" type="button" style="border-color:#ced4da;" onclick="adjustOmQty('${p.id}',-1)"><i class="bi bi-dash-lg"></i></button>
          <input type="number" min="0" class="form-control text-center px-0" id="om-qty-${p.id}" value="${qty}"
            oninput="omQty['${p.id}']=parseInt(this.value)||0; updateOmOptionsVisibility('${p.id}'); updateOMTotal(); updateOmSaveState();"/>
          <button class="btn btn-outline-secondary" type="button" style="border-color:#ced4da;" onclick="adjustOmQty('${p.id}',1)"><i class="bi bi-plus-lg"></i></button>
        </div>`;
    return `<li class="list-group-item">
      <div class="d-flex justify-content-between align-items-center">
        <div><div class="fw-bold">${esc(p.name)}</div><div class="small text-muted">$${Number(displayPrice).toFixed(2)} ${esc(p.unit||'')}</div></div>
        ${qtyControl}
      </div>
      ${optionsWrapHtml}
    </li>`;
  }).join('') + `</ul>`;

  updateOMTotal();
  updateOmSaveState();
  orderModal.show();
}

function adjustOmQty(productId, delta) {
  omQty[productId] = Math.max(0, (omQty[productId]||0) + delta);
  document.getElementById('om-qty-'+productId).value = omQty[productId];
  updateOmOptionsVisibility(productId);
  updateOMTotal();
  updateOmSaveState();
}

function updateOmOptionsVisibility(productId) {
  const wrap = document.getElementById('om-opts-wrap-'+productId);
  if (!wrap) return;
  const hasQty = (omQty[productId]||0) > 0;
  wrap.classList.toggle('d-none', !hasQty);
  if (!hasQty) {
    omOptions[productId] = {};
    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
}

function toggleOmOption(productId, optionName, optionPrice, checked) {
  if (!omOptions[productId]) omOptions[productId] = {};
  if (checked) omOptions[productId][optionName] = optionPrice;
  else delete omOptions[productId][optionName];
  updateOMTotal();
}

function getOmSelectedOptionsFor(productId) {
  const opts = omOptions[productId] || {};
  return Object.keys(opts).map(name => ({ name, price: opts[name] }));
}

function updateOmSaveState() {
  const saveBtn = document.getElementById('om-save-btn');
  if (!saveBtn) return;
  const first = document.getElementById('om-first').value.trim();
  const last = document.getElementById('om-last').value.trim();
  const phone = document.getElementById('om-phone').value.trim();
  const hasItems = products.some(p => (omQty[p.id]||0) > 0);
  const fulfillment = document.getElementById('om-fulfillment').value;
  let addressOk = true;
  if (fulfillment === 'delivery') {
    addressOk = document.getElementById('om-street').value.trim() && document.getElementById('om-city').value.trim()
      && document.getElementById('om-state').value.trim() && document.getElementById('om-zip').value.trim();
  }
  const missing = !first || !last || !phone || !hasItems || !addressOk;
  saveBtn.disabled = missing;
  saveBtn.title = missing ? 'Please fill in every required field and add at least one item before saving.' : '';
}

function updateOMTotal() {
  let subtotal = 0;
  products.forEach(p => {
    const qty = omQty[p.id]||0;
    const optionsUnitPrice = getOmSelectedOptionsFor(p.id).reduce((s,o) => s + o.price, 0);
    subtotal += qty * (p.price + optionsUnitPrice);
  });
  const pct = omDiscountPct();
  const discountAmt = subtotal * (pct/100);
  document.getElementById('om-subtotal').textContent = '$'+subtotal.toFixed(2);
  document.getElementById('om-discountRow').classList.toggle('d-none', pct===0);
  document.getElementById('om-discountLabel').textContent = pct+'% Discount';
  document.getElementById('om-discountAmt').textContent = '-$'+discountAmt.toFixed(2);
  document.getElementById('om-total').textContent = '$'+(subtotal-discountAmt).toFixed(2);
}

async function saveOrderFromModal() {
  const first = document.getElementById('om-first').value.trim();
  const last = document.getElementById('om-last').value.trim();
  const phone = document.getElementById('om-phone').value.trim();
  const currentItems = products.filter(p => (omQty[p.id]||0) > 0).map(p => ({ productId:p.id, qty:omQty[p.id], selectedOptions: getOmSelectedOptionsFor(p.id) }));
  // If this order has an existing line item for a product that's since been deleted from the
  // catalog, carry it forward unchanged rather than silently dropping it on save.
  const existingOrderForSave = editingOrderId ? orders.find(o=>o.id===editingOrderId) : null;
  const orphanedItems = existingOrderForSave ? (existingOrderForSave.items||[]).filter(i => !products.find(p=>p.id===i.productId)) : [];
  const items = [...currentItems, ...orphanedItems];
  const fulfillment = document.getElementById('om-fulfillment').value;

  const { orderData, error } = buildOrderData({
    first, last, phone, items, fulfillment,
    street: document.getElementById('om-street').value.trim(),
    city: document.getElementById('om-city').value.trim(),
    state: document.getElementById('om-state').value.trim(),
    zip: document.getElementById('om-zip').value.trim(),
    date: document.getElementById('om-date').value,
    notes: document.getElementById('om-notes').value.trim(),
    payment: document.getElementById('om-payment').value,
    paymentStatus: document.getElementById('om-paymentStatus').value,
    fulfillmentStatus: document.getElementById('om-fulfillmentStatus').value,
    discountPct: omDiscountPct(),
    products
  });
  if (error) { alert(error); return; }

  const saveBtn = document.getElementById('om-save-btn');
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';

  try {
    if (editingOrderId) {
      await apiWrite('orders','update',editingOrderId,orderData);
      const idx = orders.findIndex(o=>o.id===editingOrderId);
      orders[idx] = { ...orders[idx], ...orderData };
    } else {
      const newOrder = { id:'o'+Date.now(), createdAt:Date.now(), source:'admin-manual', ...orderData };
      await persistNewOrder(newOrder, customers);
      orders.push(newOrder);
    }
    orderModal.hide();
    renderOrdersTab();
    showToast('Order saved.');
  } catch (err) {
    alert('Save failed: ' + err.message + '\n\nYour changes were NOT saved. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
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

let selectedCustomerKeys = new Set();

function toggleCustomerSelect(key) {
  if (selectedCustomerKeys.has(key)) selectedCustomerKeys.delete(key);
  else selectedCustomerKeys.add(key);
  updateMergeBar();
}
function clearCustomerSelection() {
  selectedCustomerKeys.clear();
  document.querySelectorAll('#tab-customers input[type=checkbox]').forEach(cb => cb.checked = false);
  updateMergeBar();
}
function updateMergeBar() {
  const bar = document.getElementById('mergeBar');
  const count = selectedCustomerKeys.size;
  document.getElementById('mergeBarCount').textContent = count;
  bar.classList.toggle('d-none', count < 2);
}

function renderCustomersTab() {
  let list = getMergedCustomers(products, orders, customers);
  list.forEach(c => c._key = custKey(c));
  list.sort((a,b) => {
    let av=a[customerSortCol], bv=b[customerSortCol];
    if (typeof av==='string') { av=av.toLowerCase(); bv=(bv||'').toLowerCase(); }
    return av<bv ? (customerSortDir==='asc'?-1:1) : av>bv ? (customerSortDir==='asc'?1:-1) : 0;
  });
  const cols = [['lastName','Last Name',''],['firstName','First Name',''],['phone','Phone',''],['email','Email',''],['address','Address',''],['orderCount','Orders','end'],['totalSpent','Total Spent','end']];

  document.getElementById('tab-customers').innerHTML = `
    <label class="btn btn-outline-secondary d-inline-flex align-items-center gap-2 mb-3" for="mergeModeToggle">
      Merge
      <div class="form-check form-switch mb-0">
        <input class="form-check-input switch-grey" type="checkbox" id="mergeModeToggle" ${mergeModeOn?'checked':''} onchange="setMergeMode(this.checked)" style="cursor:pointer;">
      </div>
    </label>
    <div class="table-responsive"><table class="table table-striped table-bordered bg-white">
      <thead><tr>${mergeModeOn ? '<th></th>' : ''}${cols.map(([k,l,a])=>`<th class="text-${a||'start'}" style="cursor:pointer;" onclick="sortCustomersBy('${k}')">${l}${sortArrow(k)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${list.map(c => `<tr>
        ${mergeModeOn ? `<td><input type="checkbox" ${selectedCustomerKeys.has(c._key)?'checked':''} onchange="toggleCustomerSelect('${c._key}')"></td>` : ''}
        <td>${esc(c.lastName)}</td><td>${esc(c.firstName)}</td><td>${c.phone ? esc(c.phone) : '<span class="badge rounded-pill bg-warning text-dark">No Phone</span>'}</td><td>${esc(c.email||'—')}</td><td>${esc(c.address||'—')}</td>
        <td class="text-end">${c.orderCount}</td><td class="text-end">$${c.totalSpent.toFixed(2)}</td>
        <td class="text-end"><button class="btn btn-outline-secondary btn-sm me-2 mb-2" onclick='openCustomerModal(${JSON.stringify(c).replace(/'/g,"&apos;")})'>Edit</button><button class="btn btn-outline-danger btn-sm mb-2" ${c.recordId ? `onclick="deleteCustomerRow('${c.recordId}')"` : 'disabled title="This customer only exists from order history — nothing to delete unless you edit and save them first."'}>Delete</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${list.length===0 ? '<div class="text-center text-muted py-5">No customers yet</div>' : ''}
  `;
  updateMergeBar();
}

function openMergeModal() {
  const list = getMergedCustomers(products, orders, customers);
  list.forEach(c => c._key = custKey(c));
  const selected = list.filter(c => selectedCustomerKeys.has(c._key));
  if (selected.length < 2) return;

  document.getElementById('mergeModalOptions').innerHTML = selected.map((c,i) => `
    <div class="form-check mb-2">
      <input class="form-check-input" type="radio" name="mergeCanonical" id="mergeCanon${i}" value="${esc(c._key)}" ${i===0?'checked':''}>
      <label class="form-check-label" for="mergeCanon${i}">${esc(c.firstName)} ${esc(c.lastName)} — ${esc(c.phone||'no phone on file')} — ${c.orderCount} order(s)</label>
    </div>
  `).join('');
  mergeModal.show();
}

let mergeInProgress = false;

async function performMerge() {
  if (mergeInProgress) return; // guard against double-click starting a second overlapping merge
  const checkedEl = document.querySelector('input[name="mergeCanonical"]:checked');
  if (!checkedEl) return;
  const canonicalKey = checkedEl.value;
  const list = getMergedCustomers(products, orders, customers);
  list.forEach(c => c._key = custKey(c));
  const canonical = list.find(c => c._key === canonicalKey);
  const otherKeys = [...selectedCustomerKeys].filter(k => k !== canonicalKey);
  if (!canonical || !otherKeys.length) return;

  mergeInProgress = true;
  const mergeBtn = document.querySelector('#mergeModal .modal-footer .btn-dark');
  const originalBtnText = mergeBtn.textContent;
  mergeBtn.disabled = true;
  mergeBtn.textContent = 'Merging...';

  const updates = { firstName: canonical.firstName, lastName: canonical.lastName, phone: canonical.phone };

  try {
    const writePromises = [];
    for (const o of orders) {
      const k = custKey({firstName:o.firstName, lastName:o.lastName, phone:o.phone});
      if (otherKeys.includes(k)) {
        o.firstName = updates.firstName;
        o.lastName = updates.lastName;
        o.phone = updates.phone;
        writePromises.push(apiWrite('orders','update',o.id,updates));
      }
    }
    await Promise.all(writePromises);

    const deletePromises = [];
    for (const key of otherKeys) {
      const rec = list.find(c => c._key === key);
      if (rec && rec.recordId) {
        customers = customers.filter(c => c.id !== rec.recordId);
        deletePromises.push(apiWrite('customers','delete',rec.recordId,null));
      }
    }
    await Promise.all(deletePromises);

    // Re-fetch from the actual Sheet rather than trust local state, so the UI reflects true server data
    const fresh = await apiGetAll();
    products = fresh.products || [];
    orders = fresh.orders || [];
    customers = fresh.customers || [];
  } catch (err) {
    alert('Something went wrong during the merge: ' + err.message + '\n\nPlease refresh the page and check whether it completed before trying again.');
  } finally {
    mergeBtn.disabled = false;
    mergeBtn.textContent = originalBtnText;
    mergeInProgress = false;
  }

  selectedCustomerKeys.clear();
  mergeModal.hide();
  renderCustomersTab();
}

function updateCmSaveState() {
  const saveBtn = document.getElementById('cm-save-btn');
  if (!saveBtn) return;
  saveBtn.disabled = !document.getElementById('cm-first').value.trim();
}

function openCustomerModal(existing) {
  editingCustomerRecordId = existing ? existing.recordId : null;
  document.getElementById('customerModalTitle').textContent = existing ? 'Edit Customer' : 'Add Customer';
  document.getElementById('cm-first').value = existing ? existing.firstName : '';
  document.getElementById('cm-last').value = existing ? existing.lastName : '';
  document.getElementById('cm-phone').value = existing ? existing.phone : '';
  document.getElementById('cm-email').value = existing ? (existing.email||'') : '';
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
  updateCmSaveState();
  customerModal.show();
}

function deleteCustomerRow(id) {
  const rec = customers.find(c => c.id === id);
  if (!rec) return;
  const fullName = `${rec.firstName} ${rec.lastName}`.trim();
  openConfirm(`Delete this customer record for "${fullName}"? This won't affect any past orders — it only removes the standalone contact card.`, async () => {
    await apiWrite('customers','delete',id,null);
    customers = customers.filter(c => c.id !== id);
    renderCustomersTab();
    showToast('Customer record deleted.');
  });
}

async function saveCustomerFromModal() {
  const first = document.getElementById('cm-first').value.trim();
  const last = document.getElementById('cm-last').value.trim();
  if (!first) { alert('Please enter a first name.'); return; }
  const data = {
    firstName:first, lastName:last,
    phone: document.getElementById('cm-phone').value.trim(),
    email: document.getElementById('cm-email').value.trim(),
    street: document.getElementById('cm-street').value.trim(),
    city: document.getElementById('cm-city').value.trim(),
    state: document.getElementById('cm-state').value.trim(),
    zip: document.getElementById('cm-zip').value.trim()
  };

  const saveBtn = document.getElementById('cm-save-btn');
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';

  if (editingCustomerRecordId) {
    const rec = customers.find(c=>c.id===editingCustomerRecordId);
    Object.assign(rec, data);
    try {
      await apiWrite('customers','update',editingCustomerRecordId,data);
      customerModal.hide();
      renderCustomersTab();
      showToast('Customer saved.');
    } catch (err) {
      alert('Save failed: ' + err.message + '\n\nYour changes were NOT saved. Please try again.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  } else {
    const key = custKey(data);
    const existingRec = customers.find(c => custKey(c)===key);
    if (existingRec) {
      Object.assign(existingRec, data);
      try {
        await apiWrite('customers','update',existingRec.id,data);
        customerModal.hide();
        renderCustomersTab();
        showToast('Customer saved.');
      } catch (err) {
        alert('Save failed: ' + err.message + '\n\nYour changes were NOT saved. Please try again.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    } else {
      const newCust = { id:'c'+Date.now(), ...data };
      customers.push(newCust);
      try {
        await apiWrite('customers','add',null,newCust);
        customerModal.hide();
        renderCustomersTab();
        showToast('Customer saved.');
      } catch (err) {
        customers = customers.filter(c => c.id !== newCust.id); // roll back local state since it never actually saved
        alert('Save failed: ' + err.message + '\n\nYour changes were NOT saved. Please try again.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  }
}

// ══════════════════════════════════════════
// PRODUCTION — mark individual items made, per order, live-decrementing totals
// ══════════════════════════════════════════
const madeItemsWriteTimers = {};

function toggleUnit(orderId, productId, unitIdx) {
  const o = orders.find(o=>o.id===orderId); if (!o) return;
  o.madeItems = o.madeItems || {};
  o.madeItems[productId] = o.madeItems[productId] || [];
  o.madeItems[productId][unitIdx] = !o.madeItems[productId][unitIdx];
  renderProductionTab();

  // Debounce the save per order — rapid clicks collapse into a single request with the
  // final state, instead of firing overlapping requests that can arrive out of order
  // and silently overwrite a later click with an earlier, incomplete one.
  clearTimeout(madeItemsWriteTimers[orderId]);
  madeItemsWriteTimers[orderId] = setTimeout(async () => {
    await apiWrite('orders','update',orderId,{madeItems: o.madeItems});
    delete madeItemsWriteTimers[orderId];
  }, 500);
}

function unitsDoneCount(o, productId) {
  return ((o.madeItems && o.madeItems[productId]) || []).filter(Boolean).length;
}

function allItemsMade(o) {
  return (o.items||[]).every(i => unitsDoneCount(o, i.productId) >= i.qty);
}

async function markOrderReady(id) {
  const o = orders.find(o=>o.id===id); if (!o) return;
  o.fulfillmentStatus = 'ready';
  renderProductionTab();
  showToast('Success! Moved to Fulfillment.');
  await apiWrite('orders','update',id,{fulfillmentStatus:'ready'});
}

let productionDateFilter = null; // null = not yet set; defaults to the soonest upcoming date on first render

function formatProductionDateLabel(dateStr) {
  if (!dateStr) return 'No Date';
  const [y,m,d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m-1, d);
  return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function setProductionDateFilter(date) {
  productionDateFilter = date;
  renderProductionTab();
}

function renderProductionTab() {
  const container = document.getElementById('tab-production');
  const allActive = orders.filter(o => o.fulfillmentStatus === 'pending');

  if (!allActive.length) { container.innerHTML = '<div class="text-center"><div class="alert alert-info d-inline-block" role="alert">Nothing waiting to be made — all caught up!</div></div>'; productionDateFilter = null; return; }

  // Every distinct pickup/delivery date among pending orders, soonest first. Orders with no
  // date set get grouped under their own bucket at the end rather than silently hidden.
  const distinctDates = [...new Set(allActive.map(o => o.date || ''))].sort((a,b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });

  if (productionDateFilter === null || (productionDateFilter !== 'all' && !distinctDates.includes(productionDateFilter))) {
    productionDateFilter = distinctDates.find(d => d) || distinctDates[0];
  }

  const active = productionDateFilter === 'all' ? allActive : allActive.filter(o => (o.date || '') === productionDateFilter);

  const filterBarHtml = distinctDates.length < 2 ? '' : `
    <div class="btn-group mb-3" id="productionFilterTabs" role="group" aria-label="Filter by date">
      ${distinctDates.map(d => `<button class="btn btn-outline-secondary ${productionDateFilter === d ? 'active' : ''}" onclick="setProductionDateFilter('${d}')">${esc(formatProductionDateLabel(d))}</button>`).join('')}
      <button class="btn btn-outline-secondary ${productionDateFilter === 'all' ? 'active' : ''}" onclick="setProductionDateFilter('all')">All</button>
    </div>
  `;

  if (!active.length) { container.innerHTML = filterBarHtml + '<div class="text-center"><div class="alert alert-info d-inline-block" role="alert">Nothing to prep for this date.</div></div>'; return; }

  // Bake totals — cards stay visible even at 0 remaining, showing a green checkmark instead
  const totals = {};
  const nameById = {};
  active.forEach(o => (o.items||[]).forEach(i => {
    const remaining = Math.max(0, i.qty - unitsDoneCount(o, i.productId));
    totals[i.productId] = (totals[i.productId]||0) + remaining;
    if (!nameById[i.productId]) {
      const p = products.find(p=>p.id===i.productId);
      nameById[i.productId] = i.name || (p && p.name) || 'Unknown item';
    }
  }));
  const bakeProducts = Object.keys(totals).map(id => ({ id, name: nameById[id] }));

  const pickups = active.filter(o => o.fulfillment === 'pickup');
  const deliveries = active.filter(o => o.fulfillment === 'delivery');

  function orderCard(o) {
    const itemListItems = (o.items||[]).map(i => {
      const p = products.find(p=>p.id===i.productId);
      const name = i.name || (p && p.name);
      if (!name) return '';
      const opts = (i.selectedOptions||[]).map(o=>o.name).join(', ');
      const displayName = opts ? `${name} (${opts})` : name;
      const doneArr = (o.madeItems && o.madeItems[i.productId]) || [];
      return Array.from({length: i.qty}).map((_, idx) => {
        const done = !!doneArr[idx];
        return `<li class="list-group-item d-flex justify-content-between align-items-center" style="cursor:pointer;" onclick="toggleUnit('${o.id}','${i.productId}',${idx})">
          <span class="${done ? 'text-success' : ''}">${esc(displayName)}</span>
          <div class="form-check form-switch mb-0">
            <input class="form-check-input switch-green" type="checkbox" ${done?'checked':''} style="pointer-events:none;" tabindex="-1">
          </div>
        </li>`;
      }).join('');
    }).filter(Boolean).join('');
    const ready = allItemsMade(o);
    return `<div class="col">
      <div class="card h-100 efb-bg-light">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start">
            <div class="fs-5 fw-bold">${esc(o.firstName)} ${esc(o.lastName)}</div>
            <a href="#" class="text-secondary fs-4" onclick="openCustomerDetail('${o.id}'); return false;" title="Customer details"><i class="bi bi-person-vcard"></i></a>
          </div>
          ${o.notes ? `<div class="small text-muted fst-italic mt-3 mb-2">${esc(o.notes)}</div>` : ''}
          <ul class="list-group mt-3 mb-3">${itemListItems}</ul>
          <div class="mt-auto">
            ${ready ? `<button class="btn btn-primary" onclick="markOrderReady('${o.id}')">Mark as Ready</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = filterBarHtml + `
    <h4 class="text-muted mb-3">Prep</h4>
    <div class="card mb-4 shadow-sm"><div class="card-body"><div class="row row-cols-2 row-cols-md-3 g-3">
      ${bakeProducts.map(p => {
        const done = totals[p.id] === 0;
        return `
        <div class="col"><div class="card h-100 efb-bg-light ${done ? 'border-success' : ''}"><div class="card-body">
          <div class="fs-5 fw-bold">${esc(p.name)}</div>
          <div class="display-5 fw-bold ${done ? 'text-success' : ''}">${done ? '✓' : totals[p.id]}</div>
        </div></div></div>
      `;}).join('')}
    </div></div></div>

    <h4 class="text-muted d-flex align-items-center gap-2 mb-3 mt-3">Pickup <span class="badge rounded-pill text-bg-secondary" style="font-size:0.75rem;">${pickups.length}</span></h4>
    ${pickups.length ? `<div class="card mb-3 shadow-sm"><div class="card-body"><div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${pickups.map(o => orderCard(o)).join('')}</div></div></div>` : ''}

    <h4 class="text-muted d-flex align-items-center gap-2 mb-3 mt-3">Delivery <span class="badge rounded-pill text-bg-secondary" style="font-size:0.75rem;">${deliveries.length}</span></h4>
    ${deliveries.length ? `<div class="card mb-3 shadow-sm"><div class="card-body"><div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${deliveries.map(o => orderCard(o)).join('')}</div></div></div>` : ''}
  `;
}

// ══════════════════════════════════════════
// FULFILLMENT — final handoff step for orders already marked Ready
// ══════════════════════════════════════════
function showToast(message, bgClass) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast align-items-center text-white ${bgClass || 'bg-success'} border-0`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  toast.show();
}

async function completeOrder(id) {
  const o = orders.find(o=>o.id===id); if (!o) return;
  const finalStatus = o.fulfillment === 'delivery' ? 'delivered' : 'pickedup';
  o.fulfillmentStatus = finalStatus;
  renderFulfillmentTab();
  showToast(`Success! Moved to Orders.`);
  await apiWrite('orders','update',id,{fulfillmentStatus: finalStatus});
}
async function moveBackToProduction(id) {
  const o = orders.find(o=>o.id===id); if (!o) return;
  o.fulfillmentStatus = 'pending';
  renderFulfillmentTab();
  showToast('Order sent back to Production!', 'bg-secondary');
  await apiWrite('orders','update',id,{fulfillmentStatus:'pending'});
}

function renderFulfillmentTab() {
  const container = document.getElementById('tab-fulfillment');
  const ready = orders.filter(o => o.fulfillmentStatus === 'ready');

  if (!ready.length) { container.innerHTML = '<div class="text-center"><div class="alert alert-info d-inline-block" role="alert">No orders ready for pickup or delivery</div></div>'; return; }

  const pickups = ready.filter(o => o.fulfillment === 'pickup');
  const deliveries = ready.filter(o => o.fulfillment === 'delivery');
  if (!routeOrder.length || routeOrder.length !== deliveries.length || !deliveries.every(o=>routeOrder.includes(o.id))) {
    routeOrder = deliveries.map(o=>o.id);
  }
  const orderedDeliveries = routeOrder.map(id => deliveries.find(o=>o.id===id)).filter(Boolean);

  function orderRow(o, idx, total) {
    const itemListItems = (o.items||[]).map(i=>{
      const p = products.find(p=>p.id===i.productId);
      const name = i.name || (p && p.name);
      return name ? `<li class="list-group-item d-flex justify-content-between align-items-center">${esc(name)}<span class="badge rounded-pill text-bg-secondary">${i.qty}</span></li>` : '';
    }).filter(Boolean).join('');
    const label = o.fulfillment === 'delivery' ? 'Mark as Delivered' : 'Mark as Picked Up';
    const addr = o.fulfillment==='delivery' ? parseAddress(o.deliveryAddress||o.address||'') : null;
    return `<div class="col">
      <div class="card h-100 efb-bg-light">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start">
            <div class="fs-5 fw-bold">${esc(o.firstName)} ${esc(o.lastName)}</div>
            <a href="#" class="text-secondary fs-4" onclick="moveBackToProduction('${o.id}'); return false;" title="Send back to Production"><i class="bi bi-reply"></i></a>
          </div>
          <div class="mt-3 mb-3">
            <div class="mb-2">${esc(o.phone||'')}</div>
            ${addr ? `<div class="mb-2"><a href="https://maps.apple.com/?daddr=${encodeURIComponent(addr.street + ', ' + addr.city + ', ' + addr.state + ' ' + addr.zip)}" class="mobile-map-link">${esc(addr.street)}<br>${esc([addr.city, [addr.state, addr.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</a></div>` : ''}
            ${o.notes ? `<div class="small text-muted fst-italic mb-2">${esc(o.notes)}</div>` : ''}
          </div>
          <ul class="list-group mb-3">${itemListItems}</ul>
          <div class="mt-auto">
            <button class="btn btn-primary text-nowrap" onclick="completeOrder('${o.id}')">${label}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = `
    <h4 class="text-muted d-flex align-items-center gap-2 mb-3">Pickup <span class="badge rounded-pill text-bg-secondary" style="font-size:0.75rem;">${pickups.length}</span></h4>
    ${pickups.length ? `<div class="card mb-4 shadow-sm"><div class="card-body"><div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${pickups.map(o => orderRow(o)).join('')}</div></div></div>` : ''}

    <h4 class="text-muted d-flex align-items-center gap-2 mb-3 mt-3">Delivery <span class="badge rounded-pill text-bg-secondary" style="font-size:0.75rem;">${orderedDeliveries.length}</span></h4>
    ${orderedDeliveries.length ? `
      <div class="card mb-3 shadow-sm"><div class="card-body"><div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${orderedDeliveries.map((o,idx) => orderRow(o, idx, orderedDeliveries.length)).join('')}</div></div></div>
      <button class="btn btn-dark mt-2 mb-4" onclick="openRouteMap()">Open Route in Google Maps</button>
    ` : ''}
  `;
}

function moveRoute(idx, dir) {
  const newIdx = idx+dir; if (newIdx<0 || newIdx>=routeOrder.length) return;
  [routeOrder[idx], routeOrder[newIdx]] = [routeOrder[newIdx], routeOrder[idx]];
  renderFulfillmentTab();
}
function openRouteMap() {
  const deliveries = orders.filter(o => o.fulfillment==='delivery' && o.fulfillmentStatus==='ready' && (o.deliveryAddress||o.address));
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
// ══════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════

// DAYS_OF_WEEK now lives in shared.js so index.js can use it too
let settingsLogoUris = {}; // holds any newly-picked logos this session, keyed by slot, or '' if removed
let settingsDiscountCodes = [];

const LOGO_SLOTS = [
  { key: 'logoAdminSidebar', label: 'Admin — Left Sidebar' },
  { key: 'logoAdminMobile', label: 'Admin — Mobile Top Bar' },
  { key: 'logoPasscode', label: 'Passcode Screen' },
  { key: 'logoCustomer', label: 'Customer Order Page' },
];

function renderSettingsTab() {
  const pickupDays = (settings.pickupDays || '').split(',').filter(Boolean);
  const deliveryDays = (settings.deliveryDays || '').split(',').filter(Boolean);
  settingsLogoUris = {}; // holds any newly-picked logos this session, keyed by slot
  settingsDiscountCodes = (settings.discountCodes || []).map(d => ({ code: d.code || '', discountPct: d.discountPct || 0 }));

  function dayCheckboxes(groupId, selectedDays) {
    return DAYS_OF_WEEK.map(day => `
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="checkbox" id="${groupId}-${day}" value="${day}" ${selectedDays.includes(day) ? 'checked' : ''}>
        <label class="form-check-label" for="${groupId}-${day}">${day}</label>
      </div>
    `).join('');
  }

  function logoSlotHtml(slot) {
    const current = settings[slot.key] || LOGO_DATA_URI || '';
    return `
      <div class="col">
        <div class="card h-100 shadow-sm efb-bg-light">
          <div class="card-body">
            <div class="small fw-bold mb-2">${esc(slot.label)}</div>
            <img id="settings-logo-preview-${slot.key}" src="${current}" style="max-height:60px; display:block; margin-bottom:10px; padding:8px; background: linear-gradient(135deg, #fff 50%, #212529 50%);" alt="${esc(slot.label)} logo"/>
            <input type="file" id="settings-logo-input-${slot.key}" accept="image/*" class="d-none" onchange="handleSettingsLogoUpload(event, '${slot.key}')"/>
            <button class="btn btn-outline-secondary btn-sm me-2" onclick="document.getElementById('settings-logo-input-${slot.key}').click()">Choose Photo</button>
            <button class="btn btn-outline-danger btn-sm" onclick="removeSettingsLogo('${slot.key}')">Remove</button>
            <div id="settings-logo-status-${slot.key}" class="small text-muted mt-2"></div>
          </div>
        </div>
      </div>`;
  }

  document.getElementById('tab-settings').innerHTML = `
    <div class="card mb-3 shadow-sm">
      <div class="card-body">
        <h5 class="text-muted mb-3">Pickup Days</h5>
        <p class="small text-muted">Check every day of the week customers are allowed to choose for pickup. The customer order form will only let them pick one of these days.</p>
        <div class="mb-2">${dayCheckboxes('pickup', pickupDays)}</div>
      </div>
    </div>
    <div class="card mb-3 shadow-sm">
      <div class="card-body">
        <h5 class="text-muted mb-3">Delivery Days</h5>
        <p class="small text-muted">Same idea, for delivery.</p>
        <div class="mb-2">${dayCheckboxes('delivery', deliveryDays)}</div>
      </div>
    </div>
    <div class="card mb-3 shadow-sm">
      <div class="card-body">
        <h5 class="text-muted mb-3">Logos</h5>
        <p class="small text-muted">Each spot has its own logo, in case you ever want them different. Upload once per spot below.</p>
        <div class="row row-cols-1 row-cols-md-2 g-3">${LOGO_SLOTS.map(logoSlotHtml).join('')}</div>
      </div>
    </div>
    <div class="card mb-3 shadow-sm">
      <div class="card-body">
        <h5 class="text-muted mb-3">Discount Codes</h5>
        <p class="small text-muted">Codes customers can enter at checkout for a percentage off their whole order. Codes aren't case-sensitive.</p>
        <div id="settings-discount-list"></div>
        <button type="button" class="btn btn-outline-secondary btn-sm" id="settings-discount-add-btn" onclick="addSettingsDiscountRow()">Add Code</button>
      </div>
    </div>
    <button class="btn btn-success" id="settings-save-btn" onclick="saveSettings()">Save</button>
  `;
  renderSettingsDiscountRows();
}

async function handleSettingsLogoUpload(event, key) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('settings-logo-status-'+key);
  statusEl.textContent = 'Compressing photo...';
  try {
    const compressed = await compressImageFile(file, 600);
    settingsLogoUris[key] = compressed;
    document.getElementById('settings-logo-preview-'+key).src = compressed;
    statusEl.textContent = 'Photo ready — click Save Settings to keep it.';
  } catch (err) {
    statusEl.textContent = 'Could not process that photo: ' + err.message;
  }
  event.target.value = '';
}

function removeSettingsLogo(key) {
  settingsLogoUris[key] = '';
  document.getElementById('settings-logo-preview-'+key).src = '';
  document.getElementById('settings-logo-status-'+key).textContent = 'Logo will be removed on Save (falls back to the default).';
}

function renderSettingsDiscountRows() {
  document.getElementById('settings-discount-list').innerHTML = settingsDiscountCodes.map((d, idx) => `
    <div class="row g-2 mb-2 align-items-center">
      <div class="col form-floating"><input id="settings-discount-code-${idx}" class="form-control" placeholder="Code" value="${(d.code||'').replace(/"/g,'&quot;')}" oninput="settingsDiscountCodes[${idx}].code = this.value; updateSettingsDiscountSaveState();"/><label for="settings-discount-code-${idx}">Code <span class="text-danger">*</span></label></div>
      <div class="col-4 form-floating"><input id="settings-discount-pct-${idx}" class="form-control" type="number" step="1" placeholder="Percent Off" value="${d.discountPct ?? ''}" oninput="settingsDiscountCodes[${idx}].discountPct = parseFloat(this.value)||0; updateSettingsDiscountSaveState();"/><label for="settings-discount-pct-${idx}">Percent Off <span class="text-danger">*</span></label></div>
      <div class="col-auto"><button type="button" class="btn btn-outline-danger btn-sm" onclick="removeSettingsDiscountRow(${idx})"><i class="bi bi-x-lg"></i></button></div>
    </div>
  `).join('');
  updateSettingsDiscountSaveState();
}

function addSettingsDiscountRow() {
  settingsDiscountCodes.push({ code: '', discountPct: 0 });
  renderSettingsDiscountRows();
}

function removeSettingsDiscountRow(idx) {
  settingsDiscountCodes.splice(idx, 1);
  renderSettingsDiscountRows();
}

function updateSettingsDiscountSaveState() {
  const saveBtn = document.getElementById('settings-save-btn');
  if (!saveBtn) return;
  const hasIncomplete = settingsDiscountCodes.some(d => !(d.code||'').trim() || !(Number(d.discountPct) > 0 && Number(d.discountPct) <= 100));
  saveBtn.disabled = hasIncomplete;
  saveBtn.title = hasIncomplete ? 'Every discount code needs a code and a percent off between 1 and 100 before you can save.' : '';
}

async function saveSettings() {
  const pickupDays = DAYS_OF_WEEK.filter(day => document.getElementById(`pickup-${day}`).checked);
  const deliveryDays = DAYS_OF_WEEK.filter(day => document.getElementById(`delivery-${day}`).checked);
  const data = {
    pickupDays: pickupDays.join(','),
    deliveryDays: deliveryDays.join(','),
    discountCodes: settingsDiscountCodes.filter(d => (d.code||'').trim() && Number(d.discountPct) > 0)
      .map(d => ({ code: d.code.trim().toUpperCase(), discountPct: Number(d.discountPct) })),
  };
  LOGO_SLOTS.forEach(slot => {
    if (settingsLogoUris[slot.key] !== undefined) data[slot.key] = settingsLogoUris[slot.key];
  });

  const saveBtn = document.getElementById('settings-save-btn');
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';

  try {
    if (settings.id) {
      await apiWrite('settings', 'update', settings.id, data);
      Object.assign(settings, data);
    } else {
      const newSettings = { id: 'settings1', ...data };
      await apiWrite('settings', 'add', null, newSettings);
      settings = newSettings;
    }
    showToast('Settings saved.');
    applyLogo();
  } catch (err) {
    showToast('Save failed: ' + err.message, 'bg-danger');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

function renderProductsTab() {
  document.getElementById('tab-products').innerHTML = `
    <label class="btn btn-outline-secondary d-inline-flex align-items-center gap-2 mb-3" for="reorderModeToggle">
      Reorder
      <div class="form-check form-switch mb-0">
        <input class="form-check-input switch-grey" type="checkbox" id="reorderModeToggle" ${reorderModeOn?'checked':''} onchange="setReorderMode(this.checked)" style="cursor:pointer;">
      </div>
    </label>
    <div class="table-responsive"><table class="table table-striped table-bordered bg-white">
      <thead><tr>${reorderModeOn ? '<th></th>' : ''}<th>Name</th><th>Status</th><th>Description</th><th class="text-end">Price</th><th class="text-end">Cost</th><th>Unit</th><th></th></tr></thead>
      <tbody id="productsTableBody">
        ${products.map(p => `<tr ${reorderModeOn ? `draggable="true" data-id="${p.id}" ondragstart="onProductDragStart(event,'${p.id}')" ondragover="onProductDragOver(event,'${p.id}')" ondragleave="onProductDragLeave(event)" ondrop="onProductDrop(event,'${p.id}')"` : ''}>
          ${reorderModeOn ? '<td class="drag-handle text-muted">⠿</td>' : ''}
          <td>${esc(p.name)}</td>
          <td>${p.active===false ? '<i class="bi bi-x-lg" title="Inactive"></i>' : '<i class="bi bi-check2" title="Active"></i>'}</td>
          <td>${esc(p.desc||'')}</td>
          <td class="text-end">$${Number(p.price).toFixed(2)}</td><td class="text-end">$${Number(p.cost).toFixed(2)}</td><td>${esc(p.unit||'')}</td>
          <td class="text-end"><button class="btn btn-outline-secondary btn-sm me-2 mb-2" onclick="openProductModal('${p.id}')">Edit</button><button class="btn btn-outline-danger btn-sm mb-2" onclick="deleteProductRow('${p.id}')">Delete</button></td>
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
  document.getElementById('productModalTitle').textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('pm-name').value = p ? p.name : '';
  document.getElementById('pm-desc').value = p ? (p.desc||'') : '';
  document.getElementById('pm-price').value = p ? p.price : '';
  document.getElementById('pm-cost').value = p ? p.cost : '';
  document.getElementById('pm-unit').value = p ? (p.unit||'') : '';
  const isActive = p ? (p.active !== false) : true;
  document.getElementById('pm-active-yes').checked = isActive;
  document.getElementById('pm-active-no').checked = !isActive;
  pmPhotoDataUri = null; // no change yet — only set if the admin picks/removes a photo this session
  document.getElementById('pm-photo-preview').src = (p && p.photo) ? p.photo : PLACEHOLDER_PHOTO_URI;
  document.getElementById('pm-photo-status').textContent = '';
  pmOptions = [];
  if (p && Array.isArray(p.options)) {
    pmOptions = p.options.map(o => ({ name: o.name || '', price: o.price || 0 }));
  }
  renderProductOptionRows();
  productModal.show();
}

let pmOptions = [];

function renderProductOptionRows() {
  document.getElementById('pm-options-list').innerHTML = pmOptions.map((opt, idx) => `
    <div class="row g-2 mb-2 align-items-center">
      <div class="col form-floating"><input id="pm-opt-name-${idx}" class="form-control" placeholder="Name" value="${(opt.name||'').replace(/"/g,'&quot;')}" oninput="pmOptions[${idx}].name = this.value; updateProductModalSaveState();"/><label for="pm-opt-name-${idx}">Name <span class="text-danger">*</span></label></div>
      <div class="col-4 form-floating"><input id="pm-opt-price-${idx}" class="form-control" type="number" step="0.01" placeholder="Price" value="${opt.price ?? ''}" oninput="pmOptions[${idx}].price = parseFloat(this.value)||0; updateProductModalSaveState();"/><label for="pm-opt-price-${idx}">Price ($) <span class="text-danger">*</span></label></div>
      <div class="col-auto"><button type="button" class="btn btn-outline-danger btn-sm" onclick="removeProductOptionRow(${idx})"><i class="bi bi-x-lg"></i></button></div>
    </div>
  `).join('');
  updateProductModalSaveState();
}

function updateProductModalSaveState() {
  const saveBtn = document.getElementById('pm-save-btn');
  if (!saveBtn) return;
  const name = document.getElementById('pm-name').value.trim();
  const desc = document.getElementById('pm-desc').value.trim();
  const unit = document.getElementById('pm-unit').value.trim();
  const priceVal = document.getElementById('pm-price').value;
  const costVal = document.getElementById('pm-cost').value;
  const priceValid = priceVal !== '' && Number(priceVal) > 0;
  const costValid = costVal !== '' && Number(costVal) >= 0;
  const missingCoreField = !name || !desc || !unit || !priceValid || !costValid;
  const hasIncompleteOption = pmOptions.some(o => !(o.name||'').trim() || !(Number(o.price) > 0));
  saveBtn.disabled = missingCoreField || hasIncompleteOption;
  saveBtn.title = missingCoreField
    ? 'Please fill in every field before saving.'
    : (hasIncompleteOption ? 'Every option needs both a name and a price above $0 before you can save.' : '');
}

function addProductOptionRow() {
  pmOptions.push({ name: '', price: 0 });
  renderProductOptionRows();
}

function removeProductOptionRow(idx) {
  pmOptions.splice(idx, 1);
  renderProductOptionRows();
}
function deleteProductRow(id) {
  const p = products.find(p=>p.id===id); if (!p) return;
  openConfirm(`Delete "${p.name}" from the menu? This won't affect past orders.`, async () => {
    await apiWrite('products','delete',id,null);
    products = products.filter(pr=>pr.id!==id);
    renderProductsTab();
    showToast('Product deleted.');
  });
}
async function saveProductFromModal() {
  const name = document.getElementById('pm-name').value.trim();
  if (!name) { alert('Please enter a product name.'); return; }
  const data = {
    name, desc: document.getElementById('pm-desc').value.trim(),
    price: parseFloat(document.getElementById('pm-price').value)||0,
    cost: parseFloat(document.getElementById('pm-cost').value)||0,
    unit: document.getElementById('pm-unit').value.trim(),
    active: document.getElementById('pm-active-yes').checked
  };
  if (pmPhotoDataUri !== null) data.photo = pmPhotoDataUri; // only touch photo if it was actually changed this session
  const validOptions = pmOptions.filter(o => (o.name||'').trim());
  data.options = validOptions;

  const saveBtn = document.getElementById('pm-save-btn');
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';

  try {
    if (editingProductId) {
      await apiWrite('products','update',editingProductId,data);
      const p = products.find(p=>p.id===editingProductId);
      Object.assign(p, data);
    } else {
      const newProduct = { id:'p'+Date.now(), sortOrder:products.length, ...data };
      await apiWrite('products','add',null,newProduct);
      products.push(newProduct);
    }
    productModal.hide();
    renderProductsTab();
    showToast('Product saved.');
  } catch (err) {
    alert('Save failed: ' + err.message + '\n\nYour changes were NOT saved. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

// ══════════════════════════════════════════
// UTIL
// ══════════════════════════════════════════
function copyPublicLink() {
  const url = location.origin + location.pathname.replace('admin.html','index.html');
  navigator.clipboard.writeText(url).then(() => showToast('Order page link copied!'));
}

init();
