/** Product CRUD + sales overview for admin.html (switched between via tabs). Talks to the "Filmlab04
 * Products" Apps Script Web App (apps-script/admin-api.gs) — reads/writes
 * the live Google Sheet product catalog and reads order data for the sales
 * summary. Gated behind Google Sign-In; only emails on the backend's
 * ALLOWED_EMAILS list can actually save/upload/view sales.
 * Depends on cart.js for showToast()/escapeHtml(). */

// Same Apps Script /exec URL as PRODUCTS_ENDPOINT in js/cart.js.
const ADMIN_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyW4XSFes9LoCIUkCU7-2oWfNFTfTErV9fCksxrgy-ONdXX-h-ADkfZEz_XjyPVrF40WQ/exec';

// OAuth Client ID from Google Cloud Console — must match GOOGLE_CLIENT_ID
// in apps-script/admin-api.gs.
const GOOGLE_CLIENT_ID = '36912991192-drhj1aqehd4q9m9al25qil87kk43kmri.apps.googleusercontent.com';

let __adminProducts = [];
let __editingId = null; // null while adding a new product
let __idToken = null;
let __userEmail = null;

// Fields covered by the form. Anything else on a product round-trips
// through the "Advanced fields" JSON box.
const FORM_FIELDS = [
  'id', 'brand', 'name', 'tagline', 'iso', 'format', 'type', 'shots',
  'price', 'currency', 'quantity', 'stock', 'image', 'sampleImages', 'description', 'category',
  'variants', 'about', 'features'
];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function adminPost(payload) {
  const res = await fetch(ADMIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, idToken: __idToken })
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error === 'Not authorized' ? 'Your session has expired or you no longer have access. Please sign in again.' : body.error);
  return body;
}

async function uploadImage(file) {
  const dataBase64 = await fileToBase64(file);
  const body = await adminPost({ action: 'upload-image', filename: file.name, mimeType: file.type, dataBase64 });
  return body.url;
}

async function fetchProducts() {
  const res = await fetch(`${ADMIN_ENDPOINT}?action=products`);
  if (!res.ok) throw new Error('Could not load products');
  return res.json();
}

async function saveAllProducts(products) {
  return adminPost({ action: 'save-all', products });
}

function adminRow(p) {
  const soldOut = p.stock !== 'in-stock';
  return `
    <tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(p.brand)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.currency}${Number(p.price).toFixed(2)}</td>
      <td>${Number(p.quantity) || 0}</td>
      <td><span class="badge ${soldOut ? 'badge-sold-out' : 'badge-in-stock'}">${soldOut ? 'Sold out' : 'In stock'}</span></td>
      <td class="admin-row-actions">
        <button class="btn btn-secondary btn-sm" data-edit="${p.id}">Edit</button>
        <button class="btn btn-secondary btn-sm" data-delete="${p.id}">Delete</button>
      </td>
    </tr>`;
}

