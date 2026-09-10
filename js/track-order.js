/** Customer-facing order status lookup on track-order.html. Order ID is the
 * only credential — see getOrderStatus_() in apps-script/admin-api.gs,
 * which deliberately returns nothing more sensitive than the order itself
 * (no phone/email). Depends on cart.js for escapeHtml() and the shared
 * PRODUCTS_ENDPOINT (same Apps Script deployment as admin-api.gs, just a
 * different ?action=). */

function showTrackOrderError(message) {
  const el = document.getElementById('to-error');
  el.textContent = message;
  el.hidden = !message;
}

function formatOrderDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value || '—');
  return d.toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderOrderResult(order) {
  const result = document.getElementById('to-result');
  if (!order.found) {
    result.innerHTML = `<p class="admin-error">No order found with that ID. Double-check it and try again, or contact us on WhatsApp.</p>`;
    result.hidden = false;
    return;
  }
  const paid = order.paymentStatus === 'Paid';
  result.innerHTML = `
    <div class="notice" style="text-align:left;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <strong>${escapeHtml(order.orderId)}</strong>
        <span class="badge ${paid ? 'badge-in-stock' : 'badge-pending'}">${escapeHtml(order.paymentStatus || 'Pending')}</span>
      </div>
      <p style="margin-top:8px;">${escapeHtml(formatOrderDate(order.submittedAt))}</p>
      <p style="margin-top:8px;">${escapeHtml(order.items)}</p>
      <p style="margin-top:8px; font-weight:600;">RM${Number(order.subtotal).toFixed(2)}</p>
    </div>`;
  result.hidden = false;
}

async function checkOrderStatus() {
  const orderId = document.getElementById('to-order-id').value.trim();
  showTrackOrderError('');
  document.getElementById('to-result').hidden = true;
  if (!orderId) {
    showTrackOrderError('Please enter your order ID.');
    return;
  }
  const btn = document.getElementById('to-search-btn');
  btn.disabled = true;
  try {
    const res = await fetch(`${PRODUCTS_ENDPOINT}?action=order-status&orderId=${encodeURIComponent(orderId)}`);
    const order = await res.json();
    renderOrderResult(order);
  } catch (err) {
    showTrackOrderError('Could not check your order right now — please try again or contact us on WhatsApp.');
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('to-search-btn').addEventListener('click', checkOrderStatus);
  document.getElementById('to-order-id').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkOrderStatus();
  });
});
