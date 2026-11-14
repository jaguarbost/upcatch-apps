begin;

-- Retain existing RLS and RPC-only access. Clients cannot attach provenance.
alter table private.friend_messages add column nudge_id uuid unique
  references private.friend_nudges(id) on delete set null;

-- The nudge already queues its push; do not send a second chat push.
drop trigger friend_message_push on private.friend_messages;
create trigger friend_message_push after insert on private.friend_messages
for each row when (new.nudge_id is null)
execute function private.queue_friend_message_push();

create function private.create_nudge_chat_message() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.friend_messages(sender_id,recipient_id,body,nudge_id,created_at)
  values(new.sender_id,new.recipient_id,'Up for quick catchup?',new.id,new.created_at)
  on conflict(nudge_id) do nothing;
  return new;
end $$;
revoke all on function private.create_nudge_chat_message() from public,anon,authenticated;

-- Applies atomically to selected and bulk nudges after existing eligibility,
-- proximity, block and cooldown checks. Rejected/skipped nudges create nothing.
create trigger create_nudge_chat_message after insert on private.friend_nudges
for each row execute function private.create_nudge_chat_message();

notify pgrst, 'reload schema';
commit;
