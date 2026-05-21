import dotenv from "dotenv";
dotenv.config();

async function run() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  if (!url) {
    console.error("No supabase URL found");
    return;
  }
  
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      }
    });
    const schema = await res.json();
    console.log("Database tables:", Object.keys(schema.definitions || {}));
  } catch (error) {
    console.error("Error fetching schema:", error);
  }
}

run();