function renderAdminTable() {
  const wrap = document.querySelector('.admin-table-wrap');
  wrap.innerHTML = `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr><th>ID</th><th>Brand</th><th>Name</th><th>Category</th><th>Price</th><th>Quantity</th><th>Stock</th><th></th></tr>
        </thead>
        <tbody>${__adminProducts.map(adminRow).join('')}</tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = __adminProducts.find(p => p.id === btn.dataset.edit);
      openEditor(product);
    });
  });
  wrap.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.delete));
  });
}

function uploadBtn() {
  return `<label class="btn btn-secondary btn-sm admin-upload-btn">Upload<input type="file" accept="image/*" hidden></label>`;
}

function variantRow(v) {
  v = v || {};
  // Falls back to reading the old binary stock flag (pre-migration data)
  // so existing "in-stock" colours don't silently become 0 the first
  // time this editor opens — Jun Min still needs to fill in the real
  // per-colour count once, this just avoids zeroing everything out.
  const qty = v.quantity ?? (v.stock === 'sold-out' ? 0 : 1);
  return `
    <div class="admin-variant-row">
      <input type="text" class="v-color" placeholder="Powder Blue" value="${escapeHtml(v.color)}">
      <div class="admin-image-field">
        <input type="text" class="v-image" placeholder="images/products/..." value="${escapeHtml(v.image)}">
        ${uploadBtn()}
      </div>
      <input type="number" class="v-quantity" min="0" step="1" placeholder="0" value="${qty}">
      <button type="button" class="btn btn-secondary btn-sm admin-variant-remove">Remove</button>
    </div>`;
}

function renderVariantRows(variants) {
  document.getElementById('f-variants-rows').innerHTML = (variants || []).map(variantRow).join('');
  syncVariantsTotalQuantity();
}

// Stock is per-colour now (each colour has its own Quantity, auto sold-out
// at 0 — same derivation as the top-level field) instead of a manually
// toggled in-stock/sold-out flag, so Jun Min doesn't have to guess which
// colour a sale came out of.
function readVariants() {
  const rows = document.querySelectorAll('#f-variants-rows .admin-variant-row');
  const variants = [];
  rows.forEach(row => {
    const color = row.querySelector('.v-color').value.trim();
    const image = row.querySelector('.v-image').value.trim();
    const quantity = Math.max(0, Math.floor(Number(row.querySelector('.v-quantity').value)) || 0);
    if (color) variants.push({ color, image, quantity, stock: quantity > 0 ? 'in-stock' : 'sold-out' });
  });
  return variants;
}

// The top-level Quantity field becomes read-only (see setVariantsMode) and
// auto-follows the sum of colour quantities whenever this section is
// visible — the two numbers drifting apart independently is exactly what
// left Jun Min not knowing which colour a sale actually came from.
function syncVariantsTotalQuantity() {
  const section = document.getElementById('f-variants-section');
  if (section.hidden) return;
  const total = readVariants().reduce((sum, v) => sum + v.quantity, 0);
  document.getElementById('f-quantity').value = total;
}

function sampleRow(path) {
  return `
    <div class="admin-sample-row">
      <div class="admin-image-field">
        <input type="text" class="s-path" placeholder="images/products/..." value="${escapeHtml(path)}">
        ${uploadBtn()}
      </div>
      <button type="button" class="btn btn-secondary btn-sm admin-sample-remove">Remove</button>
    </div>`;
}

function renderSampleRows(sampleImages) {
  document.getElementById('f-sampleimages-rows').innerHTML = (sampleImages || []).map(sampleRow).join('');
}

function readSampleImages() {
  const rows = document.querySelectorAll('#f-sampleimages-rows .s-path');
  return Array.from(rows).map(input => input.value.trim()).filter(Boolean);
}

function featureRow(f) {
  f = f || {};
  return `
    <div class="admin-feature-row">
      <div class="admin-feature-top">
        <input type="text" class="ft-title" placeholder="Feature title" value="${escapeHtml(f.title)}">
        <button type="button" class="btn btn-secondary btn-sm admin-feature-remove">Remove</button>
      </div>
      <textarea class="ft-text" rows="2" placeholder="What this feature does...">${escapeHtml(f.text)}</textarea>
      <div class="admin-image-field">
        <input type="text" class="ft-image" placeholder="images/products/..." value="${escapeHtml(f.image)}">
        ${uploadBtn()}
      </div>
    </div>`;
}

function renderFeatureRows(features) {
  document.getElementById('f-features-rows').innerHTML = (features || []).map(featureRow).join('');
}

function readFeatures() {
  const rows = document.querySelectorAll('#f-features-rows .admin-feature-row');
  const features = [];
  rows.forEach(row => {
    const title = row.querySelector('.ft-title').value.trim();
    const text = row.querySelector('.ft-text').value.trim();
    const image = row.querySelector('.ft-image').value.trim();
    if (title || text) features.push({ title, text, image });
  });
  return features;
}

function fillForm(product) {
  const p = product || {};
  document.getElementById('f-id').value = p.id || '';
  document.getElementById('f-brand').value = p.brand || '';
  document.getElementById('f-name').value = p.name || '';
  document.getElementById('f-tagline').value = p.tagline || '';
  document.getElementById('f-iso').value = p.iso ?? '';
  document.getElementById('f-format').value = p.format || '135';
  document.getElementById('f-type').value = p.type || 'Color';
  document.getElementById('f-shots').value = p.shots ?? '';
  document.getElementById('f-price').value = p.price ?? '';
  document.getElementById('f-currency').value = p.currency || 'RM';
  document.getElementById('f-quantity').value = p.quantity ?? '';
  document.getElementById('f-category').value = p.category || 'film';
  document.getElementById('f-image').value = p.image || '';
  renderSampleRows(p.sampleImages || []);
  document.getElementById('f-description').value = p.description || '';
  renderVariantRows(p.variants || []);
  document.getElementById('f-about').value = p.about || '';
  renderFeatureRows(p.features || []);

  const extra = {};
  Object.keys(p).forEach(key => {
    if (!FORM_FIELDS.includes(key)) extra[key] = p[key];
  });
  document.getElementById('f-extra').value = JSON.stringify(extra, null, 2);
  const hasExtra = Object.keys(extra).length > 0;
  const advancedEl = document.querySelector('.admin-advanced');
  advancedEl.hidden = !hasExtra;
  advancedEl.open = hasExtra;
}

function readForm() {
  const num = (id) => {
    const v = document.getElementById(id).value.trim();
    return v === '' ? undefined : Number(v);
  };
  const str = (id) => document.getElementById(id).value.trim();

  const product = {
    id: str('f-id'),
    brand: str('f-brand'),
    name: str('f-name'),
    tagline: str('f-tagline'),
    iso: num('f-iso'),
    format: str('f-format'),
    type: str('f-type'),
    shots: num('f-shots'),
    price: num('f-price'),
    currency: str('f-currency'),
    quantity: num('f-quantity'),
    image: str('f-image'),
    sampleImages: readSampleImages(),
    description: str('f-description'),
    category: str('f-category')
  };
  Object.keys(product).forEach(key => {
    if (product[key] === undefined) delete product[key];
  });

  const variants = readVariants();
  if (variants.length) {
    product.variants = variants;
    // Authoritative when variants exist — see syncVariantsTotalQuantity().
    product.quantity = variants.reduce((sum, v) => sum + v.quantity, 0);
  }
  if (typeof product.quantity === 'number') {
    product.stock = product.quantity > 0 ? 'in-stock' : 'sold-out';
  }

  const about = str('f-about');
  if (about) product.about = about;

  const features = readFeatures();
  if (features.length) product.features = features;

  const extraRaw = document.getElementById('f-extra').value.trim() || '{}';
  const extra = JSON.parse(extraRaw); // throws on invalid JSON — caller catches

  return { ...product, ...extra };
}

function setVariantsMode(mode, product) {
  const isMulti = mode === 'multi';
  document.getElementById('f-variants-section').hidden = !isMulti;
  if (isMulti && !(product && product.variants && product.variants.length)) {
    renderVariantRows([{}, {}]);
  }
  // Read-only, not just a convention — see syncVariantsTotalQuantity().
  // Hand-editing this while colours are shown is exactly how the two
  // numbers used to drift apart.
  const qtyField = document.getElementById('f-quantity');
  qtyField.readOnly = isMulti;
  qtyField.title = isMulti ? 'Auto-calculated from the colours below' : '';
  if (isMulti) syncVariantsTotalQuantity();
}

function openEditor(product, mode) {
  __editingId = product ? product.id : null;
  const resolvedMode = product
    ? (Array.isArray(product.variants) && product.variants.length ? 'multi' : 'single')
    : (mode || 'single');
  document.getElementById('admin-editor-title').textContent = product ? `Edit ${product.name}` : 'New product';
  fillForm(product);
  setVariantsMode(resolvedMode, product);
  showAdminError('');
  document.getElementById('admin-editor').hidden = false;
  document.getElementById('admin-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  document.getElementById('admin-editor').hidden = true;
  __editingId = null;
}

function showAdminError(message) {
  const el = document.getElementById('admin-error');
  el.textContent = message;
  el.hidden = !message;
}

async function deleteProduct(id) {
  if (!confirm(`Delete "${id}"? This can't be undone.`)) return;
  const next = __adminProducts.filter(p => p.id !== id);
  try {
    await saveAllProducts(next);
    __adminProducts = next;
    renderAdminTable();
    showToast('Deleted');
  } catch (err) {
    alert(err.message);
  }
}

