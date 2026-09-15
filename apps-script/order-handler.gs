/**
 * Google Apps Script Web App that receives order submissions from the
 * filmlab04 shop checkout (cart.html / js/checkout.js) and appends each
 * order as a new row in this spreadsheet — one row per order, with items
 * listed as a single readable column.
 *
 * Submission goes over GET, not POST: real-world testing found that POST
 * requests to Apps Script Web App deployments have been unreliable (a
 * Google-side platform issue affecting this project — see the project
 * memory / Issue Tracker report), while GET requests route and execute
 * correctly every time. So order data travels as URL query parameters
 * (the `items` array JSON-stringified into a single `items` param)
 * instead of a POST body. doPost is kept as a fallback in case POST
 * reliability is ever restored, but doGet is the one actually used.
 *
 * Prices are never trusted from the client: this script re-fetches the
 * live product catalog (from PRODUCTS_ENDPOINT, the public admin-api.gs
 * "Filmlab04 Products" endpoint) and recomputes each line's price and the
 * order subtotal from the real, current catalog — the client only tells us
 * *which* product IDs and quantities were in the cart. A line whose
 * product ID no longer matches anything in the catalog is flagged rather
 * than trusted at face value.
 *
 * Setup (same pattern as apps-script/dropoff-handler.gs):
 * 1. Create a new Google Sheet (e.g. "Filmlab04 Orders").
 * 2. Extensions -> Apps Script, delete the placeholder code, paste this file.
 * 3. Fill in PRODUCTS_ENDPOINT below (same URL as PRODUCTS_ENDPOINT in
 *    js/cart.js / ADMIN_ENDPOINT in js/admin.js).
 * 4. Deploy -> New deployment -> type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Authorize when prompted (Advanced -> Go to [project name] (unsafe) -> Allow).
 * 6. Copy the resulting /exec URL and paste it into ORDER_ENDPOINT
 *    in js/checkout.js.
 */

const PRODUCTS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyW4XSFes9LoCIUkCU7-2oWfNFTfTErV9fCksxrgy-ONdXX-h-ADkfZEz_XjyPVrF40WQ/exec';

const MAX_QTY_PER_LINE = 50;

// Flat fee added when the customer chooses "Ship to my address" instead
// of self-pickup. This is the authoritative value — js/checkout.js has
// its own copy only for the WhatsApp fallback text and the no-backend
// demo path, never trusted for the real subtotal.
const DELIVERY_FEE = 12;

const ORDER_ID_PREFIX = 'FL04-';
const ORDER_ID_DIGITS = 6;

// Sequential, human-friendly order/tracking numbers (FL04-000000,
// FL04-000001, ...) instead of a random suffix. The client's own
// generated ID is never trusted for this — same "never trust the
// client" posture as pricing — this is the one source of truth. A
// script lock avoids two concurrent submissions getting the same
// number.
function nextOrderId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const last = parseInt(props.getProperty('lastOrderNumber'), 10);
    const next = isNaN(last) ? 0 : last + 1;
    props.setProperty('lastOrderNumber', String(next));
    return ORDER_ID_PREFIX + String(next).padStart(ORDER_ID_DIGITS, '0');
  } finally {
    lock.releaseLock();
  }
}

// Retries a few times with a short pause — PRODUCTS_ENDPOINT has been
// observed to intermittently return an HTML error page instead of JSON
// for a request or two before recovering (a Google Apps Script platform
// issue, not a bug in this code). Returns null if every attempt fails,
// rather than letting a JSON.parse exception crash the whole order.
function fetchCatalogById_() {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = UrlFetchApp.fetch(PRODUCTS_ENDPOINT + '?action=products', { muteHttpExceptions: true });
      const products = JSON.parse(res.getContentText());
      const byId = {};
      products.forEach(p => { byId[p.id] = p; });
      return byId;
    } catch (err) {
      if (attempt < maxAttempts) Utilities.sleep(1000);
    }
  }
  return null;
}

