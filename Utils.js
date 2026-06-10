function resolveUrl_(baseUrl, relativeUrl) {
  if (!relativeUrl) return baseUrl;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  
  // Simple resolution: handle both absolute-path relative URLs (/jobs) 
  // and relative-path relative URLs (jobs/123)
  var base = baseUrl.split('?')[0].split('#')[0];
  if (!base.endsWith('/')) base += '/';
  
  if (relativeUrl.startsWith('/')) {
      var matches = base.match(/^(https?:\/\/[^\/]+)/);
      if (matches) return matches[1] + relativeUrl;
  }
  
  return base + relativeUrl.replace(/^\.\//, '');
}

function makeJobKey_(person, targetRole, company, title, url) {
  return [
    String(person || '').toLowerCase().trim(),
    String(targetRole || '').toLowerCase().trim(),
    String(company || '').toLowerCase().trim(),
    String(title || '').toLowerCase().trim(),
    normalizeUrl_(url)
  ].join('|');
}

function normalizeUrl_(url) {
  return String(url || '').trim().split('#')[0];
}

function normalizeSettingsKey_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isDebugLoggingEnabled_() {
  var flag = PropertiesService.getScriptProperties().getProperty('DEBUG_LOGS');
  if (flag === null || typeof flag === 'undefined' || flag === '') return true;
  return String(flag).toLowerCase() !== 'false';
}

function debugLog_(scope, message, data) {
  if (!isDebugLoggingEnabled_()) return;

  var prefix = '[DEBUG][' + scope + '] ' + message;
  if (typeof data === 'undefined') {
    Logger.log(prefix);
    return;
  }

  try {
    Logger.log(prefix + ' | ' + JSON.stringify(data));
  } catch (err) {
    Logger.log(prefix + ' | [unserializable data]');
  }
}
