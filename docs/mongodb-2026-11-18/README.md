# MongoDB deployment

The consolidated source and normal local preview remain in
`/Users/zhangzhuoru/Desktop/master/speaknow-audit` (`npm run dev`, localhost:5173).
This change adds MongoDB Atlas as a persistent store for users, private practice
records, authentication sessions, rate limits, usage, memberships, administrator
analytics and recordings. Selecting MongoDB does not read or copy the old
Supabase database. Existing Supabase support is retained for existing deployments.

## Production configuration

Use an Atlas **database user**, not a GitHub/MongoDB website login password.
Grant that database user `readWrite` only on the dedicated `speaknow` database.
Allow the deployment's network access in Atlas. Obtain its driver connection
string from the cluster's Connect dialog. Percent-encode special characters in
the database password when assembling a URI; prefer the supplied driver URI.

Place the two values in `.env.mongodb.local` (ignored by Git and Vercel uploads):

```dotenv
MONGODB_URI=mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@CLUSTER_HOST/?retryWrites=true&w=majority
MONGODB_DB=speaknow
```

The server uses `SPEAKNOW_STORAGE_PROVIDER=mongodb` and `FORCE_LOCAL_DATA=false`.
The provider selection takes precedence over any old Supabase variables. A
missing or failing MongoDB connection fails closed; it never writes to local
JSON or silently switches databases. Credentials have no `VITE_` prefix and
never enter the browser. The server reuses a bounded pool per warm instance.

Run `node scripts/deploy-mongodb.mjs` to initialize collections/indexes and
verify database read/write using a disposable, expiring preflight marker. This
does not change Vercel. Index creation requires an appropriately scoped database
user. The preflight never changes real users, transcripts, or usage counters.

When preflight succeeds, `node scripts/deploy-mongodb.mjs --stage` configures the
linked Vercel project's production variables via stdin and builds a production
candidate using `--skip-domain`. If the CLI is not on PATH, set
`VERCEL_CLI_PATH` to its JavaScript entry point. The script does not promote the
candidate. Verify real online registration/login, account isolation, practice
save/reload, membership and private media before `vercel promote <candidate>`.
The existing domain continues to serve its previous deployment until promotion.

## Storage behavior

- Natural primary keys and unique email indexes prevent duplicate registration.
- Rate reservations use atomic MongoDB updates, including expiry and refunds.
- Membership ledger updates retain revision-based compare-and-swap and retries.
- Impact recording append/analysis uses a revision check to prevent lost updates.
- Session expiry is checked during authentication; TTL indexes perform cleanup.
- Recordings up to the existing 10 MB limit are private BSON binary documents,
  below MongoDB's 16 MB document limit. Uploads cannot overwrite an existing key.
  HTTP routes retain account ownership checks before reads, writes and deletion.
- Browser account-sync labels recognize MongoDB without changing daily/exam
  interaction, navigation, microphone/camera behavior or scoring.

## Verification recorded on 2026-11-18

- Existing automated suite: 201 passed.
- `npm run test:mongodb`: 12 passed against an isolated real MongoDB 8.0.17
  process. Includes 60 concurrent budget requests and 20 competing ledger CAS
  writes, plus ownership, CSRF, reconnect persistence and recording bytes.
- `node tests/learning/mongodb-browser.mjs`: real browser registration, login,
  cloud practice save and history reload, with 1365px / 390px / 320px review
  screenshots and no page errors. Uses an isolated local MongoDB, not Atlas.
- Lint, typecheck and local build passed before the final documentation update.
- No Atlas production connection or production deployment has yet been verified.
  Those remain required; local tests do not establish production readiness.

Test fixture transcripts are synthetic. These checks make no claim about model
quality, acoustic accuracy, provider availability, or capacity under real load.

References: [MongoDB connection pooling](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/),
[atomic updates](https://www.mongodb.com/docs/manual/reference/method/db.collection.findOneAndUpdate/).
