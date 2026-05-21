import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

async function check() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  const r1 = await supabase.from("audio_debug_logs").select("*").limit(1);
  console.log("audio_debug_logs query result:", { data: r1.data, error: r1.error ? r1.error.message : null });

  const r2 = await supabase.from("media_debug_logs").select("*").limit(1);
  console.log("media_debug_logs query result:", { data: r2.data, error: r2.error ? r2.error.message : null });
}

check();
