/** Drives the checkout flow on cart.html: collects customer details, submits
 * the order to a Google Apps Script Web App, and shows payment instructions
 * (DuitNow QR + bank transfer — Jun Min confirms payment manually against
 * his bank statement, there is no automated payment gateway). Depends on
 * cart.js for getCart/loadProducts/escapeHtml/showToast/CART_KEY.
 */

const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxS0Phx3Kem5VgXL5HnOHW4fSuUiR9Jr3kN3dA_N_FjvArdvp4Wx6DTp88cQ7vuA72o/exec';

// Fallback contact used when the order backend is unreachable (see
// showOrderFailedNotice below) — no country code punctuation, as required
// by wa.me links.
const WHATSAPP_NUMBER = '6044389878';

const PAYMENT_INFO = {
  qrImage: 'images/payment-qr.jpg', // DuitNow QR — N4 Camera x Alor Setar
  bankName: 'Maybank',
  accountNumber: '5572 2321 8483',
  accountHolder: 'N4 Camera Store (Retail) Sdn. Bhd.'
};

function showCheckoutError(message) {
  const el = document.getElementById('co-error');
  el.textContent = message;
  el.hidden = !message;
}

// Shown specifically when submitOrder() itself fails (the order backend is
// unreachable) — as opposed to a plain form-validation error, this gives
// the customer a way to still get their order through, with their cart
// pre-filled into the WhatsApp message so they don't have to retype it.
function showOrderFailedNotice(items, subtotal) {
  const lines = items.map(i => `${i.qty}x ${i.name}${i.variant ? ' (' + i.variant + ')' : ''}`).join('\n');
  const text = `Hi, I'd like to place an order — our online checkout isn't working right now:\n\n${lines}\n\nSubtotal: RM${subtotal.toFixed(2)}`;
  document.getElementById('co-whatsapp-link').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  document.getElementById('co-order-failed').hidden = false;
}

function hideOrderFailedNotice() {
  document.getElementById('co-order-failed').hidden = true;
}

// Admin-controlled kill-switch (see admin.html's "Checkout maintenance
// mode" toggle) — checked before every submission so Jun Min can force
// the WhatsApp fallback on/off himself, not just when a request actually
// fails. If the check itself fails, don't block checkout on it — fall
// through and let the real submission attempt (and its own error
// handling) decide.
async function checkoutMaintenanceMode() {
  try {
    const res = await fetch(`${PRODUCTS_ENDPOINT}?action=checkout-status`);
    const data = await res.json();
    return !!data.maintenanceMode;
  } catch (err) {
    return false;
  }
}

