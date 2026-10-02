# The Room

A neutral shared room where people and agents from two companies resolve an
issue together, instead of over B2B email. v0 runs one demo: recovering late
purchase order PO-991 between Acme (the buyer) and Northwind (the supplier).

This is the first slice of the v0 plan: the database, magic-link sign-in, and
a room where two browsers chat live.

## Layout

```
apps/web/            Next.js app: sign-in, rooms list, live room
  app/api/rooms/[id]/events   GET history after a seq, POST a new event
packages/schema/     Event types and Zod validators shared by everything
supabase/
  migrations/        Tables, per-room seq trigger, row-level security
  seed.sql           Two companies, the buyer agent, rooms PO-991 and PO-1204
```

Every message is a row in one append-only `events` table. A trigger hands out
`seq` 1, 2, 3… per room, so every browser and agent sees the same order.
Row-level security means people only see rooms they belong to, and they can
only post as themselves.

People join rooms through `room_invites`: when an invited email signs in for
the first time (or right away, if they already have an account), they become a
member and a `member_joined` event is written.

## Run it locally

Needs Node 20+ and Docker.

```sh
npm install
npx supabase start          # prints the API URL and publishable key
cp apps/web/.env.example apps/web/.env.local   # paste them in
npm run dev
```

Open http://localhost:3000 in two browsers (or one normal and one private
window). Sign in as `joe@acme.test` in one and `sarah@northwind.test` in the
other. The sign-in emails arrive in Mailpit at http://127.0.0.1:54324. Both of
you land in PO-991 and see each other's messages instantly. Joe also sees
PO-1204, which Sarah can't.

`npx supabase db reset` rebuilds the database from the migrations and seed.

## Run it on a hosted Supabase project

1. Create a project on supabase.com, then link and push the schema:
   ```sh
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
2. Load the demo data by pasting `supabase/seed.sql` into the SQL editor.
3. Invite real emails to PO-991 (the seed's `.test` addresses only work locally):
   ```sql
   insert into room_invites (room_id, email, org_id, role) values
     ('00000000-0000-0000-0000-000000000991', 'you@example.com', '00000000-0000-0000-0000-00000000000a', 'owner'),
     ('00000000-0000-0000-0000-000000000991', 'supplier@example.com', '00000000-0000-0000-0000-00000000000b', 'member');
   ```
   `org_id` `…0a` is Acme and `…0b` is Northwind.
4. Under Authentication > URL Configuration, set the site URL to where the app
   runs and add `<site>/auth/callback` to the redirect URLs.
5. Put the project URL and publishable key in `apps/web/.env.local` (or the
   Vercel project's environment variables).

Supabase's built-in email sender only allows a few sign-in emails per hour.
That's enough for a demo; add your own SMTP under Authentication > Emails if
you hit the limit.

## Not here yet

Following the v0 plan's build order, next come the agent API (API keys, the
`/rooms/:id/stream` SSE feed, the sdk package), proposal cards with Accept and
Counter, signing, and the buyer agent. Slack, Pub/Sub and federation are
parked for after v0.
