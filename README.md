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
npm run seed            # reset the register to "before go-live" (works offline from data/cache)
npm run dev             # http://localhost:3000, sign in at /sign-in
npm test
npm run rehearse        # the scripted demo end to end in the terminal, then reset
npm run verify          # re-hash every original and check the ledger chain
npm run rebuild         # recompute every score and gate from documents + ledger
npm run arrive <file>   # upload a Markdown record from the CLI (add --contributor to submit for review)
```

Put `ANTHROPIC_API_KEY` in `.env.local` for live model calls. With `SHERLOCK_OFFLINE=1` only cached results are used; the scripted demo (`npm run rehearse`) is fully cached.

### Two users

Sign in at `/sign-in` (demo accounts in `data/users.yaml`, no passwords; roles are enforced on the server).

- **Contributor** (hotline officer CSO-014) uploads a record with its provenance: who created it, how it reached them, its status and date. Sherlock hashes the original, makes a text rendition (PDF text layer, Word, HTML, email, text, Markdown; scans and photos are held for OCR), extracts claims, proposes relationships and scores it straight away. It is not readable by the assistant yet.
- **Information manager** (Priya) sees the upload in her queue with a data card: trust in plain words, the risk cell, misinformation and disinformation signals, what approving it would do to representation, and which documents and AI answers it affects. Approve puts it in the assistant's scope (approving a blocked record needs a written override). Reject keeps it out; the original is kept. Her own uploads count as approved by her. Everything is a ledger entry.

The assistant only reads records that are approved (or in scope) **and** allowed by the gate.

### Demo order (all cached)

1. `npm run seed`, sign in as Priya: register and findings show the stale $90,000 threshold, D09's invented $5,000 and the proof-of-address gap.
2. Add D12 and D20 to scope: proof of address goes High → Low.
3. Sign in as CSO-014 and upload `data/incoming/D14.md`: trust 24, High, blocked, waiting. Priya opens the data card and rejects it.
4. Priya uploads `data/incoming/D21.md`, confirms the two supersessions in the review queue: A1–A4 are recalled, A5 still holds.
5. CSO-014 asks the assistant "Are renters eligible for the grant?", "When do applications close?", "Is there a fee to apply?".
6. Edit any file under `data/corpus` and press verify (`POST /api/register/verify`): integrity 0, Extreme.

### Backend API

Every route needs a session; ★ means information manager only.

| Method | Path | What it does |
| --- | --- | --- |
| GET / POST / DELETE | `/api/session` | Who is signed in and the demo accounts / sign in `{userId}` / sign out |
| POST | `/api/register/ingest` | Upload a record: multipart `file` + provenance (`title`, `unit`, `function`, `custody` origin-first comma list, `record_status`, `date`, …). Returns its score and impact |
| GET | `/api/submissions` | ★ queue of uploads awaiting review; for a contributor, their own submissions and status |
| GET | `/api/register/:id/card` | ★ the data card for one record |
| POST | `/api/register/:id/review` | ★ `{decision: approve \| reject, reason?}` |
| GET | `/api/register`, `/api/register/:id` | ★ the risk register; one document's score breakdown, claims, gate and ledger |
| POST | `/api/register/:id/override` | ★ `{reason}`: allow a blocked document |
| POST | `/api/register/:id/extract` | ★ retry claim extraction for a quarantined document |
| POST | `/api/register/verify` | ★ re-hash every original, log tampering, verify the ledger chain |
| POST | `/api/scan` | ★ `{mode: "sample"}` reset to the demo collection, or `{mode: "staged", provenance}` ingest files staged on the Import page |
| GET | `/api/findings` | ★ `{collection, docs, claims, findings}` in the shapes of `src/lib/results-data.ts` |
| GET | `/api/dashboard` | ★ dashboard numbers in the shapes of `src/lib/mock-dashboard.ts` |
| GET | `/api/claims/:id` | ★ origin, echoes, independent sources, relationships, history |
| GET / POST | `/api/review`, `/api/review/:id` | ★ proposed relationships with impact / `{decision: confirm \| dismiss \| change, type?, reason?}`; confirming issues recalls |
| GET / POST | `/api/bias`, `/api/scope` | ★ representation per subject / `{documentId, reason}` add to AI scope |
| GET / POST | `/api/assistant` | Past answers / `{question}`: answer with per-sentence trust labels, logged for recall |
| GET | `/api/recalls` | Recall notices (a contributor sees their own) |
| GET | `/api/events` | Live Server-Sent Events: every new ledger entry (a contributor sees their own) |
| GET | `/api/ledger` | ★ entries (`?action=`, `?target=`) and the chain check |
| POST | `/api/sources/database/test`, `/api/sources/database/import` | ★ read-only SQLite connector (`sqlite://data/demo-records.db`): list tables / import rows as records |

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
- [x] Backend P2: assistant (ANSWER_V1) with per-sentence trust labels, verify, rehearse
- [x] Two users (contributor, information manager), upload with provenance, data card, approve/reject, live events
- [x] Real files: PDF, Word, HTML, email, text, Markdown; scans held for OCR; read-only SQLite connector
- [ ] Screens: sign-in is basic; upload form, submission queue + data card, review queue, assistant and register still to build; wire Results/Dashboard to `/api/findings` and `/api/dashboard`
