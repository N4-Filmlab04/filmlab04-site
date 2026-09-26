/**
 * filmlab04 cart — cart state lives in localStorage. The actual checkout
 * flow (customer details, order submission, payment instructions) is in
 * js/checkout.js.
 */

const CART_KEY = 'filmlab04_cart';

// Product catalog now lives in the "Filmlab04 Products" Google Sheet, read
// through this Apps Script Web App (see apps-script/admin-api.gs) so stock
// changes made in admin.html go live instantly, no git push needed.
const PRODUCTS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyW4XSFes9LoCIUkCU7-2oWfNFTfTErV9fCksxrgy-ONdXX-h-ADkfZEz_XjyPVrF40WQ/exec';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeJsString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Colour variants (e.g. Kodak EC35) each carry their own photo — show that
// instead of the product's default image when a specific colour was
// picked, falling back to the default if the variant has no photo of its
// own or the cart line predates variants.
function lineImage(p, variant) {
  if (variant && p.variants) {
    const v = p.variants.find(v => v.color === variant);
    if (v && v.image) return v.image;
  }
  return p.image;
}

// Each colour has its own stock now — p.quantity is only their sum, so
// capping against that would let "Vanilla White" be added using stock
// that actually belongs to "Midnight Black". Falls back to p.quantity
// (the pooled total) for a product with no variants, or for a variant
// that predates per-colour quantities (v.quantity still undefined) —
// admin.html now writes a real number for every colour going forward.
function lineMaxQty(p, variant) {
  if (variant && p.variants) {
    const v = p.variants.find(v => v.color === variant);
    if (v) return typeof v.quantity === 'number' ? v.quantity : (Number(p.quantity) || 0);
  }
  return Number(p.quantity) || 0;
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartBadge();
}

// maxQty is the product's real stock (Products sheet's Quantity column) —
// callers that know it (product.js, shop.js) pass it so the cart can never
// hold more than what's actually in stock. Defaults to Infinity for any
// caller that doesn't (there shouldn't be one, but this fails open rather
// than silently blocking a legitimate add).
function addToCart(productId, qty = 1, variant = null, maxQty = Infinity) {
  const cart = getCart();
  const line = cart.find(l => l.id === productId && (l.variant || null) === (variant || null));
  const already = line ? line.qty : 0;
  const allowed = Math.max(0, Math.min(qty, maxQty - already));
  if (allowed <= 0) {
    showToast(`Only ${maxQty} in stock — you already have the max in your cart`);
    return;
  }
  if (line) {
    line.qty += allowed;
  } else {
    cart.push({ id: productId, variant: variant || null, qty: allowed });
  }
  saveCart(cart);
  showToast(allowed < qty ? `Added ${allowed} — that's all that's in stock` : 'Added to cart');
}

function removeFromCart(productId, variant = null) {
  saveCart(getCart().filter(l => !(l.id === productId && (l.variant || null) === (variant || null))));
  renderCartDrawer();
}

function setQty(productId, qty, variant = null, maxQty = Infinity) {
  const cart = getCart();
  const line = cart.find(l => l.id === productId && (l.variant || null) === (variant || null));
  if (!line) return;
  if (qty <= 0) {
    removeFromCart(productId, variant);
    return;
  }
  const capped = Math.min(qty, maxQty);
  if (capped < qty) showToast(`Only ${maxQty} in stock`);
  line.qty = capped;
  saveCart(cart);
  renderCartDrawer();
}

function cartCount(cart = getCart()) {
  return cart.reduce((sum, l) => sum + l.qty, 0);
}

const PRODUCTS_CACHE_KEY = 'filmlab04_products_cache_v1';

