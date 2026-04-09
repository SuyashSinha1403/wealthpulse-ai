import { corsHeaders, createAuthedClient, jsonResponse } from "../_shared/financial.ts";

const quoteCache = new Map<string, { price: number; ts: number }>();
const QUOTE_TTL_MS = 5 * 60 * 1000;

async function fetchYahooQuote(ticker: string): Promise<number | null> {
  const now = Date.now();
  const cached = quoteCache.get(ticker);
  if (cached && now - cached.ts < QUOTE_TTL_MS) return cached.price;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice ?? result?.meta?.previousClose ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;
  quoteCache.set(ticker, { price, ts: now });
  return price;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const { supabase, user, errorResponse } = await createAuthedClient(req);
    if (errorResponse || !supabase || !user) return errorResponse!;

    const { data, error } = await supabase
      .from("investments")
      .select("asset_class, ticker_symbol, quantity, invested_value, current_value, base_currency_value")
      .eq("user_id", user.id);

    if (error) return jsonResponse({ error: error.message }, { status: 500 });

    let totalInvested = 0;
    let currentValue = 0;
    const breakdownMap: Record<string, number> = {};

    for (const item of data ?? []) {
      const invested = Number((item as any).invested_value ?? 0);
      totalInvested += invested;

      const assetClass = String((item as any).asset_class ?? "Unknown");
      const ticker = (item as any).ticker_symbol as string | null;
      const quantity = Number((item as any).quantity ?? 0);
      const dbCurrent = Number((item as any).base_currency_value ?? (item as any).current_value ?? 0);

      let value = dbCurrent;
      if (ticker && quantity > 0) {
        const quote = await fetchYahooQuote(ticker);
        if (quote && Number.isFinite(quote)) {
          value = quote * quantity;
        }
      }

      currentValue += value;
      breakdownMap[assetClass] = (breakdownMap[assetClass] ?? 0) + value;
    }

    const returnsValue = currentValue - totalInvested;
    const portfolioBreakdown = Object.entries(breakdownMap).map(([asset_class, value]) => ({
      asset_class,
      value,
      weight_pct: currentValue > 0 ? Number(((value / currentValue) * 100).toFixed(2)) : 0,
    }));

    return jsonResponse({
      total_invested: totalInvested,
      current_value: currentValue,
      returns: returnsValue,
      portfolio_breakdown: portfolioBreakdown,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});

