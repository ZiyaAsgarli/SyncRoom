-- SyncRoom Step 3 urgent fix:
-- Prevent playback snapshot optimistic-concurrency mismatches from becoming
-- PostgreSQL transaction errors and stop periodic recovery snapshots from
-- advancing the authoritative command version.

drop function if exists public.update_room_playback_state(
  uuid,
  bigint,
  text,
  double precision,
  double precision,
  double precision
);

create or replace function public.update_room_playback_state(
  room_id_input uuid,
  expected_state_version bigint,
  playback_status_input text,
  current_time_seconds_input double precision,
  playback_rate_input double precision default 1,
  duration_seconds_input double precision default null,
  increment_state_version_input boolean default true
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
    state_version = case
      when increment_state_version_input then state_version + 1
      else state_version
    end,
    updated_by = auth.uid(),
    updated_at = now()
  where room_id = room_id_input
    and state_version = expected_state_version
  returning * into snapshot;

  if snapshot.room_id is not null then
    return snapshot;
  end if;

  -- A stale application version is normal optimistic concurrency behavior.
  -- Return the latest row as a no-op instead of raising a transaction error.
  select *
  into snapshot
  from public.room_playback_states
  where room_id = room_id_input;

  return snapshot;
end;
$$;

grant execute on function public.update_room_playback_state(
  uuid,
  bigint,
  text,
  double precision,
  double precision,
  double precision,
  boolean
) to authenticated;
