/** Renders the product grid + filters on shop.html. Depends on cart.js. */

let __activeFilter = 'all';
let __activeSort = 'default';

function chipRow(p) {
  const chips = [p.iso && `ISO ${p.iso}`, p.format, p.type].filter(Boolean);
  return `<div class="chip-row">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>`;
}

function productCard(p) {
  const soldOut = p.stock !== 'in-stock';
  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  const action = hasVariants
    ? `<a href="product.html?id=${p.id}" class="btn btn-primary btn-sm">Choose colour</a>`
    : `<button class="btn btn-primary btn-sm" ${soldOut ? 'disabled' : ''}
        onclick="addToCart('${p.id}')">${soldOut ? 'Sold out' : 'Add to cart'}</button>`;
  return `
    <article class="product-card">
      <a href="product.html?id=${p.id}" class="product-card-img">
        ${p.image ? `<img src="${p.image}" alt="${p.brand} ${p.name}">` : 'photo coming soon'}
      </a>
      <div class="product-card-body">
        <span class="badge ${soldOut ? 'badge-sold-out' : 'badge-in-stock'}">${soldOut ? 'Sold out' : 'In stock'}</span>
        <div class="product-brand">${p.brand}</div>
        <a href="product.html?id=${p.id}"><h3 class="product-name">${p.name}</h3></a>
        <p class="product-tagline">${p.tagline}</p>
        ${chipRow(p)}
        <div class="product-card-footer">
          <span class="product-price">${p.currency}${p.price.toFixed(2)}</span>
          ${action}
        </div>
      </div>
    </article>`;
}

function applySort(products, sort) {
  const sorted = products.slice();
  if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
  else if (sort === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'name-desc') sorted.sort((a, b) => b.name.localeCompare(a.name));
  return sorted;
}

function applyFilter(products, filter) {
  if (filter === 'all') return products;
  if (filter === 'color') return products.filter(p => p.type === 'Color');
  if (filter === 'bw') return products.filter(p => p.type === 'B&W');
  if (filter === '135') return products.filter(p => p.format === '135');
  if (filter === '120') return products.filter(p => p.format === '120');
  if (filter === 'disposable') return products.filter(p => p.category === 'disposable');
  if (filter === 'camera') return products.filter(p => p.category === 'camera');
  return products;
}

async function renderShop() {
  const grid = document.querySelector('.product-grid');
  if (!grid) return;
  const products = await loadProducts();

  function draw() {
    const filtered = applyFilter(products, __activeFilter);
    const sorted = applySort(filtered, __activeSort);
    grid.innerHTML = sorted.map(productCard).join('') || '<p class="muted">No film stocks match this filter yet.</p>';
  }

  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      __activeFilter = btn.dataset.filter;
      draw();
    });
  });

  const sortSelect = document.querySelector('.sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      __activeSort = sortSelect.value;
      draw();
    });
  }

  draw();
}

document.addEventListener('DOMContentLoaded', renderShop);
