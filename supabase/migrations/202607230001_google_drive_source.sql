alter table public.room_playback_states
  drop constraint if exists room_playback_source_youtube_only;

alter table public.room_playback_states
  add column if not exists drive_file_id text,
  add column if not exists drive_file_name text,
  add column if not exists drive_mime_type text,
  add column if not exists drive_file_size bigint,
  add column if not exists drive_modified_time timestamptz;

alter table public.room_playback_states
  add constraint room_playback_valid_source_type
  check (source_type in ('youtube', 'google_drive'));

alter table public.room_playback_states
  add constraint room_playback_drive_file_id_shape
  check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$');

alter table public.room_playback_states
  add constraint room_playback_drive_mime_supported
  check (drive_mime_type is null or drive_mime_type in ('video/mp4', 'video/webm'));

alter table public.room_playback_states
  add constraint room_playback_drive_file_size_nonnegative
  check (drive_file_size is null or drive_file_size >= 0);

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
    drive_file_id,
    drive_file_name,
    drive_mime_type,
    drive_file_size,
    drive_modified_time,
    playback_status,
    current_time_seconds,
    playback_rate,
    duration_seconds,
    state_version,
    updated_by,
    updated_at
  )
  values (room_id_input, 'youtube', youtube_video_id_input, null, null, null, null, null, 'cued', 0, 1, null, 1, auth.uid(), now())
  on conflict (room_id)
  do update set
    source_type = 'youtube',
    youtube_video_id = excluded.youtube_video_id,
    drive_file_id = null,
    drive_file_name = null,
    drive_mime_type = null,
    drive_file_size = null,
    drive_modified_time = null,
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

create or replace function public.set_room_drive_source(
  room_id_input uuid,
  drive_file_id_input text,
  drive_file_name_input text,
  drive_mime_type_input text,
  drive_file_size_input bigint default null,
  drive_modified_time_input timestamptz default null
)
returns public.room_playback_states
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot public.room_playback_states%rowtype;
  clean_name text := nullif(btrim(drive_file_name_input), '');
begin
  perform public.ensure_room_playback_writable(room_id_input);

  if drive_file_id_input is null or drive_file_id_input !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'Invalid Drive file id' using errcode = '22023';
  end if;
  if clean_name is null or char_length(clean_name) > 180 then
    raise exception 'Invalid Drive file name' using errcode = '22023';
  end if;
  if drive_mime_type_input not in ('video/mp4', 'video/webm') then
    raise exception 'Unsupported Drive video type' using errcode = '22023';
  end if;
  if drive_file_size_input is not null and drive_file_size_input < 0 then
    raise exception 'Invalid Drive file size' using errcode = '22023';
  end if;

  insert into public.room_playback_states (
    room_id,
    source_type,
    youtube_video_id,
    drive_file_id,
    drive_file_name,
    drive_mime_type,
    drive_file_size,
    drive_modified_time,
    playback_status,
    current_time_seconds,
    playback_rate,
    duration_seconds,
    state_version,
    updated_by,
    updated_at
  )
  values (
    room_id_input,
    'google_drive',
    null,
    drive_file_id_input,
    clean_name,
    drive_mime_type_input,
    drive_file_size_input,
    drive_modified_time_input,
    'cued',
    0,
    1,
    null,
    1,
    auth.uid(),
    now()
  )
  on conflict (room_id)
  do update set
    source_type = 'google_drive',
    youtube_video_id = null,
    drive_file_id = excluded.drive_file_id,
    drive_file_name = excluded.drive_file_name,
    drive_mime_type = excluded.drive_mime_type,
    drive_file_size = excluded.drive_file_size,
    drive_modified_time = excluded.drive_modified_time,
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

grant execute on function public.set_room_drive_source(uuid, text, text, text, bigint, timestamptz) to authenticated;
