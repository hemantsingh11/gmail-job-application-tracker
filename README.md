# Job Tracker

<p>
  <img src="https://img.shields.io/badge/License-GPLv3-blue.svg" />
</p>

A unified place to track every job application. Connect Gmail, classify job-related emails with an LLM, and view company-level rollups without digging through long threads.

## Tech stack
<p>
  <img src="https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Azure%20Cosmos%20DB-4285F4?logo=microsoftazure&logoColor=white" />
  <img src="https://img.shields.io/badge/Azure%20Key%20Vault-0078D4?logo=microsoftazure&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/Gmail-EA4335?logo=gmail&logoColor=white" />
</p>

## What you get
- Sign in with Google; sessions use signed cookies (10-day default).
- One-click Gmail connection; refresh tokens and ingest cursors stay in **Azure Key Vault**.
- Gmail messages stored in **Azure Cosmos DB** with per-user partitions; **Redis** caches messages during ingest.
- Only job-related emails are stored—everything else is gated out before persistence.
- LLM pipeline gates job-related mail, then classifies: applied / rejected / next steps / comment only / not job related; results feed company counters.
- Nightly cron at **12:45 AM ET** plus manual “Fetch Gmail now”.
- React + Vite single-page app served by the Express backend in production.
- Company pages show classified emails per employer, and each item links straight to the thread in Gmail.

## How it works
```
Sign in → Connect Gmail → Fetch (cron/manual) → Gate & classify → Cosmos rollups → Dashboard & per-company view
```

## Quick start
```bash
npm install
cp .env.example .env   # fill in keys below
npm run dev            # http://localhost:5173 (frontend) + http://localhost:3000 (API)
```
Production build:
```bash
npm run build
npm start              # serves built SPA + API on :3000
```

## Contributing
If you would like to contribute or report an issue, please contact me at iamhks14@gmail.com.
