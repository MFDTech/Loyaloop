// Database migrations, applied in order and recorded in schema_migrations.
// Never edit a migration that already ran in production: add a new one.

export const migrations: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
-- LoyaLoop schema. Each entity is a JSON document (same shape as src/lib/types.ts)
-- with the columns needed for lookups and indexes pulled out.

create table users (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index users_business on users (business_id, at);
create table businesses (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index businesses_business on businesses (business_id, at);
create table programs (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index programs_business on programs (business_id, at);
create table rewards (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index rewards_business on rewards (business_id, at);
create table branches (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index branches_business on branches (business_id, at);
create table registers (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index registers_business on registers (business_id, at);
create table devices (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index devices_business on devices (business_id, at);
create table pairing_codes (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index pairing_codes_business on pairing_codes (business_id, at);
create table customers (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index customers_business on customers (business_id, at);
create table transactions (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index transactions_business on transactions (business_id, at);
create table scans (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index scans_business on scans (business_id, at);
create table payments (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index payments_business on payments (business_id, at);
create table integrations (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index integrations_business on integrations (business_id, at);
create table notices (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index notices_business on notices (business_id, at);
create table audit (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index audit_business on audit (business_id, at);
create table leads (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index leads_business on leads (business_id, at);
create table verifications (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index verifications_business on verifications (business_id, at);
create table resets (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index resets_business on resets (business_id, at);
create table maintenance (
  pk text primary key,
  business_id text,
  at text not null default '',
  data jsonb not null
);
create index maintenance_business on maintenance (business_id, at);

create unique index users_email on users (lower(data->>'email'));
create unique index users_invite on users ((data->>'inviteToken')) where data ? 'inviteToken';
create unique index customers_token on customers ((data->>'token'));
create unique index customers_phone on customers (business_id, (data->>'phone'));
create unique index branches_code on branches (upper(data->>'code'));
create unique index devices_token on devices ((data->>'token'));
create unique index payments_external on payments ((data->>'provider'), (data->>'externalId'));
create index transactions_customer on transactions (business_id, (data->>'customerId'));
create index scans_status on scans (business_id, (data->>'status'));
create index payments_status on payments (business_id, (data->>'status'));

create table sessions (
  token_hash text primary key,
  user_id text not null,
  impersonating text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);
`,
  },
  {
    id: "002_webhook_events",
    sql: `
create table webhook_events (
  id bigserial primary key,
  provider text not null,
  business_id text not null,
  external_id text not null,
  kind text not null default '',
  body jsonb not null,
  status text not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_id, kind)
);
create index webhook_events_status on webhook_events (status, received_at);
`,
  },
]
