import { z } from "zod";

// The canonical shape of everything that happens in a room. The web app, the
// agent API and (later) the sdk all validate against these.

export const EVENT_TYPES = [
  "message",
  "proposal",
  "decision",
  "member_joined",
  "member_left",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const MessageBody = z.object({
  text: z.string().trim().min(1).max(8000),
});

export const ProposalLine = z.object({
  qty: z.number().int().positive(),
  date: z.iso.date(),
});

export const ProposalBody = z.object({
  summary: z.string().trim().min(1).max(500),
  lines: z.array(ProposalLine).min(1),
  extra_cost_usd: z.number().nonnegative().optional(),
  actions: z.array(z.enum(["accept", "counter", "explain"])).default(["accept", "counter"]),
});

export const DecisionBody = z.object({
  decision: z.enum(["accept", "reject", "counter"]),
  note: z.string().max(2000).optional(),
  counter: ProposalBody.partial().optional(),
});

export const MemberBody = z.object({
  participant_id: z.guid(),
  role: z.enum(["owner", "member", "observer"]).optional(),
});

// What a client may send. member_joined / member_left are written by the
// server when invites are accepted, so they are not accepted here.
export const NewEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), body: MessageBody, parent_id: z.guid().optional() }),
  z.object({ type: z.literal("proposal"), body: ProposalBody, parent_id: z.guid().optional() }),
  z.object({ type: z.literal("decision"), body: DecisionBody, parent_id: z.guid() }),
]);
export type NewEvent = z.infer<typeof NewEvent>;

// A row from the events table, as clients receive it.
export type RoomEvent = {
  id: string;
  room_id: string;
  seq: number;
  sender_id: string;
  type: EventType;
  body: Record<string, unknown>;
  parent_id: string | null;
  signature: string | null;
  created_at: string;
};
