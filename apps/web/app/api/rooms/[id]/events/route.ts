import { NextResponse, type NextRequest } from "next/server";
import { NewEvent } from "@the-room/schema";
import { getMe } from "@/lib/supabase/server";

const EVENT_COLUMNS = "id, room_id, seq, sender_id, type, body, parent_id, signature, created_at";

// GET /api/rooms/:id/events?after=<seq>&limit=<n>: history in seq order.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rooms/[id]/events">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getMe();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const after = Number(request.nextUrl.searchParams.get("after") ?? 0) || 0;
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 200) || 200, 500);

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("room_id", id)
    .gt("seq", after)
    .order("seq")
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ events: data });
}

// POST /api/rooms/:id/events: append one event as the signed-in person.
// Row-level security rejects rooms they are not in.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[id]/events">) {
  const { id } = await ctx.params;
  const { supabase, user, me } = await getMe();
  if (!user || !me) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const parsed = NewEvent.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid event", issues: parsed.error.issues }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("events")
    .insert({ room_id: id, sender_id: me.id, ...parsed.data })
    .select(EVENT_COLUMNS)
    .single();

  if (error) {
    const status = error.code === "42501" ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ event: data }, { status: 201 });
}
