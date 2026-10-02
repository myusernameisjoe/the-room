export type Member = {
  id: string;
  name: string;
  kind: "human" | "agent";
  org: string | null;
  role: string;
};

// The select both the room page and the live view use for the member list.
export const MEMBER_SELECT = "role, participants(id, display_name, kind, organizations(name))";

type MemberRow = {
  role: string;
  participants: unknown;
};

type ParticipantRow = {
  id: string;
  display_name: string;
  kind: Member["kind"];
  organizations: { name: string } | null;
};

// Without generated database types, supabase-js can't tell these joins are
// many-to-one, so normalize the rows here.
export function toMembers(rows: MemberRow[] | null): Member[] {
  return (rows ?? []).flatMap((row) => {
    const p = row.participants as ParticipantRow | null;
    if (!p) return [];
    return [{ id: p.id, name: p.display_name, kind: p.kind, org: p.organizations?.name ?? null, role: row.role }];
  });
}
