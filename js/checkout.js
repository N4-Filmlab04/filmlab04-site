/** Drives the checkout flow on cart.html: collects customer details, submits
 * the order to a Google Apps Script Web App, and shows payment instructions
 * (bank transfer — Jun Min confirms payment manually against his bank
 * statement, there is no automated payment gateway). Depends on cart.js for
 * getCart/loadProducts/escapeHtml/showToast/CART_KEY.
 */

const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxS0Phx3Kem5VgXL5HnOHW4fSuUiR9Jr3kN3dA_N_FjvArdvp4Wx6DTp88cQ7vuA72o/exec';

// Fallback contact used when the order backend is unreachable (see
// showOrderFailedNotice below) — no country code punctuation, as required
// by wa.me links.
const WHATSAPP_NUMBER = '6044389878';

// Flat delivery fee added when the customer chooses "Ship to my address"
// instead of self-pickup. Must match DELIVERY_FEE in order-handler.gs —
// the server is the authoritative source (it re-prices every order from
// the live catalog and never trusts the client), this local copy is only
// used for the WhatsApp fallback text and the no-backend demo path.
const DELIVERY_FEE = 12;

// QR payment (DuitNow) is disabled for now — bank transfer only until Jun
// Min is ready to bring the QR option back.
const PAYMENT_INFO = {
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
function showOrderFailedNotice(items, subtotal, deliveryMethod, address, name, phone, email) {
  const isDelivery = deliveryMethod === 'Delivery';
  const lines = items.map((i, idx) =>
    `${idx + 1}. ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} @ RM${i.price.toFixed(2)} x${i.qty}`
  ).join('\n') + (isDelivery ? `\nDelivery fee: RM${DELIVERY_FEE.toFixed(2)}` : '');
  const deliveryLine = isDelivery ? `\n\nDeliver to: ${address}` : '\n\nSelf-pickup at store';
  const contactLine = `\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}`;
  const text = `Hi, I'd like to place an order — our online checkout isn't working right now:\n\n${lines}\n\nSubtotal: RM${subtotal.toFixed(2)}${deliveryLine}${contactLine}`;
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

  // Apps Script /exec endpoints are slow (redirect hop + occasional cold
  // start), so the maintenance check and the actual submission are fired
  // together instead of one after another — that was doubling the wait
  // before the payment step could show. The submission request goes out
  // right away; if the maintenance check comes back true we just ignore
  // its result and show the WhatsApp fallback (worst case the order still
  // gets recorded in the background during a maintenance window, which is
  // harmless — better than losing it).
  //
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
    deliveryMethod: payload.deliveryMethod,
    address: payload.address,
    submittedAt: payload.submittedAt,
    items: JSON.stringify(payload.items)
  });
  const submissionPromise = fetch(`${ORDER_ENDPOINT}?${params.toString()}`, { cache: 'no-store' })
    .then(async res => {
      if (!res.ok) throw new Error('Could not place order — please try again or contact us directly.');
      const result = await res.json();
      // order-handler.gs responds with HTTP 200 even when it caught an
      // internal error (e.g. the product catalog was temporarily
      // unreachable) — check its own ok field too, not just the HTTP status.
      if (result.ok === false) throw new Error(result.error || 'Could not place order — please try again or contact us directly.');
      return result;
    });
  const maintenancePromise = checkoutMaintenanceMode();

  if (await maintenancePromise) {
    submissionPromise.catch(() => {}); // don't leave an unhandled rejection
    throw new Error('Checkout is temporarily under maintenance.');
  }
  return submissionPromise;
}

function renderPaymentStep(orderId, subtotal, deliveryMethod, items, itemsText) {
  document.getElementById('pay-order-id').textContent = orderId;
  document.getElementById('pay-amount').textContent = subtotal.toFixed(2);

  const feeNote = document.getElementById('pay-delivery-note');
  if (feeNote) feeNote.hidden = deliveryMethod !== 'Delivery';

  document.getElementById('pay-bank').textContent = PAYMENT_INFO.bankName || '—';
  document.getElementById('pay-account').textContent = PAYMENT_INFO.accountNumber || '—';
  document.getElementById('pay-holder').textContent = PAYMENT_INFO.accountHolder || '—';

  // Pre-fill the order ID so customers don't have to copy/retype it.
  const trackLink = document.getElementById('pay-track-link');
  if (trackLink) trackLink.href = `track-order.html?id=${encodeURIComponent(orderId)}`;

  // wa.me links can't attach an image, so this just opens the chat with
  // the order details pre-filled — the customer still has to attach the
  // payment screenshot themselves once WhatsApp opens.
  const waLink = document.getElementById('pay-whatsapp-link');
  if (waLink) {
    // Prefer the server's itemsText — it's what actually got charged and
    // recorded (quantities clamped to real stock, "[OUT OF STOCK]" /
    // "[only N in stock]" notes included), so it always matches the total
    // above it. Rebuilding this from the client's original cart `items`
    // instead would show what the customer asked for, not what they were
    // actually charged for — those can differ when stock ran out between
    // adding to cart and checkout, and showing mismatched numbers next to
    // the real total looks like a pricing bug. Only falls back to `items`
    // in the no-backend demo path, where the server never priced anything.
    const itemsLines = itemsText || (items || []).map((i, idx) =>
      `${idx + 1}. ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} @ RM${i.price.toFixed(2)} x${i.qty}`
    ).join('\n');
    const text = `Hi, here's my payment receipt for order ${orderId}:\n${itemsLines}\n\nTotal: RM${subtotal.toFixed(2)}`;
    waLink.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }
}

