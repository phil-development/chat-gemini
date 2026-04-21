-- Up Migration
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user','assistant')) not null,
  content text not null,
  created_at timestamptz default now()
);

create index messages_conversation_created_idx
  on messages(conversation_id, created_at);

-- Down Migration
drop index if exists messages_conversation_created_idx;
drop table if exists messages;
drop table if exists conversations;
