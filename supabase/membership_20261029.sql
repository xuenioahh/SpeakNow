begin;
create table if not exists public.app_memberships (
 user_id text primary key references public.app_users(id) on delete cascade,
 plan_type text not null default 'free' check(plan_type in ('free','vip')),
 subscription_status text not null default 'inactive' check(subscription_status in ('inactive','active','expired','cancelled')),
 current_period_start timestamptz, current_period_end timestamptz, expires_at timestamptz,
 check(plan_type <> 'vip' or current_period_end is not null)
);
create table if not exists public.app_usage_ledgers (
 user_id text primary key, revision bigint not null default 0,
 state jsonb not null default '{"sessions":{},"operations":{},"measurements":[]}'::jsonb
);
alter table public.app_memberships enable row level security;
alter table public.app_usage_ledgers enable row level security;
revoke all on public.app_memberships, public.app_usage_ledgers from anon, authenticated;
grant select, insert, update, delete on public.app_memberships, public.app_usage_ledgers to service_role;
create or replace function public.speaknow_commit_usage(owner_id text, expected_revision bigint, next_state jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
 if owner_id is null or length(owner_id) < 3 or jsonb_typeof(next_state) <> 'object' then raise exception 'invalid_usage'; end if;
 insert into app_usage_ledgers(user_id) values(owner_id) on conflict(user_id) do nothing;
 update app_usage_ledgers set state = next_state, revision = revision + 1
 where user_id = owner_id and revision = expected_revision;
 return found;
end $$;
revoke all on function public.speaknow_commit_usage(text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.speaknow_commit_usage(text,bigint,jsonb) to service_role;
create or replace function public.speaknow_release_limit(counter_key text, decrement_by bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
 if decrement_by > 0 then update app_usage_counters set count = greatest(0, count - decrement_by) where key = counter_key; end if;
end $$;
revoke all on function public.speaknow_release_limit(text,bigint) from public, anon, authenticated;
grant execute on function public.speaknow_release_limit(text,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
