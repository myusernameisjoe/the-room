"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomEvent } from "@the-room/schema";
import { createClient } from "@/lib/supabase/client";
import { MEMBER_SELECT, toMembers, type Member } from "@/lib/members";

type Props = {
  room: { id: string; title: string; status: string };
  meId: string;
  initialMembers: Member[];
  initialEvents: RoomEvent[];
};

// Merge events by seq so live pushes, backfills and our own POST replies can
// arrive in any order without duplicates.
function mergeEvents(current: RoomEvent[], incoming: RoomEvent[]) {
  const bySeq = new Map(current.map((e) => [e.seq, e]));
  for (const e of incoming) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function RoomView({ room, meId, initialMembers, initialEvents }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState(initialEvents);
  const [members, setMembers] = useState(initialMembers);
  const [live, setLive] = useState(false);
  const lastSeq = useRef(initialEvents.at(-1)?.seq ?? 0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addEvents = useCallback((incoming: RoomEvent[]) => {
    if (!incoming.length) return;
    setEvents((cur) => mergeEvents(cur, incoming));
    lastSeq.current = Math.max(lastSeq.current, ...incoming.map((e) => e.seq));
  }, []);

  const refreshMembers = useCallback(async () => {
    const { data } = await supabase.from("room_members").select(MEMBER_SELECT).eq("room_id", room.id);
    if (data) setMembers(toMembers(data));
  }, [supabase, room.id]);

  // Fetch anything after the last seq we have, to cover gaps around reconnects.
  const backfill = useCallback(async () => {
    const res = await fetch(`/api/rooms/${room.id}/events?after=${lastSeq.current}`);
    if (res.ok) addEvents((await res.json()).events);
  }, [room.id, addEvents]);

  useEffect(() => {
    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const event = payload.new as RoomEvent;
          addEvents([event]);
          if (event.type === "member_joined" || event.type === "member_left") refreshMembers();
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") backfill();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, room.id, addEvents, backfill, refreshMembers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const names = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-6">
      <section className="flex min-h-[70vh] flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{room.title}</h1>
          <span className={`text-xs ${live ? "text-emerald-600" : "text-zinc-400"}`}>
            {live ? "● live" : "○ connecting"}
          </span>
        </div>

        <ol className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {events.map((e) => (
            <EventRow key={e.seq} event={e} sender={names.get(e.sender_id)} mine={e.sender_id === meId} />
          ))}
          <div ref={bottomRef} />
        </ol>

        <Composer roomId={room.id} onSent={(e) => addEvents([e])} />
      </section>

      <aside className="hidden w-56 shrink-0 md:block">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">In this room</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {members.map((m) => (
            <li key={m.id}>
              <div className="font-medium">
                {m.name}
                {m.kind === "agent" && <span className="ml-1 rounded bg-zinc-100 px-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">agent</span>}
              </div>
              <div className="text-xs text-zinc-500">{m.org ?? "No company yet"}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function EventRow({ event, sender, mine }: { event: RoomEvent; sender?: Member; mine: boolean }) {
  const who = sender ? sender.name : "Someone";

  if (event.type === "member_joined" || event.type === "member_left") {
    return (
      <li className="text-center text-xs text-zinc-500">
        {who} {event.type === "member_joined" ? "joined" : "left"} the room
      </li>
    );
  }

  const text =
    event.type === "message"
      ? String(event.body.text ?? "")
      : `[${event.type}] ${JSON.stringify(event.body)}`;

  return (
    <li className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className="mb-0.5 text-xs text-zinc-500">
        {who}
        {sender?.org && <span> · {sender.org}</span>}
        <span> · #{event.seq}</span>
      </div>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
          mine ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"
        }`}
      >
        {text}
      </div>
    </li>
  );
}

function Composer({ roomId, onSent }: { roomId: string; onSent: (e: RoomEvent) => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    const res = await fetch(`/api/rooms/${roomId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "message", body: { text: trimmed } }),
    });
    setSending(false);
    if (res.ok) {
      onSent((await res.json()).event);
      setText("");
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't send that message.");
    }
  }

  return (
    <form
      className="mt-4 flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="flex gap-2">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Write a message"
          className="flex-1 resize-none rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-md bg-zinc-900 px-4 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