async function submitOrder(payload) {
  if (!ORDER_ENDPOINT) {
    // No backend configured yet — this is where the real submission will
    // POST once the Google Sheet + Apps Script Web App is set up.
    return { ok: true, demo: true };
  }
  if (await checkoutMaintenanceMode()) {
    throw new Error('Checkout is temporarily under maintenance.');
  }
  // Submitted over GET, not POST — real-world testing found POST requests
  // to this Apps Script deployment unreliable (a Google-side platform
  // issue) while GET has consistently routed and executed correctly, so
  // order-handler.gs's doGet is the one actually used (see its file
  // header). `items` is JSON-stringified into a single query param since
  // query strings are flat. cache: 'no-store' avoids the browser serving
  // a cached response for what's actually a write, not a read.
  const params = new URLSearchParams({
    action: 'submit-order',
    orderId: payload.orderId,
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    notes: payload.notes,
    submittedAt: payload.submittedAt,
    items: JSON.stringify(payload.items)
  });
  const res = await fetch(`${ORDER_ENDPOINT}?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not place order — please try again or contact us directly.');
  const result = await res.json();
  // order-handler.gs responds with HTTP 200 even when it caught an
  // internal error (e.g. the product catalog was temporarily unreachable)
  // — check its own ok field too, not just the HTTP status.
  if (result.ok === false) throw new Error(result.error || 'Could not place order — please try again or contact us directly.');
  return result;
}

function renderPaymentStep(orderId, subtotal) {
  document.getElementById('pay-order-id').textContent = orderId;
  document.getElementById('pay-amount').textContent = subtotal.toFixed(2);

  // Reset to the QR tab in case a previous order left the bank tab active.
  document.querySelectorAll('#payment-method-tabs .segmented-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#payment-method-tabs .segmented-btn[data-pay-panel="qr"]')?.classList.add('active');
  document.getElementById('pay-panel-qr').hidden = false;
  document.getElementById('pay-panel-bank').hidden = true;

  document.getElementById('payment-qr-box').innerHTML = PAYMENT_INFO.qrImage
    ? `<img src="${PAYMENT_INFO.qrImage}" alt="Payment QR code" style="display:block; width:100%;">`
    : '<div class="product-card-img" style="aspect-ratio:1;">QR code coming soon</div>';

  document.getElementById('pay-bank').textContent = PAYMENT_INFO.bankName || '—';
  document.getElementById('pay-account').textContent = PAYMENT_INFO.accountNumber || '—';
  document.getElementById('pay-holder').textContent = PAYMENT_INFO.accountHolder || '—';
}

function initCheckout() {
  const toDetailsBtn = document.getElementById('to-details-btn');
  const placeOrderBtn = document.getElementById('place-order-btn');
  if (!toDetailsBtn || !placeOrderBtn) return;

  toDetailsBtn.addEventListener('click', () => {
    document.getElementById('step-cart').style.display = 'none';
    document.getElementById('step-details').style.display = 'block';
  });

  document.getElementById('payment-method-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pay-panel]');
    if (!btn) return;
    document.querySelectorAll('#payment-method-tabs .segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('pay-panel-qr').hidden = btn.dataset.payPanel !== 'qr';
    document.getElementById('pay-panel-bank').hidden = btn.dataset.payPanel !== 'bank';
  });

  placeOrderBtn.addEventListener('click', async () => {
    showCheckoutError('');
    hideOrderFailedNotice();
    const name = document.getElementById('co-name').value.trim();
    const phone = document.getElementById('co-phone').value.trim();
    const email = document.getElementById('co-email').value.trim();
    const notes = document.getElementById('co-notes').value.trim();

    if (!name || !phone || !email) {
      showCheckoutError('Please fill in your name, phone number, and email.');
      return;
    }

    const cart = getCart();
    if (cart.length === 0) return;
    const products = await loadProducts();
    let subtotal = 0;
    const items = cart.map(line => {
      const p = products.find(p => p.id === line.id);
      if (!p) return null;
      subtotal += p.price * line.qty;
      // id is the authoritative field — the backend re-prices every order
      // from the live catalog by id, name/price here are only a fallback
      // for the "no backend configured" demo path.
      return { id: p.id, name: `${p.brand} ${p.name}`, variant: line.variant, qty: line.qty, price: p.price };
    }).filter(Boolean);

    const orderId = 'FL04-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const payload = {
      orderId,
      name,
      phone,
      email,
      notes,
      items,
      subtotal: subtotal.toFixed(2),
      submittedAt: new Date().toISOString()
    };

    placeOrderBtn.disabled = true;
    try {
      const result = await submitOrder(payload);
      localStorage.setItem(CART_KEY, '[]');
      renderCartBadge();
      document.getElementById('step-details').style.display = 'none';
      // The backend re-prices from the live catalog and is authoritative —
      // fall back to the locally computed subtotal only in the no-backend
      // demo path, where result.subtotal doesn't exist.
      renderPaymentStep(orderId, typeof result.subtotal === 'number' ? result.subtotal : subtotal);
      document.getElementById('step-payment').style.display = 'block';
      if (result.demo) showToast('Order placed (demo — not saved yet)');
    } catch (err) {
      showOrderFailedNotice(items, subtotal);
    } finally {
      placeOrderBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', initCheckout);
