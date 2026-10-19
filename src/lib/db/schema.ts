/** Idempotent schema. Applied automatically the first time the app talks to the database. */
export const SCHEMA_SQL = /* sql */ `
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  name text not null,
  ext text not null,
  size integer not null,
  sha256 text not null,
  content bytea not null,
  text_content text,
  uploaded_at timestamptz not null default now()
);
create index if not exists documents_collection_idx on documents(collection_id);

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  status text not null default 'queued',
  provider text not null,
  model text,
  stage text not null default 'Queued',
  progress real not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  doc_count integer not null default 0,
  claim_count integer not null default 0,
  finding_count integer not null default 0,
  previous_scan_id uuid
);
create index if not exists scans_collection_idx on scans(collection_id, started_at desc);

-- What the scanner read from a document, keyed by its content. Re-scans reuse this instead of reading again.
create table if not exists document_extractions (
  sha256 text not null,
  name text not null,
  provider text not null,
  extracted jsonb not null,
  created_at timestamptz not null default now(),
  primary key (sha256, name, provider)
);

create table if not exists scan_events (
  id bigserial primary key,
  scan_id uuid not null references scans(id) on delete cascade,
  at timestamptz not null default now(),
  level text not null default 'info',
  message text not null
);
create index if not exists scan_events_scan_idx on scan_events(scan_id, id);

create table if not exists scan_documents (
  scan_id uuid not null references scans(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  status text not null default 'queued',
  title text,
  source text,
  doc_date date,
  year integer,
  doc_type text,
  doc_status text,
  claim_count integer not null default 0,
  error text,
  meta jsonb not null default '{}'::jsonb,
  primary key (scan_id, document_id)
);

-- Facts read from a document's own front matter. Added in place, so existing databases keep their data.
alter table scan_documents add column if not exists record_status text;
alter table scan_documents add column if not exists series text;
alter table scan_documents add column if not exists version integer;
alter table scan_documents add column if not exists in_ai_scope boolean;
alter table scan_documents add column if not exists ai_generated boolean not null default false;
alter table scan_documents add column if not exists custody text[] not null default '{}';
alter table scan_documents add column if not exists front_id text;

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  text text not null,
  attribute text,
  subject text,
  value text,
  origin_doc uuid not null,
  status text not null,
  cited_by uuid[] not null default '{}'
);
create index if not exists claims_scan_idx on claims(scan_id);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  type text not null,
  kind text not null,
  title text not null,
  summary text not null,
  severity text not null,
  confidence integer not null,
  status text not null default 'open',
  fingerprint text not null,
  is_new boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  doc_ids uuid[] not null default '{}',
  claim_ids uuid[] not null default '{}',
  ai_review jsonb
);
create index if not exists findings_scan_idx on findings(scan_id);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  collection_id uuid,
  scan_id uuid,
  finding_id uuid,
  actor text not null,
  action text not null,
  detail text not null default '',
  prev_hash text not null,
  hash text not null
);
`;
