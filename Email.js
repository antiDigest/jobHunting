function sendHighPriorityEmail_(jobs, stats, settings) {
  if (!jobs.length) {
    debugLog_('email', 'No high-priority jobs to email');
    return;
  }

  var grouped = groupJobsByPerson_(jobs);
  debugLog_('email', 'Preparing grouped digest emails', {
    groups: Object.keys(grouped),
    totalJobs: jobs.length
  });

  Object.keys(grouped).forEach(function(personKey) {
    var personJobs = grouped[personKey];
    var to = getAlertEmailForPerson_(personKey, settings);

    if (!to) {
      throw new Error('Missing alert email for person key: ' + personKey);
    }

    sendPersonHighPriorityEmail_(to, personJobs, stats);
  });
}

function sendPersonHighPriorityEmail_(to, jobs, stats) {
  var personLabel = jobs[0] && jobs[0].person ? jobs[0].person : 'candidate';
  var subject = personLabel + ' high-priority job matches: ' + jobs.length;
  var body = [
    'High-priority roles found today for ' + personLabel + ':',
    '',
    jobs.map(formatJobForEmail_).join('\n\n'),
    '',
    'Run summary:',
    'Companies checked: ' + stats.companiesChecked,
    'New jobs logged: ' + stats.newJobs,
    'High priority: ' + stats.highPriority,
    'Errors: ' + stats.errors
  ].join('\n');

  MailApp.sendEmail(to, subject, body);
  debugLog_('email', 'Sent digest email', {
    recipient: to,
    person: personLabel,
    jobs: jobs.length
  });
}

function groupJobsByPerson_(jobs) {
  return jobs.reduce(function(grouped, job) {
    var key = normalizeSettingsKey_(job.person);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(job);
    return grouped;
  }, {});
}

function getAlertEmailForPerson_(personKey, settings) {
  var direct = settings[personKey + 'AlertEmail'];
  if (direct) return direct;

  if (personKey === 'antrikshagarwal') return settings.antrikshAlertEmail;
  if (personKey === 'sunikshagupta') return settings.sunikshaAlertEmail;

  return settings.alertEmail || '';
}

function formatJobForEmail_(job) {
  return [
    'For: ' + job.person + ' (' + job.targetRole + ')',
    job.company + ' - ' + job.title,
    'Score: ' + job.score,
    job.location ? 'Location: ' + job.location : '',
    job.reason ? 'Why: ' + job.reason : '',
    job.url
  ].filter(Boolean).join('\n');
}
