create table if not exists public.app_users (
  id text primary key,
  full_name text not null default '',
  email text not null unique,
  password text not null default '',
  role text not null default 'learner',
  avatar_url text not null default '',
  profile_preferences jsonb not null default '{"weekly_goal":3,"practice_focus":"voice"}'::jsonb,
  created_date timestamptz not null default timezone('utc', now())
);

create index if not exists app_users_created_date_idx
  on public.app_users (created_date desc);

create table if not exists public.app_voice_sessions (
  id text primary key,
  created_date timestamptz not null default timezone('utc', now()),
  user_id text not null default '',
  scenario text not null default '',
  mode text not null default '',
  dialog_mode text not null default '',
  scoring_standard text not null default '',
  messages jsonb not null default '[]'::jsonb,
  report jsonb not null default '{}'::jsonb,
  duration_seconds integer not null default 0,
  words_spoken integer not null default 0,
  total_exchanges integer not null default 0
);

create index if not exists app_voice_sessions_user_id_idx
  on public.app_voice_sessions (user_id);

create index if not exists app_voice_sessions_created_date_idx
  on public.app_voice_sessions (created_date desc);

create table if not exists public.app_presentation_sessions (
  id text primary key,
  created_date timestamptz not null default timezone('utc', now()),
  user_id text not null default '',
  file_name text not null default '',
  duration_seconds integer not null default 0,
  total_pages integer not null default 0,
  page_timings jsonb not null default '[]'::jsonb,
  report jsonb not null default '{}'::jsonb
);

create index if not exists app_presentation_sessions_user_id_idx
  on public.app_presentation_sessions (user_id);

create index if not exists app_presentation_sessions_created_date_idx
  on public.app_presentation_sessions (created_date desc);

create table if not exists public.app_activity_records (
  id text primary key,
  created_date timestamptz not null default timezone('utc', now()),
  user_id text not null default '',
  activity_type text not null default '',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists app_activity_records_user_id_idx
  on public.app_activity_records (user_id);

create index if not exists app_activity_records_created_date_idx
  on public.app_activity_records (created_date desc);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);