async function saveEditor() {
  let parsed;
  try {
    parsed = readForm();
  } catch (err) {
    showAdminError(`Invalid JSON in advanced fields: ${err.message}`);
    return;
  }

  const required = ['id', 'brand', 'name', 'price', 'currency', 'quantity', 'category'];
  const missing = required.filter(k => parsed[k] === undefined || parsed[k] === '');
  if (missing.length) {
    showAdminError(`Missing required field(s): ${missing.join(', ')}`);
    return;
  }
  const variantsShown = !document.getElementById('f-variants-section').hidden;
  if (variantsShown && !(parsed.variants && parsed.variants.length)) {
    showAdminError('Please add at least one colour/style, or cancel and choose "Single style" instead.');
    return;
  }

  const isNew = __editingId === null;
  const idTaken = __adminProducts.some(p => p.id === parsed.id && p.id !== __editingId);
  if (idTaken) {
    showAdminError(`Product id "${parsed.id}" is already used by another product.`);
    return;
  }

  const next = isNew
    ? [...__adminProducts, parsed]
    : __adminProducts.map(p => (p.id === __editingId ? parsed : p));

  try {
    await saveAllProducts(next);
    __adminProducts = next;
    renderAdminTable();
    closeEditor();
    showToast(isNew ? 'Product added' : 'Saved');
  } catch (err) {
    showAdminError(err.message);
  }
}

