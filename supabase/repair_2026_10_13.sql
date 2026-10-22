-- Apply to an existing consolidated installation before deploying these repairs.
-- Does not rewrite historical rows.
begin;
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

commit;
