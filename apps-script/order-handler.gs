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
    const parts = (items || []).map(line => {
      const qty = Math.max(0, Math.min(MAX_QTY_PER_LINE, Math.floor(Number(line.qty)) || 0));
      return `${qty}x [id:${line.id}] (catalog unreachable — price manually)`;
    });
    return { subtotal: 0, itemsText: parts.join('; '), flagged: true };
  }
  let subtotal = 0;
  let flagged = false;
  const parts = (items || []).map(line => {
    const qty = Math.max(0, Math.min(MAX_QTY_PER_LINE, Math.floor(Number(line.qty)) || 0));
    const p = catalog[line.id];
    if (!p) {
      flagged = true;
      return `${qty}x [UNKNOWN PRODUCT ID: ${line.id}]`;
    }
    const lineTotal = p.price * qty;
    subtotal += lineTotal;
    const name = `${p.brand} ${p.name}`;
    return `${qty}x ${name}${line.variant ? ' (' + line.variant + ')' : ''} @ RM${p.price.toFixed(2)}`;
  });
  return { subtotal: subtotal, itemsText: parts.join('; '), flagged: flagged };
}

// Shared by doGet and doPost — data is {orderId, submittedAt, name, phone,
// email, notes, items}. Never lets an unexpected error surface as Apps
// Script's raw crash page (customers would see a confusing wall of text)
// — always responds with clean JSON so js/checkout.js's own error
// handling (the WhatsApp fallback) takes over instead.
function recordOrder_(data) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Order ID', 'Submitted At', 'Name', 'Phone', 'Email',
        'Items', 'Subtotal (RM)', 'Payment Status', 'Notes'
      ]);
    }

    const priced = priceOrder_(data.items);
    const notes = (data.notes || '') + (priced.flagged ? ' [NEEDS REVIEW: contains an unrecognised product]' : '');

    sheet.appendRow([
      data.orderId || '',
      data.submittedAt || new Date().toISOString(),
      data.name || '',
      data.phone || '',
      data.email || '',
      priced.itemsText,
      priced.subtotal,
      'Pending',
      notes.trim()
    ]);

    return jsonOut_({ ok: true, orderId: data.orderId, subtotal: priced.subtotal });
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
  const action = e.parameter.action || 'submit-order';
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
