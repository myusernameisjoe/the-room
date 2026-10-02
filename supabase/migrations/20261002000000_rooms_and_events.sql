-- The room, v0: organizations, participants, rooms, members, invites,
-- the append-only event log, and agent API keys.
--
-- Everything that happens in a room is a row in `events`. The other tables
-- describe who may write events and where. Row-level security means a
-- signed-in person only ever sees rooms they are a member of.

create type public.participant_kind as enum ('human', 'agent');
create type public.member_role as enum ('owner', 'member', 'observer');
create type public.room_status as enum ('open', 'resolved', 'archived');
create type public.event_type as enum ('message', 'proposal', 'decision', 'member_joined', 'member_left');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Email domain that maps a new sign-in to this company (null for none).
  domain text unique,
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id),
  kind public.participant_kind not null,
  display_name text not null,
  -- Humans are tied to a Supabase auth user; agents authenticate with api_keys.
  user_id uuid unique references auth.users (id) on delete cascade,
  email text,
  public_key text,
  agent_card_url text,
  created_at timestamptz not null default now(),
  constraint humans_have_a_login check (kind = 'agent' or user_id is not null)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  created_by_org uuid references public.organizations (id),
  status public.room_status not null default 'open',
  -- Highest seq handed out so far; bumped by the events trigger only.
  last_seq bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id),
  participant_id uuid not null references public.participants (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, participant_id)
);
create index room_members_participant_idx on public.room_members (participant_id);

-- An email invited to a room. Accepted automatically the first time that
-- email signs in (or right away if they already have an account).
create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  email text not null,
  -- Company the invitee belongs to, for people on gmail and the like.
  org_id uuid references public.organizations (id),
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (room_id, email)
);

-- The log. Rows are never updated or deleted.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  -- Assigned by trigger: 1, 2, 3... per room, so everyone sees one order.
  seq bigint not null,
  sender_id uuid not null references public.participants (id),
  type public.event_type not null,
  body jsonb not null default '{}'::jsonb,
  parent_id uuid references public.events (id),
  signature text,
  created_at timestamptz not null default now(),
  unique (room_id, seq)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Event log: per-room seq, append-only
-- ---------------------------------------------------------------------------

create function public.events_assign_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The row lock on the room serializes writers, so seq has no gaps or dupes.
  update public.rooms
     set last_seq = last_seq + 1
   where id = new.room_id
  returning last_seq into new.seq;

  if new.seq is null then
    raise exception 'room % does not exist', new.room_id;
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger events_assign_seq
before insert on public.events
for each row execute function public.events_assign_seq();

create function public.events_are_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'events are append-only';
end;
$$;

create trigger events_are_append_only
before update or delete on public.events
for each row execute function public.events_are_append_only();

-- ---------------------------------------------------------------------------
-- Helpers for row-level security (security definer avoids policy recursion)
-- ---------------------------------------------------------------------------

create function public.my_participant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.participants where user_id = auth.uid();
$$;

create function public.is_room_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.room_members m
      join public.participants p on p.id = m.participant_id
     where m.room_id = target_room
       and p.user_id = auth.uid()
  );
$$;

create function public.can_post(target_room uuid, sender uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.room_members m
      join public.participants p on p.id = m.participant_id
     where m.room_id = target_room
       and m.participant_id = sender
       and m.role <> 'observer'
       and p.user_id = auth.uid()
  );
$$;

-- True when the participant is me, or shares at least one room with me.
create function public.can_see_participant(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants where id = target and user_id = auth.uid()
  ) or exists (
    select 1
      from public.room_members theirs
      join public.room_members mine on mine.room_id = theirs.room_id
      join public.participants me on me.id = mine.participant_id
     where theirs.participant_id = target
       and me.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.participants enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.events enable row level security;
alter table public.api_keys enable row level security;

create policy "see organizations of people I share a room with"
  on public.organizations for select to authenticated
  using (exists (
    select 1 from public.participants p
     where p.org_id = organizations.id
       and public.can_see_participant(p.id)
  ));

create policy "see myself and people I share a room with"
  on public.participants for select to authenticated
  using (public.can_see_participant(id));

create policy "see rooms I am in"
  on public.rooms for select to authenticated
  using (public.is_room_member(id));

create policy "see members of rooms I am in"
  on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

create policy "read events in rooms I am in"
  on public.events for select to authenticated
  using (public.is_room_member(room_id));

-- People post messages, proposals and decisions as themselves.
-- member_joined / member_left are written by the invite triggers only.
create policy "post as myself in rooms I am in"
  on public.events for insert to authenticated
  with check (
    type in ('message', 'proposal', 'decision')
    and public.can_post(room_id, sender_id)
  );

-- room_invites and api_keys have no policies: only the server can touch them.

revoke update, delete, truncate on public.events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sign-in: every new auth user becomes a human participant, and any pending
-- invites for their email are accepted.
-- ---------------------------------------------------------------------------

create function public.accept_invite(invite public.room_invites, participant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.participants
     set org_id = invite.org_id
   where id = participant and org_id is null and invite.org_id is not null;

  insert into public.room_members (room_id, participant_id, role)
  values (invite.room_id, participant, invite.role)
  on conflict do nothing;

  if found then
    insert into public.events (room_id, sender_id, type, body)
    values (invite.room_id, participant, 'member_joined',
            jsonb_build_object('participant_id', participant, 'role', invite.role));
  end if;

  update public.room_invites set accepted_at = now() where id = invite.id;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_participant uuid;
  invite public.room_invites;
begin
  insert into public.participants (kind, user_id, email, display_name, org_id)
  values (
    'human',
    new.id,
    lower(new.email),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    (select id from public.organizations
      where domain = lower(split_part(new.email, '@', 2)))
  )
  returning id into new_participant;

  for invite in
    select * from public.room_invites
     where email = lower(new.email) and accepted_at is null
  loop
    perform public.accept_invite(invite, new_participant);
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.normalize_invite_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create trigger room_invites_normalize_email
before insert on public.room_invites
for each row execute function public.normalize_invite_email();

create function public.accept_invite_for_existing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select id into existing from public.participants where email = new.email;
  if existing is not null then
    perform public.accept_invite(new, existing);
  end if;
  return null;
end;
$$;

create trigger room_invites_accept_existing
after insert on public.room_invites
for each row execute function public.accept_invite_for_existing_user();

-- ---------------------------------------------------------------------------
-- Realtime: push new events to everyone in the room (RLS still applies).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.events;