// Recomputes each line's price from the real catalog (ignoring whatever
// price the client sent) and returns the honest subtotal alongside a
// display string. A line whose id isn't found in the catalog anymore is
// kept but flagged, with its price excluded from the subtotal, so Jun Min
// notices it during manual payment verification instead of silently
// trusting an arbitrary client-supplied amount. If the catalog itself is
// unreachable after retrying, the order is still recorded (never silently
// dropped) with subtotal 0 and every line flagged for manual pricing.
function priceOrder_(items) {
  const catalog = fetchCatalogById_();
  if (!catalog) {
    const parts = (items || []).map((line, i) => {
      const qty = Math.max(0, Math.min(MAX_QTY_PER_LINE, Math.floor(Number(line.qty)) || 0));
      return `${i + 1}. [id:${line.id}] (catalog unreachable — price manually) x${qty}`;
    });
    return { subtotal: 0, itemsText: parts.join('\n'), flagged: true };
  }
  let subtotal = 0;
  let flagged = false;
  const parts = (items || []).map((line, i) => {
    const qty = Math.max(0, Math.min(MAX_QTY_PER_LINE, Math.floor(Number(line.qty)) || 0));
    const p = catalog[line.id];
    if (!p) {
      flagged = true;
      return `${i + 1}. [UNKNOWN PRODUCT ID: ${line.id}] x${qty}`;
    }
    const lineTotal = p.price * qty;
    subtotal += lineTotal;
    const name = `${p.brand} ${p.name}`;
    return `${i + 1}. ${name}${line.variant ? ' (' + line.variant + ')' : ''} @ RM${p.price.toFixed(2)} x${qty}`;
  });
  return { subtotal: subtotal, itemsText: parts.join('\n'), flagged: flagged };
}

// Shared by doGet and doPost — data is {orderId, submittedAt, name, phone,
// email, notes, items}. Never lets an unexpected error surface as Apps
// Script's raw crash page (customers would see a confusing wall of text)
// — always responds with clean JSON so js/checkout.js's own error
// handling (the WhatsApp fallback) takes over instead.
// Leftover diagnostic test order from an earlier debugging session — some
// still-unidentified caller keeps resubmitting this exact payload, which
// kept polluting the Orders sheet no matter how many times it was deleted
// manually. Block it here at the source rather than chasing the caller
// further; responds ok:true (not an error) so whatever's polling this
// doesn't start retrying more aggressively.
const BLOCKED_ORDER_IDS = ['FL04-WATCHTEST2'];
const BLOCKED_PHONES = ['60000000000'];

function recordOrder_(data) {
  try {
    if (BLOCKED_ORDER_IDS.includes(data.orderId) || BLOCKED_PHONES.includes(String(data.phone || ''))) {
      return jsonOut_({ ok: true, orderId: data.orderId, subtotal: 0, blocked: true });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Order ID', 'Submitted At', 'Name', 'Phone', 'Email',
        'Items', 'Subtotal (RM)', 'Payment Status', 'Notes',
        'Delivery Method', 'Address'
      ]);
    }

    const orderId = nextOrderId_();
    // Generated here, not from data.submittedAt (the client's clock/timezone
    // isn't trusted) — always Malaysia local time so what Jun Min sees in
    // the sheet matches the wall clock, instead of UTC (8 hours behind).
    const submittedAt = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', "yyyy-MM-dd'T'HH:mm:ss");
    const priced = priceOrder_(data.items);
    const notes = (data.notes || '') + (priced.flagged ? ' [NEEDS REVIEW: contains an unrecognised product]' : '');
    const isDelivery = data.deliveryMethod === 'Delivery';
    const subtotal = priced.subtotal + (isDelivery ? DELIVERY_FEE : 0);
    const itemsText = priced.itemsText + (isDelivery ? `\nDelivery fee: RM${DELIVERY_FEE.toFixed(2)}` : '');

    sheet.appendRow([
      orderId,
      submittedAt,
      data.name || '',
      data.phone || '',
      data.email || '',
      itemsText,
      subtotal,
      'Pending',
      notes.trim(),
      data.deliveryMethod || 'Self-pickup',
      data.address || ''
    ]);

    return jsonOut_({ ok: true, orderId: orderId, subtotal: subtotal });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Primary path — see the file header for why GET instead of POST.
// action=submit-order carries the same fields the old POST body did,
// just as query parameters; `items` is a JSON-stringified array since
// query params are flat strings.
function doGet(e) {
  // Do NOT default a missing/empty action to 'submit-order' — any request
  // that hits this URL without the expected params (a health check, a
  // browser prefetch, a stray ping) would otherwise silently record a
  // phantom order. Require the caller to explicitly ask for submit-order.
  const action = e.parameter.action;
  if (action !== 'submit-order') {
    return jsonOut_({ error: 'Unknown action' });
  }
  let items;
  try {
    items = JSON.parse(e.parameter.items || '[]');
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Invalid items payload' });
  }
  return recordOrder_({
    orderId: e.parameter.orderId,
    submittedAt: e.parameter.submittedAt,
    name: e.parameter.name,
    phone: e.parameter.phone,
    email: e.parameter.email,
    notes: e.parameter.notes,
    deliveryMethod: e.parameter.deliveryMethod,
    address: e.parameter.address,
    items: items
  });
}

// Kept in case POST reliability is ever restored — not currently used by
// checkout.js (see doGet above).
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Invalid request body' });
  }
  return recordOrder_(data);
}
