import React, { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useStockMetadata, StockMetadata } from "@/hooks/useStockMetadata";
import { useHistoricalPrices, HistoricalPrice } from "@/hooks/useHistoricalPrices";
import { formatCurrency } from "@/lib/formatCurrency";
import { TrendingUp, TrendingDown, Shield, AlertTriangle, Info, BarChart3, Activity, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SECTOR_COLORS: Record<string, string> = {
  Technology: "hsl(var(--chart-1))",
  "Financial Services": "hsl(var(--chart-2))",
  Healthcare: "hsl(var(--chart-3))",
  "Consumer Cyclical": "hsl(var(--chart-4))",
  "Consumer Defensive": "hsl(var(--chart-5))",
  Energy: "hsl(var(--chart-6))",
  Industrials: "hsl(var(--chart-7))",
  "Basic Materials": "hsl(var(--chart-8))",
  "Real Estate": "hsl(var(--chart-9))",
  Utilities: "hsl(var(--chart-1))",
  "Communication Services": "hsl(var(--chart-2))",
  Crypto: "hsl(var(--chart-3))",
  Commodities: "hsl(var(--chart-4))",
  Unclassified: "hsl(var(--muted))",
};

const ALLOCATION_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
  "hsl(var(--chart-7))", "hsl(var(--chart-8))", "hsl(var(--chart-9))",
];

const FALLBACK_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
  "hsl(var(--chart-7))", "hsl(var(--chart-8))", "hsl(var(--chart-9))",
];

interface Investment {
  id: string;
  asset_class: string;
  asset_name: string;
  ticker_symbol: string | null;
  quantity: number | null;
  avg_buy_price: number | null;
  invested_value: number;
  current_value: number | null;
  api_connected: boolean;
  currency: string;
  fx_rate: number | null;
  base_currency_value: number;
}

interface Transaction {
  id: string;
  investment_id: string | null;
  ticker_symbol: string | null;
  quantity: number;
  buy_price: number;
  currency: string;
  fx_rate_at_purchase: number | null;
  transaction_date: string;
  transaction_type: string;
}

interface MfPriceData {
  price: number;
  name: string;
  category: string;
  error?: string;
}

interface PortfolioAnalyticsProps {
  investments: Investment[];
  transactions: Transaction[];
  displayCurrency: string;
  baseCurrency: string;
  getDisplayValues: (inv: Investment) => {
    currentValue: number;
    investedValue: number;
    pnl: number;
    pnlPct: number;
    baseCurrencyValue: number;
    fxRate: number;
    qty: number;
    avg: number;
  };
  toYahooTicker: (ticker: string, assetClass: string) => string;
  mfPrices?: Record<string, MfPriceData>;
}

// --- Risk metric computations ---

function computeDailyReturns(prices: HistoricalPrice[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1].close > 0) {
      returns.push((prices[i].close - prices[i - 1].close) / prices[i - 1].close);
    }
  }
  return returns;
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function covariance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len < 2) return 0;
  const mA = mean(a.slice(0, len));
  const mB = mean(b.slice(0, len));
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += (a[i] - mA) * (b[i] - mB);
  }
  return sum / (len - 1);
}

