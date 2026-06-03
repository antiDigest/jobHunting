var CONFIG = {
  COMPANIES_SHEET: 'Companies',
  JOBS_SHEET: 'Jobs',
  SETTINGS_SHEET: 'Settings',
  SCAN_STATE_SHEET: 'Scan State',

  DAILY_FUNCTION: 'runDailyJobScan',
  CONTINUE_FUNCTION: 'continueJobScan',
  DAILY_EMAIL_FUNCTION: 'sendDailyDigestEmail',
  DAILY_RESET_FUNCTION: 'runDailyJobScan',

  DAILY_HOUR: 9,
  MIN_SCORE_TO_EMAIL: 8,
  MAX_COMPANIES: 200,

  // Apps Script executions are time-limited. Process a safe batch, then resume.
  CHUNK_SIZE: 12,
  MAX_RUN_MS: 5 * 60 * 1000,
  CONTINUATION_DELAY_MS: 60 * 1000,
  RATE_LIMIT_RETRY_DELAY_MS: 2 * 60 * 60 * 1000,

  DECODO_ENDPOINT: 'https://scraper-api.decodo.com/v2/scrape',
  DECODO_MAX_CONTENT_CHARS: 300000,
  DECODO_BURST_REQUESTS: 5,
  DECODO_BURST_PAUSE_MS: 3000,
  GEMINI_ENDPOINT_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_MODEL: 'gemini-2.5-flash-lite',
  OPENAI_ENDPOINT: 'https://api.openai.com/v1/responses',
  OPENAI_MODEL: 'gpt-4.1-mini'
};

var JOB_COLUMNS = {
  SEEN_AT: 1,
  PERSON: 2,
  TARGET_ROLE: 3,
  COMPANY: 4,
  TITLE: 5,
  URL: 6,
  LOCATION: 7,
  DESCRIPTION: 8,
  SCORE: 9,
  PRIORITY: 10,
  REASON: 11,
  UNIQUE_KEY: 12
};
