/**
 * Google Apps Script Web App that receives POSTs from the filmlab04 shop
 * checkout (cart.html / js/checkout.js) and appends each order as a new
 * row in this spreadsheet — one row per order, with items listed as a
 * single readable column.
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

const PRODUCTS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyEuFDv68Pf5WUBqOYNPqiOL4BNgFyMsGCN2fXEgp7zTSh4MedmswBra5FYs1nD7W_c1Q/exec';

const MAX_QTY_PER_LINE = 50;

function fetchCatalogById_() {
  const res = UrlFetchApp.fetch(PRODUCTS_ENDPOINT + '?action=products', { muteHttpExceptions: true });
  const products = JSON.parse(res.getContentText());
  const byId = {};
  products.forEach(p => { byId[p.id] = p; });
  return byId;
}

// Recomputes each line's price from the real catalog (ignoring whatever
// price the client sent) and returns the honest subtotal alongside a
// display string. A line whose id isn't found in the catalog anymore is
// kept but flagged, with its price excluded from the subtotal, so Jun Min
// notices it during manual payment verification instead of silently
// trusting an arbitrary client-supplied amount.
function priceOrder_(items) {
  const catalog = fetchCatalogById_();
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

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

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

  return ContentService.createTextOutput(JSON.stringify({ ok: true, orderId: data.orderId, subtotal: priced.subtotal }))
    .setMimeType(ContentService.MimeType.JSON);
}
