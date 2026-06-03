function extractAndScoreJobsWithOpenAI_(company, pageText, settings) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  var candidate = getCandidateSettings_(company.person, settings);
  var payload = {
    model: CONFIG.OPENAI_MODEL,
    input: buildAnalysisPrompt_(company, pageText, candidate),
    text: {
      format: {
        type: 'json_schema',
        name: 'job_matches',
        strict: true,
        schema: getOpenAIJobMatchesSchema_()
      }
    }
  };
  debugLog_('openai', 'Sending fallback request', {
    company: company.name,
    person: company.person,
    model: CONFIG.OPENAI_MODEL,
    promptChars: payload.input.length
  });

  var response = UrlFetchApp.fetch(CONFIG.OPENAI_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  debugLog_('openai', 'Received response', {
    status: status,
    bodyPreview: body.slice(0, 300)
  });

  if (status < 200 || status >= 300) {
    var err = new Error('OpenAI failed: HTTP ' + status + ' ' + body.slice(0, 500));
    err.provider = 'openai';
    err.status = status;
    throw err;
  }

  var json = JSON.parse(body);
  var text = getOpenAIText_(json);
  var jobs = parseJobMatches_(text, 'OpenAI');
  debugLog_('openai', 'Parsed jobs', {
    company: company.name,
    jobs: jobs.length
  });
  return jobs;
}

function getOpenAIText_(json) {
  if (json.output_text) return json.output_text;

  var parts = [];
  (json.output || []).forEach(function(item) {
    (item.content || []).forEach(function(content) {
      if (content.text) parts.push(content.text);
    });
  });

  return parts.join('');
}

function isOpenAIRateLimitError_(err) {
  return err && err.provider === 'openai' && err.status === 429;
}
