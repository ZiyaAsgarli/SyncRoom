-- Restrict room Presence and Broadcast traffic to active room members.
-- Playback authority is enforced twice: host-only INSERT policy for the
-- authoritative topic, plus client-side event validation.

create or replace function public.syncroom_realtime_room_id(topic_input text)
returns uuid
language sql
immutable
strict
set search_path = public
as $$
  select case
    when topic_input ~ '^room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(:playback|:participant)?$'
      then split_part(topic_input, ':', 2)::uuid
    else null
  end;
$$;

revoke all on function public.syncroom_realtime_room_id(text) from public, anon;
grant execute on function public.syncroom_realtime_room_id(text) to authenticated;

drop policy if exists "Active room members can receive private realtime" on realtime.messages;
create policy "Active room members can receive private realtime"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension::text in ('broadcast', 'presence')
  and public.is_allowed_user()
  and public.is_active_room_member(public.syncroom_realtime_room_id(realtime.topic()), auth.uid())
  and exists (
    select 1
    from public.rooms r
    where r.id = public.syncroom_realtime_room_id(realtime.topic())
      and r.status <> 'ended'
  )
);

drop policy if exists "Active room members can send private realtime" on realtime.messages;
create policy "Active room members can send private realtime"
on realtime.messages
for insert
to authenticated
with check (
  public.is_allowed_user()
  and public.is_active_room_member(public.syncroom_realtime_room_id(realtime.topic()), auth.uid())
  and exists (
    select 1
    from public.rooms r
    where r.id = public.syncroom_realtime_room_id(realtime.topic())
      and r.status <> 'ended'
  )
  and (
    (
      realtime.messages.extension::text = 'presence'
      and realtime.topic() = 'room:' || public.syncroom_realtime_room_id(realtime.topic())::text
    )
    or (
      realtime.messages.extension::text = 'broadcast'
      and realtime.topic() = 'room:' || public.syncroom_realtime_room_id(realtime.topic())::text || ':participant'
    )
    or (
      realtime.messages.extension::text = 'broadcast'
      and realtime.topic() = 'room:' || public.syncroom_realtime_room_id(realtime.topic())::text || ':playback'
      and public.is_room_host(public.syncroom_realtime_room_id(realtime.topic()), auth.uid())
    )
  )
);

comment on function public.syncroom_realtime_room_id(text) is
  'Parses only SyncRoom room-scoped Realtime topics; malformed or unrelated topics return null.';