function initCheckout() {
  const toDetailsBtn = document.getElementById('to-details-btn');
  const placeOrderBtn = document.getElementById('place-order-btn');
  if (!toDetailsBtn || !placeOrderBtn) return;

  toDetailsBtn.addEventListener('click', () => {
    document.getElementById('step-cart').style.display = 'none';
    document.getElementById('step-details').style.display = 'block';
  });

  // Flag + dial-code + national-number widget shared with services.html's
  // drop-off form — see js/phone-picker.js.
  initPhonePicker('co-phone-country');

  // Delivery vs self-pickup — same segmented-control pattern used on
  // services.html's drop-off form.
  const deliveryGroup = document.querySelector('.segmented[data-field="delivery"]');
  const addressField = document.getElementById('co-address-field');
  deliveryGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    deliveryGroup.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isDelivery = btn.dataset.value === 'Delivery';
    addressField.hidden = !isDelivery;
    if (!isDelivery) document.getElementById('co-address').value = '';
  });

  placeOrderBtn.addEventListener('click', async () => {
    showCheckoutError('');
    hideOrderFailedNotice();
    const name = document.getElementById('co-name').value.trim();
    const phone = phonePickerFullNumber('co-phone');
    const email = document.getElementById('co-email').value.trim();
    const notes = document.getElementById('co-notes').value.trim();
    const deliveryMethod = deliveryGroup?.querySelector('.segmented-btn.active')?.dataset.value || 'Self-pickup';
    const address = document.getElementById('co-address').value.trim();

    if (!name || !phone || !email) {
      showCheckoutError('Please fill in your name, phone number, and email.');
      return;
    }
    // Loose on purpose — just needs an "@", not full RFC validation.
    if (!email.includes('@')) {
      showCheckoutError('Please enter a valid email address.');
      return;
    }
    if (deliveryMethod === 'Delivery' && !address) {
      showCheckoutError('Please enter your delivery address, or switch to self-pickup.');
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
    if (deliveryMethod === 'Delivery') subtotal += DELIVERY_FEE;

    // A placeholder only — the real, sequential tracking number
    // (FL04-000000, FL04-000001, ...) is assigned server-side in
    // order-handler.gs and used instead once the order succeeds. This
    // local one only shows up in the WhatsApp fallback text if the
    // backend never actually recorded the order.
    const orderId = 'FL04-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const payload = {
      orderId,
      name,
      phone,
      email,
      notes,
      deliveryMethod,
      address: deliveryMethod === 'Delivery' ? address : '',
      items,
      subtotal: subtotal.toFixed(2),
      submittedAt: new Date().toISOString()
    };

    // The Apps Script backend can take several seconds to respond (it's a
    // Google-side quirk, not something we control), so swap the button
    // label to something that changed on click — otherwise a disabled
    // button with unchanged text reads as "did nothing happened".
    const originalLabel = placeOrderBtn.textContent;
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = 'Placing order…';
    try {
      const result = await submitOrder(payload);
      localStorage.setItem(CART_KEY, '[]');
      renderCartBadge();
      document.getElementById('step-details').style.display = 'none';
      // The backend assigns the real sequential order/tracking number and
      // re-prices from the live catalog — both are authoritative. Fall
      // back to the locally generated ones only in the no-backend demo
      // path, where result.orderId/subtotal don't exist.
      renderPaymentStep(result.orderId || orderId, typeof result.subtotal === 'number' ? result.subtotal : subtotal, deliveryMethod, items, result.itemsText);
      document.getElementById('step-payment').style.display = 'block';
      if (result.demo) showToast('Order placed (demo — not saved yet)');
    } catch (err) {
      showOrderFailedNotice(items, subtotal, deliveryMethod, address, name, phone, email);
    } finally {
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = originalLabel;
    }
  });
}

document.addEventListener('DOMContentLoaded', initCheckout);
