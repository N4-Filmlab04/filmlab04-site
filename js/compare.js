/** Renders the film-stock comparison picker + table on compare.html. Depends on cart.js. */

const COMPARE_MAX = 4;
const COMPARE_KEY = 'filmlab04_compare';
let __compareSelected = [];

function loadCompareSelection() {
  try {
    return JSON.parse(localStorage.getItem(COMPARE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCompareSelection() {
  localStorage.setItem(COMPARE_KEY, JSON.stringify(__compareSelected));
}

function comparePill(p, checked) {
  return `
    <label class="compare-pill ${checked ? 'active' : ''}">
      <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''}>
      ${p.brand} ${p.name}
    </label>`;
}

function compareRow(label, cells) {
  return `<tr><th>${label}</th>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
}

function renderCompareTable(products) {
  const wrap = document.querySelector('.compare-table-wrap');
  if (products.length < 2) {
    wrap.innerHTML = '<p class="muted">Pick at least two film stocks to compare.</p>';
    return;
  }
  const heads = products.map(p => `<th>${p.brand}<br>${p.name}</th>`).join('');
  const rows = [
    compareRow('Type', products.map(p => p.type)),
    compareRow('ISO', products.map(p => p.iso)),
    compareRow('Format', products.map(p => p.format)),
    compareRow('Shots', products.map(p => p.shots ?? '—')),
    compareRow('Price', products.map(p => `${p.currency}${p.price.toFixed(2)}`)),
    compareRow('Look', products.map(p => p.description)),
  ].join('');
  wrap.innerHTML = `
    <div class="compare-table-scroll">
      <table class="compare-table">
        <thead><tr><th></th>${heads}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function renderCompare() {
  const pickerEl = document.querySelector('.compare-picker');
  if (!pickerEl) return;
  const allProducts = await loadProducts();
  const comparable = allProducts.filter(p => p.iso);

  const saved = loadCompareSelection().filter(id => comparable.some(p => p.id === id));
  __compareSelected = saved.length > 0 ? saved : comparable.slice(0, 3).map(p => p.id);

  function draw() {
    pickerEl.innerHTML = comparable
      .map(p => comparePill(p, __compareSelected.includes(p.id)))
      .join('');
    const selectedProducts = comparable.filter(p => __compareSelected.includes(p.id));
    renderCompareTable(selectedProducts);

    pickerEl.querySelectorAll('input[type=checkbox]').forEach(box => {
      box.addEventListener('change', () => {
        if (box.checked) {
          if (__compareSelected.length >= COMPARE_MAX) {
            box.checked = false;
            return;
          }
          __compareSelected.push(box.value);
        } else {
          __compareSelected = __compareSelected.filter(id => id !== box.value);
        }
        saveCompareSelection();
        draw();
      });
    });
  }

  draw();
}

document.addEventListener('DOMContentLoaded', renderCompare);
