# Sherlock.ai

An investigator for document collections. Give it a pile of documents on one topic and it shows which pieces of information can be trusted, where each came from, and which documents are affected when something turns out to be wrong or out of date.

Built for the RIMPA 2026 hackathon problem: *How might we build information management know-how into AI so that users can better recognise and manage bias, misinformation, and disinformation?*

## Core ideas

- Documents are broken into individual **claims**, each linked to its earliest source and every document that repeats it.
- Claims relate to each other in four ways: **supersedes**, **contradicts**, **corrects**, **corroborates**. A newer document is never automatically "true".
- **Source reliability** is a visible record (corroborated, superseded, contradicted), counted by independent sources, not by number of documents.
- **A person decides.** Sherlock proposes with quoted evidence and a confidence level. Nothing changes until it is confirmed.
- **Originals are never modified.** Status lives in a separate append-only, hash-chained audit log.
- **Privacy:** designed to run on the organisation's own servers with an open-weight model.

## Repository layout

| Path | Contents |
| --- | --- |
| `docs/Sherlock-ai-how-it-works.pdf` | Design document explaining how Sherlock works |
| `prototype/sherlock-demo.html` | Hard-coded, click-through demo (open in any browser) |

## Run it

Needs Node 24 (`nvm use`).

```bash
npm install
export ANTHROPIC_API_KEY=...        # or put it in .env.local
npm run seed                        # resets data/sherlock.db: ingest data/corpus, extract claims, score
npm run dev
npm test
SHERLOCK_OFFLINE=1 npm run seed     # replay model results from data/cache only, no network
```

Open http://localhost:3000. Uploaded files are written to `data/uploads/` (git-ignored).

Backend API: `GET /api/register` (every document with trust, risk and gate), `GET /api/register/:id` (score breakdown, claims, ledger), `POST /api/register/:id/override` (`{actor, reason}`).

## Stack

Next.js 16 (App Router), React 19, Tailwind 4, Motion and Geist. The backend is route handlers under `src/app/api` over `src/lib`: SQLite (`node:sqlite`), Claude via `@anthropic-ai/sdk` for claim extraction (model from `SHERLOCK_MODEL`, default `claude-sonnet-5-5`), scoring weights in `config/scoring.yaml`, classification in `data/taxonomy.yaml`.

## Status

- [x] Design document and clickable prototype
- [x] Step 1: Import page (multi-file and folder upload with SHA-256, database tab with a **mocked** connection, sample set)
- [x] Dashboard for returning users (sample data)
- [ ] Step 2: Scanning screen
- [x] Step 3: Results (bias, misinformation, disinformation), data-driven, sample data
- [x] Sources list and source detail pages, sample data
- [ ] Step 4: Load new documents, then Summary and charts
- [ ] Step 5: User review queue and audit log
- [x] Backend P0: demo corpus, taxonomy, scoring config, ingest with SHA-256, Claude claim extraction with cache and verbatim-quote check, hash-chained ledger, trust/risk scoring, gate, register API
- [ ] Backend P1: echo detection, conflict classification, review queue, upload flow, impact and recall, bias view
- [ ] Real database connector
