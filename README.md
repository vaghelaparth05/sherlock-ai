# Sherlock.ai

An investigator for document collections, built for the National Archives of Australia (NAA). Give it a pile of documents and it shows which claims can be trusted, where each came from, and which documents are affected when something is out of date, altered or wrongly cited.

Built for the RIMPA 2026 hackathon problem: *How might we build information management know-how into AI so that users can better recognise and manage bias, misinformation, and disinformation?*

## Run it

You need Node 22+ and Docker Desktop.

```bash
npm install
docker compose up -d      # Postgres on localhost:5435
npm run dev               # http://localhost:3000
```

Open http://localhost:3000, go to **Import**, choose the **NAA sample** tab, load the 10 sample documents and press **Start scanning**.

Tables are created automatically the first time the app talks to the database. The data lives in a Docker volume, so it survives restarts and `docker compose stop`. `npm run db:seed` adds the 10 sample documents (if missing) and runs a scan of them from the command line; it never deletes anything. To delete everything on purpose: `npm run db:reset -- --yes`.

### Look inside the database

The quickest way is the **Data** tab in Sherlock itself (http://localhost:3000/data). It lists every table with its row count, and lets you search, sort, page through rows, click an id to jump to the row it points at, open any row in full, and download a table as CSV. It is read-only, and binary file contents are never sent to the browser.

For a full database tool there is also Adminer:

`docker compose up -d` also starts **Adminer**. Open this link (it preselects PostgreSQL, the server, the user and the database), type the password `sherlock`, and click any table in the left column:

http://localhost:8081/?pgsql=db&username=sherlock&db=sherlock&ns=public

Careful: Adminer can edit and delete rows. Changing a row in `audit_log` on purpose is a good way to see the tamper check fail on the Summary page.

### Add your Gemini key

Open `.env.local` (it is git-ignored) and paste your key after `GEMINI_API_KEY=`, then restart `npm run dev`:

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-flash-latest
```

With no key the app still works using an **offline rules scanner** (regular expressions, no AI), so you can demo everything. The Import page shows which scanner will run. Keys stay on the server and are never sent to the browser.

## How it works

```
documents ──▶ SCAN (extract facts) ──▶ ENGINE (compare, trace, verify) ──▶ findings ──▶ human review ──▶ audit log
              Gemini / rules / external   plain code, deterministic          Postgres     confirm or dismiss   hash-chained
```

1. **Scan.** Each document is turned into structured facts: title, producer, date, status, and claims such as "grant application files: retention period 10 years", each with the exact quote. Gemini does this; a quote that does not appear in the document is dropped, so the model cannot invent evidence.
2. **Engine** (`src/lib/scanner/engine.ts`). Pure code, no AI. It groups comparable claims and decides:
   - *supersedes*: an older value that a current Records Authority replaced
   - *contradicts the authority*: a document dated after the authority that disagrees with it
   - *depends on*: a figure built on an outdated value
   - *single source*: many documents, one original (counted per **organisation**, not per page)
   - *altered*: a file whose SHA-256 no longer matches the registry manifest
   - *authority not found*: a cited Records Authority number that is not in the register
   - plus no authority cited, sources that only repeat others, outdated terminology, and one organisation dominating
3. **AI second opinion.** With Gemini, each finding gets a short grounded review ("agree / disagree / unsure"). It can lower a confidence score but it cannot overrule hash or register checks.
4. **Review.** People confirm or dismiss findings (keyboard: C, D, S, U). "Ask Sherlock" gives a recommendation and a draft note. A human always decides.
5. **Audit log.** Every upload, scan and decision is appended to a hash-chained log. Edit an old entry and *Verify* reports where the chain breaks.
6. **Incremental rescans.** What the scanner read from each document is saved against the file's SHA-256. Add documents and scan again: unchanged files are not read again (no AI calls), only the new ones are read and checked against everything already known. Earlier decisions carry over and only genuinely new findings are marked New. `npm run test:incremental` proves this on a throwaway database.

Originals are never modified; their SHA-256 is stored on arrival.

## The 10 sample documents

`samples/naa/` holds synthetic documents about a fictional Records Authority. They are invented for testing. Regenerate them with `npm run build:samples`.

| # | Document | What it is for |
| --- | --- | --- |
| 01 | Records Authority 2024/00561247 | The authoritative source: 10-year retention, 15-year transfer, 20-year public access |
| 02 | Retention schedule 2021 | Superseded: says 7 years |
| 03 | Information management policy v3 | Says transfer at 20 years, and was **edited after registration** |
| 04 | Staff guide 2022 | Repeats 7 years and the old 30-year access rule, cites no authority |
| 05 | Intranet FAQ 2023 (HTML) | Repeats both, cites authority **2019/00334118**, which does not exist |
| 06 | Storage cost estimate | A $412,000 figure built on the outdated 7 years |
| 07 | Transfer register (CSV) | Also cites the non-existent authority |
| 08 | NAA authority register (CSV) | The list of valid authorities used for the citation check |
| 09 | Registry manifest (JSON) | SHA-256 fingerprints at registration, used to catch document 03 |
| 10 | Series description 1987 | Outdated terminology, written only from the department's view |

Expected result with the offline scanner: 11 findings (5 misinformation, 4 bias, 2 disinformation). `npm run scan:samples` runs the engine on them from the command line.

## Database import

On the Import page, the **Database** tab connects read-only to a PostgreSQL database, lists its tables, and stores the first 1,000 rows of each chosen table as a CSV document. **Use the demo database** creates a small `naa_demo` schema in Sherlock's own database so it can be shown without another server. Other engines are not supported yet.

## Plugging in the Python scanner

Set these in `.env.local` and the Python service replaces Gemini for reading documents. The engine, review screens and audit log are unchanged.

```
SHERLOCK_SCANNER=external
SCANNER_URL=http://localhost:8000/extract
```

Sherlock POSTs `{ "name", "ext", "sha256", "text", "base64" }` (`text` is null for PDFs) and expects JSON in this shape:

```json
{
  "title": "Staff Records Guide 2022",
  "producedBy": "DRIC People and Culture",
  "organisation": "DRIC",
  "date": "2022-05-17",
  "docType": "Guide",
  "status": "current",
  "refersTo": ["DRIC Retention Schedule 2021"],
  "authorityNumbers": [],
  "claims": [
    {
      "subject": "grant application files",
      "attribute": "retention_period",
      "value": "7 years",
      "quote": "Grant application files are kept for 7 years after action completed, then destroyed.",
      "effectiveFrom": null,
      "basedOn": null
    }
  ],
  "languageFlags": []
}
```

`attribute` is one of `retention_period`, `transfer_age`, `access_period`, `disposal_action`, `security_classification`, `custodian`, `other`. The full schema is `ExtractedDocSchema` in `src/lib/scanner/types.ts`.

## Layout

| Path | Contents |
| --- | --- |
| `src/app/api` | Route handlers: collections, documents, scans, findings, audit, dashboard, database import |
| `src/lib/scanner` | `engine.ts` (comparison), `gemini-provider.ts`, `rules-provider.ts`, `external-provider.ts`, `index.ts` (pipeline) |
| `src/lib/repo.ts`, `src/lib/db` | Database access and schema |
| `src/components` | Screens: dashboard, import, scan, results, sources, review, summary |
| `samples/naa` | The 10 synthetic documents |
| `docs`, `prototype` | Original design document and the first clickable prototype |

## Limits worth knowing

- Sherlock does not prove anything is true. It shows how claims relate and what depends on what.
- The offline scanner only recognises a fixed set of phrasings. Gemini reads free text.
- PDF and DOCX need Gemini (PDF) or extract text on upload (DOCX). Excel files are not supported yet.
- A scan runs inside the Next.js server process, which is fine locally and in Docker but not on serverless hosting.
- The database import connects to whatever host you give it, so only use it on a trusted machine.

## Stack

Next.js 16 (App Router, Cache Components), React 19, Tailwind 4, Motion, Postgres 16, `@google/genai`, zod.
