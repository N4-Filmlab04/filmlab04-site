/** Renders a single product detail on product.html?id=... Depends on cart.js. */

let __selectedVariant = null;

async function renderProduct() {
  const root = document.querySelector('.product-detail');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const products = await loadProducts();
  const p = products.find(p => p.id === id);

  if (!p) {
    root.innerHTML = '<p>Product not found. <a href="shop.html">Back to shop</a></p>';
    return;
  }

  document.title = `${p.brand} ${p.name} — Filmlab04`;

  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  if (hasVariants && !__selectedVariant) {
    __selectedVariant = p.variants.find(v => v.stock === 'in-stock') || p.variants[0];
  }

  const image = hasVariants ? __selectedVariant.image : p.image;
  // p.stock is a master switch: marking the whole product sold out overrides
  // any individual colour's own stock status.
  const masterSoldOut = p.stock !== 'in-stock';
  const soldOut = masterSoldOut || (hasVariants && __selectedVariant.stock !== 'in-stock');

  root.innerHTML = `
    <div class="grid-2">
      <div class="product-card-img" style="border-radius:16px; aspect-ratio: 4/5;">
        ${image ? `<img src="${image}" alt="${p.brand} ${p.name}">` : 'photo coming soon'}
      </div>
      <div>
        <span class="badge ${soldOut ? 'badge-sold-out' : 'badge-in-stock'}">${soldOut ? 'Sold out' : 'In stock'}</span>
        <div class="product-brand">${p.brand}</div>
        <h1>${p.name}</h1>
        <p class="product-tagline">${p.tagline}</p>
        <div class="chip-row">
          ${[
            p.iso && `<span class="chip">ISO ${p.iso}</span>`,
            p.format && `<span class="chip">${p.format} format</span>`,
            p.type && `<span class="chip">${p.type}</span>`,
            p.shots && `<span class="chip">${p.shots} exposures</span>`
          ].filter(Boolean).join('')}
        </div>
        ${hasVariants ? `
        <div class="variant-picker">
          <div class="variant-label">Colour: <strong>${__selectedVariant.color}</strong></div>
          <div class="variant-options">
            ${p.variants.map(v => `
              <button class="variant-option ${v.color === __selectedVariant.color ? 'active' : ''}"
                ${masterSoldOut || v.stock !== 'in-stock' ? 'disabled' : ''}
                onclick="selectVariant('${p.id}', '${v.color}')">${v.color}</button>`).join('')}
          </div>
        </div>` : ''}
        <p>${p.description}</p>
        <div style="display:flex; align-items:center; gap:16px; margin: 24px 0;">
          <span class="product-price" style="font-size:1.5rem;">${p.currency}${p.price.toFixed(2)}</span>
          <button class="btn btn-primary" ${soldOut ? 'disabled' : ''}
            onclick="addToCart('${p.id}', 1, ${hasVariants ? `'${__selectedVariant.color}'` : 'null'}); openCart();">${soldOut ? 'Sold out' : 'Add to cart'}</button>
        </div>
      </div>
    </div>
    ${p.about || (p.features && p.features.length) ? `
    <div class="section">
      <h2>About ${p.name}</h2>
      ${p.about ? `<p>${p.about}</p>` : ''}
      ${p.features && p.features.length ? `
      <div class="product-grid">
        ${p.features.map(f => `
          <div>
            ${f.image ? `<div class="product-card-img" style="border-radius:16px; aspect-ratio: 4/5; margin-bottom: var(--space-3);"><img src="${f.image}" alt="${f.title}"></div>` : ''}
            <h3>${f.title}</h3>
            <p>${f.text}</p>
          </div>`).join('')}
      </div>` : ''}
    </div>` : ''}
    <div class="section">
      <h2>Sample shots on ${p.name}</h2>
      ${p.sampleImages && p.sampleImages.length
        ? `<div class="product-grid">${p.sampleImages.map(src => `<div class="product-card-img"><img src="${src}" alt="Sample shot on ${p.name}"></div>`).join('')}</div>`
        : '<p class="muted">Sample shots coming soon.</p>'}
    </div>`;
}

function selectVariant(productId, color) {
  const products = window.__filmlab04Products || [];
  const p = products.find(p => p.id === productId);
  if (!p || !Array.isArray(p.variants)) return;
  __selectedVariant = p.variants.find(v => v.color === color) || __selectedVariant;
  renderProduct();
}

document.addEventListener('DOMContentLoaded', () => {
  __selectedVariant = null;
  renderProduct();
});
