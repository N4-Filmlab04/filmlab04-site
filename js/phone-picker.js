/** Reusable country-code phone picker (flag + dial code + searchable list),
 * shared by the drop-off form (services.html) and checkout (cart.html).
 * Needs js/country-codes.js loaded first for COUNTRY_CODES, and expects
 * the markup ids #phone-picker / #phone-picker-trigger / #phone-picker-panel
 * / #phone-picker-search / #phone-picker-list (one picker per page).
 */

let __phonePickerCountry = null;
let __phonePickerCountryInputId = null;

function phonePickerDialCode() {
  return __phonePickerCountry ? `+${__phonePickerCountry.code}` : '';
}

function renderPhonePickerTrigger() {
  if (!__phonePickerCountry) return;
  document.querySelector('#phone-picker-trigger .phone-picker-flag').textContent = __phonePickerCountry.flag;
  document.querySelector('#phone-picker-trigger .phone-picker-code').textContent = `+${__phonePickerCountry.code}`;
  if (__phonePickerCountryInputId) document.getElementById(__phonePickerCountryInputId).value = __phonePickerCountry.code;
}

function renderPhonePickerList(query) {
  const list = document.getElementById('phone-picker-list');
  const q = (query || '').trim().toLowerCase();
  const matches = COUNTRY_CODES.filter(c =>
    !q || c.name.toLowerCase().includes(q) || String(c.code).includes(q)
  );
  list.innerHTML = matches.length
    ? matches.map(c => `
      <button type="button" class="phone-picker-item${__phonePickerCountry && c.region === __phonePickerCountry.region ? ' active' : ''}" data-region="${c.region}">
        <span>${c.flag}</span>
        <span class="phone-picker-item-name">${c.name}</span>
        <span class="phone-picker-item-code">+${c.code}</span>
      </button>`).join('')
    : '<p class="phone-picker-empty">No matches</p>';
}

function openPhonePickerPanel() {
  const panel = document.getElementById('phone-picker-panel');
  panel.hidden = false;
  document.getElementById('phone-picker-trigger').setAttribute('aria-expanded', 'true');
  const search = document.getElementById('phone-picker-search');
  search.value = '';
  renderPhonePickerList('');
  search.focus();
}

function closePhonePickerPanel() {
  document.getElementById('phone-picker-panel').hidden = true;
  document.getElementById('phone-picker-trigger').setAttribute('aria-expanded', 'false');
}

// countryInputId: hidden input that receives the selected dial code.
// onChange: optional callback fired after the user picks a country.
function initPhonePicker(countryInputId, onChange) {
  if (typeof COUNTRY_CODES === 'undefined') return;
  __phonePickerCountryInputId = countryInputId;
  __phonePickerCountry = COUNTRY_CODES[0]; // Malaysia
  renderPhonePickerTrigger();

  const trigger = document.getElementById('phone-picker-trigger');
  const panel = document.getElementById('phone-picker-panel');
  const search = document.getElementById('phone-picker-search');
  const list = document.getElementById('phone-picker-list');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden ? openPhonePickerPanel() : closePhonePickerPanel();
  });

  search.addEventListener('input', () => renderPhonePickerList(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      list.querySelector('.phone-picker-item')?.click();
    }
  });

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.phone-picker-item');
    if (!item) return;
    __phonePickerCountry = COUNTRY_CODES.find(c => c.region === item.dataset.region) || __phonePickerCountry;
    renderPhonePickerTrigger();
    closePhonePickerPanel();
    if (onChange) onChange();
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('phone-picker').contains(e.target)) closePhonePickerPanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePhonePickerPanel();
  });
}

// Full E.164-ish number (dial code + national number) from a given
// national-number input id, or '' if that input is empty.
function phonePickerFullNumber(numberInputId) {
  const num = document.getElementById(numberInputId).value.trim();
  return num ? `${phonePickerDialCode()}${num}` : '';
}
