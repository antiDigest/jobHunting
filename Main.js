/**
 * Run once manually after creating the Apps Script project.
 */
function setup() {
  debugLog_('setup', 'Initializing sheets and triggers');
  setupSheets_();
  installContinueTrigger();
  installDailyEmailTrigger();
  installDailyResetTrigger();
  debugLog_('setup', 'Setup completed');
}

/**
 * Resets the scanner to start from the top of the company list.
 * Should be called once per day (e.g., via a midnight trigger or manually).
 */
function runDailyJobScan() {
  debugLog_('runDailyJobScan', 'Resetting scan state for the day');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SCAN_CURSOR', '0');
  props.setProperty('SCAN_COMPLETED_TODAY', 'false');
  props.setProperty('SCAN_STARTED_AT', new Date().toISOString());
  props.setProperty('SCAN_STATS', JSON.stringify({
    companiesChecked: 0,
    newJobs: 0,
    highPriority: 0,
    errors: 0
  }));
  writeScanState_('started', 0, 'Daily scan reset');
  
  processScanChunk_();
}

/**
 * Entry point for the recurring 2-hour trigger.
 */
function continueJobScan() {
  var props = PropertiesService.getScriptProperties();
  var isCompleted = props.getProperty('SCAN_COMPLETED_TODAY') === 'true';
  
  if (isCompleted) {
    debugLog_('continueJobScan', 'Scan already completed for today, skipping');
    return;
  }

  debugLog_('continueJobScan', 'Triggered continuation run');
  processScanChunk_();
}

function processScanChunk_() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActive();
  var companiesSheet = ss.getSheetByName(CONFIG.COMPANIES_SHEET);
  var jobsSheet = ss.getSheetByName(CONFIG.JOBS_SHEET);

  var settings = getSettings_();
  validateSecrets_(settings);

  var companies = getCompanies_(companiesSheet).slice(0, CONFIG.MAX_COMPANIES);
  var cursor = Number(props.getProperty('SCAN_CURSOR') || '0');
  var stats = JSON.parse(props.getProperty('SCAN_STATS') || '{}');

  if (!companies.length) {
    debugLog_('processScanChunk', 'No companies found, exiting');
    writeScanState_('idle', 0, 'No companies to scan');
    return;
  }

  if (cursor >= companies.length) {
    debugLog_('processScanChunk', 'All companies processed for today');
    props.setProperty('SCAN_COMPLETED_TODAY', 'true');
    writeScanState_('completed', cursor, 'All companies processed for today');
    return;
  }

  var existingKeys = getExistingJobKeys_(jobsSheet);
  var rowsToAppend = [];
  var processedThisChunk = 0;
  var decodoRequestsThisChunk = 0;

  while (
    cursor < companies.length &&
    processedThisChunk < CONFIG.CHUNK_SIZE &&
    Date.now() - started < CONFIG.MAX_RUN_MS
  ) {
    var company = companies[cursor];
    debugLog_('processScanChunk', 'Processing company', {
      cursor: cursor,
      company: company.name
    });

    try {
      decodoRequestsThisChunk++;
      var pageText = scrapeCareerPageWithDecodo_(company.url);
      var analyzedJobs = extractAndScoreJobsWithAI_(company, pageText, settings);

      analyzedJobs.forEach(function(job) {
        var normalizedUrl = normalizeUrl_(job.url || company.url);
        var key = makeJobKey_(company.person, company.targetRole, company.name, job.title, normalizedUrl);

        if (existingKeys.has(key)) return;

        var score = Number(job.score || 0);
        var priority = score >= CONFIG.MIN_SCORE_TO_EMAIL ? 'HIGH' : 'NORMAL';

        rowsToAppend.push([
          new Date(),
          company.person,
          company.targetRole,
          company.name,
          job.title || '',
          normalizedUrl,
          job.location || '',
          job.description || '',
          score,
          priority,
          job.reason || '',
          key
        ]);

        existingKeys.add(key);
        stats.newJobs++;
        if (priority === 'HIGH') stats.highPriority++;
      });

      stats.companiesChecked++;
    } catch (err) {
      if (isDecodoRateLimitError_(err) || isAIRateLimitPauseError_(err)) {
        debugLog_('processScanChunk', 'Pausing due to rate limit', { cursor: cursor, message: err.message });
        appendJobRows_(jobsSheet, rowsToAppend);
        props.setProperty('SCAN_CURSOR', String(cursor));
        props.setProperty('SCAN_STATS', JSON.stringify(stats));
        writeScanState_('paused_rate_limit', cursor, err.message);
        return;
      }

      stats.errors++;
      rowsToAppend.push(buildErrorRow_(company, err));
    }

    cursor++;
    processedThisChunk++;

    if (
      decodoRequestsThisChunk > 0 &&
      decodoRequestsThisChunk % CONFIG.DECODO_BURST_REQUESTS === 0 &&
      cursor < companies.length &&
      processedThisChunk < CONFIG.CHUNK_SIZE &&
      Date.now() - started < CONFIG.MAX_RUN_MS
    ) {
      Utilities.sleep(CONFIG.DECODO_BURST_PAUSE_MS);
    }
  }

  appendJobRows_(jobsSheet, rowsToAppend);
  props.setProperty('SCAN_CURSOR', String(cursor));
  props.setProperty('SCAN_STATS', JSON.stringify(stats));

  if (cursor >= companies.length) {
    props.setProperty('SCAN_COMPLETED_TODAY', 'true');
    writeScanState_('completed', cursor, 'Completed full pass for today');
  } else {
    writeScanState_('running', cursor, 'Processed chunk');
  }

  debugLog_('processScanChunk', 'Chunk finished', {
    cursor: cursor,
    stats: stats,
    elapsedMs: Date.now() - started
  });
}

