function extractAndScoreJobsWithGemini_(company, pageText, settings) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var candidate = getCandidateSettings_(company.person, settings);
  var url = [
    CONFIG.GEMINI_ENDPOINT_BASE,
    '/',
    CONFIG.GEMINI_MODEL,
    ':generateContent?key=',
    encodeURIComponent(apiKey)
  ].join('');

  var payload = {
    contents: [
      {
        parts: [
          {
            text: buildAnalysisPrompt_(company, pageText, candidate)
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: getGeminiJobMatchesSchema_()
    }
  };
  debugLog_('gemini', 'Sending request', {
    company: company.name,
    person: company.person,
    model: CONFIG.GEMINI_MODEL,
    promptChars: payload.contents[0].parts[0].text.length
  });

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  debugLog_('gemini', 'Received response', {
    status: status,
    bodyPreview: body.slice(0, 300)
  });

  if (status < 200 || status >= 300) {
    var err = new Error('Gemini failed: HTTP ' + status + ' ' + body.slice(0, 500));
    err.provider = 'gemini';
    err.status = status;
    throw err;
  }

  var jobs = parseJobMatches_(getGeminiText_(JSON.parse(body)), 'Gemini');
  debugLog_('gemini', 'Parsed jobs', {
    company: company.name,
    jobs: jobs.length
  });
  return jobs;
}

function getGeminiText_(json) {
  if (!json.candidates || !json.candidates.length) {
    throw new Error('Gemini returned no candidates');
  }

  var parts = json.candidates[0].content && json.candidates[0].content.parts;
  if (!parts || !parts.length) {
    throw new Error('Gemini returned no content parts');
  }

  return parts.map(function(part) {
    return part.text || '';
  }).join('').trim();
}

function isGeminiRateLimitError_(err) {
  return err && err.provider === 'gemini' && (err.status === 429 || err.status === 403);
}
