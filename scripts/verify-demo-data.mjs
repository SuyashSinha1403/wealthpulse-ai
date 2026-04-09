import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function getUserArg(argv) {
  const equalsArg = argv.find((arg) => arg.startsWith("--user="));
  if (equalsArg) {
    return equalsArg.split("=")[1] || null;
  }

  const userFlagIndex = argv.indexOf("--user");
  if (userFlagIndex !== -1) {
    return argv[userFlagIndex + 1] || null;
  }

  return null;
}

loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = getUserArg(process.argv.slice(2));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!userId) {
  console.error('Missing required user id. Usage: node scripts/verify-demo-data.mjs --user "<AUTH_USER_UUID>"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "profiles",
  "bank_accounts",
  "bank_transactions",
  "investments",
  "investment_transactions",
  "income_entries",
  "expenses",
  "liabilities",
];

async function getCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

console.log(`User: ${userId}`);
console.log("");

for (const table of tables) {
  const count = await getCount(table);
  console.log(`${table}: ${count}`);

  if (count === 0) {
    console.log(`WARNING: No rows found in ${table} for this user.`);
  }
}
