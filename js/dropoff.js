/** Drives the drop-off form on dropoff.html: segmented toggles, live receipt
 * preview, and submission. Depends on cart.js for showToast().
 *
 * Submissions go via GET to a Google Apps Script Web App
 * (apps-script/dropoff-handler.gs) bound to the "Filmlab04 Drop-offs" Google
 * Sheet — see that file's header for why GET instead of POST.
 */

const DROPOFF_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwFdyNWnPvZXSx_YATiTZiBRAhcLN8ovRxdSe7MHCSssXan4kPigYBICWbsUOQLyXfiGg/exec';

// Same bank details as checkout (js/checkout.js) — Jun Min confirms
// payment manually, no gateway.
const PAYMENT_INFO = {
  bankName: 'Maybank',
  accountNumber: '5572 2321 8483',
  accountHolder: 'N4 Camera Store (Retail) Sdn. Bhd.'
};
const WHATSAPP_NUMBER = '6044389878';

// Must match SERVICE_PRICES / HIGHRES_FEE in apps-script/dropoff-handler.gs
// — that copy is authoritative, this one is only for the live preview
// before submission and the no-backend demo path.
const SERVICE_PRICES = {
  'Develop and scan': 18,
  'Developing only': 13,
  'Cut film scanning only': 13
};
const HIGHRES_FEE = 10;

function estimateDropoffTotal(service, rolls, highResScan) {
  const n = Math.max(0, Math.floor(Number(rolls)) || 0);
  return (SERVICE_PRICES[service] || 0) * n + (highResScan ? HIGHRES_FEE * n : 0);
}

function formatDropoffDate(d) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// Phone country picker (flag/dial-code/search widget) lives in
// js/phone-picker.js, shared with cart.html's checkout form.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setSegmented(group, value) {
  group.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function getSegmentedValue(group) {
  const active = group.querySelector('.segmented-btn.active');
  return active ? active.dataset.value : '';
}

function updateStripsReturnVisibility() {
  const stripsGroup = document.querySelector('.segmented[data-field="keepStrips"]');
  const returnField = document.getElementById('strips-return-field');
  const returnGroup = document.querySelector('.segmented[data-field="stripsReturn"]');
  const keeping = getSegmentedValue(stripsGroup) === 'Yes, keep';
  returnField.hidden = !keeping;
  if (!keeping) setSegmented(returnGroup, '');
  updateStripsReturnNote();
}

function updateStripsReturnNote() {
  const returnGroup = document.querySelector('.segmented[data-field="stripsReturn"]');
  document.getElementById('strips-return-note').hidden = getSegmentedValue(returnGroup) !== 'Mail / Courier';
}

function updateCourierFieldVisibility() {
  const methodGroup = document.querySelector('.segmented[data-field="method"]');
  const courierField = document.getElementById('courier-field');
  const isCourier = getSegmentedValue(methodGroup) === 'Mail / Courier';
  courierField.hidden = !isCourier;
  if (!isCourier) {
    document.getElementById('d-courier').value = '';
    document.getElementById('d-courier-other').value = '';
    document.getElementById('d-courier-other').hidden = true;
    document.getElementById('d-tracking').value = '';
  }
}

function updateCourierOtherVisibility() {
  const isOther = document.getElementById('d-courier').value === 'Other';
  document.getElementById('d-courier-other').hidden = !isOther;
}

function courierProviderValue() {
  const select = document.getElementById('d-courier');
  return select.value === 'Other' ? document.getElementById('d-courier-other').value.trim() : select.value;
}

