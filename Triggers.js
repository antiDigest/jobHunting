function installContinueTrigger() {
  debugLog_('triggers', 'Installing continuation trigger (every 2 hours)');
  deleteTriggersFor_(CONFIG.CONTINUE_FUNCTION);

  ScriptApp.newTrigger(CONFIG.CONTINUE_FUNCTION)
    .timeBased()
    .everyHours(2)
    .create();
}

function installDailyEmailTrigger() {
  debugLog_('triggers', 'Installing daily 9 AM email trigger');
  deleteTriggersFor_(CONFIG.DAILY_EMAIL_FUNCTION);

  ScriptApp.newTrigger(CONFIG.DAILY_EMAIL_FUNCTION)
    .timeBased()
    .atHour(CONFIG.DAILY_HOUR)
    .nearMinute(0)
    .everyDays(1)
    .create();
}

function installDailyResetTrigger() {
  debugLog_('triggers', 'Installing daily midnight reset trigger');
  deleteTriggersFor_(CONFIG.DAILY_RESET_FUNCTION);

  ScriptApp.newTrigger(CONFIG.DAILY_RESET_FUNCTION)
    .timeBased()
    .atHour(0)
    .nearMinute(0)
    .everyDays(1)
    .create();
}

function deleteTriggersFor_(functionName) {
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });
  debugLog_('triggers', 'Deleted existing triggers', {
    functionName: functionName,
    deleted: deleted
  });
}
