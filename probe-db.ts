import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

async function run() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log("Missing Supabase env vars.");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const rpcNames = ["exec_sql", "run_sql", "execute_sql", "exec_query", "query", "sql"];
  
  const ddl = `
    ALTER TABLE crm_conversations DROP CONSTRAINT IF EXISTS crm_conversations_customer_phone_normalized_key CASCADE;
    DROP INDEX IF EXISTS idx_crm_conversations_phone_normalized CASCADE;
  `;

  for (const name of rpcNames) {
    console.log(`Trying RPC: ${name}...`);
    try {
      const { data, error } = await supabase.rpc(name, { sql: ddl, query: ddl, query_text: ddl, stmt: ddl });
      if (error) {
        console.log(`RPC ${name} returned error:`, error.message, error.code);
      } else {
        console.log(`RPC ${name} SUCCEEDED! Data:`, data);
        return;
      }
    } catch (e: any) {
      console.log(`RPC ${name} exception:`, e.message);
    }
  }

  console.log("No common SQL RPCs succeeded.");
}

run();
