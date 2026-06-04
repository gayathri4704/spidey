/**
 * supabaseClient.js
 * ─────────────────────────────────────────────
 * Initialises and exports the Supabase JS client singleton.
 * Import { supabase } wherever you need DB / Auth / Storage access.
 * ─────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Spidey] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