function updatePreview() {
  document.getElementById('p-date').textContent = formatDropoffDate(new Date());
  document.getElementById('p-name').textContent = document.getElementById('d-name').value.trim() || '…';
  document.getElementById('p-phone').textContent = (phonePickerDialCode() + ' ' + document.getElementById('d-phone').value.trim()).trim();
  document.getElementById('p-email').textContent = document.getElementById('d-email').value.trim() || '…';

  const methodGroup = document.querySelector('.segmented[data-field="method"]');
  const paymentGroup = document.querySelector('.segmented[data-field="payment"]');
  const stripsGroup = document.querySelector('.segmented[data-field="keepStrips"]');

  document.getElementById('p-method').textContent = getSegmentedValue(methodGroup) || '—';

  const isCourier = getSegmentedValue(methodGroup) === 'Mail / Courier';
  document.getElementById('p-courier-row').hidden = !isCourier;
  document.getElementById('p-tracking-row').hidden = !isCourier;
  if (isCourier) {
    document.getElementById('p-courier').textContent = courierProviderValue() || '…';
    document.getElementById('p-tracking').textContent = document.getElementById('d-tracking').value.trim() || '…';
  }

  document.getElementById('p-rolls').textContent = document.getElementById('d-rolls').value || '1';
  document.getElementById('p-service').textContent = document.getElementById('d-service').value;
  document.getElementById('p-highres-row').hidden = !document.getElementById('d-highres').checked;
  document.getElementById('p-payment').textContent = getSegmentedValue(paymentGroup) || 'Pending';
  document.getElementById('p-strips').textContent = getSegmentedValue(stripsGroup) || 'Select…';

  const keeping = getSegmentedValue(stripsGroup) === 'Yes, keep';
  document.getElementById('p-strips-return-row').hidden = !keeping;
  if (keeping) {
    const returnGroup = document.querySelector('.segmented[data-field="stripsReturn"]');
    document.getElementById('p-strips-return').textContent = getSegmentedValue(returnGroup) || 'Select…';
  }
}

function showDropoffError(message) {
  const el = document.getElementById('d-error');
  el.textContent = message;
  el.hidden = !message;
}

