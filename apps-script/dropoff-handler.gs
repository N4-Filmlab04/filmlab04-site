/**
 * Google Apps Script Web App that receives submissions from the filmlab04
 * drop-off form (services.html / js/dropoff.js) and appends each one as a
 * new row in this spreadsheet.
 *
 * Submission goes over GET, not POST: testing found POST requests to this
 * deployment unreliable (the same Google-side platform issue that hit the
 * Orders endpoint — see apps-script/order-handler.gs's header and the
 * project memory / Issue Tracker report), while GET requests route and
 * execute correctly every time. So the payload travels as URL query
 * parameters instead of a POST body. doPost is kept as a fallback in case
 * POST reliability is ever restored, but doGet is the one actually used.
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

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Shared by doGet and doPost. Never lets an unexpected error surface as
// Apps Script's raw crash page — always responds with clean JSON so
// js/dropoff.js's own error handling can show a real message instead.
function recordDropoff_(data) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

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

    return jsonOut_({ ok: true, subtotal: subtotal });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// Primary path — see the file header for why GET instead of POST.
// action=submit-dropoff carries the same fields the old POST body did,
// just as query parameters.
function doGet(e) {
  const action = e.parameter.action;
  if (action !== 'submit-dropoff') {
    return jsonOut_({ error: 'Unknown action' });
  }
  return recordDropoff_({
    submittedAt: e.parameter.submittedAt,
    name: e.parameter.name,
    phone: e.parameter.phone,
    email: e.parameter.email,
    method: e.parameter.method,
    courierProvider: e.parameter.courierProvider,
    trackingNumber: e.parameter.trackingNumber,
    rolls: e.parameter.rolls,
    service: e.parameter.service,
    highResScan: e.parameter.highResScan === 'true',
    payment: e.parameter.payment,
    keepStrips: e.parameter.keepStrips,
    stripsReturn: e.parameter.stripsReturn,
    reference: e.parameter.reference,
    notes: e.parameter.notes
  });
}

// Kept in case POST reliability is ever restored — not currently used by
// dropoff.js (see doGet above).
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Invalid request body' });
  }
  return recordDropoff_(data);
}
