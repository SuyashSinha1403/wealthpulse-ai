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

function getArg(argv, name) {
  const equalsArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) {
    return equalsArg.split("=")[1] || null;
  }

  const flagIndex = argv.indexOf(name);
  if (flagIndex !== -1) {
    return argv[flagIndex + 1] || null;
  }

  return null;
}

loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authUserId = getArg(process.argv.slice(2), "--user");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!authUserId) {
  console.error('Missing required user id. Usage: node scripts/debug-user-data.mjs --user "<AUTH_USER_UUID>"');
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

async function getCountForUser(table, userId) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function getDistinctUserIds(table) {
  const pageSize = 1000;
  let from = 0;
  const ids = new Set();

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select("user_id")
      .not("user_id", "is", null)
      .range(from, to);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.user_id) ids.add(row.user_id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

const counts = {};
let totalRowsForAuthUser = 0;

for (const table of tables) {
  const count = await getCountForUser(table, authUserId);
  counts[table] = count;
  totalRowsForAuthUser += count;
}

const otherUserIds = new Set();
for (const table of tables) {
  const tableUserIds = await getDistinctUserIds(table);
  for (const userId of tableUserIds) {
    if (userId !== authUserId) {
      otherUserIds.add(userId);
    }
  }
}

let seededUserId = authUserId;
let status = "OK — UI should display data.";

if (totalRowsForAuthUser === 0 && otherUserIds.size > 0) {
  seededUserId = Array.from(otherUserIds)[0];
  status = "USER MISMATCH — demo data cannot appear in UI";
} else if (totalRowsForAuthUser === 0) {
  seededUserId = "NO SEEDED DATA FOUND";
  status = "NO DATA FOUND FOR THIS USER";
}

console.log(`Auth User UUID: ${authUserId}`);
console.log(`Seeded User UUID: ${seededUserId}`);
console.log(`Supabase Project URL: ${SUPABASE_URL}`);
console.log(`process.env.VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ?? ""}`);
console.log("");

for (const table of tables) {
  console.log(`${table}: ${counts[table]}`);
  if (counts[table] === 0) {
    console.log(`WARNING: No rows found in ${table} for this user.`);
  }
}

if (status === "USER MISMATCH — demo data cannot appear in UI") {
  console.log("");
  console.log("USER MISMATCH — demo data cannot appear in UI");
  console.log(`Other user IDs with data detected: ${Array.from(otherUserIds).join(", ")}`);
}

console.log("");
console.log(`STATUS: ${status}`);