function sendDailyDigestEmail() {
  debugLog_('sendDailyDigestEmail', 'Starting daily digest email process');
  var ss = SpreadsheetApp.getActive();
  var jobsSheet = ss.getSheetByName(CONFIG.JOBS_SHEET);
  var settings = getSettings_();
  
  // Get all jobs from the sheet
  var data = jobsSheet.getDataRange().getValues();
  if (data.length <= 1) {
    debugLog_('sendDailyDigestEmail', 'No jobs in sheet, skipping email');
    return;
  }
  
  var headers = data[0];
  var rows = data.slice(1);
  
  // Filter for jobs from the last 24 hours
  var now = new Date();
  var twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  
  var recentJobs = rows.filter(function(row) {
    var seenAt = new Date(row[JOB_COLUMNS.SEEN_AT - 1]);
    return seenAt >= twentyFourHoursAgo;
  }).map(function(row) {
    return {
      person: row[JOB_COLUMNS.PERSON - 1],
      targetRole: row[JOB_COLUMNS.TARGET_ROLE - 1],
      company: row[JOB_COLUMNS.COMPANY - 1],
      title: row[JOB_COLUMNS.TITLE - 1],
      url: row[JOB_COLUMNS.URL - 1],
      location: row[JOB_COLUMNS.LOCATION - 1],
      score: Number(row[JOB_COLUMNS.SCORE - 1]),
      priority: row[JOB_COLUMNS.PRIORITY - 1],
      reason: row[JOB_COLUMNS.REASON - 1]
    };
  });
  
  if (!recentJobs.length) {
    debugLog_('sendDailyDigestEmail', 'No recent jobs found to email');
    return;
  }
  
  // Only keep high scoring ones (e.g. score >= 7 or 8)
  var matchedJobs = recentJobs.filter(function(job) {
    return job.score >= CONFIG.MIN_SCORE_TO_EMAIL;
  });
  
  if (!matchedJobs.length) {
    debugLog_('sendDailyDigestEmail', 'No high-scoring matches found today');
    return;
  }
  
  // Sort by score descending
  matchedJobs.sort(function(a, b) {
    return b.score - a.score;
  });
  
  sendHighPriorityEmail_(matchedJobs, {
    companiesChecked: 'N/A (Daily Digest)',
    newJobs: recentJobs.length,
    highPriority: matchedJobs.length,
    errors: 0
  }, settings);
  
  debugLog_('sendDailyDigestEmail', 'Daily digest email sent');
}

function buildErrorRow_(company, err) {
  var message = String(err && err.message ? err.message : err);

  return [
    new Date(),
    company.person,
    company.targetRole,
    company.name,
    'ERROR',
    company.url,
    '',
    '',
    '',
    'ERROR',
    message,
    makeJobKey_(company.person, company.targetRole, company.name, 'ERROR', company.url + '#' + new Date().toISOString())
  ];
}
