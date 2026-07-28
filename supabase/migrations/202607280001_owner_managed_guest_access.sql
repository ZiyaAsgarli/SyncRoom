-- Owner-managed private guest access.
-- The existing enum value "friend" is intentionally retained as the internal guest role
-- so live profiles, memberships, messages, and history do not require destructive rewrites.

alter table public.allowed_users
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'allowed_users_created_by_fkey'
      and conrelid = 'public.allowed_users'::regclass
  ) then
    alter table public.allowed_users
      add constraint allowed_users_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end;
$$;

-- Existing owner/friend rows stay active. This is also safe if the migration is re-run.
update public.allowed_users
set email = lower(btrim(email)), is_active = true
where is_active is null or email <> lower(btrim(email));

create unique index if not exists allowed_users_single_owner_idx
  on public.allowed_users (private_role)
  where private_role = 'owner';

comment on table public.allowed_users is
  'Private SyncRoom access list: exactly one owner and owner-managed approved guests. The internal friend role represents a guest.';
comment on column public.allowed_users.is_active is
  'Inactive guest rows retain history but no longer authorize authentication, RLS, or protected RPC access.';
comment on column public.allowed_users.created_by is
  'Authenticated owner who approved the guest. Existing manually-created rows may be null.';

create or replace function public.normalized_auth_email()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(btrim(coalesce((auth.jwt() ->> 'email'), '')));
$$;

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.allowed_users au
    where au.email = public.normalized_auth_email()
      and au.is_active
  );
$$;

create or replace function public.is_private_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.allowed_users au
    where au.email = public.normalized_auth_email()
      and au.private_role = 'owner'
      and au.is_active
  );
$$;

create or replace function public.is_room_member(target_room_id uuid)
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
      and rm.user_id = auth.uid()
  );
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_allowed_user() and (
    target_user_id = auth.uid()
    or public.is_private_owner()
    or exists (
      select 1
      from public.room_members mine
      join public.room_members theirs on theirs.room_id = mine.room_id
      where mine.user_id = auth.uid()
        and theirs.user_id = target_user_id
    )
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
  select * into allowed
  from public.allowed_users
  where email = lower(btrim(user_record.email));

  if allowed.id is null then
    raise exception 'This Google account is not invited to SyncRoom' using errcode = '42501';
  end if;
  if not allowed.is_active then
    raise exception 'Your access to this private SyncRoom has been removed' using errcode = '42501';
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

create or replace function public.check_private_access()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  access_row public.allowed_users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into access_row
  from public.allowed_users
  where email = public.normalized_auth_email();

  if access_row.id is null then
    raise exception 'This Google account is not invited to SyncRoom' using errcode = '42501';
  end if;
  if not access_row.is_active then
    raise exception 'Your access to this private SyncRoom has been removed' using errcode = '42501';
  end if;

  return case when access_row.private_role = 'owner' then 'owner' else 'guest' end;
end;
$$;

create or replace function public.list_allowed_guests()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_private_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'email', au.email,
        'is_active', au.is_active,
        'created_at', au.created_at
      ) order by au.is_active desc, au.email
    )
    from public.allowed_users au
    where au.private_role = 'friend'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.add_allowed_guest(email_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_email text := lower(btrim(coalesce(email_input, '')));
  guest_row public.allowed_users%rowtype;
begin
  if not public.is_private_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if char_length(clean_email) < 3 or char_length(clean_email) > 254
     or clean_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$' then
    raise exception 'Enter a valid Google email address' using errcode = '22023';
  end if;
  if clean_email = public.normalized_auth_email() then
    raise exception 'The owner cannot be added as a guest' using errcode = '22023';
  end if;

  insert into public.allowed_users (email, private_role, is_active, created_by)
  values (clean_email, 'friend', true, auth.uid())
  on conflict (email)
  do update set
    is_active = true,
    created_by = coalesce(public.allowed_users.created_by, excluded.created_by)
  where public.allowed_users.private_role = 'friend'
  returning * into guest_row;

  if guest_row.id is null then
    raise exception 'That email belongs to the private owner' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'email', guest_row.email,
    'is_active', guest_row.is_active,
    'created_at', guest_row.created_at
  );
end;
$$;

create or replace function public.set_allowed_guest_active(email_input text, active_input boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_email text := lower(btrim(coalesce(email_input, '')));
  guest_row public.allowed_users%rowtype;
begin
  if not public.is_private_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  update public.allowed_users
  set is_active = active_input
  where email = clean_email
    and private_role = 'friend'
  returning * into guest_row;

  if guest_row.id is null then
    raise exception 'Approved guest not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'email', guest_row.email,
    'is_active', guest_row.is_active,
    'created_at', guest_row.created_at
  );
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
  if not public.is_private_owner() then
    raise exception 'Only the private owner can create a room' using errcode = '42501';
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
  if host_role <> 'owner' or profile_row.private_role <> 'friend' then
    raise exception 'This invitation requires the private owner and an approved guest' using errcode = '42501';
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

create or replace function public.get_private_room_invite(invite_code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_code text := upper(btrim(invite_code_input));
  room_row public.rooms%rowtype;
  member_rows jsonb;
begin
  if not public.is_allowed_user() then
    raise exception 'This account is not invited' using errcode = '42501';
  end if;

  select * into room_row
  from public.rooms
  where invite_code = clean_code;

  if room_row.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(rm) || jsonb_build_object('profiles', to_jsonb(p)) order by rm.joined_at), '[]'::jsonb)
  into member_rows
  from public.room_members rm
  left join public.profiles p on p.user_id = rm.user_id
  where rm.room_id = room_row.id
    and rm.left_at is null;

  return jsonb_build_object('room', to_jsonb(room_row), 'members', member_rows);
end;
$$;

drop policy if exists "Allowed users can read approved profiles" on public.profiles;
drop policy if exists "Users can read relevant profiles" on public.profiles;
create policy "Users can read relevant profiles"
on public.profiles for select
using (public.can_view_profile(user_id));

drop policy if exists "Members can read their rooms" on public.rooms;
create policy "Members can read their rooms"
on public.rooms for select
using (public.is_allowed_user() and public.is_room_member(id));

drop policy if exists "Allowed users can read memberships for visible rooms" on public.room_members;
drop policy if exists "Members can read relevant memberships" on public.room_members;
create policy "Members can read relevant memberships"
on public.room_members for select
using (public.is_allowed_user() and public.is_room_member(room_id));

revoke all on public.allowed_users from anon, authenticated;

revoke all on function public.is_private_owner() from public, anon;
revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.check_private_access() from public, anon;
revoke all on function public.list_allowed_guests() from public, anon;
revoke all on function public.add_allowed_guest(text) from public, anon;
revoke all on function public.set_allowed_guest_active(text, boolean) from public, anon;
revoke all on function public.get_private_room_invite(text) from public, anon;

grant execute on function public.is_private_owner() to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.check_private_access() to authenticated;
grant execute on function public.list_allowed_guests() to authenticated;
grant execute on function public.add_allowed_guest(text) to authenticated;
grant execute on function public.set_allowed_guest_active(text, boolean) to authenticated;
grant execute on function public.get_private_room_invite(text) to authenticated;
