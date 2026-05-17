import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tjehnzijznuyjpilmain.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ai_kCETEPe3ktuQTFrfFsw_NSFIqJ6h';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.warn('Supabase credentials missing in environment. Using default fallback keys.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
