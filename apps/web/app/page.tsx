import Link from "next/link";
import { getMe } from "@/lib/supabase/server";
import { Header } from "@/components/header";

export default async function RoomsPage() {
  const { supabase, me } = await getMe();
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, slug, title, status, last_seq")
    .order("created_at", { ascending: false });

  return (
    <>
      <Header name={me?.display_name} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="mb-4 text-xl font-semibold">Your rooms</h1>
        {!rooms?.length ? (
          <p className="text-sm text-zinc-500">
            You aren&apos;t in any rooms yet. When someone invites your email to a room, it shows up here.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link href={`/rooms/${room.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <span className="font-medium">{room.title}</span>
                  <span className="text-xs text-zinc-500">{room.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
