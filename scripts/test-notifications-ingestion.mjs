import { createClient } from "@supabase/supabase-js";

async function loadEnvFile() {
  // Minimal .env parser (matches how other repo scripts do it)
  // Note: assumes simple KEY=VALUE lines.
  const fs = await import("node:fs");
  const path = await import("node:path");

  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const valueRaw = trimmed.slice(eqIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = valueRaw;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

await loadEnvFile();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exitCode = 1;
}

function randomAlpha(len = 6) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const runTag = randomAlpha(8);
const payload = {
  app_package: "com.wealthpulse.android",
  title: "INR 500 received",
  body: `UPI payment from Rahul ${runTag}`,
  received_at: "2026-03-20T12:00:00.000Z",
  device_id: "test-device-01",
};

async function main() {
  const accessToken = process.env.TEST_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("Missing TEST_ACCESS_TOKEN in environment.");
    process.exitCode = 1;
    return;
  }

  console.log("Using TEST_ACCESS_TOKEN from environment.");

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const endpoint = `${supabaseUrl}/functions/v1/notifications`;

  async function postOnce(label) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    console.log(`${label} status:`, res.status);
    console.log(`${label} response:`, json);
    return json;
  }

  await postOnce("First request");
  await postOnce("Second request");

  // Verify DB state via RLS with authenticated client
  const { data: rows, error: rowsErr } = await supabase
    .from("raw_events")
    .select("id, user_id, title, body, received_at, ingested_at, processed, app_package, source_type, event_type, dedup_key, device_id, ingestion_status, raw_payload")
    .eq("title", payload.title)
    .eq("body", payload.body)
    .eq("received_at", payload.received_at);

  if (rowsErr) {
    console.error("DB query error:", rowsErr.message);
    process.exitCode = 1;
    return;
  }

  console.log("DB raw_events rows matching payload:", rows?.length ?? 0);
  console.log(rows);
}

if (supabaseUrl && anonKey) {
  main().catch((e) => {
    console.error("Test script failed:", e);
    process.exitCode = 1;
  });
}
