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


-- Fetch all feed counters and recent approved comments in one database call.
create or replace function public.get_portfolio_summary(
  p_post_ids text[],
  p_visitor_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected as (
    select distinct unnest(coalesce(p_post_ids, array[]::text[])) as post_id
  ),
  like_counts as (
    select post_id, count(*) as total
    from public.portfolio_likes
    where post_id = any(coalesce(p_post_ids, array[]::text[]))
    group by post_id
  ),
  comment_counts as (
    select post_id, count(*) as total
    from public.portfolio_comments
    where status = 'approved'
      and post_id = any(coalesce(p_post_ids, array[]::text[]))
    group by post_id
  ),
  view_counts as (
    select post_id, count(*) as total
    from public.portfolio_views
    where post_id = any(coalesce(p_post_ids, array[]::text[]))
    group by post_id
  ),
  my_likes as (
    select post_id
    from public.portfolio_likes
    where visitor_hash = p_visitor_hash
      and post_id = any(coalesce(p_post_ids, array[]::text[]))
  ),
  ranked_comments as (
    select post_id, display_name, body, created_at,
      row_number() over (partition by post_id order by created_at desc) as row_num
    from public.portfolio_comments
    where status = 'approved'
      and post_id = any(coalesce(p_post_ids, array[]::text[]))
  ),
  comment_previews as (
    select post_id,
      jsonb_agg(jsonb_build_object(
        'display_name', display_name,
        'body', body,
        'created_at', created_at
      ) order by created_at desc) as items
    from ranked_comments
    where row_num <= 5
    group by post_id
  ),
  post_data as (
    select jsonb_object_agg(s.post_id, jsonb_build_object(
      'likes', coalesce(lc.total, 0),
      'commentCount', coalesce(cc.total, 0),
      'views', coalesce(vc.total, 0),
      'likedByMe', (ml.post_id is not null),
      'comments', coalesce(cp.items, '[]'::jsonb)
    )) as posts
    from selected s
    left join like_counts lc on lc.post_id = s.post_id
    left join comment_counts cc on cc.post_id = s.post_id
    left join view_counts vc on vc.post_id = s.post_id
    left join my_likes ml on ml.post_id = s.post_id
    left join comment_previews cp on cp.post_id = s.post_id
  ),
  recent_activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'post_id', activity.post_id,
      'display_name', activity.display_name,
      'body', activity.body,
      'created_at', activity.created_at
    ) order by activity.created_at desc), '[]'::jsonb) as items
    from (
      select post_id, display_name, body, created_at
      from public.portfolio_comments
      where status = 'approved'
        and post_id = any(coalesce(p_post_ids, array[]::text[]))
      order by created_at desc
      limit 6
    ) activity
  )
  select jsonb_build_object(
    'posts', coalesce(post_data.posts, '{}'::jsonb),
    'activity', recent_activity.items
  )
  from post_data cross join recent_activity;
$$;

revoke all on function public.get_portfolio_summary(text[], text)
  from public, anon, authenticated;
grant execute on function public.get_portfolio_summary(text[], text)
  to service_role;
