const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_SECTORS = new Set([
  "Technology",
  "Financial Services",
  "Healthcare",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Industrials",
  "Basic Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
]);

const cache = new Map<string, { price: number; previousClose: number; currency: string; name: string; sector: string; industry: string; country: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function normalizeSector(sector: string): string {
  const raw = (sector || "").trim();
  if (!raw) return "Unclassified";

  const map: Record<string, string> = {
    "Financials": "Financial Services",
    "Financial Services": "Financial Services",
    "Consumer Discretionary": "Consumer Cyclical",
    "Consumer Cyclical": "Consumer Cyclical",
    "Consumer Staples": "Consumer Defensive",
    "Consumer Defensive": "Consumer Defensive",
    "Materials": "Basic Materials",
    "Basic Materials": "Basic Materials",
    "Information Technology": "Technology",
    "IT Services": "Technology",
  };

  const normalized = map[raw] || raw;
  return ALLOWED_SECTORS.has(normalized) ? normalized : "Unclassified";
}

async function fetchYahooPrice(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No data for ticker");
  const price = result.meta?.regularMarketPrice ?? result.meta?.previousClose ?? 0;
  const previousClose = result.meta?.previousClose ?? result.meta?.chartPreviousClose ?? Number(price);
  const currency = result.meta?.currency ?? "USD";
  const name = result.meta?.shortName ?? result.meta?.longName ?? ticker;
  return { price: Number(price), previousClose: Number(previousClose), currency, name };
}

async function fetchYahooMetadata(ticker: string): Promise<{ sector: string; industry: string; country: string }> {
  const fallback = { sector: "", industry: "", country: "" };
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // Clean ticker for profile lookups (remove .NS/.BO suffix)
  const cleanTicker = ticker.replace(/\.(NS|BO)$/, "");

  // Try v10 quoteSummary (assetProfile) with both query1 and query2
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile`;
      const res = await fetch(url, { headers: { "User-Agent": ua } });
      if (res.ok) {
        const json = await res.json();
        const profile = json?.quoteSummary?.result?.[0]?.assetProfile;
        if (profile?.sector) {
          return {
            sector: profile.sector,
            industry: profile.industry || "",
            country: profile.country || "",
          };
        }
      }
    } catch { /* continue */ }
  }

  // Try v11 quoteSummary
  try {
    const url = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile`;
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (res.ok) {
      const json = await res.json();
      const profile = json?.quoteSummary?.result?.[0]?.assetProfile;
      if (profile?.sector) {
        return { sector: profile.sector, industry: profile.industry || "", country: profile.country || "" };
      }
    }
  } catch { /* continue */ }

  // Try scraping Yahoo Finance quote page for sector info
  try {
    const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/profile/`;
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (res.ok) {
      const html = await res.text();
      const sectorMatch = html.match(/"sector"\s*:\s*"([^"]+)"/);
      const industryMatch = html.match(/"industry"\s*:\s*"([^"]+)"/);
      const countryMatch = html.match(/"country"\s*:\s*"([^"]+)"/);
      if (sectorMatch?.[1]) {
        return {
          sector: sectorMatch[1],
          industry: industryMatch?.[1] || "",
          country: countryMatch?.[1] || "",
        };
      }
    }
  } catch { /* continue */ }

  // Try v7 finance/quote which sometimes includes sector
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (res.ok) {
      const json = await res.json();
      const quote = json?.quoteResponse?.result?.[0];
      if (quote?.sector) {
        return { sector: quote.sector, industry: quote.industry || "", country: "" };
      }
    }
  } catch { /* continue */ }

  // Fallback: infer sector from exchange/ticker patterns for common cases
  const sectorMap: Record<string, string> = {
    AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", GOOG: "Technology", AMZN: "Consumer Discretionary",
    META: "Technology", NVDA: "Technology", TSLA: "Consumer Discretionary", NFLX: "Communication Services",
    JPM: "Financials", BAC: "Financials", GS: "Financials", V: "Financials", MA: "Financials",
    JNJ: "Healthcare", UNH: "Healthcare", PFE: "Healthcare", ABBV: "Healthcare", MRK: "Healthcare",
    XOM: "Energy", CVX: "Energy", COP: "Energy",
    PG: "Consumer Staples", KO: "Consumer Staples", PEP: "Consumer Staples", WMT: "Consumer Staples",
    DIS: "Communication Services", CMCSA: "Communication Services",
    CAT: "Industrials", BA: "Industrials", HON: "Industrials", UPS: "Industrials", GE: "Industrials",
    NEE: "Utilities", DUK: "Utilities", SO: "Utilities",
    TCS: "Technology", INFY: "Technology", WIPRO: "Technology", HCLTECH: "Technology", TECHM: "Technology", LTI: "Technology",
    RELIANCE: "Energy", ONGC: "Energy", BPCL: "Energy", IOC: "Energy",
    HDFCBANK: "Financials", ICICIBANK: "Financials", KOTAKBANK: "Financials", SBIN: "Financials", AXISBANK: "Financials", BAJFINANCE: "Financials",
    SUNPHARMA: "Healthcare", DRREDDY: "Healthcare", CIPLA: "Healthcare", DIVISLAB: "Healthcare",
    HINDUNILVR: "Consumer Staples", ITC: "Consumer Staples", NESTLEIND: "Consumer Staples", BRITANNIA: "Consumer Staples",
    TATAMOTORS: "Consumer Discretionary", MARUTI: "Consumer Discretionary", M_M: "Consumer Discretionary",
    LT: "Industrials", ADANIENT: "Industrials", ADANIPORTS: "Industrials",
    TATASTEEL: "Materials", JSWSTEEL: "Materials", HINDALCO: "Materials",
    BHARTIARTL: "Communication Services",
    POWERGRID: "Utilities", NTPC: "Utilities", TATAPOWER: "Utilities",
    TITAN: "Consumer Discretionary", ASIANPAINT: "Materials",
  };

  if (sectorMap[cleanTicker]) {
    return { sector: sectorMap[cleanTicker], industry: "", country: ticker.endsWith(".NS") || ticker.endsWith(".BO") ? "India" : "United States" };
  }

  return fallback;
}

async function classifySectorWithGroq(companyName: string): Promise<string> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return "Unclassified";

  const prompt = `You are a financial classification system. Classify the following company into ONE of these sectors:\n\nTechnology\n\nFinancial Services\n\nHealthcare\n\nConsumer Cyclical\n\nConsumer Defensive\n\nEnergy\n\nIndustrials\n\nBasic Materials\n\nReal Estate\n\nUtilities\n\nCommunication Services\n\nReturn ONLY the sector name.\n\nCompany: ${companyName}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 24,
    }),
  });

  if (!response.ok) return "Unclassified";

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return "Unclassified";

  const candidate = content.trim().split("\n")[0].trim();
  return ALLOWED_SECTORS.has(candidate) ? candidate : "Unclassified";
}

