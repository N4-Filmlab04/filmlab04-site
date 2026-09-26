/**
 * Filmlab04 Admin API — Google Apps Script Web App.
 *
 * Bound to a Google Sheet ("Filmlab04 Products"), one row per product in
 * its first tab:
 *   ID | Brand | Name | Category | Price | Currency | Quantity | Data (JSON)
 *
 * The Quantity column is the live source of truth for that product's
 * top-level stock — you can type a number directly in the Sheet cell and
 * it takes effect immediately, no admin.html needed. In-stock/sold-out is
 * always derived from it (quantity > 0 = in-stock, 0 = sold-out), never
 * stored separately. Everything else (tagline, image, colour variants,
 * sample photos, features, etc.) lives in the Data column as JSON and is
 * meant to be edited through admin.html, not by hand.
 *
 * doGet ?action=products      — public, no login. Returns the full catalog
 *                                as JSON (this is what shop.html/product.html
 *                                actually read).
 * doGet ?action=sales         — requires idToken. Returns an orders summary
 *                                read from the separate "Filmlab04 Orders"
 *                                sheet, for the admin sales overview.
 * doGet ?action=order-status  — public, no login. Looks up one order by
 *                                orderId (that's the only thing a customer
 *                                needs to check their own order — see
 *                                track-order.html) and returns a small,
 *                                non-sensitive subset of its fields.
 * doGet ?action=whoami        — requires idToken. Returns {authorized,email}.
 * doGet ?action=checkout-status — public, no login. Returns
 *                                {maintenanceMode}. js/checkout.js checks
 *                                this before trying to submit an order —
 *                                if true, it skips straight to the
 *                                WhatsApp fallback instead of attempting
 *                                (and waiting to fail) a real submission.
 * doGet ?action=decrement-stock — requires key=INTERNAL_KEY (a shared
 *                                secret, not customer/admin auth). Called
 *                                by order-handler.gs right after an order
 *                                is recorded, once per line item, to
 *                                reduce that product's Quantity so it can
 *                                go "Sold out" automatically. An optional
 *                                &variant=<colour name> reduces just that
 *                                colour's own Quantity for a multi-colour
 *                                product instead of the pooled total.
 * doPost {action:'save-all'}  — requires idToken. Replaces the whole catalog.
 * doPost {action:'upload-image'} — requires idToken. Saves a base64 image to
 *                                Drive and returns a public URL for it.
 * doPost {action:'mark-order-paid'} — requires idToken. Sets one order's
 *                                Payment Status to "Paid" in the Orders sheet.
 * doPost {action:'set-checkout-maintenance'} — requires idToken. Toggles
 *                                the maintenance-mode flag above.
 *
 * Setup:
 * 1. Create a new Google Sheet, name it "Filmlab04 Products".
 * 2. Extensions -> Apps Script, delete the placeholder code, paste this file.
 * 3. Fill in ALLOWED_EMAILS, GOOGLE_CLIENT_ID, and ORDERS_SHEET_ID below.
 * 4. Deploy -> New deployment -> type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Authorize when prompted (Advanced -> Go to [project name] (unsafe) -> Allow).
 * 6. Copy the resulting /exec URL into PRODUCTS_ENDPOINT in js/cart.js and
 *    ADMIN_ENDPOINT in js/admin.js.
 */

// Only these Google accounts are allowed to log into admin.html and make changes.
const ALLOWED_EMAILS = [
  'junminlee26@gmail.com',
  // 'boss-email@example.com',
];

// OAuth Client ID from Google Cloud Console ("Sign In With Google" on admin.html).
const GOOGLE_CLIENT_ID = 'PASTE_YOUR_OAUTH_CLIENT_ID_HERE';

// Shared secret order-handler.gs sends when it calls ?action=decrement-stock
// after recording a paid-for order — not full auth (no customer/browser
// ever calls this action), just enough that a stranger who finds this URL
// can't quietly zero out the catalog. Must match INTERNAL_KEY in
// apps-script/order-handler.gs.
const INTERNAL_KEY = 'flb04-internal-9c72e1a4';

// The spreadsheet ID of the existing "Filmlab04 Orders" sheet (from its URL:
// docs.google.com/spreadsheets/d/THIS_PART/edit).
const ORDERS_SHEET_ID = '1Wb6TD2hgpkbT6tOyFdUTADhOZxWVkNqPB_A1Y2P_vFI';

const HEADERS = ['ID', 'Brand', 'Name', 'Category', 'Price', 'Currency', 'Quantity', 'Data'];

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

// Verifies a Google Identity Services ID token against Google directly and
// checks the signed-in email is on the allow-list. Returns the email on
// success, or null if the token is missing/invalid/not allowed.
function verifyLogin_(idToken) {
  if (!idToken) return null;
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) return null;
  const info = JSON.parse(res.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) return null;
  if (info.email_verified !== 'true' && info.email_verified !== true) return null;
  if (ALLOWED_EMAILS.indexOf(info.email) === -1) return null;
  return info.email;
}

