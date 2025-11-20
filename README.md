# Job Tracker Webapp

Simple Express + Cosmos DB app that lets you connect a Google account, fetch Gmail messages, classify job‑related emails with OpenAI, and track applications per company. The UI serves a single welcome page that shows your application summary and buttons to connect Gmail or trigger a manual fetch.

## Features
- Google Sign-In with persistent session cookies (10-day expiry).
- Gmail OAuth flow that stores refresh tokens/state in Azure Key Vault.
- Scheduled Gmail ingestion at **12:45 AM Eastern** that pulls the previous day's emails; manual “Fetch Gmail now” button for on-demand runs.
- OpenAI classification for each unprocessed email (applied, rejected, next steps, comment-only, or ignored) with results stored in Cosmos.
- Per-user storage: Gmail messages and job counters partitioned by the signed-in Google email.

## Requirements
- Node.js 18+ (tested on v24).
- Azure Cosmos DB account (SQL API) for `gmaildb/emails` and `jobsdb/applications`.
- Azure Key Vault access for secrets (refresh tokens, Gmail state).
- OpenAI API key for classification (e.g., `gpt-4o-mini`).
- Google Cloud OAuth credentials (client ID + secret).

## Setup
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create `.env` from `.env.example`** and set:
   - Cosmos URI/key + database/container names.
   - `KEY_VAULT_URI` and ensure `DefaultAzureCredential` can access it (via `az login` or service principal env vars).
   - Google OAuth client values (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URI).
   - `OPENAI_API_KEY`, `EMAIL_CLASS_MODEL`.
   - `SESSION_SECRET`, `SESSION_DURATION_DAYS` (optional).
3. **Azure Key Vault RBAC**: grant the app identity (e.g., Azure CLI) secret `get/list/set` permissions on your vault.
4. **Google setup**: add `http://localhost:3000` origin and `http://localhost:3000/auth/google/callback` redirect URI to your OAuth client.
5. **Initialize Cosmos containers** by running the app once; it auto-creates `gmaildb/emails` and `jobsdb/applications` with `/owner` partition keys.

## Running
```bash
npm start
```
- Visit `http://localhost:3000`, sign in with Google.
- Click “Connect Gmail account” to authorize Gmail read-only access.
- Use “Fetch Gmail now” to ingest current emails; cron will run nightly at 12:45 AM Eastern for the previous day.

## Notes
- Secrets and tokens live in Azure Key Vault; local files `gmail_tokens.json` / `gmail_state.json` are no longer used.
- `.env` is git-ignored—never commit your credentials.
- To change the cron schedule, update `GMAIL_CRON_SCHEDULE` in `.env` or modify `server.js`.