async function submitDropoff(payload) {
  if (!DROPOFF_ENDPOINT) {
    // No backend configured yet — this is where the real submission will
    // POST once the Google Sheet + Apps Script Web App is set up.
    return { ok: true, demo: true, subtotal: estimateDropoffTotal(payload.service, payload.rolls, payload.highResScan) };
  }
  // Submitted over GET, not POST — same reason as checkout.js/order-handler.gs:
  // POST requests to this Apps Script deployment have been unreliable (a
  // Google-side platform issue), GET has consistently worked.
  // cache: 'no-store' avoids the browser serving a cached response for
  // what's actually a write, not a read.
  const params = new URLSearchParams({
    action: 'submit-dropoff',
    submittedAt: payload.submittedAt,
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    method: payload.method,
    courierProvider: payload.courierProvider,
    trackingNumber: payload.trackingNumber,
    rolls: payload.rolls,
    service: payload.service,
    highResScan: payload.highResScan ? 'true' : 'false',
    payment: payload.payment,
    keepStrips: payload.keepStrips,
    stripsReturn: payload.stripsReturn,
    reference: payload.reference,
    notes: payload.notes
  });
  const res = await fetch(`${DROPOFF_ENDPOINT}?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not submit — please try again or contact us directly.');
  const result = await res.json();
  // recordDropoff_ responds with HTTP 200 even when it caught an internal
  // error — check its own ok field too, not just the HTTP status.
  if (result.ok === false) throw new Error(result.error || 'Could not submit — please try again or contact us directly.');
  return result;
}

function initDropoff() {
  const form = document.getElementById('dropoff-form');
  if (!form) return;

  initPhonePicker('d-phone-country', updatePreview);

  document.querySelectorAll('.segmented').forEach(group => {
    group.querySelectorAll('.segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setSegmented(group, btn.dataset.value);
        if (group.dataset.field === 'keepStrips') updateStripsReturnVisibility();
        if (group.dataset.field === 'stripsReturn') updateStripsReturnNote();
        if (group.dataset.field === 'method') updateCourierFieldVisibility();
        updatePreview();
      });
    });
  });

  document.getElementById('d-courier').addEventListener('change', () => {
    updateCourierOtherVisibility();
    updatePreview();
  });

  const rollsInput = document.getElementById('d-rolls');
  rollsInput.addEventListener('input', () => {
    if (rollsInput.value !== '' && Number(rollsInput.value) < 1) rollsInput.value = '1';
  });

  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', updatePreview);
  });

  updatePreview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showDropoffError('');

    const methodGroup = document.querySelector('.segmented[data-field="method"]');
    const paymentGroup = document.querySelector('.segmented[data-field="payment"]');
    const stripsGroup = document.querySelector('.segmented[data-field="keepStrips"]');
    const stripsReturnGroup = document.querySelector('.segmented[data-field="stripsReturn"]');

    const payload = {
      name: document.getElementById('d-name').value.trim(),
      phone: phonePickerFullNumber('d-phone'),
      email: document.getElementById('d-email').value.trim(),
      method: getSegmentedValue(methodGroup),
      rolls: Number(document.getElementById('d-rolls').value),
      service: document.getElementById('d-service').value,
      highResScan: document.getElementById('d-highres').checked,
      courierProvider: getSegmentedValue(methodGroup) === 'Mail / Courier' ? courierProviderValue() : '',
      trackingNumber: getSegmentedValue(methodGroup) === 'Mail / Courier' ? document.getElementById('d-tracking').value.trim() : '',
      payment: getSegmentedValue(paymentGroup),
      keepStrips: getSegmentedValue(stripsGroup),
      stripsReturn: getSegmentedValue(stripsGroup) === 'Yes, keep' ? getSegmentedValue(stripsReturnGroup) : '',
      reference: document.getElementById('d-ref').value.trim(),
      notes: document.getElementById('d-notes').value.trim(),
      submittedAt: new Date().toISOString()
    };

    if (!payload.name || !payload.phone.length || !payload.email) {
      showDropoffError('Please fill in your name, phone number, and email.');
      return;
    }
    // Loose on purpose — just needs an "@", not full RFC validation.
    if (!payload.email.includes('@')) {
      showDropoffError('Please enter a valid email address.');
      return;
    }
    if (payload.method === 'Mail / Courier' && !payload.courierProvider) {
      showDropoffError('Please choose or enter your courier provider.');
      return;
    }
    if (payload.method === 'Mail / Courier' && !payload.trackingNumber) {
      showDropoffError('Please enter your tracking number.');
      return;
    }
    if (!payload.payment) {
      showDropoffError('Please choose when you’ll pay.');
      return;
    }
    if (!payload.keepStrips) {
      showDropoffError('Please let us know whether to keep the film strips.');
      return;
    }
    if (payload.keepStrips === 'Yes, keep' && !payload.stripsReturn) {
      showDropoffError('Please let us know how you’d like to get your film strips back.');
      return;
    }
    if (!document.getElementById('d-agree').checked) {
      showDropoffError('Please confirm the details are accurate before submitting.');
      return;
    }

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    try {
      const result = await submitDropoff(payload);
      const payNow = payload.payment === 'Pay now';

      form.reset();
      setSegmented(methodGroup, 'Walk-in');
      setSegmented(paymentGroup, '');
      setSegmented(stripsGroup, '');
      updateStripsReturnVisibility();
      updateCourierFieldVisibility();
      __phonePickerCountry = COUNTRY_CODES[0];
      renderPhonePickerTrigger();
      updatePreview();

      if (payNow) {
        // Take the customer straight to payment instead of just a toast —
        // same "amount due + bank details + WhatsApp receipt" pattern as
        // cart.html's checkout payment step.
        const subtotal = typeof result.subtotal === 'number'
          ? result.subtotal
          : estimateDropoffTotal(payload.service, payload.rolls, payload.highResScan);
        document.getElementById('dp-amount').textContent = subtotal.toFixed(2);
        document.getElementById('dp-bank').textContent = PAYMENT_INFO.bankName || '—';
        document.getElementById('dp-account').textContent = PAYMENT_INFO.accountNumber || '—';
        document.getElementById('dp-holder').textContent = PAYMENT_INFO.accountHolder || '—';
        const text = `Hi, here's my payment receipt for my film drop-off (${payload.rolls}x roll, ${payload.service}) — RM${subtotal.toFixed(2)}.`;
        document.getElementById('dp-whatsapp-link').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
        form.hidden = true;
        document.getElementById('dropoff-payment-step').hidden = false;
        window.scrollTo({ top: document.getElementById('dropoff-payment-step').offsetTop - 24, behavior: 'smooth' });
      } else {
        showToast(result.demo ? 'Submitted (demo — not saved yet)' : 'Drop-off submitted!');
      }
    } catch (err) {
      showDropoffError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', initDropoff);
