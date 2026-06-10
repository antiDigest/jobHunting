function getGeminiJobLinksSchema_() {
  return {
    type: 'OBJECT',
    properties: {
      jobs: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            url: { type: 'STRING' }
          },
          required: ['title', 'url']
        }
      }
    },
    required: ['jobs']
  };
}

function extractJobLinksWithGemini_(company, pageText, settings) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var url = [
    CONFIG.GEMINI_ENDPOINT_BASE,
    '/',
    CONFIG.GEMINI_MODEL,
    ':generateContent?key=',
    encodeURIComponent(apiKey)
  ].join('');

  var prompt = [
    'Extract all current job listings from the following career page content.',
    'For each job, return its title and the URL.',
    'IMPORTANT: Only return jobs that have a specific, unique URL to the posting.',
    'DO NOT return jobs if a specific URL is missing or if you have to guess/fallback to the "Career URL" itself.',
    'If the URL on the page is relative (e.g., "/jobs/123"), you MUST prepend the provided "Career URL" to make it absolute.',
    '',
    'Company: ' + company.name,
    'Career URL: ' + company.url,
    '',
    'Career page content:',
    pageText
  ].join('\n');

  var payload = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: getGeminiJobLinksSchema_()
    }
  };

  debugLog_('gemini', 'Sending job links extraction request', {
    company: company.name,
    model: CONFIG.GEMINI_MODEL,
    promptChars: prompt.length
  });

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  debugLog_('gemini', 'Received job links response', {
    status: status,
    bodyPreview: body.slice(0, 300)
  });

  if (status < 200 || status >= 300) {
    var err = new Error('Gemini (job links) failed: HTTP ' + status + ' ' + body.slice(0, 500));
    err.provider = 'gemini';
    err.status = status;
    throw err;
  }

  var parsed = JSON.parse(stripJsonFences_(getGeminiText_(JSON.parse(body))));
  if (!parsed || !Array.isArray(parsed.jobs)) {
    throw new Error('Gemini returned JSON without a jobs array for job links');
  }
  return parsed.jobs;
}

function scoreSingleJobWithGemini_(company, jobTitle, jobUrl, jobDescriptionText, settings) {
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
            text: buildSingleJobAnalysisPrompt_(company, jobTitle, jobUrl, jobDescriptionText, candidate)
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: getGeminiJobMatchesSchema_()
    }
  };
  debugLog_('gemini', 'Sending single job scoring request', {
    company: company.name,
    person: company.person,
    jobTitle: jobTitle,
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
  debugLog_('gemini', 'Received single job scoring response', {
    status: status,
    bodyPreview: body.slice(0, 300)
  });

  if (status < 200 || status >= 300) {
    var err = new Error('Gemini (single job) failed: HTTP ' + status + ' ' + body.slice(0, 500));
    err.provider = 'gemini';
    err.status = status;
    throw err;
  }

  var jobs = parseJobMatches_(getGeminiText_(JSON.parse(body)), 'Gemini');
  if (jobs.length !== 1) {
    throw new Error('Gemini returned ' + jobs.length + ' jobs for a single job scoring request. Expected 1.');
  }
  return jobs[0]; // Return the single scored job
}

function extractJobLinksWithAI_(company, careerPageText, settings) {
  debugLog_('ai', 'Starting job link extraction', {
    company: company.name,
    person: company.person,
    careerPageChars: careerPageText.length
  });

  try {
    var jobLinks = extractJobLinksWithGemini_(company, careerPageText, settings);
    debugLog_('ai', 'Extracted job links', {
      company: company.name,
      count: jobLinks.length,
      links: jobLinks.map(function(j) { return j.url; })
    });
    return jobLinks;
  } catch (err) {
    if (isGeminiRateLimitError_(err)) {
      debugLog_('ai', 'Gemini job links extraction rate limited', {
        company: company.name,
        person: company.person,
        status: err.status
      });
      // Throw pause error to Main.js to pause the scan
      var pauseErr = new Error('Gemini job links extraction rate limited');
      pauseErr.pauseScan = true;
      throw pauseErr;
    }
    
    debugLog_('ai', 'Gemini job links extraction failed with non-rate-limit error', {
      company: company.name,
      error: String(err && err.message ? err.message : err)
    });
    throw err;
  }
}

function scoreSingleJobWithAI_(company, jobTitle, jobUrl, jobDescriptionText, settings) {
  debugLog_('ai', 'Starting scoring for single job', {
    company: company.name,
    jobTitle: jobTitle,
    jobUrl: jobUrl,
    descriptionChars: jobDescriptionText.length
  });
  
  try {
    return scoreSingleJobWithGemini_(company, jobTitle, jobUrl, jobDescriptionText, settings);
  } catch (err) {
    if (isGeminiRateLimitError_(err)) {
      debugLog_('ai', 'Gemini single job scoring rate limited', {
        company: company.name,
        jobTitle: jobTitle,
        status: err.status
      });
      // Throw pause error to Main.js to pause the scan
      var pauseErr = new Error('Gemini single job scoring rate limited');
      pauseErr.pauseScan = true;
      throw pauseErr;
    }

    debugLog_('ai', 'Gemini single job scoring failed with non-rate-limit error', {
      company: company.name,
      jobTitle: jobTitle,
      error: String(err && err.message ? err.message : err)
    });
    throw err;
  }
}

function createAIRateLimitPauseError_(geminiErr, openAIErr) {
  var err = new Error('Both Gemini and OpenAI are rate-limited. Pausing scan for retry.');
  err.pauseScan = true;
  err.geminiStatus = geminiErr && geminiErr.status;
  err.openAIStatus = openAIErr && openAIErr.status;
  return err;
}

function isAIRateLimitPauseError_(err) {
  return err && err.pauseScan === true;
}

function buildSingleJobAnalysisPrompt_(company, jobTitle, jobUrl, jobDescriptionText, candidate) {
  var rules = [
    'Score 1-10: 10=Perf(100% keywords), 8=Strong(75%), 6=Mod(50%), 4=Weak(30%), 2=Poor(<20%).',
    'Evidence-based only. In "reason", list matching keywords found.',
  ];
  if (isAntriksh_(company.person)) {
    rules.push('Antriksh Rules: Only match strong title family alignment and specific profile strengths (backend/platform/infra).');
  }

  var lines = [
    'Analyze role for: ' + company.person,
    'Target Role: ' + company.targetRole,
    'Profile/Strong Keywords: ' + candidate.profile,
    'Rules: ' + rules.join(' '),
    '---',
    'Company: ' + company.name,
    'Job: ' + jobTitle,
    'Description: ' + jobDescriptionText
  ];
  return lines.join('\n');
}

function buildCareerPageExtractionPrompt_(company, pageText, candidate) {
  var lines = [
    'Extract current job listings. Return title, URL.',
    'Scoring: 10=Perf, 8=Strong, 6=Mod, 4=Weak, 2=Poor.',
    'Candidate: ' + company.person,
    'Target: ' + company.targetRole,
    'Profile: ' + candidate.profile,
    '---',
    'Company: ' + company.name,
    'Content: ' + pageText
  ];

  if (isAntriksh_(company.person)) {
    lines.splice(1, 0, 'Antriksh Rules: Only return roles with strong title match and infrastructure/cloud alignment.');
  }

  return lines.join('\n');
}

function getCandidateSettings_(person, settings) {
  var key = normalizeSettingsKey_(person);
  var profile = getStaticProfile_(key) || settings[key + 'Profile'];
  var preferences = settings[key + 'Preferences'] || '';

  if (!profile) {
    throw new Error('Missing Settings profile for person "' + person + '". Expected key: ' + key + 'Profile');
  }

  // Extract keywords
  var keywords = '';
  var match = profile.match(/Strong matching keywords:\s*([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i);
  if (match && match[1]) {
    keywords = match[1].trim();
  } else {
    // Fallback: send full profile if keywords not found
    keywords = profile;
  }

  return {
    profile: keywords,
    preferences: preferences
  };
}

function getStaticProfile_(key) {
  if (typeof STATIC_PROFILES === 'undefined') return '';
  return STATIC_PROFILES[key] || '';
}

function parseJobMatches_(text, providerName) {
  var parsed = JSON.parse(stripJsonFences_(text));

  if (!parsed || !Array.isArray(parsed.jobs)) {
    throw new Error(providerName + ' returned JSON without a jobs array');
  }

  return parsed.jobs;
}

function stripJsonFences_(text) {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
}

function getOpenAIJobMatchesSchema_() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            location: { type: 'string' },
            description: { type: 'string' },
            score: { type: 'number' },
            reason: { type: 'string' }
          },
          required: ['title', 'url', 'location', 'description', 'score', 'reason']
        }
      }
    },
    required: ['jobs']
  };
}

