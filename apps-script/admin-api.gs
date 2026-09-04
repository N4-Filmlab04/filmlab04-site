/**
 * Filmlab04 Admin API — Google Apps Script Web App.
 *
 * Bound to a Google Sheet ("Filmlab04 Products"), one row per product in
 * its first tab:
 *   ID | Brand | Name | Category | Price | Currency | Stock | Data (JSON)
 *
 * The Stock column is the live source of truth for that product's
 * top-level stock — you can flip in-stock/sold-out directly in the Sheet
 * cell and it takes effect immediately, no admin.html needed. Everything
 * else (tagline, image, colour variants, sample photos, features, etc.)
 * lives in the Data column as JSON and is meant to be edited through
 * admin.html, not by hand.
 *
 * doGet ?action=products      — public, no login. Returns the full catalog
 *                                as JSON (this is what shop.html/product.html
 *                                actually read).
 * doGet ?action=sales         — requires idToken. Returns an orders summary
 *                                read from the separate "Filmlab04 Orders"
 *                                sheet, for the admin sales overview.
 * doGet ?action=whoami        — requires idToken. Returns {authorized,email}.
 * doPost {action:'save-all'}  — requires idToken. Replaces the whole catalog.
 * doPost {action:'upload-image'} — requires idToken. Saves a base64 image to
 *                                Drive and returns a public URL for it.
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

// The spreadsheet ID of the existing "Filmlab04 Orders" sheet (from its URL:
// docs.google.com/spreadsheets/d/THIS_PART/edit).
const ORDERS_SHEET_ID = 'PASTE_FILMLAB04_ORDERS_SHEET_ID_HERE';

const HEADERS = ['ID', 'Brand', 'Name', 'Category', 'Price', 'Currency', 'Stock', 'Data'];

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
    products.push(Object.assign({}, data, {
      id: String(row[0]),
      brand: String(row[1]),
      name: String(row[2]),
      category: String(row[3]),
      price: Number(row[4]),
      currency: String(row[5]),
      stock: String(row[6])
    }));
  }
  return products;
}

function writeAllProducts_(products) {
  const sheet = getSheet_();
  sheet.clear();
  sheet.appendRow(HEADERS);
  const rows = products.map(p => {
    const data = Object.assign({}, p);
    delete data.id; delete data.brand; delete data.name; delete data.category;
    delete data.price; delete data.currency; delete data.stock;
    return [p.id, p.brand, p.name, p.category, p.price, p.currency, p.stock, JSON.stringify(data)];
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function salesSummary_() {
  const ss = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  const sheet = ss.getSheets()[0];
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
      notes: row[8]
    });
  }
  orders.reverse(); // most recent first
  return {
    totalOrders: orders.length,
    totalRevenue: totalRevenue,
    recentOrders: orders.slice(0, 30)
  };
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
  if (action === 'whoami') {
    const email = verifyLogin_(e.parameter.idToken);
    return jsonOut_({ authorized: !!email, email: email || null });
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
  return jsonOut_({ error: 'Unknown action' });
}
