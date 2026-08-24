import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// Anon key only - this respects Row Level Security. It can never do anything
// the public-read policies (see supabase/002-public-read-policies.sql) don't
// explicitly allow. The automation's service role key never goes anywhere
// near this frontend.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