async function importFromStaticJson() {
  if (!confirm('This will overwrite the Google Sheet data with the current contents of data/products.json. Continue?')) return;
  try {
    const res = await fetch('data/products.json');
    const products = await res.json();
    await saveAllProducts(products);
    __adminProducts = products;
    renderAdminTable();
    showToast('Imported');
  } catch (err) {
    alert(err.message);
  }
}

function formatDateTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value || '—');
  return d.toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
}

let __salesOrders = [];
let __salesStats = { totalOrders: 0, totalRevenue: 0 };

function salesOrderRow(o) {
  const paid = o.paymentStatus === 'Paid';
  const isDelivery = o.deliveryMethod === 'Delivery';
  return `
    <tr>
      <td>${escapeHtml(o.orderId)}</td>
      <td>${escapeHtml(formatDateTime(o.submittedAt))}</td>
      <td>${escapeHtml(o.name)}</td>
      <td>${escapeHtml(o.phone)}</td>
      <td style="white-space:pre-line;">${escapeHtml(o.items)}</td>
      <td>RM${Number(o.subtotal).toFixed(2)}</td>
      <td>${isDelivery ? `Ship: ${escapeHtml(o.address || '—')}` : 'Self-pickup'}</td>
      <td><span class="badge ${paid ? 'badge-in-stock' : 'badge-pending'}">${escapeHtml(o.paymentStatus || 'Pending')}</span></td>
      <td>${paid ? '' : `<button class="btn btn-secondary btn-sm" data-mark-paid="${escapeHtml(o.orderId)}">Mark as paid</button>`}</td>
    </tr>`;
}

