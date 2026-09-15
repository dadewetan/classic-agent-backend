-- Classic Insurance Agency & Tags and Title — production leads database
-- Run once against a real Postgres instance (Supabase, Render, Railway, AWS RDS, etc.)

create extension if not exists "pgcrypto";

-- One row per lead: an insurance inquiry, a tags & title request, or a dealership inquiry.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('insurance', 'tags_title', 'dealership')),
  stage text not null default 'new' check (stage in ('new', 'onboarding_complete', 'paid')),
  fields jsonb not null default '{}'::jsonb,       -- name, phone, email, insurance_type, vehicle, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  qqcatalyst_synced boolean not null default false,
  qqcatalyst_record_id text                         -- set once pushed into QQCatalyst via its API
);

create index if not exists idx_leads_type on leads(type);
create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_created_at on leads(created_at desc);

-- Uploaded documents (driver's license, title, bill of sale) — stores a reference
-- to the actual file in object storage (e.g. S3), never the file itself.
create table if not exists lead_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  file_url text not null,
  file_type text,
  uploaded_at timestamptz not null default now()
);

-- Full chat transcript per lead, kept separately from the structured fields
-- so the raw conversation is auditable if a quote or request is ever disputed.
create table if not exists lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_messages_lead_id on lead_messages(lead_id);
