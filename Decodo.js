function scrapeCareerPageWithDecodo_(url) {
  var payload = {
    url: url,
    headless: 'html',
    proxy_pool: 'standard',
    geo: 'United States',
    locale: 'en-us'
  };
  debugLog_('decodo', 'Sending scrape request', {
    url: url,
    payload: payload
  });

  var response = UrlFetchApp.fetch(CONFIG.DECODO_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/json',
      Authorization: getDecodoAuthorizationHeader_()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  debugLog_('decodo', 'Received scrape response', {
    status: status,
    bodyPreview: body.slice(0, 300)
  });

  if (status < 200 || status >= 300) {
    var err = new Error(formatDecodoHttpError_(status, body));
    err.provider = 'decodo';
    err.status = status;
    err.body = body;
    throw err;
  }

  var json = JSON.parse(body);
  var result = json.results && json.results[0];

  if (!result) {
    throw new Error('Decodo returned no content');
  }

  var rawText = getDecodoTextContent_(result);
  if (!rawText) {
    throw new Error('Decodo returned result without text content fields');
  }

  var maxChars = Number(CONFIG.DECODO_MAX_CONTENT_CHARS || 300000);
  var truncatedText = rawText.slice(0, maxChars);
  debugLog_('decodo', 'Selected text content from response', {
    contentLength: rawText.length,
    truncatedLength: truncatedText.length,
    maxChars: maxChars
  });
  return truncatedText;
}

function isDecodoRateLimitError_(err) {
  if (!err || err.provider !== 'decodo') return false;

  if (err.status === 429) return true;

  var body = String(err.body || err.message || '').toLowerCase();
  return body.indexOf('rate limit') !== -1 || body.indexOf('too many requests') !== -1;
}

function getDecodoAuthorizationHeader_() {
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty('DECODO_USERNAME') || '').trim();
  var password = String(props.getProperty('DECODO_PASSWORD') || '').trim();

  if (username && password) {
    debugLog_('decodo-auth', 'Using username/password credentials');
    return 'Basic ' + Utilities.base64Encode(username + ':' + password);
  }

  var token = String(props.getProperty('DECODO_BASIC_TOKEN') || '').trim();
  if (!token) {
    throw new Error(
      'Missing Decodo credentials. In Script Properties set DECODO_USERNAME and DECODO_PASSWORD ' +
      '(from Dashboard > Scraping APIs > your plan > Scraper tab), or set DECODO_BASIC_TOKEN ' +
      'to the Basic auth token from that same page (paste the token only, without a "Basic " prefix).'
    );
  }

  if (/^basic\s+/i.test(token)) {
    token = token.replace(/^basic\s+/i, '').trim();
  }

  // Plaintext "username:password" pasted by mistake instead of the base64 token.
  if (token.indexOf(':') !== -1) {
    debugLog_('decodo-auth', 'Token looks like username:password; base64-encoding before use');
    token = Utilities.base64Encode(token);
  }

  debugLog_('decodo-auth', 'Using basic token credential');
  return 'Basic ' + token;
}

function formatDecodoHttpError_(status, body) {
  var detail = body.slice(0, 500);
  var hint = '';

  if (status === 401) {
    hint = [
      ' Check Decodo Script Properties:',
      ' use Web Scraping API username/password from Dashboard > Scraping APIs > Scraper tab',
      ' (not residential-proxy credentials); set DECODO_USERNAME + DECODO_PASSWORD,',
      ' or paste the dashboard "Basic authentication token" into DECODO_BASIC_TOKEN without a "Basic " prefix.'
    ].join('');
  }

  return 'Decodo failed: HTTP ' + status + ' ' + detail + hint;
}

function getDecodoTextContent_(result) {
  var candidates = [
    result.content,
    result.markdown,
    result.text,
    result.html
  ];

  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return '';
}
