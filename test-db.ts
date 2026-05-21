import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

async function check() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase.from("crm_channels").select("*").limit(1);
  console.log("crm_channels query result:", { data, error: error ? error.message : null });
}

check();
