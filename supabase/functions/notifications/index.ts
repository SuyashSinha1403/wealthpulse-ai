import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-idempotency-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NotificationInsertRequest = {
  app_package?: string;
  title?: string;
  body?: string;
  received_at?: string; // ISO-8601 recommended
  device_id?: string;
};

type IngestionResponse = {
  success: boolean;
  deduped: boolean;
  event_id: string | null;
  error?: string;
};

function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function normalizeText(input: string, stripDynamicNumbers = true) {
  let normalized = input.toLowerCase();
  normalized = normalized
    .replace(/\u20b9/g, " rs ")
    .replace(/\binr\b/g, " rs ")
    .replace(/\binr(?=\d)/g, " rs ")
    .replace(/\brs\.(?=\s|$)/g, "rs")
    .replace(/\brs\.(?=\d)/g, "rs ")
    .replace(/[.,;:!?()[\]{}"'`~|\\/<>+=_-]+/g, " ")
    .replace(/\brs(?=\d)/g, "rs ")
    .trim()
    .replace(/\s+/g, " ");
  if (stripDynamicNumbers) {
    normalized = normalized
      .replace(/\b(otp|code|pin|password)\b\s*[:\-]?\s*\d{4,8}\b/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return normalized;
}

function normalizeForDedup(input: string) {
  return normalizeText(input, false);
}

function normalizeForParsing(input: string) {
  return normalizeText(input, true);
}

function validateAppPackage(value: string) {
  // Accept Android-like package IDs and similar dotted source identifiers.
  return /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(value);
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function badRequest(error: string) {
  const body: IngestionResponse = { success: false, deduped: false, event_id: null, error };
  return jsonResponse(body, { status: 400 });
}

type RateLimitCacheEntry = {
  bucket: number;
  baseCount: number;
  localInserted: number;
};

const rateLimitCache = new Map<string, RateLimitCacheEntry>();
const userRecentEventTimestamps = new Map<string, number[]>();
const userDuplicateTimestamps = new Map<string, number[]>();
const userFailureStreak = new Map<string, number>();

function pushTimestamp(map: Map<string, number[]>, userId: string, nowMs: number, windowMs: number) {
  const existing = map.get(userId) ?? [];
  existing.push(nowMs);
  const cutoff = nowMs - windowMs;
  const pruned = existing.filter((ts) => ts >= cutoff);
  map.set(userId, pruned);
  return pruned.length;
}

function recordFailure(userId: string, reason: string) {
  const next = (userFailureStreak.get(userId) ?? 0) + 1;
  userFailureStreak.set(userId, next);
  if (next > 5) {
    console.log(JSON.stringify({
      event: "notification_ingest_failure_spike",
      user_id: userId,
      consecutive_failures: next,
      reason,
    }));
  }
}

function recordSuccess(userId: string) {
  userFailureStreak.set(userId, 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, deduped: false, event_id: null, error: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return jsonResponse(
        {
          success: false,
          deduped: false,
          event_id: null,
          error: "Server misconfiguration: Supabase env vars missing",
        },
        { status: 500 },
      );
    }

    let payloadRaw: unknown;
    let payload: Partial<NotificationInsertRequest> = {};
    try {
      payloadRaw = await req.json();
      if (!payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) {
        return badRequest("JSON body must be an object");
      }
      payload = payloadRaw as Partial<NotificationInsertRequest>;
    } catch {
      return badRequest("Invalid JSON body");
    }

    // -------------------------
    // Validation
    // -------------------------
    const appPackage = typeof payload.app_package === "string" ? payload.app_package.trim() : "";
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const bodyText = typeof payload.body === "string" ? payload.body.trim() : "";
    const receivedAtRaw = typeof payload.received_at === "string" ? payload.received_at.trim() : "";
    const deviceId = typeof payload.device_id === "string" ? payload.device_id.trim() : null;

    if (!appPackage) return badRequest("app_package is required");
    if (!validateAppPackage(appPackage)) return badRequest("app_package format is invalid");
    if (!title) return badRequest("title must not be empty");
    if (!bodyText) return badRequest("body must not be empty");
    if (!receivedAtRaw) return badRequest("received_at is required");
    if (deviceId !== null && deviceId.length === 0) return badRequest("device_id must not be empty");
    if (deviceId !== null && deviceId.length > 128) return badRequest("device_id is too long");

    const receivedAt = new Date(receivedAtRaw);
    if (Number.isNaN(receivedAt.getTime())) {
      return badRequest("received_at must be a valid timestamp");
    }

    // Normalize to UTC ISO with milliseconds for stable deduplication/index matching.
    const receivedAtUtcIso = receivedAt.toISOString();

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      console.log(JSON.stringify({ event: "notification_ingest_unauthorized", reason: userErr?.message ?? "missing_user" }));
      return jsonResponse(
        { success: false, deduped: false, event_id: null, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const normalizedBody = normalizeForDedup(bodyText);
    const parsingBody = normalizeForParsing(bodyText);
    const idempotencyKeyRaw = req.headers.get("X-Idempotency-Key")?.trim() ?? "";
    if (idempotencyKeyRaw.length > 512) return badRequest("X-Idempotency-Key is too long");
    const dedupKey = idempotencyKeyRaw
      ? await sha256Hex(`${user.id}|idempotency|${idempotencyKeyRaw}`)
      : await sha256Hex(`${user.id}${normalizedBody}`);
    const ingestedAtIso = new Date().toISOString();
    const dedupWindowMsRaw = Number(Deno.env.get("NOTIFICATIONS_DEDUP_WINDOW_MS") ?? "120000");
    const dedupWindowMs = Number.isFinite(dedupWindowMsRaw) && dedupWindowMsRaw > 0
      ? Math.floor(dedupWindowMsRaw)
      : 120_000;
    const nowMs = Date.now();

    const perMinuteLimitRaw = Number(Deno.env.get("NOTIFICATIONS_RATE_LIMIT_PER_MINUTE") ?? "60");
    const perMinuteLimit = Number.isFinite(perMinuteLimitRaw) && perMinuteLimitRaw > 0
      ? Math.floor(perMinuteLimitRaw)
      : 60;
    const user10sCount = pushTimestamp(userRecentEventTimestamps, user.id, nowMs, 10_000);
    if (user10sCount > 20) {
      console.log(JSON.stringify({
        event: "notification_ingest_high_velocity",
        user_id: user.id,
        events_in_last_10s: user10sCount,
      }));
    }

    const minuteBucket = Math.floor(nowMs / 60_000);
    let cacheEntry = rateLimitCache.get(user.id);
    if (!cacheEntry || cacheEntry.bucket !== minuteBucket) {
      const bucketStartIso = new Date(minuteBucket * 60_000).toISOString();
      const bucketEndIso = new Date((minuteBucket + 1) * 60_000).toISOString();
      const { count: dbCount, error: rateLimitErr } = await supabase
        .from("raw_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("ingested_at", bucketStartIso)
        .lt("ingested_at", bucketEndIso);

      if (rateLimitErr) {
        console.error("notifications rate-limit check error:", rateLimitErr);
        recordFailure(user.id, "rate_limit_check_failed");
        return jsonResponse(
          { success: false, deduped: false, event_id: null, error: "Failed to validate rate limit" },
          { status: 500 },
        );
      }

      cacheEntry = { bucket: minuteBucket, baseCount: dbCount ?? 0, localInserted: 0 };
      rateLimitCache.set(user.id, cacheEntry);
    }

    const estimatedCount = cacheEntry.baseCount + cacheEntry.localInserted;
    if (estimatedCount >= perMinuteLimit) {
      console.log(JSON.stringify({
        event: "notification_ingest_rate_limited",
        user_id: user.id,
        recent_count: estimatedCount,
        per_minute_limit: perMinuteLimit,
      }));
      return jsonResponse(
        { success: false, deduped: false, event_id: null, error: "Rate limit exceeded" },
        { status: 429 },
      );
    }

    const { data: ingestResult, error: ingestErr } = await supabase.rpc(
      "ingest_raw_event_windowed",
      {
        p_user_id: user.id,
        p_app_package: appPackage,
        p_title: title,
        p_body: bodyText,
        p_received_at: receivedAtUtcIso,
        p_source_type: "notification",
        p_dedup_key: dedupKey,
        p_device_id: deviceId,
        p_ingestion_status: "pending",
        p_event_type: "unknown",
        p_raw_payload: payloadRaw,
        p_ingested_at: ingestedAtIso,
        p_error_message: null,
        p_dedup_window_ms: dedupWindowMs,
      },
    );

    if (ingestErr) {
      console.error("notifications ingest rpc error:", ingestErr);
      recordFailure(user.id, ingestErr.code ?? "ingest_rpc_failed");
      return jsonResponse(
        { success: false, deduped: false, event_id: null, error: "Failed to insert event" },
        { status: 500 },
      );
    }

    const row = Array.isArray(ingestResult) ? ingestResult[0] : null;
    const eventId = row?.event_id ?? null;
    const isDeduped = Boolean(row?.deduped);
    if (!eventId) {
      recordFailure(user.id, "ingest_rpc_empty_result");
      return jsonResponse(
        { success: false, deduped: false, event_id: null, error: "Failed to insert event" },
        { status: 500 },
      );
    }

    if (isDeduped) {
      console.log(JSON.stringify({
        event: "notification_ingest_duplicate",
        user_id: user.id,
        dedup_key: dedupKey,
        normalized_body: normalizedBody,
        parsing_body: parsingBody,
        window_ms: dedupWindowMs,
        event_id: eventId,
      }));
      const dupCount = pushTimestamp(userDuplicateTimestamps, user.id, nowMs, 60_000);
      if (dupCount > 10) {
        console.log(JSON.stringify({
          event: "notification_ingest_duplicate_spike",
          user_id: user.id,
          duplicates_in_last_60s: dupCount,
        }));
      }
      recordSuccess(user.id);
      return jsonResponse({
        success: true,
        deduped: true,
        event_id: eventId,
      });
    }

    if (cacheEntry) {
      cacheEntry.localInserted += 1;
    }
    recordSuccess(user.id);

    console.log(JSON.stringify({
      event: "notification_ingest_success",
      user_id: user.id,
      event_id: eventId,
      normalized_body: normalizedBody,
      parsing_body: parsingBody,
      deduped: false,
    }));

    return jsonResponse({
      success: true,
      deduped: false,
      event_id: eventId,
    });
  } catch (e) {
    console.error("notifications handler error:", e);
    return jsonResponse(
      {
        success: false,
        deduped: false,
        event_id: null,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});

