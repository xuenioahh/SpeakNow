-- Security persistence for the existing product. Apply before deploying the new build.
begin;
create table if not exists public.app_auth_sessions (
 id text primary key, user_id text not null references public.app_users(id) on delete cascade,
 csrf_hash text not null, expires_at timestamptz not null
);
create index if not exists app_auth_sessions_expiry_idx on public.app_auth_sessions(expires_at);
create table if not exists public.app_usage_counters (
 key text primary key, count bigint not null default 0, until_at timestamptz not null
);
create table if not exists public.app_api_usage (
 id text primary key, user_id text not null, endpoint text not null, requests integer not null,
 input_tokens integer not null, output_tokens integer not null, latency_ms integer not null,
 source text not null, created_date timestamptz not null
);
alter table public.app_auth_sessions enable row level security;
alter table public.app_usage_counters enable row level security;
alter table public.app_api_usage enable row level security;
alter table public.app_users enable row level security;
alter table public.app_voice_sessions enable row level security;
alter table public.app_presentation_sessions enable row level security;
alter table public.app_activity_records enable row level security;
alter table public.app_settings enable row level security;
revoke all on public.app_auth_sessions, public.app_usage_counters, public.app_api_usage,
 public.app_users, public.app_voice_sessions, public.app_presentation_sessions,
 public.app_activity_records, public.app_settings from anon, authenticated;

create or replace function public.speaknow_consume_limit(counter_key text, counter_limit bigint, window_ms bigint, increment_by bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare applied boolean;
begin
 if increment_by <= 0 or counter_limit <= 0 or window_ms <= 0 then return false; end if;
 insert into app_usage_counters(key, count, until_at)
 values(counter_key, 0, now() + (window_ms::text || ' milliseconds')::interval)
 on conflict(key) do nothing;
 perform 1 from app_usage_counters where key = counter_key for update;
 update app_usage_counters set count = 0, until_at = now() + (window_ms::text || ' milliseconds')::interval
 where key = counter_key and until_at <= now();
 update app_usage_counters set count = count + increment_by where key = counter_key and count + increment_by <= counter_limit;
 applied := found;
 return applied;
end $$;
revoke all on function public.speaknow_consume_limit(text,bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.speaknow_consume_limit(text,bigint,bigint,bigint) to service_role;

create or replace function public.speaknow_update_impact(owner_id text, practice_id text, operation text, patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare saved app_presentation_sessions; metadata jsonb; existing jsonb;
begin
 select * into saved from app_presentation_sessions where id = practice_id and user_id = owner_id for update;
 if not found or saved.report->'impact' is null then return null; end if;
 metadata := saved.report->'impact';
 if operation = 'append' then
   select value into existing from jsonb_array_elements(metadata->'recordings')
   where value->>'id' = patch->'recording'->>'id' limit 1;
   if found then
     if existing->>'mime' is distinct from patch->'recording'->>'mime'
        or existing->>'bytes' is distinct from patch->'recording'->>'bytes' then
       raise sqlstate 'PT409' using message = 'The saved recording is immutable.';
     end if;
     return to_jsonb(saved);
   end if;
   if jsonb_array_length(metadata->'recordings') >= 20 then raise exception 'recording_limit'; end if;
   metadata := jsonb_set(metadata, '{recordings}', (metadata->'recordings') || jsonb_build_array(patch->'recording'));
   metadata := jsonb_set(metadata, '{recordingIds}', (metadata->'recordingIds') || jsonb_build_array(practice_id || ':' || (patch->'recording'->>'id')));
 elsif operation = 'analysis' then
   if not (metadata ? 'analysis' or metadata ? 'comparison') then metadata := metadata || patch; saved.report := saved.report || '{"source":"ai"}'::jsonb; end if;
 else raise exception 'invalid_operation'; end if;
 saved.report := jsonb_set(saved.report, '{impact}', metadata);
 update app_presentation_sessions set report = saved.report where id = practice_id and user_id = owner_id;
 return to_jsonb(saved);
end $$;
revoke all on function public.speaknow_update_impact(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.speaknow_update_impact(text,text,text,jsonb) to service_role;

-- Existing admin tables must not bypass the authenticated server API.
do $$
declare table_name text;
begin
 foreach table_name in array array['admin_users', 'admin_events', 'admin_voice_sessions', 'admin_presentation_sessions'] loop
   if to_regclass('public.' || table_name) is not null then
     execute format('alter table public.%I enable row level security', table_name);
     execute format('revoke all on public.%I from anon, authenticated', table_name);
     execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
   end if;
 end loop;
end $$;

-- Uploaded recordings stay private. The API checks session ownership before accessing this bucket.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('speaknow-recordings', 'speaknow-recordings', false, 10485760,
 array['audio/webm','audio/mp4','video/webm','video/mp4','audio/ogg']) on conflict(id) do update set public = false;
commit;
