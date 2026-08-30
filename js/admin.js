/** Product CRUD for admin.html. Reads/writes data/products.json via server.py's
 * /api/products endpoint — only works while server.py is running. Depends on
 * cart.js for showToast(). */

let __adminProducts = [];
let __editingId = null; // null while adding a new product

// Fields covered by the form. Anything else on a product round-trips
// through the "Advanced fields" JSON box.
const FORM_FIELDS = [
  'id', 'brand', 'name', 'tagline', 'iso', 'format', 'type', 'shots',
  'price', 'currency', 'stock', 'image', 'sampleImages', 'description', 'category',
  'variants', 'about', 'features'
];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function uploadImage(file) {
  const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    body: file
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Upload failed');
  return body.path;
}

async function fetchProducts() {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error('Could not load products.json');
  return res.json();
}

async function saveAllProducts(products) {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(products)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Save failed');
  return body;
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
          <tr><th>ID</th><th>Brand</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr>
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
  return `
    <div class="admin-variant-row">
      <input type="text" class="v-color" placeholder="Powder Blue" value="${escapeHtml(v.color)}">
      <div class="admin-image-field">
        <input type="text" class="v-image" placeholder="images/products/..." value="${escapeHtml(v.image)}">
        ${uploadBtn()}
      </div>
      <select class="v-stock">
        <option value="in-stock" ${v.stock !== 'sold-out' ? 'selected' : ''}>in-stock</option>
        <option value="sold-out" ${v.stock === 'sold-out' ? 'selected' : ''}>sold-out</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm admin-variant-remove">Remove</button>
    </div>`;
}

function renderVariantRows(variants) {
  document.getElementById('f-variants-rows').innerHTML = (variants || []).map(variantRow).join('');
}

function readVariants() {
  const rows = document.querySelectorAll('#f-variants-rows .admin-variant-row');
  const variants = [];
  rows.forEach(row => {
    const color = row.querySelector('.v-color').value.trim();
    const image = row.querySelector('.v-image').value.trim();
    const stock = row.querySelector('.v-stock').value;
    if (color) variants.push({ color, image, stock });
  });
  return variants;
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
  document.getElementById('f-stock').value = p.stock || 'in-stock';
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
    stock: str('f-stock'),
    image: str('f-image'),
    sampleImages: readSampleImages(),
    description: str('f-description'),
    category: str('f-category')
  };
  Object.keys(product).forEach(key => {
    if (product[key] === undefined) delete product[key];
  });

  const variants = readVariants();
  if (variants.length) product.variants = variants;

  const about = str('f-about');
  if (about) product.about = about;

  const features = readFeatures();
  if (features.length) product.features = features;

  const extraRaw = document.getElementById('f-extra').value.trim() || '{}';
  const extra = JSON.parse(extraRaw); // throws on invalid JSON — caller catches

  return { ...product, ...extra };
}

function openEditor(product) {
  __editingId = product ? product.id : null;
  document.getElementById('admin-editor-title').textContent = product ? `Edit ${product.name}` : 'New product';
  fillForm(product);
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

  const required = ['id', 'brand', 'name', 'price', 'currency', 'stock', 'category'];
  const missing = required.filter(k => parsed[k] === undefined || parsed[k] === '');
  if (missing.length) {
    showAdminError(`Missing required field(s): ${missing.join(', ')}`);
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

async function initAdmin() {
  const wrap = document.querySelector('.admin-table-wrap');
  if (!wrap) return;
  try {
    __adminProducts = await fetchProducts();
  } catch (err) {
    wrap.innerHTML = `<p class="admin-error">${err.message} — make sure you're running <code>python3 server.py</code>, not the plain http.server.</p>`;
    return;
  }
  renderAdminTable();

  document.getElementById('admin-new').addEventListener('click', () => openEditor(null));
  document.getElementById('admin-cancel').addEventListener('click', closeEditor);
  document.getElementById('admin-save').addEventListener('click', saveEditor);
  document.getElementById('admin-variant-add').addEventListener('click', () => {
    document.getElementById('f-variants-rows').insertAdjacentHTML('beforeend', variantRow());
  });
  document.getElementById('f-variants-rows').addEventListener('click', (e) => {
    if (e.target.classList.contains('admin-variant-remove')) {
      e.target.closest('.admin-variant-row').remove();
    }
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

document.addEventListener('DOMContentLoaded', initAdmin);
