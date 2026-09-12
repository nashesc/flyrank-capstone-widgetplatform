import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let ownerSupabaseClient: SupabaseClient | null = null;

export function getOwnerSupabaseClient(): SupabaseClient {
  if (!ownerSupabaseClient) {
    ownerSupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    );
  }
  return ownerSupabaseClient;
}
