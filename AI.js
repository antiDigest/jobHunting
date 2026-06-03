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
    'Extract all current job listings from the following career page content. For each job, return its title and the absolute URL to its individual job posting. If no specific URL is found for a job, use the career page URL itself.',
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
            text: buildAnalysisPrompt_(company, jobTitle, jobUrl, jobDescriptionText, candidate)
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

  var jobLinks = [];
  try {
    jobLinks = extractJobLinksWithGemini_(company, careerPageText, settings);
  } catch (err) {
    if (!isGeminiRateLimitError_(err)) {
      debugLog_('ai', 'Gemini job links extraction failed with non-rate-limit error', {
        company: company.name,
        error: String(err && err.message ? err.message : err)
      });
      throw err;
    }

    debugLog_('ai', 'Gemini job links extraction rate limited, falling back to OpenAI', {
      company: company.name,
      person: company.person,
      status: err.status
    });
    jobLinks = extractJobLinksWithOpenAI_(company, careerPageText, settings);
  }

  debugLog_('ai', 'Extracted job links', {
    company: company.name,
    count: jobLinks.length
  });

  // This function now primarily returns job links. The actual scraping and scoring for individual jobs will happen in Main.js processScanChunk_.
  return jobLinks;
}



function extractJobLinksWithOpenAI_(company, careerPageText, settings) {
  // Implement OpenAI fallback for job link extraction
  debugLog_('openai', 'Falling back to OpenAI for job link extraction (not implemented)', { company: company.name });
  throw new Error('OpenAI fallback for job link extraction not implemented.');
}

function scoreSingleJobWithOpenAI_(company, jobTitle, jobUrl, jobDescriptionText, settings) {
  debugLog_('openai', 'Falling back to OpenAI for single job scoring', { company: company.name, jobTitle: jobTitle });
  
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  var candidate = getCandidateSettings_(company.person, settings);
  
  var payload = {
    model: CONFIG.OPENAI_MODEL,
    messages: [
      { role: 'user', content: buildAnalysisPrompt_(company, jobTitle, jobUrl, jobDescriptionText, candidate) }
    ],
    response_format: { type: 'json_object' }
  };
  
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
  
  if (status === 429) {
    var err = new Error('OpenAI rate limited');
    err.pauseScan = true;
    err.provider = 'openai';
    err.status = status;
    throw err;
  }
  
  if (status < 200 || status >= 300) {
    var err = new Error('OpenAI (single job) failed: HTTP ' + status + ' ' + body.slice(0, 500));
    err.provider = 'openai';
    err.status = status;
    throw err;
  }
  
  var json = JSON.parse(body);
  // Need a way to parse this response based on OpenAI structure, similar to how extractAndScoreJobsWithOpenAI_ does it
  var content = json.choices[0].message.content;
  var jobs = parseJobMatches_(content, 'OpenAI');
  
  if (jobs.length !== 1) {
    throw new Error('OpenAI returned ' + jobs.length + ' jobs for a single job scoring request. Expected 1.');
  }
  return jobs[0]; // Return the single scored job
}