function readAllProducts_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const products = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    let data = {};
    try { data = JSON.parse(row[7] || '{}'); } catch (err) { data = {}; }
    const quantity = Number(row[6]) || 0;
    products.push(Object.assign({}, data, {
      id: String(row[0]),
      brand: String(row[1]),
      name: String(row[2]),
      category: String(row[3]),
      price: Number(row[4]),
      currency: String(row[5]),
      quantity: quantity,
      stock: quantity > 0 ? 'in-stock' : 'sold-out'
    }));
  }
  return products;
}

// Called by order-handler.gs right after an order is recorded, one call
// per line item, so a product that sells out is reflected immediately
// (quantity hits 0 -> shop.html/product.html show "Sold out" on their
// next load, same derivation readAllProducts_ already does). Clamped at
// 0 — never goes negative even if two orders race for the last unit.
//
// variant (a colour name, or '') tells us which one sold for a
// multi-colour product — each colour tracks its own Quantity (in the
// Data JSON's variants array) rather than sharing one pooled number, so
// selling out "Vanilla White" doesn't quietly also mark "Midnight Black"
// as sold out. The top-level Quantity column (used for the overall
// in-stock/sold-out badge and the shop's stock cap) is kept as the sum
// of all colours, recomputed here — never edited independently.
function decrementStock_(id, qty, variant) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) !== String(id)) continue;

    let data = {};
    try { data = JSON.parse(values[i][7] || '{}'); } catch (err) { data = {}; }

    // Only touch the per-colour number if this colour actually has one —
    // one that predates per-colour quantities (still just the old binary
    // stock flag) falls through to the pooled-total path below instead
    // of being wrongly zeroed out from nothing.
    if (variant && Array.isArray(data.variants) && data.variants.length) {
      const v = data.variants.find(v => v.color === variant);
      if (v && typeof v.quantity === 'number') {
        v.quantity = Math.max(0, v.quantity - qty);
        v.stock = v.quantity > 0 ? 'in-stock' : 'sold-out';
        sheet.getRange(i + 1, 8).setValue(JSON.stringify(data)); // column H — Data
        const total = data.variants.reduce((sum, v2) => sum + (Number(v2.quantity) || 0), 0);
        sheet.getRange(i + 1, 7).setValue(total); // column G — Quantity
        return { ok: true, id: id, variant: variant, quantity: v.quantity, totalQuantity: total };
      }
    }

    const current = Number(values[i][6]) || 0;
    const next = Math.max(0, current - qty);
    sheet.getRange(i + 1, 7).setValue(next); // column G — Quantity
    return { ok: true, id: id, quantity: next };
  }
  return { ok: false, error: 'Product not found' };
}

function writeAllProducts_(products) {
  const sheet = getSheet_();
  sheet.clear();
  sheet.appendRow(HEADERS);
  const rows = products.map(p => {
    const data = Object.assign({}, p);
    delete data.id; delete data.brand; delete data.name; delete data.category;
    delete data.price; delete data.currency; delete data.quantity; delete data.stock;
    return [p.id, p.brand, p.name, p.category, p.price, p.currency, Number(p.quantity) || 0, JSON.stringify(data)];
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function getOrdersSheet_() {
  return SpreadsheetApp.openById(ORDERS_SHEET_ID).getSheets()[0];
}

function salesSummary_() {
  const sheet = getOrdersSheet_();
  const values = sheet.getDataRange().getValues();
  const orders = [];
  let totalRevenue = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    const subtotal = Number(row[6]) || 0;
    totalRevenue += subtotal;
    orders.push({
      orderId: row[0],
      submittedAt: row[1],
      name: row[2],
      phone: row[3],
      email: row[4],
      items: row[5],
      subtotal: subtotal,
      paymentStatus: row[7],
      notes: row[8],
      deliveryMethod: row[9] || 'Self-pickup',
      address: row[10] || ''
    });
  }
  orders.reverse(); // most recent first
  return {
    totalOrders: orders.length,
    totalRevenue: totalRevenue,
    recentOrders: orders.slice(0, 200)
  };
}

// Sheet row index (1-based, matching getRange) of the order with this
// orderId, or -1 if not found. Column A holds the order ID.
function findOrderRow_(sheet, orderId) {
  if (sheet.getLastRow() < 2) return -1; // header row only, no orders yet
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(orderId)) return i + 2;
  }
  return -1;
}

// Public lookup for track-order.html — orderId is the only credential, so
// this deliberately returns nothing more sensitive than the order itself
// (no phone/email, matching what a customer already knows about their own
// order).
function getOrderStatus_(orderId) {
  const sheet = getOrdersSheet_();
  const row = findOrderRow_(sheet, orderId);
  if (row === -1) return { found: false };
  const values = sheet.getRange(row, 1, 1, 9).getValues()[0];
  return {
    found: true,
    orderId: values[0],
    submittedAt: values[1],
    items: values[5],
    subtotal: Number(values[6]) || 0,
    paymentStatus: values[7]
  };
}

