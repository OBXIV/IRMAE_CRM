'use strict';

const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const { runOwnershipCheck } = require('./src/runOwnershipCheck');

admin.initializeApp({
  databaseURL: 'https://iramecrm-default-rtdb.firebaseio.com',
});

const COMMON = {
  region: 'us-central1',
  memory: '512MiB',
  timeoutSeconds: 540, // 9 min — the loop is throttled and may run long
};

// Breakage alerting: when a county portal changes its site and a provider stops
// returning owners, the run emits a `logger.error('[ownership][ALERT] ...')`
// line and writes `systemHealth/ownership` in RTDB. Two ways to be notified:
//   1) Cloud Logging alert (no code): create a log-based alert policy on
//      severity=ERROR containing "[ownership][ALERT]" -> email/SMS.
//   2) Instant webhook (Slack/Zapier/email relay): set the env var
//      OWNERSHIP_ALERT_WEBHOOK_URL (add it to the secrets arrays below and run
//      `firebase functions:secrets:set OWNERSHIP_ALERT_WEBHOOK_URL`). When unset,
//      alerting still works via the ERROR log + Firebase node above.

// Nightly scheduled run. 3:15am Mountain time.
exports.nightlyOwnershipCheck = onSchedule(
  { schedule: '15 3 * * *', timeZone: 'America/Boise', ...COMMON },
  async () => {
    await runOwnershipCheck(admin.database(), { logger });
  },
);

// Manual trigger for testing without waiting for the schedule.
// Protected by a shared secret to avoid open invocation:
//   firebase functions:secrets:set OWNERSHIP_RUN_TOKEN
// then call: https://<region>-iramecrm.cloudfunctions.net/runOwnershipCheckNow?token=...
exports.runOwnershipCheckNow = onRequest(
  { ...COMMON, secrets: ['OWNERSHIP_RUN_TOKEN'] },
  async (req, res) => {
    const expected = process.env.OWNERSHIP_RUN_TOKEN;
    if (!expected || req.query.token !== expected) {
      res.status(403).send('forbidden');
      return;
    }
    const summary = await runOwnershipCheck(admin.database(), { logger });
    res.status(200).json(summary);
  },
);
