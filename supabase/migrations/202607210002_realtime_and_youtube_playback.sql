-- Step 2 normalizes Realtime publication setup for future deployments.
-- This is equivalent to the manual dashboard/SQL action previously performed:
-- alter publication supabase_realtime add table public.messages;
-- It is safe when the tables have already been added.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members'
    ) then
      alter publication supabase_realtime add table public.room_members;
    end if;
  end if;
end;
$$;

create table public.room_playback_states (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  source_type text not null default 'youtube',
  youtube_video_id text,
  playback_status text not null default 'idle',
  current_time_seconds double precision not null default 0,
  playback_rate double precision not null default 1,
  duration_seconds double precision,
  state_version bigint not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint room_playback_source_youtube_only check (source_type = 'youtube'),
  constraint room_playback_valid_status check (playback_status in ('idle', 'loading', 'cued', 'playing', 'paused', 'buffering', 'ended', 'error')),
  constraint room_playback_non_negative_time check (current_time_seconds >= 0),
  constraint room_playback_non_negative_duration check (duration_seconds is null or duration_seconds >= 0),
  constraint room_playback_sensible_rate check (playback_rate between 0.25 and 2)
);

alter table public.room_playback_states enable row level security;

create policy "Room members can read playback snapshots"
on public.room_playback_states for select
using (public.is_allowed_user() and public.is_active_room_member(room_id));

create policy "Playback state is inserted through RPC only"
on public.room_playback_states for insert
with check (false);

create policy "Playback state is updated through RPC only"
on public.room_playback_states for update
using (false)
with check (false);

create policy "Playback state cannot be deleted by clients"
on public.room_playback_states for delete
using (false);

create or replace function public.is_room_host(target_room_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.rooms r
    join public.room_members rm on rm.room_id = r.id
    where r.id = target_room_id
      and r.host_user_id = target_user_id
      and rm.user_id = target_user_id
      and rm.member_role = 'host'
      and rm.left_at is null
  );
$$;

create or replace function public.ensure_room_playback_writable(target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  room_row public.rooms%rowtype;
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;

  select * into room_row
  from public.rooms
  where id = target_room_id
  for update;

  if room_row.id is null then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  if room_row.status = 'ended' then
    raise exception 'This room has ended' using errcode = '22023';
  end if;
  if not public.is_active_room_member(target_room_id, auth.uid()) then
    raise exception 'Room membership required' using errcode = '42501';
  end if;
  if not public.is_room_host(target_room_id, auth.uid()) then
    raise exception 'Only the host can update playback' using errcode = '42501';
  end if;

  return room_row;
end;
$$;

create or replace function public.set_room_youtube_source(
  room_id_input uuid,
  youtube_video_id_input text
)
returns public.room_playback_states
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot public.room_playback_states%rowtype;
begin
  perform public.ensure_room_playback_writable(room_id_input);

  if youtube_video_id_input is null or youtube_video_id_input !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Invalid YouTube video id' using errcode = '22023';
  end if;

  insert into public.room_playback_states (
    room_id,
    source_type,
    youtube_video_id,
    playback_status,
    current_time_seconds,
    playback_rate,
    duration_seconds,
    state_version,
    updated_by,
    updated_at
  )
  values (room_id_input, 'youtube', youtube_video_id_input, 'cued', 0, 1, null, 1, auth.uid(), now())
  on conflict (room_id)
  do update set
    source_type = 'youtube',
    youtube_video_id = excluded.youtube_video_id,
    playback_status = 'cued',
    current_time_seconds = 0,
    playback_rate = 1,
    duration_seconds = null,
    state_version = public.room_playback_states.state_version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into snapshot;

  return snapshot;
end;
$$;

create or replace function public.update_room_playback_state(
  room_id_input uuid,
  expected_state_version bigint,
  playback_status_input text,
  current_time_seconds_input double precision,
  playback_rate_input double precision default 1,
  duration_seconds_input double precision default null
)
returns public.room_playback_states
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot public.room_playback_states%rowtype;
begin
  perform public.ensure_room_playback_writable(room_id_input);

  if playback_status_input not in ('idle', 'loading', 'cued', 'playing', 'paused', 'buffering', 'ended', 'error') then
    raise exception 'Invalid playback status' using errcode = '22023';
  end if;
  if current_time_seconds_input < 0 or playback_rate_input < 0.25 or playback_rate_input > 2 then
    raise exception 'Invalid playback state' using errcode = '22023';
  end if;
  if duration_seconds_input is not null and duration_seconds_input < 0 then
    raise exception 'Invalid duration' using errcode = '22023';
  end if;

  update public.room_playback_states
  set
    playback_status = playback_status_input,
    current_time_seconds = current_time_seconds_input,
    playback_rate = playback_rate_input,
    duration_seconds = duration_seconds_input,
    state_version = state_version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where room_id = room_id_input
    and state_version = expected_state_version
  returning * into snapshot;

  if snapshot.room_id is null then
    raise exception 'Stale playback state version' using errcode = '40001';
  end if;

  return snapshot;
end;
$$;

create or replace function public.get_room_playback_snapshot(room_id_input uuid)
returns public.room_playback_states
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot public.room_playback_states%rowtype;
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;
  if not public.is_active_room_member(room_id_input, auth.uid()) then
    raise exception 'Room membership required' using errcode = '42501';
  end if;

  select * into snapshot
  from public.room_playback_states
  where room_id = room_id_input;

  return snapshot;
end;
$$;

grant select on public.room_playback_states to authenticated;
grant execute on function public.is_room_host(uuid, uuid) to authenticated;
grant execute on function public.set_room_youtube_source(uuid, text) to authenticated;
grant execute on function public.update_room_playback_state(uuid, bigint, text, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_room_playback_snapshot(uuid) to authenticated;
