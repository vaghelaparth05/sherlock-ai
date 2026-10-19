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

For the live demo, upload `data/incoming/D14.md` then `data/incoming/D21.md` (or `npm run arrive <file>`). Their model results are in `data/cache`, so the demo also works with `SHERLOCK_OFFLINE=1`. Run `npm run seed` again to reset.

### Backend API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/register` | Every document with trust, likelihood, consequence, risk, gate and AI scope |
| GET | `/api/register/:id` | Score breakdown, claims with status, gate decision, ledger entries |
| POST | `/api/register/:id/override` | `{actor, reason}`: allow a blocked document (ledger `GATE_OVERRIDE`) |
| POST | `/api/register/ingest` | Multipart `file` (a `.md` record): ingest, extract, propose relationships, score; returns its impact |
| GET | `/api/claims/:id` | Origin, echoes, independent sources, relationships, status history |
| GET | `/api/review` | Proposed relationships with both quotes and what confirming them would affect |
| POST | `/api/review/:id` | `{decision: confirm \| dismiss \| change, type?, actor, reason?}`; confirming issues recall notices |
| GET | `/api/bias` | Representation rating per subject, with the gap message |
| POST | `/api/scope` | `{documentId, actor, reason}`: add a document to AI scope (ledger `SCOPE_ADD`) |
| GET | `/api/recalls` | Recall notices for AI answers that relied on superseded or contradicted claims |
| GET | `/api/ledger` | Entries (`?action=`, `?target=`) and the result of verifying the hash chain |

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
- [x] Backend P1: echo detection, conflict classification (COMPARE_V1), review queue, upload flow, impact and recall notices, bias rating with "Add to AI scope", ledger API
- [ ] Backend P2: assistant (ANSWER_V1) with per-sentence trust labels
- [ ] Screens for register, document, claim, review, impact, bias, ledger
- [ ] Real database connector
