function setupSheets_() {
  var ss = SpreadsheetApp.getActive();
  debugLog_('sheets', 'Ensuring required sheets exist');

  var companies = ss.getSheetByName(CONFIG.COMPANIES_SHEET);
  if (!companies) companies = ss.insertSheet(CONFIG.COMPANIES_SHEET);
  if (companies.getLastRow() === 0) {
    companies.appendRow(['Company', 'Role', 'Person', 'Link']);
  }

  var jobs = ss.getSheetByName(CONFIG.JOBS_SHEET);
  if (!jobs) jobs = ss.insertSheet(CONFIG.JOBS_SHEET);
  if (jobs.getLastRow() === 0) {
    jobs.appendRow([
      'Seen At',
      'Person',
      'Target Role',
      'Company',
      'Title',
      'URL',
      'Location',
      'Description',
      'Score',
      'Priority',
      'Reason',
      'Unique Key'
    ]);
  }

  var settings = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settings) settings = ss.insertSheet(CONFIG.SETTINGS_SHEET);
  if (settings.getLastRow() === 0) {
    settings.appendRow(['Key', 'Value']);
    settings.appendRow(['antrikshAlertEmail', 'antriksh@example.com']);
    settings.appendRow(['sunikshaAlertEmail', 'suniksha@example.com']);
    settings.appendRow(['antrikshPreferences', 'Paste Antriksh location, industry, compensation, visa, remote, and company preferences here.']);
    settings.appendRow(['sunikshaPreferences', 'Paste Suniksha location, industry, compensation, visa, remote, and company preferences here.']);
  }

  var scanState = ss.getSheetByName(CONFIG.SCAN_STATE_SHEET);
  if (!scanState) scanState = ss.insertSheet(CONFIG.SCAN_STATE_SHEET);
  if (scanState.getLastRow() === 0) {
    scanState.appendRow(['Updated At', 'Status', 'Cursor', 'Message']);
  }
}

function getCompanies_(sheet) {
  if (!sheet) throw new Error('Missing sheet: ' + CONFIG.COMPANIES_SHEET);

  var values = sheet.getDataRange().getValues();

  var companies = values.slice(1)
    .filter(function(row) {
      return row[0] && row[1] && row[2] && row[3];
    })
    .map(function(row) {
      return {
        name: String(row[0]).trim(),
        targetRole: String(row[1]).trim(),
        person: String(row[2]).trim(),
        url: String(row[3]).trim()
      };
    });
  debugLog_('sheets', 'Loaded companies', { count: companies.length });
  return companies;
}

function getSettings_() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  var values = sheet ? sheet.getDataRange().getValues().slice(1) : [];
  var settings = {};

  values.forEach(function(row) {
    if (row[0]) settings[String(row[0]).trim()] = String(row[1] || '').trim();
  });

  settings.antrikshAlertEmail = props.getProperty('ANTRIKSH_ALERT_EMAIL') || settings.antrikshAlertEmail;
  settings.sunikshaAlertEmail = props.getProperty('SUNIKSHA_ALERT_EMAIL') || settings.sunikshaAlertEmail;
  settings.alertEmail = props.getProperty('ALERT_EMAIL') || settings.alertEmail || '';
  debugLog_('sheets', 'Loaded settings keys', {
    keys: Object.keys(settings).sort()
  });

  return settings;
}

function validateSecrets_(settings) {
  var props = PropertiesService.getScriptProperties();
  debugLog_('secrets', 'Validating required secrets');

  if (!hasDecodoCredentials_(props)) {
    throw new Error(
      'Missing Decodo credentials. Set DECODO_USERNAME and DECODO_PASSWORD, or DECODO_BASIC_TOKEN in Script Properties.'
    );
  }

  if (!props.getProperty('GEMINI_API_KEY')) {
    throw new Error('Missing Script Property: GEMINI_API_KEY');
  }

  if (!props.getProperty('OPENAI_API_KEY')) {
    throw new Error('Missing Script Property: OPENAI_API_KEY');
  }

  validatePersonAlertEmail_(settings, 'antriksh');
  validatePersonAlertEmail_(settings, 'suniksha');
  debugLog_('secrets', 'Secrets validation passed');
}

function hasDecodoCredentials_(props) {
  if (props.getProperty('DECODO_USERNAME') && props.getProperty('DECODO_PASSWORD')) {
    return true;
  }
  return !!props.getProperty('DECODO_BASIC_TOKEN');
}

function validatePersonAlertEmail_(settings, personKey) {
  var key = personKey + 'AlertEmail';
  var fallback = personKey + '@example.com';
  var value = settings[key] || settings.alertEmail;

  if (!value || value === fallback || value === 'you@example.com') {
    throw new Error('Set ' + key + ' in Settings sheet or ' + personKey.toUpperCase() + '_ALERT_EMAIL in Script Properties');
  }
}

function getExistingJobKeys_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();

  var keys = sheet
    .getRange(2, JOB_COLUMNS.UNIQUE_KEY, lastRow - 1, 1)
    .getValues()
    .flat();

  var keySet = new Set(keys.filter(Boolean).map(String));
  debugLog_('sheets', 'Loaded existing job keys', { count: keySet.size });
  return keySet;
}

function appendJobRows_(sheet, rows) {
  if (!rows.length) return;
  debugLog_('sheets', 'Appending rows to Jobs', { count: rows.length });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);
}

function writeScanState_(status, cursor, message) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.SCAN_STATE_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SCAN_STATE_SHEET);
    sheet.appendRow(['Updated At', 'Status', 'Cursor', 'Message']);
  }

  var row = [new Date(), status, cursor, message || ''];
  debugLog_('scan-state', 'Appending scan state row', {
    status: status,
    cursor: cursor,
    message: message || ''
  });

  sheet.appendRow(row);
}
