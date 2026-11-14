-- New members get friend discovery preferences on; existing choices remain unchanged.
begin;
alter table private.member_settings alter column prefs set default '{"verifiedOnly":false,"share":false,"hideAge":false,"notifyFriends":true,"friendMeetups":true,"friendsFirst":true}'::jsonb;
commit;