function readProductsCache_() {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeProductsCache_(products) {
  try {
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch {}
}

async function fetchProductsFresh_() {
  const res = await fetch(PRODUCTS_ENDPOINT ? `${PRODUCTS_ENDPOINT}?action=products` : 'data/products.json');
  return res.json();
}

// The Apps Script backend is noticeably slower than the static JSON file it
// replaced, so pages paint instantly from a cached copy (if any) while a
// fresh fetch runs in the background. If the fresh data differs, pages
// listening for 'filmlab04:products-updated' re-render with it.
async function loadProducts() {
  if (window.__filmlab04Products) return window.__filmlab04Products;

  const cached = readProductsCache_();
  if (cached) {
    window.__filmlab04Products = cached;
    fetchProductsFresh_().then(fresh => {
      writeProductsCache_(fresh);
      if (JSON.stringify(fresh) !== JSON.stringify(window.__filmlab04Products)) {
        window.__filmlab04Products = fresh;
        window.dispatchEvent(new CustomEvent('filmlab04:products-updated'));
      }
    }).catch(() => {});
    return cached;
  }

  const products = await fetchProductsFresh_();
  window.__filmlab04Products = products;
  writeProductsCache_(products);
  return products;
}

function renderCartBadge() {
  const badge = document.querySelector('.nav-cart-badge');
  if (!badge) return;
  const count = cartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

async function renderCartDrawer() {
  const container = document.querySelector('.cart-drawer-items');
  const foot = document.querySelector('.cart-drawer-foot');
  if (!container) return;

  const cart = getCart();
  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    if (foot) foot.style.display = 'none';
    return;
  }
  if (foot) foot.style.display = 'block';

  const products = await loadProducts();
  let subtotal = 0;
  container.innerHTML = cart.map(line => {
    const p = products.find(p => p.id === line.id);
    if (!p) return '';
    const lineTotal = p.price * line.qty;
    subtotal += lineTotal;
    const idJs = escapeJsString(p.id);
    const variantArg = line.variant ? `, '${escapeJsString(line.variant)}'` : ', null';
    const maxQty = lineMaxQty(p, line.variant);
    const atMax = line.qty >= maxQty;
    return `
      <div class="cart-line">
        <div class="cart-line-thumb">${(() => { const img = lineImage(p, line.variant); return img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.brand)} ${escapeHtml(p.name)}">` : ''; })()}</div>
        <div class="cart-line-info">
          <div class="name">${escapeHtml(p.brand)} ${escapeHtml(p.name)}${line.variant ? ` — ${escapeHtml(line.variant)}` : ''}</div>
          <div class="meta">${escapeHtml(p.currency)}${p.price.toFixed(2)} each</div>
          <div class="cart-line-qty">
            <button onclick="setQty('${idJs}', ${line.qty - 1}${variantArg})">-</button>
            <span>${line.qty}</span>
            <button onclick="setQty('${idJs}', ${line.qty + 1}${variantArg}, ${maxQty})" ${atMax ? 'disabled title="Only ' + maxQty + ' in stock"' : ''}>+</button>
          </div>
        </div>
        <div class="cart-line-total">${escapeHtml(p.currency)}${lineTotal.toFixed(2)}</div>
      </div>`;
  }).join('');

  const subtotalEl = document.querySelector('.cart-subtotal .amount');
  if (subtotalEl) subtotalEl.textContent = `RM${subtotal.toFixed(2)}`;
}

function openCart() {
  document.querySelector('.cart-overlay')?.classList.add('open');
  document.querySelector('.cart-drawer')?.classList.add('open');
  renderCartDrawer();
}

function closeCart() {
  document.querySelector('.cart-overlay')?.classList.remove('open');
  document.querySelector('.cart-drawer')?.classList.remove('open');
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 1800);
}

document.addEventListener('DOMContentLoaded', () => {
  renderCartBadge();
  document.querySelector('.nav-cart')?.addEventListener('click', openCart);
  document.querySelector('.cart-overlay')?.addEventListener('click', closeCart);
  document.querySelector('.cart-close')?.addEventListener('click', closeCart);

  // Mobile nav — .nav-links is hidden below 720px (see style.css), so this
  // hamburger + dropdown panel is the only way phone visitors can reach
  // Shop/Services/Blog from anywhere but the homepage's own buttons.
  const hamburger = document.getElementById('nav-hamburger');
  const panel = document.getElementById('nav-mobile-panel');
  const navBar = document.querySelector('.nav');
  if (hamburger && panel && navBar) {
    // The panel is position:fixed (see style.css) so it floats over the
    // page instead of pushing content down when it opens — this just
    // aligns its top edge to sit right under the nav bar, recalculated
    // each time in case the nav's height ever shifts (font loading,
    // viewport resize/rotation).
    const positionPanel = () => { panel.style.top = `${navBar.getBoundingClientRect().bottom}px`; };
    hamburger.addEventListener('click', () => {
      positionPanel();
      const open = panel.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    window.addEventListener('resize', () => { if (panel.classList.contains('open')) positionPanel(); });
  }
});
