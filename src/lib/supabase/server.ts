import { createClient } from "@supabase/supabase-js";

// Server client — uses the service role key to bypass RLS for writes
// Only use in API routes and server-side code, never expose to the client

let serverClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseServerClient() {
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  serverClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}
