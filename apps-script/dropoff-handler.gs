/**
 * Google Apps Script Web App that receives POSTs from the filmlab04
 * drop-off form (services.html / js/dropoff.js) and appends each
 * submission as a new row in this spreadsheet.
 *
 * Setup:
 * 1. Create a new Google Sheet (e.g. "Filmlab04 Drop-offs").
 * 2. Extensions -> Apps Script, delete the placeholder code, paste this file.
 * 3. Deploy -> New deployment -> type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Authorize when prompted (Advanced -> Go to [project name] (unsafe) -> Allow) —
 *    this warning is normal for your own unpublished script.
 * 5. Copy the resulting /exec URL and paste it into DROPOFF_ENDPOINT
 *    in js/dropoff.js.
 */

// Must match SERVICE_PRICES / HIGHRES_FEE in js/dropoff.js — this copy is
// authoritative (never trust a client-sent amount), the client's copy is
// only for the live preview before submission.
const SERVICE_PRICES = {
  'Develop and scan': 18,
  'Developing only': 13,
  'Cut film scanning only': 13
};
const HIGHRES_FEE = 10;

function priceDropoff_(data) {
  const rolls = Math.max(0, Math.floor(Number(data.rolls)) || 0);
  const base = SERVICE_PRICES[data.service] || 0;
  const highres = data.highResScan ? HIGHRES_FEE * rolls : 0;
  return base * rolls + highres;
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Submitted At', 'Name', 'Phone', 'Email', 'Method', 'Courier Provider',
      'Tracking Number', 'Rolls', 'Service', 'High-Res Scan', 'Subtotal (RM)',
      'Payment', 'Keep Strips', 'Strips Return', 'Reference', 'Notes'
    ]);
  }

  const subtotal = priceDropoff_(data);

  sheet.appendRow([
    data.submittedAt || new Date().toISOString(),
    data.name || '',
    data.phone || '',
    data.email || '',
    data.method || '',
    data.courierProvider || '',
    data.trackingNumber || '',
    data.rolls || '',
    data.service || '',
    data.highResScan ? 'Yes' : 'No',
    subtotal,
    data.payment || '',
    data.keepStrips || '',
    data.stripsReturn || '',
    data.reference || '',
    data.notes || ''
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true, subtotal: subtotal }))
    .setMimeType(ContentService.MimeType.JSON);
}