function markOrderPaid_(orderId) {
  const sheet = getOrdersSheet_();
  const row = findOrderRow_(sheet, orderId);
  if (row === -1) return { ok: false, error: 'Order not found' };
  sheet.getRange(row, 8).setValue('Paid'); // column H — Payment Status
  return { ok: true };
}

// Manual kill-switch for checkout, controlled from admin.html — lets Jun
// Min force the WhatsApp fallback on/off himself (e.g. while the Orders
// backend is down, or for planned maintenance) instead of it only
// reacting to an actual failed request. Stored in Script Properties, not
// the Sheet, since it's a simple flag with no need for a row/history.
function getCheckoutMaintenanceMode_() {
  return PropertiesService.getScriptProperties().getProperty('checkoutMaintenanceMode') === 'true';
}

function setCheckoutMaintenanceMode_(enabled) {
  PropertiesService.getScriptProperties().setProperty('checkoutMaintenanceMode', enabled ? 'true' : 'false');
  return { ok: true, maintenanceMode: enabled };
}

function uploadImage_(filename, mimeType, dataBase64) {
  const folder = getOrCreateImagesFolder_();
  const bytes = Utilities.base64Decode(dataBase64);
  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function getOrCreateImagesFolder_() {
  const name = 'Filmlab04 Product Images';
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// No-op — set up as a time-driven trigger (Apps Script editor: clock icon
// on the left sidebar -> Add Trigger -> function keepWarm_ -> Time-driven
// -> Minutes timer -> Every 5 minutes -> Save) so this script's runtime
// container doesn't go idle/cold between real requests. order-handler.gs
// calls into this project on almost every order (checkout-status,
// products, decrement-stock), so this one being warm matters too.
function keepWarm_() {}

function doGet(e) {
  const action = (e.parameter.action || 'products');

  if (action === 'products') {
    return jsonOut_(readAllProducts_());
  }
  if (action === 'sales') {
    const email = verifyLogin_(e.parameter.idToken);
    if (!email) return jsonOut_({ error: 'Not authorized' });
    return jsonOut_(salesSummary_());
  }
  if (action === 'order-status') {
    return jsonOut_(getOrderStatus_(e.parameter.orderId || ''));
  }
  if (action === 'checkout-status') {
    return jsonOut_({ maintenanceMode: getCheckoutMaintenanceMode_() });
  }
  if (action === 'whoami') {
    const email = verifyLogin_(e.parameter.idToken);
    return jsonOut_({ authorized: !!email, email: email || null });
  }
  if (action === 'decrement-stock') {
    if (e.parameter.key !== INTERNAL_KEY) return jsonOut_({ ok: false, error: 'Not authorized' });
    const qty = Math.max(0, Math.floor(Number(e.parameter.qty)) || 0);
    return jsonOut_(decrementStock_(e.parameter.id || '', qty, e.parameter.variant || ''));
  }
  // These two used to be doPost-only, but POST requests to this Apps
  // Script Web App deployment have been observed to hang indefinitely (no
  // response, not even an error) — the same Google-side platform issue
  // documented in apps-script/order-handler.gs, confirmed here directly
  // (a live "Mark as paid" click waited 45s+ with nothing coming back).
  // GET requests have consistently routed and executed correctly for
  // every other action on this same endpoint, so these two small,
  // URL-safe write actions moved to GET as well. save-all/upload-image
  // stay POST-only — their payloads (the full product list, base64 image
  // data) are too large to fit safely in a URL.
  if (action === 'mark-order-paid') {
    const email = verifyLogin_(e.parameter.idToken);
    if (!email) return jsonOut_({ error: 'Not authorized' });
    return jsonOut_(markOrderPaid_(e.parameter.orderId || ''));
  }
  if (action === 'set-checkout-maintenance') {
    const email = verifyLogin_(e.parameter.idToken);
    if (!email) return jsonOut_({ error: 'Not authorized' });
    return jsonOut_(setCheckoutMaintenanceMode_(e.parameter.enabled === 'true'));
  }
  return jsonOut_({ error: 'Unknown action' });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const email = verifyLogin_(body.idToken);
  if (!email) return jsonOut_({ error: 'Not authorized' });

  if (body.action === 'save-all') {
    writeAllProducts_(body.products || []);
    return jsonOut_({ ok: true });
  }
  if (body.action === 'upload-image') {
    const url = uploadImage_(body.filename, body.mimeType, body.dataBase64);
    return jsonOut_({ url: url });
  }
  if (body.action === 'mark-order-paid') {
    return jsonOut_(markOrderPaid_(body.orderId || ''));
  }
  if (body.action === 'set-checkout-maintenance') {
    return jsonOut_(setCheckoutMaintenanceMode_(!!body.enabled));
  }
  return jsonOut_({ error: 'Unknown action' });
}
