create extension if not exists pgcrypto;

create type public.private_role as enum ('owner', 'friend');
create type public.room_status as enum ('waiting', 'active', 'ended');
create type public.room_member_role as enum ('host', 'guest');

create table public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  private_role public.private_role not null,
  created_at timestamptz not null default now(),
  constraint allowed_users_email_lowercase check (email = lower(trim(email))),
  constraint allowed_users_email_shape check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

comment on table public.allowed_users is
  'Private two-account whitelist. Manually insert exactly OWNER_GOOGLE_EMAIL and FRIEND_GOOGLE_EMAIL after deploying this migration.';
comment on column public.allowed_users.email is
  'Store lowercase Google account emails only. Example manual setup is documented below; never commit real email addresses.';

-- Manual setup after migration:
-- insert into public.allowed_users (email, private_role)
-- values
--   (lower('OWNER_GOOGLE_EMAIL'), 'owner'),
--   (lower('FRIEND_GOOGLE_EMAIL'), 'friend');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  private_role public.private_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(trim(email)))
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  room_name text not null default 'Private room',
  host_user_id uuid not null references public.profiles(user_id) on delete cascade,
  status public.room_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint rooms_invite_code_format check (invite_code ~ '^[A-Z0-9]{6,10}$'),
  constraint rooms_room_name_length check (char_length(trim(room_name)) between 1 and 80)
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  member_role public.room_member_role not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create unique index room_members_one_active_host_per_room
  on public.room_members (room_id)
  where member_role = 'host' and left_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (char_length(body) between 1 and 500),
  constraint messages_body_trimmed check (body = btrim(body))
);

create index room_members_user_id_idx on public.room_members (user_id);
create index room_members_active_room_idx on public.room_members (room_id) where left_at is null;
create index messages_room_created_idx on public.messages (room_id, created_at);
create index rooms_host_user_id_idx on public.rooms (host_user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger rooms_touch_updated_at
before update on public.rooms
for each row execute function public.touch_updated_at();

create or replace function public.normalized_auth_email()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce((auth.jwt() ->> 'email'), ''));
$$;

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.allowed_users au
    where au.email = public.normalized_auth_email()
  );
$$;

create or replace function public.is_active_room_member(target_room_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = target_room_id
      and rm.user_id = target_user_id
      and rm.left_at is null
  );
$$;

create or replace function public.sync_private_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  allowed public.allowed_users%rowtype;
  user_record auth.users%rowtype;
  profile_row public.profiles%rowtype;
  display_name text;
  avatar text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into user_record from auth.users where id = auth.uid();
  select * into allowed from public.allowed_users where email = lower(user_record.email);

  if allowed.id is null then
    raise exception 'This Google account is not invited to SyncRoom' using errcode = '42501';
  end if;

  display_name := coalesce(
    nullif(user_record.raw_user_meta_data ->> 'full_name', ''),
    nullif(user_record.raw_user_meta_data ->> 'name', ''),
    split_part(allowed.email, '@', 1)
  );
  avatar := nullif(coalesce(user_record.raw_user_meta_data ->> 'avatar_url', user_record.raw_user_meta_data ->> 'picture'), '');

  insert into public.profiles (user_id, email, full_name, avatar_url, private_role)
  values (auth.uid(), allowed.email, display_name, avatar, allowed.private_role)
  on conflict (user_id)
  do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    private_role = excluded.private_role,
    updated_at = now()
  returning * into profile_row;

  return profile_row;
end;
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  for i in 1..7 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.create_private_room(room_name_input text default null)
returns public.rooms
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile_row public.profiles%rowtype;
  new_room public.rooms%rowtype;
  clean_name text;
  code text;
begin
  if not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;

  select * into profile_row from public.sync_private_profile();
  clean_name := coalesce(nullif(btrim(room_name_input), ''), 'Private room');
  if char_length(clean_name) > 80 then
    raise exception 'Room name is too long' using errcode = '22001';
  end if;

  loop
    code := public.generate_invite_code();
    begin
      insert into public.rooms (invite_code, room_name, host_user_id, status)
      values (code, clean_name, auth.uid(), 'waiting')
      returning * into new_room;
      exit;
    exception when unique_violation then
    end;
  end loop;

  insert into public.room_members (room_id, user_id, member_role)
  values (new_room.id, auth.uid(), 'host');

  return new_room;
end;
$$;

