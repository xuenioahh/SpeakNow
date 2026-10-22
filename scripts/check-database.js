import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server .env; never use VITE_ for a server key.");
  process.exit(1);
}
if (/^(true|1|yes)$/i.test(process.env.FORCE_LOCAL_DATA || "")) {
  console.error("FORCE_LOCAL_DATA is enabled: the app is currently using local JSON.");
  process.exit(1);
}
let failed = false;
for (const table of ["app_users", "app_voice_sessions", "app_presentation_sessions", "app_activity_records", "app_settings"]) {
  const columns = table === "app_users" ? "id,profile_preferences" : table === "app_settings" ? "key" : "id";
  try {
    const response = await fetch(new URL(`/rest/v1/${table}?select=${columns}&limit=0`, url), {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
    });
    console.log(`${table}: ${response.ok ? "reachable" : `HTTP ${response.status}; check schema, migration and credentials`}`);
    if (!response.ok) failed = true;
  } catch {
    console.error(`${table}: connection failed or timed out`);
    failed = true;
  }
}
console.log("Read-only schema check; no user records were read or changed. Writes and access policies need separate verification.");
process.exitCode = failed ? 1 : 0;
