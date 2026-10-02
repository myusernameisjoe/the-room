import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "./env";

// A Supabase client acting as the signed-in person, so row-level security
// decides what they can read and write.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

// The signed-in person's participant row, or null when signed out.
export async function getMe() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, me: null };

  const { data: me } = await supabase
    .from("participants")
    .select("id, display_name, org_id, organizations(name)")
    .eq("user_id", user.id)
    .single();

  return { supabase, user, me };
}
