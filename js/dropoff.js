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

// Must match SERVICE_PRICES / HIGHRES_FEE / OUTLET_FEE in
// apps-script/dropoff-handler.gs — that copy is authoritative, this one is
// only for the live preview before submission and the no-backend demo path.
const SERVICE_PRICES = {
  'Develop and scan': 18,
  'Developing only': 13,
  'Cut film scanning only': 13
};
const HIGHRES_FEE = 10;
// Flat fee (not per roll) for Nearby outlet drop-offs, covering the
// outlet forwarding the film to us instead of the customer mailing it
// themselves or walking it in directly.
const OUTLET_FEE = 12;

// N4 Camera Store outlets customers can drop film at instead of mailing it
// or walking into the lab directly. N4-07 (Alor Setar — Aman Central) is a
// separate outlet and IS listed here; the one deliberately left out is
// N4-15 (Alor Setar — Pekan Melayu), which is the lab's own Walk-in
// location and already covered by the "Walk-in" option — don't confuse
// the two, they're both in Alor Setar but different outlets. Source: N4's
// outlet list (2026-09-29).
const DROPOFF_OUTLETS = [
  'N4-01 · Seberang Jaya, Penang — Lotus\'s Seberang Jaya (1st floor)',
  'N4-05 · Sungai Petani, Kedah — Aman Jaya Mall (1st floor)',
  'N4-06 · Seri Manjung, Perak — AEON Mall Seri Manjung (1st floor)',
  'N4-07 · Alor Setar, Kedah — Aman Central (2nd floor)',
  'N4-08 · Kota Bharu, Kelantan — AEON Mall Kota Bharu (2nd floor)',
  'N4-09 · Bayan Lepas, Penang — Queensbay Mall (LG floor)',
  'N4-10 · Bayan Lepas, Penang — Queensbay Mall (3rd floor)',
  'N4-11 · Ipoh, Perak — AEON Mall Kinta City (1st floor)',
  'N4-12 · Perai, Penang — Sunway Carnival Mall (2nd floor)',
  'N4-13 · Petaling Jaya, Selangor — JioSpace',
  'N4-14 · Kuala Lumpur — MyTOWN Shopping Centre (3rd floor)',
  'N4-16 · Ipoh, Perak — Jalan Niaga Simee',
  'N4-17 · Shah Alam, Selangor — Central i-City'
];

function estimateDropoffTotal(service, rolls, highResScan, method) {
  const n = Math.max(0, Math.floor(Number(rolls)) || 0);
  const outletFee = method === 'Nearby outlet' ? OUTLET_FEE : 0;
  return (SERVICE_PRICES[service] || 0) * n + (highResScan ? HIGHRES_FEE * n : 0) + outletFee;
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
  const method = getSegmentedValue(methodGroup);

  const courierField = document.getElementById('courier-field');
  const isCourier = method === 'Mail / Courier';
  courierField.hidden = !isCourier;
  if (!isCourier) {
    document.getElementById('d-courier').value = '';
    document.getElementById('d-courier-other').value = '';
    document.getElementById('d-courier-other').hidden = true;
    document.getElementById('d-tracking').value = '';
  }

  const outletField = document.getElementById('outlet-field');
  const isOutlet = method === 'Nearby outlet';
  outletField.hidden = !isOutlet;
  if (!isOutlet) {
    document.getElementById('d-outlet').value = '';
  }

  // Nearby outlet drop-offs must be Pay now — there's no "pay later" way to
  // collect from an outlet that isn't our own till, so lock the choice down
  // instead of letting the customer pick Pay later and creating a payment
  // gap. document.getElementById('payment-outlet-note') mirrors this in the UI.
  const payLaterBtn = document.getElementById('btn-pay-later');
  const paymentGroup = document.querySelector('.segmented[data-field="payment"]');
  document.getElementById('payment-outlet-note').hidden = !isOutlet;
  if (isOutlet) {
    payLaterBtn.disabled = true;
    setSegmented(paymentGroup, 'Pay now');
  } else {
    payLaterBtn.disabled = false;
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

  const isOutlet = getSegmentedValue(methodGroup) === 'Nearby outlet';
  document.getElementById('p-outlet-row').hidden = !isOutlet;
  if (isOutlet) {
    document.getElementById('p-outlet').textContent = document.getElementById('d-outlet').value || '…';
  }
  document.getElementById('p-outlet-fee-row').hidden = !isOutlet;

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
    return { ok: true, demo: true, subtotal: estimateDropoffTotal(payload.service, payload.rolls, payload.highResScan, payload.method) };
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
    outletBranch: payload.outletBranch,
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

  const outletSelect = document.getElementById('d-outlet');
  DROPOFF_OUTLETS.forEach(label => {
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    outletSelect.appendChild(opt);
  });

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
      outletBranch: getSegmentedValue(methodGroup) === 'Nearby outlet' ? document.getElementById('d-outlet').value : '',
      // Nearby outlet is always Pay now (see updateCourierFieldVisibility) —
      // re-asserted here rather than trusting the segmented control's state.
      payment: getSegmentedValue(methodGroup) === 'Nearby outlet' ? 'Pay now' : getSegmentedValue(paymentGroup),
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
    if (payload.method === 'Nearby outlet' && !payload.outletBranch) {
      showDropoffError('Please choose which outlet you\'ll drop your film at.');
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
          : estimateDropoffTotal(payload.service, payload.rolls, payload.highResScan, payload.method);
        document.getElementById('dp-amount').textContent = subtotal.toFixed(2);
        document.getElementById('dp-bank').textContent = PAYMENT_INFO.bankName || '—';
        document.getElementById('dp-account').textContent = PAYMENT_INFO.accountNumber || '—';
        document.getElementById('dp-holder').textContent = PAYMENT_INFO.accountHolder || '—';
        // Only Nearby outlet drop-offs need the outlet named here — that's
        // the one method where staff can't otherwise tell where the film
        // physically is (Walk-in is always this lab, Mail/Courier already
        // has a tracking number).
        const outletLine = payload.method === 'Nearby outlet' && payload.outletBranch
          ? `\nOutlet: ${payload.outletBranch}`
          : '';
        const text = `Hi, here's my payment receipt for my film drop-off (${payload.rolls}x roll, ${payload.service}) — RM${subtotal.toFixed(2)}.\n\nName: ${payload.name}\nPhone: ${payload.phone}\nEmail: ${payload.email}${outletLine}`;
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
