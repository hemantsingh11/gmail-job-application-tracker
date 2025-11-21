# Job Tracker Webapp

Express + TypeScript backend with Cosmos DB and a Vite + React + TypeScript SPA. Connect a Google account, ingest Gmail, classify messages with OpenAI, and track applications per company.

## Features
- Google Sign-In with signed session cookies (10-day expiry).
- Gmail OAuth tokens and ingestion state stored in Azure Key Vault.
- Scheduled Gmail ingestion at **12:45 AM Eastern** (previous day range) plus manual “Fetch Gmail now”.
- OpenAI classification of unprocessed emails (applied/rejected/next steps/comment-only/not job related) with per-company rollups in Cosmos.
- Per-user partitioning by signed-in Google email for Gmail messages and job counters.

## Stack & layout
- Backend: `src/server.ts` (Express 5, CommonJS output), Cosmos SDK, Google APIs, node-cron.
- Frontend: `client/` (Vite + React + TS), served from `client/dist` in prod; dev at `http://localhost:5173`.
- Key Vault helpers: `src/gmailTokenStore.ts`, `src/gmailStateStore.ts`, `src/keyVaultClient.ts`.
- Build output: `dist/` (server) and `client/dist/` (SPA).

## Requirements
- Node.js 18+ (tested on v24).
- Azure Cosmos DB (SQL API) for `gmaildb/emails` and `jobsdb/applications`.
- Azure Key Vault access for secrets/state.
- OpenAI API key (e.g., `gpt-4o-mini`).
- Google OAuth client (ID + secret).

## Setup
1) Install deps
```bash
npm install
```
2) Create `.env` from `.env.example`, set:
   - Cosmos: `COSMOS_URI`, `COSMOS_KEY`, `COSMOS_DATABASE`, `COSMOS_CONTAINER`, and optional overrides for Gmail/Jobs DB+containers.
   - Key Vault: `KEY_VAULT_URI` and ensure `DefaultAzureCredential` works (e.g., `az login`).
   - Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (default `http://localhost:3000/auth/google/callback`).
   - OpenAI: `OPENAI_API_KEY`, `EMAIL_CLASS_MODEL`.
   - Sessions: `SESSION_SECRET`, optional `SESSION_DURATION_DAYS`.
   - Cron: optional `GMAIL_CRON_SCHEDULE`.
3) Azure Key Vault RBAC: grant the app identity secret `get/list/set` on the vault.
4) Google OAuth setup: allow origin `http://localhost:3000` and redirect `http://localhost:3000/auth/google/callback`.
5) First run will auto-create Cosmos containers with `/email` and `/owner` partition keys.

## Running
- Dev (hot reload server + client):
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173` (Vite). API and auth proxy to Express on `3000`.
- Prod build + run:
  ```bash
  npm run build
  npm start
  ```
  Express serves `dist/server.js` and the built SPA from `client/dist` at `http://localhost:3000`.

## Usage
- Sign in with Google on the front end.
- Click “Connect Gmail account” to complete Gmail OAuth.
- Use “Fetch Gmail now” for on-demand ingestion; nightly cron covers the previous day.

## Notes
- Secrets/tokens/state are in Azure Key Vault; local token/state files are not used.
- `.env` is ignored by git—never commit credentials.
- Change the cron via `GMAIL_CRON_SCHEDULE` or adjust in `src/server.ts`.
