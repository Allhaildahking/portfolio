-- Anonymous portfolio interactions for ALLHAILDAHKING.
-- All writes go through the Edge Function using the server-only service role key.
-- Do not add the service role key to frontend code.

create table if not exists public.portfolio_likes (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  visitor_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  constraint portfolio_likes_one_per_visitor unique (post_id, visitor_hash)
);

create index if not exists portfolio_likes_post_id_idx
  on public.portfolio_likes (post_id);

create table if not exists public.portfolio_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  visitor_hash text not null,
  ip_hash text not null,
  display_name varchar(32) not null,
  body varchar(500) not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists portfolio_comments_post_status_created_idx
  on public.portfolio_comments (post_id, status, created_at desc);

create table if not exists public.portfolio_views (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  visitor_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  constraint portfolio_views_one_per_visitor unique (post_id, visitor_hash)
);

create index if not exists portfolio_views_post_id_idx
  on public.portfolio_views (post_id);

create table if not exists public.portfolio_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_rate_limits_lookup_idx
  on public.portfolio_rate_limits (ip_hash, action, created_at desc);

-- Atomic rate-limit check. Returns false when the caller has reached its limit.
create or replace function public.consume_portfolio_rate_limit(
  p_ip_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip_hash || ':' || p_action));
  select count(*) into recent_count
  from public.portfolio_rate_limits
  where ip_hash = p_ip_hash
    and action = p_action
    and created_at > now() - make_interval(secs => p_window_seconds);

  if recent_count >= p_limit then
    return false;
  end if;

  insert into public.portfolio_rate_limits (ip_hash, action)
  values (p_ip_hash, p_action);
  return true;
end;
$$;

revoke all on function public.consume_portfolio_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_portfolio_rate_limit(text, text, integer, integer)
  to service_role;

alter table public.portfolio_likes enable row level security;
alter table public.portfolio_comments enable row level security;
alter table public.portfolio_views enable row level security;
alter table public.portfolio_rate_limits enable row level security;

-- No anon/authenticated table policies by design. The Edge Function uses service_role.
