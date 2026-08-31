/** Drives the checkout flow on cart.html: collects customer details, submits
 * the order to a Google Apps Script Web App, and shows payment instructions
 * (DuitNow QR + bank transfer — Jun Min confirms payment manually against
 * his bank statement, there is no automated payment gateway). Depends on
 * cart.js for getCart/loadProducts/escapeHtml/showToast/CART_KEY.
 */

const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbybjY0Tk13wPQ8T5aKDWz-xpEQpf_7OATxhBEwdjS404sXHUrXMXhCA1WcAgkWhKJiG_A/exec';

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

async function submitOrder(payload) {
  if (!ORDER_ENDPOINT) {
    // No backend configured yet — this is where the real submission will
    // POST once the Google Sheet + Apps Script Web App is set up.
    return { ok: true, demo: true };
  }
  const res = await fetch(ORDER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Could not place order — please try again or contact us directly.');
  return res.json();
}

function renderPaymentStep(orderId, subtotal) {
  document.getElementById('pay-order-id').textContent = orderId;
  document.getElementById('pay-amount').textContent = subtotal.toFixed(2);

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

  placeOrderBtn.addEventListener('click', async () => {
    showCheckoutError('');
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
      return { name: `${p.brand} ${p.name}`, variant: line.variant, qty: line.qty, price: p.price };
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
      renderPaymentStep(orderId, subtotal);
      document.getElementById('step-payment').style.display = 'block';
      if (result.demo) showToast('Order placed (demo — not saved yet)');
    } catch (err) {
      showCheckoutError(err.message);
    } finally {
      placeOrderBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', initCheckout);
