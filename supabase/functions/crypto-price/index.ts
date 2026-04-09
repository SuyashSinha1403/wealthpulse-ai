const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CryptoPrice {
  price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
  name: string;
  symbol: string;
  currency: string;
  timestamp: string;
}

interface HistoricalPrice {
  date: string;
  close: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ids = url.searchParams.get('ids')?.split(',') || [];
    const currency = url.searchParams.get('currency') || 'usd';
    const history = url.searchParams.get('history') === 'true';
    const days = url.searchParams.get('days') || '180';

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No crypto IDs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (history) {
      // Fetch historical data
      const historyData: Record<string, HistoricalPrice[]> = {};

      for (const id of ids) {
        try {
          const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${id.trim()}/market_chart?vs_currency=${currency}&days=${days}&interval=daily`
          );

          if (!response.ok) {
            console.error(`Failed to fetch history for ${id}: ${response.statusText}`);
            continue;
          }

          const data = await response.json();
          
          // Convert prices array to HistoricalPrice format
          historyData[id] = data.prices.map(([timestamp, price]: [number, number]) => ({
            date: new Date(timestamp).toISOString().split('T')[0],
            close: price,
          }));
        } catch (error) {
          console.error(`Error fetching history for ${id}:`, error);
        }
      }

      return new Response(
        JSON.stringify({ data: historyData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch current prices
    const idsParam = ids.map(id => id.trim()).join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=${currency}&include_24hr_change=true&include_market_cap=true`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }

    const priceData = await response.json();

    // Fetch additional metadata for names and symbols
    const detailsPromises = ids.map(async (id) => {
      try {
        const detailResponse = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id.trim()}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
        );
        if (detailResponse.ok) {
          const detail = await detailResponse.json();
          return { id: id.trim(), name: detail.name, symbol: detail.symbol?.toUpperCase() };
        }
      } catch (error) {
        console.error(`Failed to fetch details for ${id}:`, error);
      }
      return { id: id.trim(), name: id, symbol: id.toUpperCase() };
    });

    const details = await Promise.all(detailsPromises);
    const detailsMap = Object.fromEntries(details.map(d => [d.id, d]));

    // Transform data to match expected format
    const data: Record<string, CryptoPrice> = {};
    const currencyKey = currency.toLowerCase();

    for (const id of ids) {
      const trimmedId = id.trim();
      const cryptoData = priceData[trimmedId];
      
      if (cryptoData && cryptoData[currencyKey] !== undefined) {
        const detail = detailsMap[trimmedId];
        data[trimmedId] = {
          price: cryptoData[currencyKey],
          price_change_24h: cryptoData[`${currencyKey}_24h_change`] || 0,
          price_change_percentage_24h: cryptoData[`${currencyKey}_24h_change`] || 0,
          market_cap: cryptoData[`${currencyKey}_market_cap`] || 0,
          name: detail.name,
          symbol: detail.symbol,
          currency: currency.toUpperCase(),
          timestamp: new Date().toISOString(),
        };
      }
    }

    return new Response(
      JSON.stringify({ data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
