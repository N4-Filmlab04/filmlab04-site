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

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Submitted At', 'Name', 'Phone', 'Email', 'Method', 'Courier Provider',
      'Tracking Number', 'Rolls', 'Service', 'High-Res Scan', 'Payment',
      'Keep Strips', 'Strips Return', 'Reference', 'Notes'
    ]);
  }

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
    data.payment || '',
    data.keepStrips || '',
    data.stripsReturn || '',
    data.reference || '',
    data.notes || ''
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