function getGeminiJobMatchesSchema_() {
  return {
    type: 'OBJECT',
    properties: {
      jobs: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            url: { type: 'STRING' },
            location: { type: 'STRING' },
            description: { type: 'STRING' },
            score: { type: 'NUMBER' },
            reason: { type: 'STRING' }
          },
          required: ['title', 'url', 'location', 'description', 'score', 'reason']
        }
      }
    },
    required: ['jobs']
  };
}

function applyStrictPersonRules_(company, jobs, candidate) {
  if (!isAntriksh_(company.person)) return jobs;

  var filtered = jobs.filter(function(job) {
    return isStrictTitleMatch_(job.title, company.targetRole) &&
      hasStrongDescriptionProfileMatch_(job, candidate);
  });

  debugLog_('ai', 'Applied strict Antriksh filtering', {
    company: company.name,
    before: jobs.length,
    after: filtered.length
  });

  return filtered;
}

function isAntriksh_(person) {
  var key = normalizeSettingsKey_(person);
  return key === 'antriksh' || key === 'antrikshagarwal';
}

function isStrictTitleMatch_(title, targetRole) {
  var titleTokens = getMeaningfulTokens_(title);
  var targetTokens = getMeaningfulTokens_(targetRole);

  if (!titleTokens.length || !targetTokens.length) return false;

  var matches = targetTokens.filter(function(token) {
    return titleTokens.indexOf(token) !== -1;
  }).length;

  // Strict: all target-role tokens should appear in the title.
  return matches >= targetTokens.length;
}

function hasStrongDescriptionProfileMatch_(job, candidate) {
  var text = [
    job.description || '',
    job.reason || ''
  ].join(' ').toLowerCase();
  if (!text.trim()) return false;

  var profile = String(candidate && candidate.profile ? candidate.profile : '').toLowerCase();
  var keywords = [
    'backend',
    'platform',
    'distributed',
    'microservices',
    'kubernetes',
    'cloud',
    'golang',
    'python',
    'infrastructure',
    'api',
    'reliability',
    'observability'
  ];

  var hits = keywords.filter(function(keyword) {
    return text.indexOf(keyword) !== -1 && profile.indexOf(keyword) !== -1;
  }).length;

  // Strict: require multiple shared signals between JD and profile.
  return hits >= 2;
}

function getMeaningfulTokens_(value) {
  var stopwords = {
    and: true,
    or: true,
    the: true,
    a: true,
    an: true,
    of: true,
    to: true,
    for: true,
    in: true,
    ii: true,
    iii: true,
    iv: true,
    sr: true,
    senior: true,
    staff: true,
    principal: true
  };

  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(function(token) {
      return token && !stopwords[token];
    });
}