create or replace function public.join_private_room(invite_code_input text)
returns public.rooms
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_code text := upper(btrim(invite_code_input));
  room_row public.rooms%rowtype;
  profile_row public.profiles%rowtype;
  host_role public.private_role;
  guest_role public.private_role;
  active_count integer;
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;

  select * into profile_row from public.sync_private_profile();

  select * into room_row
  from public.rooms
  where invite_code = clean_code
  for update;

  if room_row.id is null then
    raise exception 'Room invitation not found' using errcode = 'P0002';
  end if;
  if room_row.status = 'ended' then
    raise exception 'This room has ended' using errcode = '22023';
  end if;
  if room_row.host_user_id = auth.uid() then
    return room_row;
  end if;

  select private_role into host_role from public.profiles where user_id = room_row.host_user_id;
  guest_role := profile_row.private_role;

  if host_role = guest_role then
    raise exception 'This invitation is for the other private account' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = room_row.id and user_id = auth.uid() and left_at is null
  ) then
    return room_row;
  end if;

  select count(*) into active_count
  from public.room_members
  where room_id = room_row.id and left_at is null;

  if active_count >= 2 then
    raise exception 'This room is already full' using errcode = '54000';
  end if;

  insert into public.room_members (room_id, user_id, member_role)
  values (room_row.id, auth.uid(), 'guest')
  on conflict (room_id, user_id)
  do update set left_at = null, joined_at = now(), member_role = 'guest';

  update public.rooms
  set status = 'active'
  where id = room_row.id and status = 'waiting'
  returning * into room_row;

  return room_row;
end;
$$;

create or replace function public.leave_private_room(room_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;

  update public.room_members
  set left_at = now()
  where room_id = room_id_input
    and user_id = auth.uid()
    and member_role <> 'host'
    and left_at is null;
end;
$$;

create or replace function public.end_private_room(room_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;

  update public.rooms
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where id = room_id_input
    and host_user_id = auth.uid()
    and status <> 'ended';
end;
$$;

create or replace function public.trim_message_body()
returns trigger
language plpgsql
as $$
begin
  new.body = btrim(new.body);
  if new.body = '' then
    raise exception 'Message cannot be empty' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger messages_trim_body
before insert or update on public.messages
for each row execute function public.trim_message_body();

alter table public.allowed_users enable row level security;
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

create policy "No direct allowed user reads"
on public.allowed_users for select
using (false);

create policy "No direct allowed user writes"
on public.allowed_users for all
using (false)
with check (false);

create policy "Allowed users can read approved profiles"
on public.profiles for select
using (public.is_allowed_user());

create policy "Allowed users can upsert their own profile"
on public.profiles for insert
with check (public.is_allowed_user() and user_id = auth.uid());

create policy "Allowed users can update their own profile"
on public.profiles for update
using (public.is_allowed_user() and user_id = auth.uid())
with check (public.is_allowed_user() and user_id = auth.uid());

create policy "Members can read their rooms"
on public.rooms for select
using (
  public.is_allowed_user()
  and (
    public.is_active_room_member(id)
    or (status <> 'ended' and invite_code is not null)
  )
);

create policy "Rooms are created through RPC only"
on public.rooms for insert
with check (false);

create policy "Rooms are updated through RPC only"
on public.rooms for update
using (false)
with check (false);

create policy "Allowed users can read memberships for visible rooms"
on public.room_members for select
using (
  public.is_allowed_user()
  and exists (
    select 1 from public.rooms r
    where r.id = room_id
      and (public.is_active_room_member(r.id) or r.status <> 'ended')
  )
);

create policy "Memberships are changed through RPC only"
on public.room_members for insert
with check (false);

create policy "Membership updates are through RPC only"
on public.room_members for update
using (false)
with check (false);

create policy "Room members can read messages"
on public.messages for select
using (public.is_allowed_user() and public.is_active_room_member(room_id));

create policy "Room members can send messages as themselves"
on public.messages for insert
with check (
  public.is_allowed_user()
  and user_id = auth.uid()
  and public.is_active_room_member(room_id)
  and exists (select 1 from public.rooms r where r.id = room_id and r.status <> 'ended')
);

revoke all on public.allowed_users from anon, authenticated;
grant select on public.profiles, public.rooms, public.room_members, public.messages to authenticated;
grant insert on public.messages to authenticated;
grant execute on function public.sync_private_profile() to authenticated;
grant execute on function public.create_private_room(text) to authenticated;
grant execute on function public.join_private_room(text) to authenticated;
grant execute on function public.leave_private_room(uuid) to authenticated;
grant execute on function public.end_private_room(uuid) to authenticated;