function renderSalesTable() {
  const wrap = document.getElementById('admin-sales-wrap');
  if (!wrap) return;

  const query = (document.getElementById('admin-sales-search')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('admin-sales-status-filter')?.value || '';
  const filtered = __salesOrders.filter(o => {
    if (statusFilter && (o.paymentStatus || 'Pending') !== statusFilter) return false;
    if (!query) return true;
    return [o.orderId, o.name, o.items].some(v => String(v || '').toLowerCase().includes(query));
  });

  wrap.innerHTML = `
    <div class="admin-sales-stats">
      <div class="admin-sales-stat"><span>Total orders</span><strong>${__salesStats.totalOrders}</strong></div>
      <div class="admin-sales-stat"><span>Total order value (incl. unconfirmed payments)</span><strong>RM${__salesStats.totalRevenue.toFixed(2)}</strong></div>
    </div>
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead><tr><th>Order ID</th><th>Time</th><th>Customer</th><th>Phone</th><th>Items</th><th>Amount</th><th>Delivery</th><th>Status</th><th></th></tr></thead>
        <tbody>${filtered.map(salesOrderRow).join('') || `<tr><td colspan="9" class="muted">${__salesOrders.length ? 'No orders match this search' : 'No orders yet'}</td></tr>`}</tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('[data-mark-paid]').forEach(btn => {
    btn.addEventListener('click', () => markOrderPaid(btn.dataset.markPaid, btn));
  });
}

async function markOrderPaid(orderId, btn) {
  btn.disabled = true;
  btn.textContent = 'Marking...';
  try {
    const result = await adminPost({ action: 'mark-order-paid', orderId });
    if (!result.ok) throw new Error(result.error || 'Could not mark as paid');
    const order = __salesOrders.find(o => o.orderId === orderId);
    if (order) order.paymentStatus = 'Paid';
    renderSalesTable();
    showToast('Marked as paid');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Mark as paid';
    alert(err.message);
  }
}

async function loadSales() {
  const wrap = document.getElementById('admin-sales-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const res = await fetch(`${ADMIN_ENDPOINT}?action=sales&idToken=${encodeURIComponent(__idToken)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    __salesOrders = data.recentOrders;
    __salesStats = { totalOrders: data.totalOrders, totalRevenue: data.totalRevenue };
    renderSalesTable();
  } catch (err) {
    wrap.innerHTML = `<p class="admin-error">${escapeHtml(err.message)}</p>`;
  }
}

async function loadMaintenanceToggle() {
  const toggle = document.getElementById('admin-maintenance-toggle');
  const status = document.getElementById('admin-maintenance-status');
  if (!toggle) return;
  try {
    const res = await fetch(`${ADMIN_ENDPOINT}?action=checkout-status`);
    const data = await res.json();
    toggle.checked = !!data.maintenanceMode;
    status.textContent = toggle.checked ? 'On — checkout shows WhatsApp fallback' : 'Off — checkout is live';
  } catch (err) {
    status.textContent = 'Could not load status';
  }
}

async function toggleMaintenanceMode() {
  const toggle = document.getElementById('admin-maintenance-toggle');
  const status = document.getElementById('admin-maintenance-status');
  const enabled = toggle.checked;
  toggle.disabled = true;
  status.textContent = 'Saving...';
  try {
    const result = await adminPost({ action: 'set-checkout-maintenance', enabled });
    if (!result.ok) throw new Error(result.error || 'Could not update');
    status.textContent = enabled ? 'On — checkout shows WhatsApp fallback' : 'Off — checkout is live';
  } catch (err) {
    toggle.checked = !enabled;
    status.textContent = 'Could not save — try again';
    alert(err.message);
  } finally {
    toggle.disabled = false;
  }
}

async function loadProductsSection() {
  const wrap = document.querySelector('.admin-table-wrap');
  if (!wrap) return;
  try {
    __adminProducts = await fetchProducts();
  } catch (err) {
    wrap.innerHTML = `<p class="admin-error">${escapeHtml(err.message)}</p>`;
    return;
  }
  renderAdminTable();
}

async function loadAdminApp() {
  loadProductsSection();
  loadSales();
  loadMaintenanceToggle();
}

function showSignedIn(email) {
  document.getElementById('admin-gate').hidden = true;
  document.getElementById('admin-app').hidden = false;
  document.getElementById('admin-user-email').textContent = email;
  loadAdminApp();
}

function showGateError(message) {
  const el = document.getElementById('admin-gate-error');
  el.textContent = message;
  el.hidden = !message;
}

async function handleCredentialResponse(response) {
  __idToken = response.credential;
  showGateError('');
  // The verification round-trip (this Apps Script deployment, which then
  // calls Google's tokeninfo endpoint itself) can take several seconds —
  // show something so it doesn't look stuck, same fix as checkout's
  // "Placing order..." button.
  const statusEl = document.getElementById('admin-gate-status');
  if (statusEl) statusEl.hidden = false;
  try {
    const res = await fetch(`${ADMIN_ENDPOINT}?action=whoami&idToken=${encodeURIComponent(__idToken)}`);
    const data = await res.json();
    if (!data.authorized) {
      __idToken = null;
      showGateError('This Google account does not have access to the admin panel.');
      return;
    }
    __userEmail = data.email;
    showSignedIn(data.email);
  } catch (err) {
    showGateError('Could not verify sign-in. Please check your connection and try again.');
  } finally {
    if (statusEl) statusEl.hidden = true;
  }
}

function signOut() {
  __idToken = null;
  __userEmail = null;
  document.getElementById('admin-app').hidden = true;
  document.getElementById('admin-gate').hidden = false;
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
}

function initAdmin() {
  if (!document.getElementById('admin-gate')) return;

  if (!ADMIN_ENDPOINT || !GOOGLE_CLIENT_ID) {
    document.querySelector('.container').insertAdjacentHTML('afterbegin',
      '<p class="admin-error">ADMIN_ENDPOINT / GOOGLE_CLIENT_ID not set yet — edit the top of js/admin.js to fill them in.</p>');
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: true
  });
  google.accounts.id.renderButton(document.getElementById('admin-signin-btn'), { theme: 'outline', size: 'large' });
  // Try a silent sign-in first so a page refresh doesn't force clicking the
  // button again — Google only does this quietly if the browser still has
  // your session and you haven't explicitly signed out (see signOut()'s
  // disableAutoSelect call).
  google.accounts.id.prompt();

  document.getElementById('admin-signout')?.addEventListener('click', signOut);
  document.getElementById('admin-import-json')?.addEventListener('click', importFromStaticJson);
  document.getElementById('admin-sales-search')?.addEventListener('input', renderSalesTable);
  document.getElementById('admin-sales-status-filter')?.addEventListener('change', renderSalesTable);
  document.getElementById('admin-maintenance-toggle')?.addEventListener('change', toggleMaintenanceMode);

  const tabProducts = document.getElementById('admin-tab-products');
  const tabSales = document.getElementById('admin-tab-sales');
  if (tabProducts && tabSales) {
    const viewProducts = document.getElementById('admin-view-products');
    const viewSales = document.getElementById('admin-view-sales');
    const showTab = (tab) => {
      viewProducts.hidden = tab !== 'products';
      viewSales.hidden = tab !== 'sales';
      tabProducts.classList.toggle('btn-primary', tab === 'products');
      tabProducts.classList.toggle('btn-secondary', tab !== 'products');
      tabSales.classList.toggle('btn-primary', tab === 'sales');
      tabSales.classList.toggle('btn-secondary', tab !== 'sales');
    };
    tabProducts.addEventListener('click', () => showTab('products'));
    tabSales.addEventListener('click', () => showTab('sales'));
  }

  // The product-editor UI only exists on admin.html, guard in case a future
  // page reuses admin.js without it.
  if (document.getElementById('admin-editor')) {
    document.getElementById('admin-new').addEventListener('click', () => {
      document.getElementById('admin-new-modal').hidden = false;
    });
    document.getElementById('admin-new-modal-cancel').addEventListener('click', () => {
      document.getElementById('admin-new-modal').hidden = true;
    });
    document.getElementById('admin-new-single').addEventListener('click', () => {
      document.getElementById('admin-new-modal').hidden = true;
      openEditor(null, 'single');
    });
    document.getElementById('admin-new-multi').addEventListener('click', () => {
      document.getElementById('admin-new-modal').hidden = true;
      openEditor(null, 'multi');
    });
    document.getElementById('admin-cancel').addEventListener('click', closeEditor);
    document.getElementById('admin-save').addEventListener('click', saveEditor);
    document.getElementById('admin-variant-add').addEventListener('click', () => {
      document.getElementById('f-variants-rows').insertAdjacentHTML('beforeend', variantRow());
      syncVariantsTotalQuantity();
    });
    document.getElementById('f-variants-rows').addEventListener('click', (e) => {
      if (e.target.classList.contains('admin-variant-remove')) {
        e.target.closest('.admin-variant-row').remove();
        syncVariantsTotalQuantity();
      }
    });
    document.getElementById('f-variants-rows').addEventListener('input', (e) => {
      if (e.target.classList.contains('v-quantity')) syncVariantsTotalQuantity();
    });
    document.getElementById('admin-sample-add').addEventListener('click', () => {
      document.getElementById('f-sampleimages-rows').insertAdjacentHTML('beforeend', sampleRow());
    });
    document.getElementById('f-sampleimages-rows').addEventListener('click', (e) => {
      if (e.target.classList.contains('admin-sample-remove')) {
        e.target.closest('.admin-sample-row').remove();
      }
    });
    document.getElementById('admin-feature-add').addEventListener('click', () => {
      document.getElementById('f-features-rows').insertAdjacentHTML('beforeend', featureRow());
    });
    document.getElementById('f-features-rows').addEventListener('click', (e) => {
      if (e.target.classList.contains('admin-feature-remove')) {
        e.target.closest('.admin-feature-row').remove();
      }
    });
    document.getElementById('admin-editor').addEventListener('change', async (e) => {
      if (e.target.type !== 'file') return;
      const fileInput = e.target;
      const file = fileInput.files[0];
      if (!file) return;
      const textInput = fileInput.closest('.admin-image-field').querySelector('input[type=text]');
      fileInput.disabled = true;
      try {
        textInput.value = await uploadImage(file);
        showToast('Image uploaded');
      } catch (err) {
        showAdminError(err.message);
      } finally {
        fileInput.disabled = false;
        fileInput.value = '';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // google.accounts.id needs the GIS script (loaded async) to have run first.
  if (window.google?.accounts?.id) initAdmin();
  else window.addEventListener('load', initAdmin);
});
