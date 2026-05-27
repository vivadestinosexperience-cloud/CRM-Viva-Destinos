import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config();

console.log("Environment keys:", Object.keys(process.env));

const url = process.env.VITE_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";


const supabase = createClient(url, serviceKey);

async function test_tables() {
  const tables = ["crm_conversations", "whatsapp_message_templates", "platform_notifications", "crm_customers", "crm_messages"];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      console.log(`Table ${t}: Error ->`, error.message, "code:", error.code);
    } else {
      console.log(`Table ${t}: Success (exists!)`);
    }
  }
}

test_tables();
