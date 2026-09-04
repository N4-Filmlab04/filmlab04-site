/** Drives the drop-off form on dropoff.html: segmented toggles, live receipt
 * preview, and submission. Depends on cart.js for showToast().
 *
 * Submissions POST to a Google Apps Script Web App (apps-script/dropoff-handler.gs)
 * bound to the "Filmlab04 Drop-offs" Google Sheet, which appends each one as a row.
 */

const DROPOFF_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzo9trOi84dJ3J6PxSZqL98GcAiAR2jOO7d0cgNfst9jpimndl4Adw8peDOfiEktYXM2w/exec';

function formatDropoffDate(d) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

let __phoneCountry = null;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function selectedDialCode() {
  return __phoneCountry ? `+${__phoneCountry.code}` : '';
}

function renderPhoneTrigger() {
  if (!__phoneCountry) return;
  document.querySelector('#phone-picker-trigger .phone-picker-flag').textContent = __phoneCountry.flag;
  document.querySelector('#phone-picker-trigger .phone-picker-code').textContent = `+${__phoneCountry.code}`;
  document.getElementById('d-phone-country').value = __phoneCountry.code;
}

function renderPhoneList(query) {
  const list = document.getElementById('phone-picker-list');
  const q = (query || '').trim().toLowerCase();
  const matches = COUNTRY_CODES.filter(c =>
    !q || c.name.toLowerCase().includes(q) || String(c.code).includes(q)
  );
  list.innerHTML = matches.length
    ? matches.map(c => `
      <button type="button" class="phone-picker-item${__phoneCountry && c.region === __phoneCountry.region ? ' active' : ''}" data-region="${c.region}">
        <span>${c.flag}</span>
        <span class="phone-picker-item-name">${escapeHtml(c.name)}</span>
        <span class="phone-picker-item-code">+${c.code}</span>
      </button>`).join('')
    : '<p class="phone-picker-empty">No matches</p>';
}

function openPhonePanel() {
  const panel = document.getElementById('phone-picker-panel');
  panel.hidden = false;
  document.getElementById('phone-picker-trigger').setAttribute('aria-expanded', 'true');
  const search = document.getElementById('phone-picker-search');
  search.value = '';
  renderPhoneList('');
  search.focus();
}

function closePhonePanel() {
  document.getElementById('phone-picker-panel').hidden = true;
  document.getElementById('phone-picker-trigger').setAttribute('aria-expanded', 'false');
}

function initPhonePicker() {
  if (typeof COUNTRY_CODES === 'undefined') return;
  __phoneCountry = COUNTRY_CODES[0]; // Malaysia
  renderPhoneTrigger();

  const trigger = document.getElementById('phone-picker-trigger');
  const panel = document.getElementById('phone-picker-panel');
  const search = document.getElementById('phone-picker-search');
  const list = document.getElementById('phone-picker-list');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden ? openPhonePanel() : closePhonePanel();
  });

  search.addEventListener('input', () => renderPhoneList(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      list.querySelector('.phone-picker-item')?.click();
    }
  });

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.phone-picker-item');
    if (!item) return;
    __phoneCountry = COUNTRY_CODES.find(c => c.region === item.dataset.region) || __phoneCountry;
    renderPhoneTrigger();
    closePhonePanel();
    updatePreview();
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('phone-picker').contains(e.target)) closePhonePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePhonePanel();
  });
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
  document.getElementById('p-phone').textContent = (selectedDialCode() + ' ' + document.getElementById('d-phone').value.trim()).trim();
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
    return { ok: true, demo: true };
  }
  // text/plain avoids a CORS preflight (Apps Script web apps don't handle
  // OPTIONS by default) — Apps Script still reads e.postData.contents fine.
  const res = await fetch(DROPOFF_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Could not submit — please try again or contact us directly.');
  return res.json();
}

function initDropoff() {
  const form = document.getElementById('dropoff-form');
  if (!form) return;

  initPhonePicker();

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
      phone: selectedDialCode() + document.getElementById('d-phone').value.trim(),
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
      form.reset();
      setSegmented(methodGroup, 'Walk-in');
      setSegmented(paymentGroup, '');
      setSegmented(stripsGroup, '');
      updateStripsReturnVisibility();
      updateCourierFieldVisibility();
      __phoneCountry = COUNTRY_CODES[0];
      renderPhoneTrigger();
      updatePreview();
      showToast(result.demo ? 'Submitted (demo — not saved yet)' : 'Drop-off submitted!');
    } catch (err) {
      showDropoffError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', initDropoff);
