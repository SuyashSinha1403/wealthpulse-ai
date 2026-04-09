const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache per warm instance
const cache = new Map<string, { rate: number; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchFxRate(from: string, to: string, date?: string): Promise<number> {
  if (from === to) return 1;
  const ticker = `${from}${to}=X`;

  // If a historical date is requested, widen range to handle weekends/holidays
  if (date) {
    const d = new Date(date + "T00:00:00Z");
    const period1 = Math.floor(d.getTime() / 1000) - (5 * 86400); // 5 days before
    const period2 = Math.floor(d.getTime() / 1000) + (2 * 86400); // 2 days after
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`Yahoo Finance FX returned ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`No FX data for ${from}/${to} on ${date}`);
    
    // Find the closest date <= requested date
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const targetTs = Math.floor(d.getTime() / 1000);
    let bestRate = 0;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i] <= targetTs + 86400 && closes[i] != null) {
        bestRate = Number(closes[i]);
        break;
      }
    }
    if (bestRate > 0) return bestRate;
    
    // Fallback: use last available close in the range
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) return Number(closes[i]);
    }
    
    // Final fallback to meta
    const rate = result.meta?.regularMarketPrice ?? result.meta?.previousClose ?? 0;
    return Number(rate);
  }

  // Current rate
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance FX returned ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No FX data for ${from}/${to}`);
  const rate = result.meta?.regularMarketPrice ?? result.meta?.previousClose ?? 0;
  return Number(rate);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from")?.toUpperCase();
    const to = url.searchParams.get("to")?.toUpperCase();
    const date = url.searchParams.get("date") || undefined; // YYYY-MM-DD
    // Also support batch: ?pairs=USD-INR,EUR-INR
    const pairs = url.searchParams.get("pairs");

    const pairList: { from: string; to: string }[] = [];

    if (pairs) {
      pairs.split(",").forEach((p) => {
        const [f, t] = p.trim().split("-");
        if (f && t) pairList.push({ from: f.toUpperCase(), to: t.toUpperCase() });
      });
    } else if (from && to) {
      pairList.push({ from, to });
    }

    if (pairList.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide ?from=&to= or ?pairs=USD-INR,EUR-INR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, { from: string; to: string; rate: number; timestamp: string; error?: string }> = {};

    await Promise.all(
      pairList.map(async ({ from: f, to: t }) => {
        const key = date ? `${f}-${t}-${date}` : `${f}-${t}`;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          results[`${f}-${t}`] = { from: f, to: t, rate: cached.rate, timestamp: new Date(cached.ts).toISOString() };
          return;
        }
        try {
          const rate = await fetchFxRate(f, t, date);
          cache.set(key, { rate, ts: Date.now() });
          results[`${f}-${t}`] = { from: f, to: t, rate, timestamp: new Date().toISOString() };
        } catch (e) {
          results[`${f}-${t}`] = { from: f, to: t, rate: 0, timestamp: new Date().toISOString(), error: (e as Error).message };
        }
      })
    );

    return new Response(JSON.stringify({ data: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