export function PortfolioAnalytics({
  investments,
  transactions,
  displayCurrency,
  baseCurrency,
  getDisplayValues,
  toYahooTicker,
  mfPrices = {},
}: PortfolioAnalyticsProps) {
  const { metadata, loading: metaLoading, fetchMetadata } = useStockMetadata();
  const { history, loading: historyLoading, fetchHistory } = useHistoricalPrices();
  const [benchmarkReturns, setBenchmarkReturns] = useState<Record<string, { returnPct: number; current: number; start: number }>>({});
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  // Only fetch Yahoo Finance data for non-crypto API assets
  const apiTickers = useMemo(
    () =>
      investments
        .filter((i) => i.api_connected && i.ticker_symbol && i.asset_class !== "Crypto")
        .map((i) => toYahooTicker(i.ticker_symbol!, i.asset_class)),
    [investments, toYahooTicker]
  );

  useEffect(() => {
    if (apiTickers.length > 0) fetchMetadata(apiTickers);
  }, [apiTickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch historical prices for risk metrics + benchmarks (always 1 year)
  useEffect(() => {
    if (apiTickers.length === 0) return;
    const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 86400;
    const now = Math.floor(Date.now() / 1000);

    const hasUS = investments.some((i) => i.asset_class === "US Stocks");
    const hasIndian = investments.some((i) => i.asset_class === "Indian Stocks");
    const benchmarks: string[] = [];
    if (hasUS) benchmarks.push("^GSPC");
    if (hasIndian) benchmarks.push("^NSEI");
    if (benchmarks.length === 0 && apiTickers.length > 0) benchmarks.push("^GSPC");

    const allTickers = [...apiTickers, ...benchmarks];
    if (allTickers.length > 0) fetchHistory(allTickers, oneYearAgo, now);
  }, [apiTickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute benchmark 1Y returns
  useEffect(() => {
    if (Object.keys(history).length === 0) return;
    setBenchmarkLoading(true);

    const results: Record<string, { returnPct: number; current: number; start: number }> = {};
    const benchmarkTickers = ["^GSPC", "^NSEI"];

    for (const ticker of benchmarkTickers) {
      const prices = history[ticker];
      if (!prices || prices.length < 2) continue;

      const startPrice = prices[0].close;
      const currentPrice = prices[prices.length - 1].close;

      if (startPrice > 0) {
        results[ticker] = {
          returnPct: ((currentPrice - startPrice) / startPrice) * 100,
          current: currentPrice,
          start: startPrice,
        };
      }
    }

    setBenchmarkReturns(results);
    setBenchmarkLoading(false);
  }, [history]);

  // Total portfolio values
  const totalValue = useMemo(
    () => investments.reduce((s, i) => s + getDisplayValues(i).currentValue, 0),
    [investments, getDisplayValues]
  );
  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + getDisplayValues(i).investedValue, 0),
    [investments, getDisplayValues]
  );

  // Portfolio allocation by asset class (Indian vs US vs others)
  const portfolioAllocation = useMemo(() => {
    const map: Record<string, number> = {};
    investments.forEach((inv) => {
      const cls = inv.asset_class || "Other";
      map[cls] = (map[cls] || 0) + getDisplayValues(inv).currentValue;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [investments, totalValue, getDisplayValues]);

  // Sector allocation — equities only
  const EQUITY_CLASSES = ["Indian Stocks", "US Stocks", "ESOPs / RSUs"];
  const MF_CLASSES = ["Mutual Funds", "Global Funds"];
  const sectorAllocation = useMemo(() => {
    const equities = investments.filter((inv) => EQUITY_CLASSES.includes(inv.asset_class));
    const equityTotal = equities.reduce((s, inv) => s + getDisplayValues(inv).currentValue, 0);
    const map: Record<string, number> = {};
    equities.forEach((inv) => {
      const val = getDisplayValues(inv).currentValue;
      if (!inv.api_connected || !inv.ticker_symbol) {
        map["Unclassified"] = (map["Unclassified"] || 0) + val;
        return;
      }
      const yahoo = toYahooTicker(inv.ticker_symbol, inv.asset_class);
      const rawSector = metadata[yahoo]?.sector;
      const sector = rawSector && rawSector !== "Other" && rawSector !== "" ? rawSector : "Unclassified";
      map[sector] = (map[sector] || 0) + val;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: equityTotal > 0 ? (value / equityTotal) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [investments, metadata, getDisplayValues, toYahooTicker]);

  // Mutual fund category allocation — separate from equities
  const mfCategoryAllocation = useMemo(() => {
    const mfs = investments.filter((inv) => MF_CLASSES.includes(inv.asset_class));
    const mfTotal = mfs.reduce((s, inv) => s + getDisplayValues(inv).currentValue, 0);
    const map: Record<string, number> = {};
    mfs.forEach((inv) => {
      const val = getDisplayValues(inv).currentValue;
      const mfData = inv.ticker_symbol ? mfPrices[inv.ticker_symbol.trim()] : null;
      const category = mfData?.category || "Unclassified";
      map[category] = (map[category] || 0) + val;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: mfTotal > 0 ? (value / mfTotal) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [investments, mfPrices, getDisplayValues]);

  // Performers
  const performers = useMemo(() => {
    const list = investments.map((inv) => {
      const d = getDisplayValues(inv);
      const returnPct = d.investedValue > 0 ? ((d.currentValue - d.investedValue) / d.investedValue) * 100 : 0;
      return { inv, returnPct, currentValue: d.currentValue, investedValue: d.investedValue };
    });
    const sorted = [...list].sort((a, b) => b.returnPct - a.returnPct);
    return {
      top: sorted.slice(0, 3).filter((p) => p.returnPct > 0),
      worst: sorted.slice(-3).reverse().filter((p) => p.returnPct < 0).sort((a, b) => a.returnPct - b.returnPct),
    };
  }, [investments, getDisplayValues]);

  // Risk exposure
  const riskMetrics = useMemo(() => {
    if (investments.length === 0 || totalValue <= 0) return null;

    let largestName = "";
    let largestWeight = 0;
    investments.forEach((inv) => {
      const w = getDisplayValues(inv).currentValue / totalValue;
      if (w > largestWeight) {
        largestWeight = w;
        largestName = inv.ticker_symbol || inv.asset_name;
      }
    });

    const largestSector = sectorAllocation[0];

    const countryMap: Record<string, number> = {};
    investments.forEach((inv) => {
      if (inv.api_connected && inv.ticker_symbol) {
        if (inv.asset_class === "Crypto") {
          countryMap["Global (Crypto)"] = (countryMap["Global (Crypto)"] || 0) + getDisplayValues(inv).currentValue;
        } else if (inv.asset_class === "Commodities") {
          countryMap["Global (Commodities)"] = (countryMap["Global (Commodities)"] || 0) + getDisplayValues(inv).currentValue;
        } else {
          const yahoo = toYahooTicker(inv.ticker_symbol, inv.asset_class);
          const country = metadata[yahoo]?.country || "Unknown";
          countryMap[country] = (countryMap[country] || 0) + getDisplayValues(inv).currentValue;
        }
      } else {
        countryMap["Other"] = (countryMap["Other"] || 0) + getDisplayValues(inv).currentValue;
      }
    });
    const countries = Object.entries(countryMap)
      .map(([name, value]) => ({ name, pct: (value / totalValue) * 100 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);

    return {
      largestHolding: { name: largestName, pct: largestWeight * 100 },
      largestSector: largestSector ? { name: largestSector.name, pct: largestSector.pct } : null,
      countries,
      assetCount: investments.length,
    };
  }, [investments, totalValue, sectorAllocation, metadata, getDisplayValues, toYahooTicker]);

  // XIRR calculation
  const portfolioXirr = useMemo(() => {
    const cashflows: { date: Date; amount: number }[] = [];
    for (const tx of transactions) {
      if (tx.transaction_type === "buy") {
        const amt = tx.quantity * tx.buy_price * (tx.fx_rate_at_purchase || 1);
        cashflows.push({ date: new Date(tx.transaction_date), amount: -amt });
      } else if (tx.transaction_type === "sell") {
        const amt = tx.quantity * tx.buy_price * (tx.fx_rate_at_purchase || 1);
        cashflows.push({ date: new Date(tx.transaction_date), amount: amt });
      }
    }
    if (cashflows.length === 0 || totalValue <= 0) return null;
    cashflows.push({ date: new Date(), amount: totalValue });

    const d0 = cashflows.reduce((min, cf) => (cf.date < min ? cf.date : min), cashflows[0].date);
    const daysDiff = (d: Date) => (d.getTime() - d0.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    let rate = 0.1;
    for (let iter = 0; iter < 200; iter++) {
      let npv = 0, dnpv = 0;
      for (const cf of cashflows) {
        const t = daysDiff(cf.date);
        const denom = Math.pow(1 + rate, t);
        npv += cf.amount / denom;
        dnpv -= (t * cf.amount) / (denom * (1 + rate));
      }
      if (Math.abs(dnpv) < 1e-12) break;
      const newRate = rate - npv / dnpv;
      if (Math.abs(newRate - rate) < 1e-7) { rate = newRate; break; }
      rate = newRate;
    }
    return isFinite(rate) ? rate * 100 : null;
  }, [transactions, totalValue]);

  // Portfolio risk metrics: volatility, beta, Sharpe
  const portfolioRiskMetrics = useMemo(() => {
    if (Object.keys(history).length === 0 || apiTickers.length === 0 || totalValue <= 0) return null;

    // Calculate weights based on current market values
    const weights: Record<string, number> = {};
    investments.forEach((inv) => {
      // Skip crypto — no Yahoo Finance historical data available
      if (inv.api_connected && inv.ticker_symbol && inv.asset_class !== "Crypto") {
        const yahoo = toYahooTicker(inv.ticker_symbol, inv.asset_class);
        weights[yahoo] = getDisplayValues(inv).currentValue / totalValue;
      }
    });
    
    const tickerReturnsMap: Record<string, Record<string, number>> = {};

    for (const ticker of apiTickers) {
      const prices = history[ticker];
      if (!prices || prices.length < 90) continue;
      const returns = computeDailyReturns(prices);
      const dateMap: Record<string, number> = {};
      for (let i = 0; i < returns.length; i++) {
        dateMap[prices[i + 1].date] = returns[i];
      }
      tickerReturnsMap[ticker] = dateMap;
    }

    if (Object.keys(tickerReturnsMap).length === 0) return null;

    const allDatesSet = new Set<string>();
    Object.values(tickerReturnsMap).forEach((dm) => Object.keys(dm).forEach((d) => allDatesSet.add(d)));
    const allDates = [...allDatesSet].sort();

    // Calculate market-cap weighted portfolio returns using current allocations
    const portfolioReturns: number[] = [];
    const portfolioDates: string[] = [];
    
    for (const date of allDates) {
      let portReturn = 0;
      let totalWeight = 0;
      
      for (const ticker of Object.keys(weights)) {
        const r = tickerReturnsMap[ticker]?.[date];
        const w = weights[ticker];
        if (r !== undefined && w > 0) {
          portReturn += w * r;
          totalWeight += w;
        }
      }
      
      if (totalWeight > 0) {
        portfolioReturns.push(portReturn);
        portfolioDates.push(date);
      }
    }

    if (portfolioReturns.length < 90) return null;

    // Annualized volatility: std dev of daily returns × sqrt(252)
    const vol = stdDev(portfolioReturns) * Math.sqrt(252);

    // Determine appropriate benchmark based on portfolio composition
    const hasUS = investments.some((i) => i.asset_class === "US Stocks");
    const hasIndian = investments.some((i) => i.asset_class === "Indian Stocks");
    const benchmarkTicker = hasUS ? "^GSPC" : hasIndian ? "^NSEI" : "^GSPC";
    const benchPrices = history[benchmarkTicker];

    let beta: number | null = null;
    let sharpe: number | null = null;

    // Calculate Beta (portfolio sensitivity to market movements)
    if (benchPrices && benchPrices.length >= 90) {
      const benchDailyReturns = computeDailyReturns(benchPrices);
      const benchDateMap: Record<string, number> = {};
      for (let i = 0; i < benchDailyReturns.length; i++) {
        benchDateMap[benchPrices[i + 1].date] = benchDailyReturns[i];
      }

      // Align portfolio and benchmark returns by date
      const alignedPort: number[] = [];
      const alignedBench: number[] = [];
      for (let i = 0; i < portfolioDates.length; i++) {
        const br = benchDateMap[portfolioDates[i]];
        if (br !== undefined) {
          alignedPort.push(portfolioReturns[i]);
          alignedBench.push(br);
        }
      }

      // Beta = Covariance(Portfolio, Market) / Variance(Market)
      if (alignedPort.length >= 60) {
        const cov = covariance(alignedPort, alignedBench);
        const benchVar = stdDev(alignedBench) ** 2;
        if (benchVar > 0) {
          beta = cov / benchVar;
        }
      }
    }

    // Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
    // Risk-free rates: 7% for India (10-year G-Sec), 4% for US (10-year Treasury)
    const riskFreeRate = hasIndian && !hasUS ? 0.07 : 0.04;
    const annualizedReturn = mean(portfolioReturns) * 252;
    if (vol > 0) {
      sharpe = (annualizedReturn - riskFreeRate) / vol;
    }

    return { volatility: vol * 100, beta, sharpe };
  }, [history, apiTickers, investments, totalValue, getDisplayValues, toYahooTicker]);

  // Insights
  const insights = useMemo(() => {
    const list: { text: string; type: "warning" | "info" | "success" }[] = [];
    if (!riskMetrics) return list;

    if (riskMetrics.largestHolding.pct > 40) {
      list.push({
        text: `High concentration: ${riskMetrics.largestHolding.name} is ${riskMetrics.largestHolding.pct.toFixed(1)}% of your portfolio.`,
        type: "warning",
      });
    } else if (riskMetrics.largestHolding.pct > 30) {
      list.push({
        text: `${riskMetrics.largestHolding.name} makes up ${riskMetrics.largestHolding.pct.toFixed(1)}% of your portfolio.`,
        type: "warning",
      });
    }

    if (riskMetrics.largestSector && riskMetrics.largestSector.name !== "Unclassified" && riskMetrics.largestSector.pct > 40) {
      list.push({
        text: `Heavy exposure to ${riskMetrics.largestSector.name} (${riskMetrics.largestSector.pct.toFixed(1)}%).`,
        type: "warning",
      });
    }

    if (riskMetrics.assetCount < 5) {
      list.push({
        text: "Your portfolio may benefit from additional diversification across more assets.",
        type: "info",
      });
    }

    if (portfolioXirr !== null) {
      if (portfolioXirr > 15) {
        list.push({ text: `Strong portfolio performance with ${portfolioXirr.toFixed(1)}% XIRR.`, type: "success" });
      } else if (portfolioXirr < 0) {
        list.push({ text: `Portfolio is currently returning ${portfolioXirr.toFixed(1)}% — consider reviewing allocations.`, type: "warning" });
      }
    }

    if (portfolioRiskMetrics) {
      if (portfolioRiskMetrics.sharpe !== null && portfolioRiskMetrics.sharpe > 1) {
        list.push({ text: `Strong risk-adjusted performance (Sharpe Ratio: ${portfolioRiskMetrics.sharpe.toFixed(2)}).`, type: "success" });
      }
      if (portfolioRiskMetrics.volatility > 25) {
        list.push({ text: `High portfolio volatility at ${portfolioRiskMetrics.volatility.toFixed(1)}% — consider risk management.`, type: "warning" });
      }
    }

    const totalReturnPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0;
    if (totalReturnPct > 20) {
      list.push({ text: `Excellent overall returns of ${totalReturnPct.toFixed(1)}%.`, type: "success" });
    }

    return list;
  }, [riskMetrics, portfolioXirr, portfolioRiskMetrics, totalValue, totalInvested]);

  if (investments.length === 0) return null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div className="glass-card rounded-lg px-3 py-2 shadow-xl text-xs">
        <p className="font-medium">{name}</p>
        <p className="text-muted-foreground">{formatCurrency(value, displayCurrency)}</p>
        <p className="text-primary font-semibold">
          {totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0.0"}%
        </p>
      </div>
    );
  };

  return (
    <Tabs defaultValue="allocation" className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-4">
        <TabsTrigger value="allocation">Allocation</TabsTrigger>
        <TabsTrigger value="risk">Risk</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
      </TabsList>

      {/* Allocation Tab */}
      <TabsContent value="allocation" className="space-y-4 mt-0">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Portfolio Allocation */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Portfolio Allocation</h3>
            </div>
            {portfolioAllocation.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={portfolioAllocation}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      activeShape={undefined}
                    >
                      {portfolioAllocation.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4">
                  {portfolioAllocation.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </div>

          {/* Sector Allocation */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Sector Allocation</h3>
            </div>
            {metaLoading ? (
              <div className="flex items-center justify-center h-52">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading sectors...</span>
                </div>
              </div>
            ) : sectorAllocation.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={sectorAllocation}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      activeShape={undefined}
                    >
                      {sectorAllocation.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={SECTOR_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                  {sectorAllocation.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{
                            backgroundColor: SECTOR_COLORS[item.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                          }}
                        />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No sector data available</p>
            )}
          </div>

          {/* MF Category Allocation */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">MF Category Allocation</h3>
            </div>
            {mfCategoryAllocation.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={mfCategoryAllocation}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      activeShape={undefined}
                    >
                      {mfCategoryAllocation.map((_, i) => (
                        <Cell
                          key={`mf-cell-${i}`}
                          fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                  {mfCategoryAllocation.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No mutual fund data available</p>
            )}
          </div>
        </div>
      </TabsContent>

      {/* Risk Tab */}
      <TabsContent value="risk" className="space-y-4 mt-0">
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Portfolio Risk Metrics</h3>
          </div>
          {portfolioRiskMetrics ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border-2 border-accent bg-accent/10 text-center">
                <p className="text-xs text-accent-foreground/80 mb-1 font-medium">Volatility</p>
                <p className="text-2xl font-bold text-foreground">{portfolioRiskMetrics.volatility.toFixed(1)}%</p>
                <p className="text-xs text-accent-foreground/70 mt-1">
                  {portfolioRiskMetrics.volatility > 25 ? "High risk" : portfolioRiskMetrics.volatility > 15 ? "Moderate risk" : "Low risk"}
                </p>
              </div>
              {portfolioRiskMetrics.beta !== null && (
                <div className="p-4 rounded-lg border-2 border-accent bg-accent/10 text-center">
                  <p className="text-xs text-accent-foreground/80 mb-1 font-medium">Beta</p>
                  <p className="text-2xl font-bold text-foreground">{portfolioRiskMetrics.beta.toFixed(2)}</p>
                  <p className="text-xs text-accent-foreground/70 mt-1">
                    {portfolioRiskMetrics.beta > 1 ? "More volatile than market" : "Less volatile than market"}
                  </p>
                </div>
              )}
              {portfolioRiskMetrics.sharpe !== null && (
                <div className="p-4 rounded-lg border-2 border-accent bg-accent/10 text-center">
                  <p className="text-xs text-accent-foreground/80 mb-1 font-medium">Sharpe Ratio</p>
                  <p className="text-2xl font-bold text-foreground">{portfolioRiskMetrics.sharpe.toFixed(2)}</p>
                  <p className="text-xs text-accent-foreground/70 mt-1">
                    {portfolioRiskMetrics.sharpe > 1 ? "Strong risk-adjusted return" : portfolioRiskMetrics.sharpe > 0.5 ? "Adequate" : "Below average"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not enough data to calculate risk metrics</p>
          )}
        </div>
      </TabsContent>

      {/* Performance Tab */}
      <TabsContent value="performance" className="space-y-4 mt-0">
        {/* Benchmark Comparison */}
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Benchmark Comparison</h3>
          </div>
          {benchmarkLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading benchmarks...</span>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Portfolio XIRR */}
              <div className="p-4 rounded-lg border-2 border-primary bg-primary/10">
                <div className="text-sm text-primary font-medium mb-1">Portfolio XIRR</div>
                <div className={`text-2xl font-bold ${portfolioXirr !== null && portfolioXirr > 0 ? "text-primary" : portfolioXirr !== null && portfolioXirr < 0 ? "text-destructive" : "text-foreground"}`}>
                  {portfolioXirr !== null ? `+${portfolioXirr.toFixed(1)}%` : "N/A"}
                </div>
              </div>

              {/* S&P 500 */}
              {benchmarkReturns["^GSPC"] && (
                <div className="p-4 rounded-lg border-2 border-secondary bg-secondary/10">
                  <div className="text-sm text-secondary-foreground/80 font-medium mb-1">S&P 500 (1Y)</div>
                  <div className={`text-2xl font-bold ${benchmarkReturns["^GSPC"].returnPct > 0 ? "text-primary" : "text-destructive"}`}>
                    +{benchmarkReturns["^GSPC"].returnPct.toFixed(1)}%
                  </div>
                </div>
              )}

              {/* Nifty 50 */}
              {benchmarkReturns["^NSEI"] && (
                <div className="p-4 rounded-lg border-2 border-secondary bg-secondary/10">
                  <div className="text-sm text-secondary-foreground/80 font-medium mb-1">Nifty 50 (1Y)</div>
                  <div className={`text-2xl font-bold ${benchmarkReturns["^NSEI"].returnPct > 0 ? "text-primary" : "text-destructive"}`}>
                    +{benchmarkReturns["^NSEI"].returnPct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top/Bottom Performers */}
        {(performers.top.length > 0 || performers.worst.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Performers */}
            {performers.top.length > 0 && (
              <div className="glass-card p-5 rounded-xl">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Top Performers</h3>
                </div>
                <div className="space-y-3">
                  {performers.top.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{p.inv.ticker_symbol || p.inv.asset_name}</div>
                        <div className="text-xs text-muted-foreground">{formatCurrency(p.currentValue, displayCurrency)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-primary">+{p.returnPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Performers */}
            {performers.worst.length > 0 && (
              <div className="glass-card p-5 rounded-xl">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                  <h3 className="text-lg font-semibold">Needs Attention</h3>
                </div>
                <div className="space-y-3">
                  {performers.worst.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{p.inv.ticker_symbol || p.inv.asset_name}</div>
                        <div className="text-xs text-muted-foreground">{formatCurrency(p.currentValue, displayCurrency)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-destructive">{p.returnPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      {/* Insights Tab */}
      <TabsContent value="insights" className="space-y-4 mt-0">
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Investment Insights</h3>
          </div>
          {insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-lg p-3 ${
                    insight.type === "warning"
                      ? "bg-destructive/10 border border-destructive/20"
                      : insight.type === "success"
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/50 border border-border/50"
                  }`}
                >
                  {insight.type === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  ) : insight.type === "success" ? (
                    <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-sm">{insight.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No insights available yet</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
