-- Demo data for room PO-991: two companies, Company A's buyer agent, the room,
-- and a second room that Company B must never see.
--
-- People are created when they first sign in. Locally, sign in as
-- joe@acme.test or sarah@northwind.test (links arrive in Mailpit at
-- http://127.0.0.1:54324) and the invites below put each of you in PO-991.

insert into public.organizations (id, name, domain) values
  ('00000000-0000-0000-0000-00000000000a', 'Acme Manufacturing', 'acme.test'),
  ('00000000-0000-0000-0000-00000000000b', 'Northwind Components', 'northwind.test');

insert into public.participants (id, org_id, kind, display_name, agent_card_url) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a',
   'agent', 'Acme Buyer Agent', null);

insert into public.rooms (id, slug, title, created_by_org) values
  ('00000000-0000-0000-0000-000000000991', 'po-991', 'PO-991: late shipment recovery',
   '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000001204', 'po-1204', 'PO-1204: internal (Acme only)',
   '00000000-0000-0000-0000-00000000000a');

insert into public.room_members (room_id, participant_id, role) values
  ('00000000-0000-0000-0000-000000000991', '00000000-0000-0000-0000-0000000000a1', 'member'),
  ('00000000-0000-0000-0000-000000001204', '00000000-0000-0000-0000-0000000000a1', 'member');

insert into public.room_invites (room_id, email, org_id, role) values
  ('00000000-0000-0000-0000-000000000991', 'joe@acme.test', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-000000000991', 'sarah@northwind.test', '00000000-0000-0000-0000-00000000000b', 'member'),
  ('00000000-0000-0000-0000-000000001204', 'joe@acme.test', '00000000-0000-0000-0000-00000000000a', 'owner');
