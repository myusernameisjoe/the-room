import { notFound } from "next/navigation";
import type { RoomEvent } from "@the-room/schema";
import { getMe } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { RoomView } from "@/components/room-view";
import { MEMBER_SELECT, toMembers } from "@/lib/members";

export default async function RoomPage(props: PageProps<"/rooms/[id]">) {
  const { id } = await props.params;
  const { supabase, me } = await getMe();
  if (!me) notFound();

  // Row-level security returns nothing for rooms this person isn't in.
  const { data: room } = await supabase.from("rooms").select("id, title, status").eq("id", id).maybeSingle();
  if (!room) notFound();

  const [{ data: members }, { data: events }] = await Promise.all([
    supabase.from("room_members").select(MEMBER_SELECT).eq("room_id", id),
    supabase
      .from("events")
      .select("id, room_id, seq, sender_id, type, body, parent_id, signature, created_at")
      .eq("room_id", id)
      .order("seq", { ascending: false })
      .limit(200),
  ]);

  return (
    <>
      <Header name={me.display_name} />
      <RoomView
        room={room}
        meId={me.id}
        initialMembers={toMembers(members)}
        initialEvents={((events ?? []) as RoomEvent[]).reverse()}
      />
    </>
  );
}