function scoreSingleJobWithAI_(company, jobTitle, jobUrl, jobDescriptionText, settings) {
  debugLog_('ai', 'Starting scoring for single job', {
    company: company.name,
    jobTitle: jobTitle,
    jobUrl: jobUrl,
    descriptionChars: jobDescriptionText.length
  });
  var candidate = getCandidateSettings_(company.person, settings);
  try {
    var geminiScore = scoreSingleJobWithGemini_(company, jobTitle, jobUrl, jobDescriptionText, settings);
    return geminiScore;
  } catch (err) {
    if (!isGeminiRateLimitError_(err)) {
      debugLog_('ai', 'Gemini single job scoring failed with non-rate-limit error', {
        company: company.name,
        jobTitle: jobTitle,
        error: String(err && err.message ? err.message : err)
      });
      throw err;
    }

    debugLog_('ai', 'Gemini single job scoring rate limited, falling back to OpenAI', {
      company: company.name,
      jobTitle: jobTitle,
      status: err.status
    });
    return scoreSingleJobWithOpenAI_(company, jobTitle, jobUrl, jobDescriptionText, settings);
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

function buildAnalysisPrompt_(company, jobTitle, jobUrl, jobDescriptionText, candidate) {
  var lines = [
    'Analyze the following single job description and score it based on the candidate profile.',
    'SCORING PROCESS (STRICT):',
    '1. Extract all important technical and functional keywords from THIS job description.',
    '2. Compare these keywords ONLY against the "Strong matching keywords" listed in the candidate profile below.',
    '3. Calculate the score (1-10) based strictly on this keyword overlap:',
    '   - 10: Perfect match (all keywords match).',
    '   - 8: Strong match (75%+ keywords match).',
    '   - 6: Moderate match (50%+ keywords match).',
    '   - 4: Weak match (30%+ keywords match).',
    '   - 2 or lower: Little to no match (less than 20% keywords match).',
    '4. DO NOT give high scores (8+) unless there is concrete keyword evidence.',
    '5. In the "reason" field, list the matching keywords found.',
    '',
    'Candidate name:',
    company.person,
    '',
    'Candidate profile (including "Strong matching keywords"):',
    candidate.profile,
    '',
    'Exact target role from the sheet (for context, but primary matching is keyword-based):',
    company.targetRole,
    '',
    'Preferences:',
    candidate.preferences,
    '',
    'Company: ' + company.name,
    'Job Title: ' + jobTitle,
    'Job URL: ' + jobUrl,
    '',
    'Job Description Content:',
    jobDescriptionText
  ];

  if (isAntriksh_(company.person)) {
    lines.splice(2, 0,
      'STRICT RULES FOR ANTRIKSH:',
      '- Consider only the job title and description provided here.',
      '- Return roles only when title strongly matches the exact target role family; reject adjacent/non-matching families.',
      '- Return roles only when description/responsibilities clearly align with Antriksh profile strengths (backend/platform/distributed systems/cloud/infrastructure).',
      '- If title fit is weak OR description-to-profile evidence is weak, the overall score should be low (4 or less).'
    );
  }

  return lines.join('\n');
}

function buildAnalysisPrompt_(company, pageText, candidate) {
  var lines = [
    'Extract only real current job listings from this career page.',
    'Ignore navigation links, benefits pages, expired jobs, generic pages, and roles that are not actual openings.',
    '',
    'SCORING PROCESS (STRICT):',
    '1. For each role, extract the 10 most important technical and functional keywords from its description.',
    '2. Compare these 10 keywords ONLY against the "Strong matching keywords" listed in the candidate profile below.',
    '3. Calculate the score (1-10) based strictly on this keyword overlap:',
    '   - 10: Perfect match (8-10 keywords match).',
    '   - 8: Strong match (6-7 keywords match).',
    '   - 6: Moderate match (4-5 keywords match).',
    '   - 4: Weak match (2-3 keywords match).',
    '   - 2 or lower: Little to no match (0-1 keywords match).',
    '4. DO NOT give high scores (8+) unless there is concrete keyword evidence. Be stingy with high scores.',
    '5. In the "reason" field, list the matching keywords found.',
    '',
    'Candidate name:',
    company.person,
    '',
    'Candidate profile (including "Strong matching keywords"):',
    candidate.profile,
    '',
    'Exact target role from the sheet:',
    company.targetRole,
    '',
    'Preferences:',
    candidate.preferences,
    '',
    'Company: ' + company.name,
    'Career URL: ' + company.url,
    '',
    'Career page content:',
    pageText
  ];

  if (isAntriksh_(company.person)) {
    lines.splice(2, 0,
      'STRICT RULES FOR ANTRIKSH:',
      '- Return roles only when title strongly matches the exact target role family; reject adjacent/non-matching families.',
      '- Return roles only when description/responsibilities clearly align with Antriksh profile strengths (backend/platform/distributed systems/cloud/infrastructure).',
      '- If title fit is weak OR description-to-profile evidence is weak, exclude that role entirely.'
    );
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

  return {
    profile: profile,
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