async function fetchYahooHistory(ticker: string, period1: number, period2: number, interval: string = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=${interval}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No chart data");
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const prices: { date: string; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        prices.push({
          date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
          close: closes[i]!,
        });
      }
    }
    return prices;
  } catch (e) {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tickers = url.searchParams.get("tickers");
    const single = url.searchParams.get("ticker");
    const withMetadata = url.searchParams.get("metadata") === "true";
    const historyMode = url.searchParams.get("history") === "true";
    const period1 = url.searchParams.get("period1");
    const period2 = url.searchParams.get("period2");
    const interval = url.searchParams.get("interval") || "1d";

    const tickerList = tickers
      ? tickers.split(",").map((t) => t.trim()).filter(Boolean)
      : single
        ? [single.trim()]
        : [];

    if (tickerList.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide ?ticker= or ?tickers= param" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Historical price mode
    if (historyMode && period1 && period2) {
      const p1 = parseInt(period1);
      const p2 = parseInt(period2);
      const results: Record<string, { date: string; close: number }[]> = {};
      await Promise.all(
        tickerList.map(async (ticker) => {
          results[ticker] = await fetchYahooHistory(ticker, p1, p2, interval);
        })
      );
      return new Response(JSON.stringify({ data: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard price + optional metadata mode
    const results: Record<string, { price: number; previousClose: number; currency: string; name: string; sector?: string; industry?: string; country?: string; timestamp: string; error?: string }> = {};

    await Promise.all(
      tickerList.map(async (ticker) => {
        const cached = cache.get(ticker);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          results[ticker] = {
            price: cached.price,
            previousClose: cached.previousClose,
            currency: cached.currency,
            name: cached.name,
            ...(withMetadata ? { sector: cached.sector, industry: cached.industry, country: cached.country } : {}),
            timestamp: new Date(cached.ts).toISOString(),
          };
          return;
        }
        try {
          const { price, previousClose, currency, name } = await fetchYahooPrice(ticker);
          let sector = "", industry = "", country = "";
          if (withMetadata) {
            const meta = await fetchYahooMetadata(ticker);
            sector = normalizeSector(meta.sector);
            industry = meta.industry || "";
            country = meta.country || "";

            if (sector === "Unclassified") {
              sector = await classifySectorWithGroq(name || ticker);
            }
          }
          cache.set(ticker, { price, previousClose, currency, name, sector, industry, country, ts: Date.now() });
          results[ticker] = {
            price,
            previousClose,
            currency,
            name,
            ...(withMetadata ? { sector, industry, country } : {}),
            timestamp: new Date().toISOString(),
          };
        } catch (e) {
          results[ticker] = {
            price: 0,
            previousClose: 0,
            currency: "USD",
            name: ticker,
            timestamp: new Date().toISOString(),
            error: (e as Error).message,
          };
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
