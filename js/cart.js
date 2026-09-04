/**
 * filmlab04 cart — cart state lives in localStorage. The actual checkout
 * flow (customer details, order submission, payment instructions) is in
 * js/checkout.js.
 */

const CART_KEY = 'filmlab04_cart';

// Product catalog now lives in the "Filmlab04 Products" Google Sheet, read
// through this Apps Script Web App (see apps-script/admin-api.gs) so stock
// changes made in admin.html go live instantly, no git push needed.
const PRODUCTS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyEuFDv68Pf5WUBqOYNPqiOL4BNgFyMsGCN2fXEgp7zTSh4MedmswBra5FYs1nD7W_c1Q/exec';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeJsString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

function addToCart(productId, qty = 1, variant = null) {
  const cart = getCart();
  const line = cart.find(l => l.id === productId && (l.variant || null) === (variant || null));
  if (line) {
    line.qty += qty;
  } else {
    cart.push({ id: productId, variant: variant || null, qty });
  }
  saveCart(cart);
  showToast('Added to cart');
}

function removeFromCart(productId, variant = null) {
  saveCart(getCart().filter(l => !(l.id === productId && (l.variant || null) === (variant || null))));
  renderCartDrawer();
}

function setQty(productId, qty, variant = null) {
  const cart = getCart();
  const line = cart.find(l => l.id === productId && (l.variant || null) === (variant || null));
  if (!line) return;
  if (qty <= 0) {
    removeFromCart(productId, variant);
    return;
  }
  line.qty = qty;
  saveCart(cart);
  renderCartDrawer();
}

function cartCount(cart = getCart()) {
  return cart.reduce((sum, l) => sum + l.qty, 0);
}

async function loadProducts() {
  if (window.__filmlab04Products) return window.__filmlab04Products;
  const res = await fetch(PRODUCTS_ENDPOINT ? `${PRODUCTS_ENDPOINT}?action=products` : 'data/products.json');
  window.__filmlab04Products = await res.json();
  return window.__filmlab04Products;
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
    return `
      <div class="cart-line">
        <div class="cart-line-thumb"></div>
        <div class="cart-line-info">
          <div class="name">${escapeHtml(p.brand)} ${escapeHtml(p.name)}${line.variant ? ` — ${escapeHtml(line.variant)}` : ''}</div>
          <div class="meta">${escapeHtml(p.currency)}${p.price.toFixed(2)} each</div>
          <div class="cart-line-qty">
            <button onclick="setQty('${idJs}', ${line.qty - 1}${variantArg})">-</button>
            <span>${line.qty}</span>
            <button onclick="setQty('${idJs}', ${line.qty + 1}${variantArg})">+</button>
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
});
