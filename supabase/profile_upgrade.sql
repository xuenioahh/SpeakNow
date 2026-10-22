-- Run after app_schema.sql, using the Supabase SQL editor as project owner.
-- Additive migration: does not replace users, sessions or existing preferences.
begin;
alter table public.app_users
  add column if not exists profile_preferences jsonb not null
  default '{"weekly_goal":3,"practice_focus":"voice"}'::jsonb;

create index if not exists app_voice_sessions_user_created_idx
  on public.app_voice_sessions (user_id, created_date desc);
create index if not exists app_presentation_sessions_user_created_idx
  on public.app_presentation_sessions (user_id, created_date desc);

-- Current app accesses these tables ONLY from its server with service_role.
-- Block browser API keys; do not add public read/write policies.
alter table public.app_users enable row level security;
alter table public.app_voice_sessions enable row level security;
alter table public.app_presentation_sessions enable row level security;
alter table public.app_activity_records enable row level security;
alter table public.app_settings enable row level security;
revoke all on public.app_users, public.app_voice_sessions,
  public.app_presentation_sessions, public.app_activity_records, public.app_settings
  from anon, authenticated;
grant select, insert, update, delete on public.app_users, public.app_voice_sessions,
  public.app_presentation_sessions, public.app_activity_records, public.app_settings
  to service_role;
commit;
