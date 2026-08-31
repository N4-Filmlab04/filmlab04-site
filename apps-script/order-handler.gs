/**
 * Google Apps Script Web App that receives POSTs from the filmlab04 shop
 * checkout (cart.html / js/checkout.js) and appends each order as a new
 * row in this spreadsheet — one row per order, with items listed as a
 * single readable column.
 *
 * Setup (same pattern as apps-script/dropoff-handler.gs):
 * 1. Create a new Google Sheet (e.g. "Filmlab04 Orders").
 * 2. Extensions -> Apps Script, delete the placeholder code, paste this file.
 * 3. Deploy -> New deployment -> type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Authorize when prompted (Advanced -> Go to [project name] (unsafe) -> Allow).
 * 5. Copy the resulting /exec URL and paste it into ORDER_ENDPOINT
 *    in js/checkout.js.
 */

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Order ID', 'Submitted At', 'Name', 'Phone', 'Email',
      'Items', 'Subtotal (RM)', 'Payment Status', 'Notes'
    ]);
  }

  const itemsText = (data.items || [])
    .map(i => `${i.qty}x ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} @ RM${i.price}`)
    .join('; ');

  sheet.appendRow([
    data.orderId || '',
    data.submittedAt || new Date().toISOString(),
    data.name || '',
    data.phone || '',
    data.email || '',
    itemsText,
    data.subtotal || '',
    'Pending',
    data.notes || ''
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true, orderId: data.orderId }))
    .setMimeType(ContentService.MimeType.JSON);
}
