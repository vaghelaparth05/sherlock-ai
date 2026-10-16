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

## Status

Design and clickable prototype done. Next: real application (ingestion, claim extraction, claim graph, relationship engine, review UI, audit log).
