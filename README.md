# Career Page Scanner for Google Apps Script

Reads company career pages from a Google Sheet, scrapes them with Decodo, scores new jobs with Gemini against the correct person's resume and target role, falls back to OpenAI if Gemini is rate-limited, logs everything to Sheets, and emails only high-priority matches.

## Files

- `Main.js`: setup, daily entry point, chunked scan loop
- `Config.js`: sheet names, thresholds, endpoints, trigger settings
- `Sheets.js`: sheet setup, settings, company loading, job logging
- `Decodo.js`: Decodo Web Scraping API call
- `AI.js`: shared prompt/schema/parsing and Gemini-primary provider selection
- `Gemini.js`: primary job extraction and relevance scoring
- `OpenAI.js`: fallback job extraction and relevance scoring when Gemini is rate-limited
- `Profiles.js`: static candidate profiles/resume text bundled into Apps Script
- `Email.js`: high-priority email digest
- `Triggers.js`: daily and continuation trigger helpers
- `Utils.js`: URL normalization and unique keys
- `appsscript.json`: Apps Script manifest and OAuth scopes

## Sheet Layout

Create a Google Sheet named `Job Hunting`, then add this Apps Script project to that spreadsheet as a bound script.

`Companies`

| Company | Role | Person | Link |
| --- | --- | --- | --- |
| Acme | Product Manager | Antriksh | https://example.com/careers |
| ExampleCo | Data Analyst | Suniksha | https://example.com/jobs |

`Jobs`, `Settings`, and `Scan State` are created by `setup()`.

## Script Properties

Set these in Apps Script under **Project Settings > Script properties**:

- `GEMINI_API_KEY`: your Gemini API key, used as the primary scoring provider
- `OPENAI_API_KEY`: your OpenAI API key, used only as fallback if Gemini is rate-limited
- `DECODO_USERNAME` and `DECODO_PASSWORD`: primary auth path. Copy from **Dashboard → Scraping APIs → your plan → Scraper** (Web Scraping API credentials). The script base64-encodes `username:password` on each request.
- `DECODO_BASIC_TOKEN`: secondary fallback only. Paste the **Basic authentication token** from that same Scraper tab (do not add a `Basic ` prefix; the script adds it).
- `DEBUG_LOGS`: optional. Defaults to enabled. Set to `false` to suppress `[DEBUG]` log lines in Apps Script execution logs.
- `DECODO_BURST_REQUESTS`: optional throttle setting. Defaults to `5`; after this many Decodo requests in a chunk, the script pauses.
- `DECODO_BURST_PAUSE_MS`: optional throttle pause in milliseconds. Defaults to `3000`.
- `ANTRIKSH_ALERT_EMAIL`: optional if you set `antrikshAlertEmail` in the `Settings` sheet
- `SUNIKSHA_ALERT_EMAIL`: optional if you set `sunikshaAlertEmail` in the `Settings` sheet

## Setup

1. Copy these files into a bound Google Apps Script project.
2. Run `setup()` once manually.
3. Approve the requested permissions.
4. Fill `Companies` with up to 200 rows using `Company | Role | Person | Link`.
5. Fill `Settings` with `antrikshAlertEmail`, `sunikshaAlertEmail`, `antrikshPreferences`, and `sunikshaPreferences`. Both resume profiles are bundled in `Profiles.js`.

The script installs a recurring 2-hour trigger. It processes career pages in chunks because Apps Script has execution time limits, then resumes on the next 2-hour run.

If Gemini is rate-limited, the script falls back to OpenAI for that same company. If OpenAI is also rate-limited, or if Decodo is rate-limited, the script writes the current cursor to `Scan State` and leaves the next 2-hour trigger to resume from that point.

## Manual Runs

- `runDailyJobScan()`: start a full scan now
- `continueJobScan()`: resume from the saved cursor
- `installContinueTrigger()`: recreate the recurring 2-hour trigger

## Notes

- Each row is scored only against that row's `Person` and `Role`.
- `Person` must match a profile prefix after lowercasing and removing spaces/punctuation. For example, `Antriksh` or `Antriksh Agarwal` uses the static Antriksh profile; `Suniksha` or `Suniksha Gupta` uses the static Suniksha profile.
- Jobs are deduplicated by person, target role, company, title, and normalized URL.
- Rows with API errors are logged in `Jobs` with `Priority = ERROR`.
- Only scores `>= 8` are included in the email digest.
- Antriksh and Suniksha receive separate email digests based on the row's `Person` value.
