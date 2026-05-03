import React, { useEffect, useState, useCallback, useMemo } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStockPrices } from "@/hooks/useStockPrices";
import { useMutualFundNavs } from "@/hooks/useMutualFundNavs";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useBaseCurrency, SUPPORTED_CURRENCIES } from "@/hooks/useBaseCurrency";
import { formatCurrency } from "@/lib/formatCurrency";
import { calculateXirr } from "@/lib/xirr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, TrendingUp, RefreshCw, Wifi, WifiOff, ArrowUpDown, ChevronDown, ChevronRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportInvestmentsDialog } from "@/components/ImportInvestmentsDialog";
import { PortfolioAnalytics } from "@/components/PortfolioAnalytics";
import { AiInsightsSection } from "@/components/AiInsightsSection";
import { PrototypeSyncPanel } from "@/components/PrototypeSyncPanel";


const MUTUAL_FUND_CLASSES = ["Mutual Funds", "Global Funds"];
const API_CONNECTED_ASSET_CLASSES = ["US Stocks", "Indian Stocks", "Crypto", "Commodities", ...MUTUAL_FUND_CLASSES];

// API-connected asset classes (live prices/NAVs)
const API_ASSET_CLASSES = [...API_CONNECTED_ASSET_CLASSES];

// Manual-entry asset classes
const MANUAL_ASSET_CLASSES = [
  "NPS",
  "Fixed Deposits",
  "EPF",
  "PPF",
  "Gold",
  "Real Estate",
  "Vehicle",
  "Bonds",
  "ESOPs / RSUs",
  "Custom Asset",
];

const ALL_ASSET_CLASSES = [...API_ASSET_CLASSES, ...MANUAL_ASSET_CLASSES];

// Asset class tab grouping for UI
const ASSET_CLASS_TABS = [
  { label: "Equities", dbClasses: ["Indian Stocks", "US Stocks", "ESOPs / RSUs"] },
  { label: "Mutual Funds", dbClasses: ["Mutual Funds", "Global Funds"] },
  { label: "Bonds", dbClasses: ["Bonds", "PPF", "NPS"] },
  { label: "Crypto", dbClasses: ["Crypto"] },
  { label: "Commodities", dbClasses: ["Commodities", "Gold"] },
  { label: "Cash", dbClasses: ["Fixed Deposits", "EPF"] },
  { label: "Other", dbClasses: ["Real Estate", "Vehicle", "Custom Asset"] },
];

// Sub-sections within Equities tab
const EQUITIES_SECTIONS = [
  { label: "Indian Stocks", dbClasses: ["Indian Stocks"] },
  { label: "US Stocks", dbClasses: ["US Stocks"] },
  { label: "ESOPs / RSUs", dbClasses: ["ESOPs / RSUs"] },
];

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-9))",
];

interface TxFormState {
  quantity: string;
  buy_price: string;
  transaction_date: string;
  fx_rate_at_purchase: string;
}

const DEFAULT_CURRENCY: Record<string, string> = {
  "US Stocks": "USD",
  "Indian Stocks": "INR",
  "Crypto": "USD",
  "Commodities": "USD",
};

// Commodity ticker mapping: user-friendly name → Yahoo Finance futures ticker
const COMMODITY_TICKERS: Record<string, string> = {
  "GOLD": "GC=F",
  "SILVER": "SI=F",
  "PLATINUM": "PL=F",
  "PALLADIUM": "PA=F",
  "CRUDE OIL": "CL=F",
  "NATURAL GAS": "NG=F",
  "HEATING OIL": "HO=F",
  "COPPER": "HG=F",
  "ALUMINUM": "ALI=F",
};

const COMMODITY_NAMES: Record<string, string> = {
  "GC=F": "Gold Futures",
  "SI=F": "Silver Futures",
  "PL=F": "Platinum Futures",
  "PA=F": "Palladium Futures",
  "CL=F": "Crude Oil Futures",
  "NG=F": "Natural Gas Futures",
  "HO=F": "Heating Oil Futures",
  "HG=F": "Copper Futures",
  "ALI=F": "Aluminum Futures",
};

// Check if asset class is commodity
const isCommodityClass = (cls: string) => cls === "Commodities";

// Check if asset class is mutual fund-like
const isMutualFundClass = (cls: string) => MUTUAL_FUND_CLASSES.includes(cls);

// Get Yahoo ticker for commodity — either use mapping or pass through if already a futures ticker
const toCommodityTicker = (ticker: string): string => {
  const upper = ticker.toUpperCase().trim();
  return COMMODITY_TICKERS[upper] || upper;
};

const normalizeApiTicker = (ticker: string, assetClass: string): string => {
  const trimmed = ticker.trim();

  if (isMutualFundClass(assetClass)) return trimmed;
  if (isCommodityClass(assetClass)) return toCommodityTicker(trimmed);

  const upper = trimmed.toUpperCase();

  if (assetClass === "Indian Stocks") {
    return upper.endsWith(".NS") || upper.endsWith(".BO") ? upper : `${upper}.NS`;
  }
  if (assetClass === "Crypto") {
    return upper.endsWith("-USD") ? upper : `${upper.replace(/-USD$/, "")}-USD`;
  }

  return upper;
};

interface Investment {
  id: string;
  asset_class: string;
  asset_name: string;
  ticker_symbol: string | null;
  quantity: number | null;
  avg_buy_price: number | null;
  invested_value: number;
  current_value: number | null;
  current_price?: number | null;
  api_connected: boolean;
  notes: string | null;
  last_updated: string;
  last_price_update?: string | null;
  currency: string;
  fx_rate: number | null;
  base_currency_value: number;
}

interface Transaction {
  id: string;
  user_id: string;
  investment_id: string | null;
  ticker_symbol: string | null;
  asset_class: string;
  asset_name: string;
  quantity: number;
  buy_price: number;
  currency: string;
  fx_rate_at_purchase: number | null;
  transaction_date: string;
  transaction_type: string;
}

// Aggregated holding derived from transactions
interface AggregatedHolding {
  investmentId: string; // ID of the investment record
  ticker_symbol: string;
  asset_name: string;
  asset_class: string;
  currency: string;
  totalQty: number;
  weightedAvgPrice: number;
  totalInvestedValue: number; // sum(qty * buy_price)
  totalInvestedBase: number; // sum(qty * buy_price * fx_rate_at_purchase)
  transactions: Transaction[];
}

type FormState = {
  asset_class: string;
  asset_name: string;
  ticker_symbol: string;
  quantity: string;
  avg_buy_price: string;
  invested_value: string;
  current_value: string;
  notes: string;
  currency: string;
  transaction_date: string;
  mode: "new" | "add_lot"; // new holding or add purchase lot
};

const formatQty = (qty: number) => parseFloat(qty.toFixed(8)).toString();

// Map stored ticker to Yahoo Finance ticker (e.g. INFY → INFY.NS for Indian Stocks, GOLD → GC=F for Commodities)
const toYahooTicker = (ticker: string, assetClass: string): string => normalizeApiTicker(ticker, assetClass);

// Check if asset class is crypto
const isCryptoClass = (cls: string) => cls === "Crypto";


const emptyForm: FormState = {
  asset_class: "US Stocks",
  asset_name: "",
  ticker_symbol: "",
  quantity: "",
  avg_buy_price: "",
  invested_value: "",
  current_value: "",
  notes: "",
  currency: "USD",
  transaction_date: new Date().toISOString().split("T")[0],
  mode: "new",
};

const Investments = () => {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const { baseCurrency } = useBaseCurrency();
  const { prices: stockPrices, loading: stockPricesLoading, fetchPrices: fetchStockPrices } = useStockPrices();
  const { prices: mfPrices, loading: mfPricesLoading, fetchPrices: fetchMutualFundNavs } = useMutualFundNavs();
  const { rates, loading: fxLoading, fetchRates, getRate } = useExchangeRates();
  
  // Combined prices object for uniform access
  const prices = useMemo(
    () => ({ ...stockPrices, ...mfPrices }),
    [stockPrices, mfPrices]
  );
  const pricesLoading = stockPricesLoading || mfPricesLoading;
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [sortBy, setSortBy] = useState<"invested" | "current" | "pnl">("current");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [txEditing, setTxEditing] = useState<Transaction | null>(null);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txDialogInvId, setTxDialogInvId] = useState<string | null>(null);
  const [txDeleteId, setTxDeleteId] = useState<string | null>(null);
  const [txForm, setTxForm] = useState<TxFormState>({ quantity: "", buy_price: "", transaction_date: new Date().toISOString().split("T")[0], fx_rate_at_purchase: "" });
  const [txFxLoading, setTxFxLoading] = useState(false);
  const [formFxLoading, setFormFxLoading] = useState(false);
  const [formHistoricalFx, setFormHistoricalFx] = useState<number | null>(null);
  const [activeAssetTab, setActiveAssetTab] = useState("Equities");
  const [importOpen, setImportOpen] = useState(false);
  const [showXirr, setShowXirr] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<string>(baseCurrency);

  // Sync displayCurrency when baseCurrency loads
  useEffect(() => { setDisplayCurrency(baseCurrency); }, [baseCurrency]);

  const isApiClass = (cls: string) => API_ASSET_CLASSES.includes(cls);

  const fetchInvestments = useCallback(async () => {
    if (loading) return;

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("Current user:", authUser?.id);
    console.log("AUTH USER UUID:", authUser?.id);

    if (authError) {
      console.error("Investments auth lookup failed", authError);
      toast.error(authError.message || "Failed to verify current user");
      return;
    }

    if (!authUser) return;

    const [invRes, txRes] = await Promise.all([
      (async () => {
        console.log("Querying investments for:", authUser?.id);
        const result = await supabase
          .from("investments")
          .select("*")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false });
        console.log("Investments rows:", result.data?.length ?? 0, result.error ?? null);
        return result;
      })(),
      (async () => {
        console.log("Querying investment_transactions for:", authUser?.id);
        const result = await supabase
          .from("investment_transactions")
          .select("*")
          .eq("user_id", authUser.id)
          .order("transaction_date", { ascending: true });
        console.log("Investment transaction rows:", result.data?.length ?? 0, result.error ?? null);
        return result;
      })(),
    ]);

    console.log("Investments query result:", {
      investments: invRes.data,
      investmentTransactions: txRes.data,
    });

    const anyError = invRes.error || txRes.error;
    if (anyError) {
      console.error("Investments query failed", anyError);
      toast.error(anyError.message || "Failed to load investments");
      return;
    }

    setInvestments((invRes.data as Investment[]) || []);
    setTransactions((txRes.data as Transaction[]) || []);
  }, [loading]);

  useEffect(() => {
    if (loading || !user) return;
    fetchInvestments();
  }, [fetchInvestments, loading, user]);

  // Helper: fetch historical FX rate for a specific date
  const fetchHistoricalFx = useCallback(async (from: string, to: string, date: string): Promise<number> => {
    if (from === to) return 1;
    try {
      const url = `${SUPABASE_URL}/functions/v1/exchange-rate?from=${from}&to=${to}&date=${date}`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      const json = await res.json();
      const key = `${from}-${to}`;
      const rate = json?.data?.[key]?.rate;
      if (rate && rate > 0) return rate;
    } catch (e) {
      console.error("Failed to fetch historical FX:", e);
    }
    // Fallback to current rate
    const currentRate = getRate(from, to);
    return currentRate || 1;
  }, [getRate]);

  // Build aggregated holdings from transactions for API-connected assets
  const aggregatedHoldings = useMemo(() => {
    const map = new Map<string, AggregatedHolding>();
    
    for (const tx of transactions) {
      if (!tx.investment_id) continue;
      const existing = map.get(tx.investment_id);
      if (existing) {
        existing.totalQty += Number(tx.quantity);
        existing.totalInvestedValue += Number(tx.quantity) * Number(tx.buy_price);
        existing.totalInvestedBase += Number(tx.quantity) * Number(tx.buy_price) * (Number(tx.fx_rate_at_purchase) || 1);
        existing.transactions.push(tx);
      } else {
        const qty = Number(tx.quantity);
        const price = Number(tx.buy_price);
        map.set(tx.investment_id, {
          investmentId: tx.investment_id,
          ticker_symbol: tx.ticker_symbol || "",
          asset_name: tx.asset_name,
          asset_class: tx.asset_class,
          currency: tx.currency,
          totalQty: qty,
          weightedAvgPrice: price, // will recalc below
          totalInvestedValue: qty * price,
          totalInvestedBase: qty * price * (Number(tx.fx_rate_at_purchase) || 1),
          transactions: [tx],
        });
      }
    }
    
    // Calculate weighted avg price
    for (const h of map.values()) {
      h.weightedAvgPrice = h.totalQty > 0 ? h.totalInvestedValue / h.totalQty : 0;
    }
    
    return map;
  }, [transactions]);

  // Backfill transactions missing fx_rate_at_purchase
  useEffect(() => {
    if (!user || transactions.length === 0) return;
    const toBackfill = transactions.filter(
      (tx) => tx.fx_rate_at_purchase == null && tx.currency !== baseCurrency
    );
    if (toBackfill.length === 0) return;

    const doBackfill = async () => {
      for (const tx of toBackfill) {
        try {
          const rate = await fetchHistoricalFx(tx.currency, baseCurrency, tx.transaction_date);
          await supabase
            .from("investment_transactions")
            .update({ fx_rate_at_purchase: rate } as any)
            .eq("id", tx.id);
        } catch { /* skip */ }
      }
      fetchInvestments(); // reload after backfill
    };
    doBackfill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions.length, user]);

  // Fetch stock/crypto prices & FX rates on mount + every 60 seconds
  useEffect(() => {
    const fetchLiveData = () => {
      // Separate stock/commodity tickers and crypto IDs
      const apiTickers = investments
        .filter(
          (i) =>
            i.api_connected === true &&
            i.ticker_symbol &&
            !isMutualFundClass(i.asset_class)
        )
        .map((i) => normalizeApiTicker(i.ticker_symbol!, i.asset_class));
      const mfSchemeCodes = investments
        .filter((i) => i.api_connected === true && i.ticker_symbol && isMutualFundClass(i.asset_class))
        .map((i) => i.ticker_symbol!.trim());

      const allStockLikeTickers = [...new Set(apiTickers)];

      if (allStockLikeTickers.length > 0) fetchStockPrices(allStockLikeTickers);
      // Always fetch crypto in USD — FX conversion to baseCurrency/displayCurrency is handled separately
      if (mfSchemeCodes.length > 0) fetchMutualFundNavs(mfSchemeCodes);

      const uniqueCurrencies = [...new Set(investments.map((i) => i.currency))];
      const pairs: { from: string; to: string }[] = [];
      uniqueCurrencies.forEach((c) => {
        if (c !== baseCurrency) pairs.push({ from: c, to: baseCurrency });
      });
      // Fetch base→display and display→base for currency toggle
      if (displayCurrency !== baseCurrency) {
        pairs.push({ from: baseCurrency, to: displayCurrency });
        pairs.push({ from: displayCurrency, to: baseCurrency });
      }
      if (pairs.length > 0) fetchRates(pairs);
    };

    if (investments.length > 0) fetchLiveData();
    const interval = setInterval(() => {
      if (investments.length > 0) fetchLiveData();
    }, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments.length, baseCurrency, displayCurrency]);

  // Update DB when prices/rates change for API-connected assets
  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    const getPriceKey = (inv: Investment) => {
      if (!inv.ticker_symbol) return "";
      if (isMutualFundClass(inv.asset_class)) {
        return inv.ticker_symbol.trim();
      }
      return normalizeApiTicker(inv.ticker_symbol, inv.asset_class);
    };
    const updates = investments
      .filter((i) => i.api_connected === true && i.ticker_symbol && prices[getPriceKey(i)])
      .map((i) => {
        const priceKey = getPriceKey(i);
        const p = prices[priceKey];
        if (p.error) return null;
        const livePrice = p.price;
        const agg = aggregatedHoldings.get(i.id);
        const qty = agg ? agg.totalQty : (Number(i.quantity) || 0);
        const avgBuy = agg ? agg.weightedAvgPrice : (Number(i.avg_buy_price) || 0);
        const currentValue = livePrice * qty;
        const investedValue = avgBuy * qty;
        const fxRate = i.currency === baseCurrency ? 1 : getRate(i.currency, baseCurrency);
        const baseCurrencyValue = currentValue * (fxRate || 1);
        const priceTimestamp = new Date().toISOString();
        return supabase
          .from("investments")
          .update({
            current_price: livePrice,
            current_value: currentValue,
            invested_value: investedValue,
            quantity: qty,
            avg_buy_price: avgBuy,
            fx_rate: fxRate || null,
            base_currency_value: baseCurrencyValue,
            last_updated: priceTimestamp,
            last_price_update: priceTimestamp,
          })
          .eq("id", i.id);
      })
      .filter(Boolean);

    if (updates.length > 0) {
      Promise.all(updates).then(() => fetchInvestments());
    }
  }, [prices, rates]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => { setForm({ ...emptyForm, transaction_date: new Date().toISOString().split("T")[0] }); setEditing(null); setFormHistoricalFx(null); };

  // Check if ticker already exists as an investment
  const existingInvestmentForTicker = useMemo(() => {
    if (!form.ticker_symbol || !isApiClass(form.asset_class)) return null;
    const normalizedTicker = normalizeApiTicker(form.ticker_symbol, form.asset_class);
    return investments.find(
      (i) => i.api_connected === true && i.ticker_symbol === normalizedTicker
    ) || null;
  }, [form.ticker_symbol, form.asset_class, investments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const apiConnected = isApiClass(form.asset_class);
    const normalizedTicker = apiConnected ? normalizeApiTicker(form.ticker_symbol, form.asset_class) : null;
    const currentFxRate = form.currency === baseCurrency ? 1 : getRate(form.currency, baseCurrency);
    // Use the selected transaction date for historical FX
    const txDate = form.transaction_date || new Date().toISOString().split("T")[0];
    const fxRate = form.currency !== baseCurrency
      ? (formHistoricalFx || await fetchHistoricalFx(form.currency, baseCurrency, txDate))
      : 1;

    // If adding another lot to existing holding
    if (form.mode === "add_lot" && existingInvestmentForTicker && apiConnected) {
      const qty = Number(form.quantity) || 0;
      const price = Number(form.avg_buy_price) || 0;
      
      const { error } = await supabase.from("investment_transactions").insert({
        user_id: user.id,
        investment_id: existingInvestmentForTicker.id,
        ticker_symbol: normalizedTicker,
        asset_class: form.asset_class,
        asset_name: existingInvestmentForTicker.asset_name,
        quantity: qty,
        buy_price: price,
        currency: form.currency,
        fx_rate_at_purchase: fxRate || null,
        transaction_date: txDate,
        transaction_type: "buy",
      } as any);
      
      if (error) { toast.error(error.message); return; }
      toast.success(`Added purchase lot for ${form.ticker_symbol}`);
      setOpen(false);
      resetForm();
      fetchInvestments();
      return;
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      asset_class: form.asset_class,
      asset_name: apiConnected ? (normalizedTicker || form.asset_name) : form.asset_name,
      ticker_symbol: normalizedTicker,
      quantity: apiConnected ? (form.quantity ? Number(form.quantity) : null) : null,
      avg_buy_price: apiConnected ? (form.avg_buy_price ? Number(form.avg_buy_price) : null) : null,
      api_connected: apiConnected,
      notes: form.notes || null,
      currency: form.currency,
      fx_rate: currentFxRate || null,
      current_price: null,
      last_updated: new Date().toISOString(),
    };

    if (apiConnected) {
      const qty = Number(form.quantity) || 0;
      const avg = Number(form.avg_buy_price) || 0;
      payload.invested_value = avg * qty;
      payload.current_value = null;
      payload.last_price_update = null;
      payload.base_currency_value = avg * qty * (fxRate || 1);
    } else {
      const inv = Number(form.invested_value);
      const cur = form.current_value.trim() === "" ? null : Number(form.current_value);
      payload.invested_value = inv;
      payload.current_value = cur;
      payload.last_price_update = null;
      payload.base_currency_value = (cur ?? inv) * (fxRate || 1);
    }

    if (editing) {
      const { error } = await supabase.from("investments").update(payload as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      
      // If editing an API asset, also update/replace the synthetic transaction
      if (apiConnected && editing.api_connected) {
        // Delete old transactions for this investment and create fresh one
        await supabase.from("investment_transactions").delete().eq("investment_id", editing.id);
        await supabase.from("investment_transactions").insert({
          user_id: user.id,
          investment_id: editing.id,
          ticker_symbol: normalizedTicker,
          asset_class: form.asset_class,
          asset_name: normalizedTicker || form.asset_name,
          quantity: Number(form.quantity) || 0,
          buy_price: Number(form.avg_buy_price) || 0,
          currency: form.currency,
          fx_rate_at_purchase: fxRate || null,
          transaction_date: txDate,
          transaction_type: "buy",
        } as any);
      }
      toast.success("Investment updated");
    } else {
      const { data: inserted, error } = await supabase.from("investments").insert(payload as any).select().single();
      if (error) { toast.error(error.message); return; }
      
      // Create initial transaction for API-connected assets
      if (apiConnected && inserted) {
        const insertedId = (inserted as any).id;
        await supabase.from("investment_transactions").insert({
          user_id: user.id,
          investment_id: insertedId,
          ticker_symbol: normalizedTicker,
          asset_class: form.asset_class,
          asset_name: normalizedTicker,
          quantity: Number(form.quantity) || 0,
          buy_price: Number(form.avg_buy_price) || 0,
          currency: form.currency,
          fx_rate_at_purchase: fxRate || null,
          transaction_date: txDate,
          transaction_type: "buy",
        } as any);

        // Fetch asset name from price API and persist it
        try {
          const isCommodity = isCommodityClass(form.asset_class);
          let companyName: string | undefined;
          
          if (isCommodity) {
            // Use predefined commodity names
            companyName = COMMODITY_NAMES[normalizedTicker!] || normalizedTicker!;
          } else {
            const yahooT = normalizeApiTicker(normalizedTicker!, form.asset_class);
            const url = `${SUPABASE_URL}/functions/v1/stock-price?ticker=${yahooT}`;
            const res = await fetch(url, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
            const json = await res.json();
            companyName = json?.data?.[yahooT]?.name;
          }
          
          if (companyName && companyName !== normalizedTicker) {
            await supabase.from("investments").update({ asset_name: companyName } as any).eq("id", insertedId);
          }
        } catch { /* fallback: keep ticker/id as name */ }
      }
      toast.success("Investment added");
    }
    setOpen(false);
    resetForm();
    fetchInvestments();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("investments").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchInvestments(); }
    setDeleteId(null);
  };

  // Transaction CRUD
  const openTxDialog = async (invId: string, tx?: Transaction) => {
    setTxDialogInvId(invId);
    if (tx) {
      setTxEditing(tx);
      setTxForm({
        quantity: tx.quantity.toString(),
        buy_price: tx.buy_price.toString(),
        transaction_date: tx.transaction_date,
        fx_rate_at_purchase: tx.fx_rate_at_purchase?.toString() || "",
      });
    } else {
      setTxEditing(null);
      const inv = investments.find((i) => i.id === invId);
      const today = new Date().toISOString().split("T")[0];
      setTxForm({ quantity: "", buy_price: "", transaction_date: today, fx_rate_at_purchase: "" });
      // Auto-fetch FX for today
      if (inv && inv.currency !== baseCurrency) {
        setTxFxLoading(true);
        const rate = await fetchHistoricalFx(inv.currency, baseCurrency, today);
        setTxForm((f) => ({ ...f, fx_rate_at_purchase: rate.toString() }));
        setTxFxLoading(false);
      } else {
        setTxForm((f) => ({ ...f, fx_rate_at_purchase: "1" }));
      }
    }
    setTxDialogOpen(true);
  };

  // Auto-fetch historical FX when transaction date changes
  const handleTxDateChange = async (newDate: string) => {
    setTxForm((f) => ({ ...f, transaction_date: newDate }));
    const inv = txDialogInvId ? investments.find((i) => i.id === txDialogInvId) : null;
    if (inv && inv.currency !== baseCurrency && newDate) {
      setTxFxLoading(true);
      const rate = await fetchHistoricalFx(inv.currency, baseCurrency, newDate);
      setTxForm((f) => ({ ...f, fx_rate_at_purchase: rate.toString() }));
      setTxFxLoading(false);
    }
  };

  const handleTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !txDialogInvId) return;
    const inv = investments.find((i) => i.id === txDialogInvId);
    if (!inv) return;

    const payload = {
      user_id: user.id,
      investment_id: txDialogInvId,
      ticker_symbol: inv.ticker_symbol?.toUpperCase() || null,
      asset_class: inv.asset_class,
      asset_name: inv.asset_name,
      quantity: Number(txForm.quantity) || 0,
      buy_price: Number(txForm.buy_price) || 0,
      currency: inv.currency,
      fx_rate_at_purchase: Number(txForm.fx_rate_at_purchase) || null,
      transaction_date: txForm.transaction_date,
      transaction_type: "buy" as const,
    };

    if (txEditing) {
      const { error } = await supabase.from("investment_transactions").update(payload as any).eq("id", txEditing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Transaction updated");
    } else {
      const { error } = await supabase.from("investment_transactions").insert(payload as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Purchase lot added");
    }
    setTxDialogOpen(false);
    setTxEditing(null);
    fetchInvestments();
  };

  const confirmTxDelete = async () => {
    if (!txDeleteId) return;
    const { error } = await supabase.from("investment_transactions").delete().eq("id", txDeleteId);
    if (error) toast.error(error.message);
    else { toast.success("Transaction deleted"); fetchInvestments(); }
    setTxDeleteId(null);
  };

  const handleEdit = (inv: Investment) => {
    const agg = aggregatedHoldings.get(inv.id);
    setEditing(inv);
    setForm({
      asset_class: inv.asset_class,
      asset_name: inv.asset_name,
      ticker_symbol: inv.ticker_symbol || "",
      quantity: agg ? agg.totalQty.toString() : (inv.quantity?.toString() || ""),
      avg_buy_price: agg ? agg.weightedAvgPrice.toFixed(2) : (inv.avg_buy_price?.toString() || ""),
      invested_value: inv.invested_value.toString(),
      current_value: inv.current_value?.toString() || "",
      notes: inv.notes || "",
      currency: inv.currency || "INR",
      transaction_date: new Date().toISOString().split("T")[0],
      mode: "new",
    });
    setOpen(true);
  };

  const refreshPrices = () => {
    const apiTickers = investments
      .filter(
        (i) =>
          i.api_connected === true &&
          i.ticker_symbol &&
          !isMutualFundClass(i.asset_class),
      )
      .map((i) => normalizeApiTicker(i.ticker_symbol!, i.asset_class));
    const mfSchemeCodes = investments
      .filter((i) => i.api_connected === true && i.ticker_symbol && isMutualFundClass(i.asset_class))
      .map((i) => i.ticker_symbol!.trim());

    if (apiTickers.length > 0 || mfSchemeCodes.length > 0) {
      if (apiTickers.length > 0) fetchStockPrices([...new Set(apiTickers)]);
      if (mfSchemeCodes.length > 0) fetchMutualFundNavs([...new Set(mfSchemeCodes)]);
      const uniqueCurrencies = [...new Set(investments.map((i) => i.currency))];
      const pairs = uniqueCurrencies.filter((c) => c !== baseCurrency).map((c) => ({ from: c, to: baseCurrency }));
      if (pairs.length > 0) fetchRates(pairs);
      toast.success("Refreshing prices & rates…");
    } else {
      toast.info("No API-connected assets to refresh");
    }
  };

  // Convert a value to displayCurrency: use native when display matches asset ccy, else go via base
  const toDisplay = (nativeValue: number, baseValue: number, assetCurrency: string): number => {
    if (displayCurrency === assetCurrency) return nativeValue;
    if (displayCurrency === baseCurrency) return baseValue;
    const baseToDisplay = getRate(baseCurrency, displayCurrency) || 1;
    return baseValue * baseToDisplay;
  };

  // Compute live values — historical FX for invested, current FX for current value
  const getDisplayValues = (inv: Investment) => {
    const currentFxToBase = inv.currency === baseCurrency ? 1 : (getRate(inv.currency, baseCurrency) || inv.fx_rate || 1);
    const agg = aggregatedHoldings.get(inv.id);
    if (inv.api_connected && inv.ticker_symbol) {
      const qty = agg ? agg.totalQty : (Number(inv.quantity) || 0);
      const avg = agg ? agg.weightedAvgPrice : (Number(inv.avg_buy_price) || 0);

      // Invested: native = sum(qty*price), base = sum(qty*price*historical_fx)
      const investedNative = agg ? agg.totalInvestedValue : (avg * qty);
      const investedBase = agg ? agg.totalInvestedBase : (avg * qty * currentFxToBase);

      const priceKey = isMutualFundClass(inv.asset_class)
        ? inv.ticker_symbol.trim()
        : normalizeApiTicker(inv.ticker_symbol, inv.asset_class);
      const priceData = prices[priceKey];
      
      if (priceData && !priceData.error) {
        const livePrice = priceData.price;
        const rawPrevClose = 'previousClose' in priceData ? priceData.previousClose : null;
        const hasPreviousClose = rawPrevClose != null && rawPrevClose > 0 && rawPrevClose !== livePrice;
        const previousClose = rawPrevClose || livePrice;

        const currentNative = livePrice * qty;
        const currentBase = currentNative * currentFxToBase;
        const dailyChangeNative = hasPreviousClose ? (livePrice - previousClose) * qty : 0;
        const dailyChangePct = hasPreviousClose && previousClose > 0 ? ((livePrice - previousClose) / previousClose) * 100 : 0;

        const investedDisplay = toDisplay(investedNative, investedBase, inv.currency);
        const currentDisplay = toDisplay(currentNative, currentBase, inv.currency);
        const pnlDisplay = currentDisplay - investedDisplay;
        const dailyChangeDisplay = toDisplay(dailyChangeNative, dailyChangeNative * currentFxToBase, inv.currency);

        return {
          livePrice, previousClose, hasPreviousClose,
          currentValue: currentDisplay,
          investedValue: investedDisplay,
          pnl: pnlDisplay,
          pnlPct: investedDisplay > 0 ? (pnlDisplay / investedDisplay) * 100 : 0,
          dailyChange: dailyChangeDisplay,
          dailyChangePct,
          baseCurrencyValue: currentBase,
          fxRate: currentFxToBase,
          qty, avg,
          lotCount: agg ? agg.transactions.length : 1,
        };
      }

      // No live price
      const currentNative = Number(inv.current_value) || (avg * qty);
      const currentBase = currentNative * currentFxToBase;
      const investedDisplay = toDisplay(investedNative, investedBase, inv.currency);
      const currentDisplay = toDisplay(currentNative, currentBase, inv.currency);
      const pnlDisplay = currentDisplay - investedDisplay;
      return {
        livePrice: null, previousClose: null, hasPreviousClose: false,
        currentValue: currentDisplay,
        investedValue: investedDisplay,
        pnl: pnlDisplay,
        pnlPct: investedDisplay > 0 ? (pnlDisplay / investedDisplay) * 100 : 0,
        dailyChange: 0, dailyChangePct: 0,
        baseCurrencyValue: currentBase,
        fxRate: currentFxToBase,
        qty, avg,
        lotCount: agg ? agg.transactions.length : 1,
      };
    }

    // Manual assets
    const investedNative = Number(inv.invested_value);
    const currentNative = Number(inv.current_value);
    const investedBase = investedNative * currentFxToBase;
    const currentBase = currentNative * currentFxToBase;
    const investedDisplay = toDisplay(investedNative, investedBase, inv.currency);
    const currentDisplay = toDisplay(currentNative, currentBase, inv.currency);
    const pnlDisplay = currentDisplay - investedDisplay;
    return {
      livePrice: null, previousClose: null, hasPreviousClose: false,
      currentValue: currentDisplay,
      investedValue: investedDisplay,
      pnl: pnlDisplay,
      pnlPct: investedDisplay > 0 ? (pnlDisplay / investedDisplay) * 100 : 0,
      dailyChange: 0, dailyChangePct: 0,
      baseCurrencyValue: currentBase,
      fxRate: currentFxToBase,
      qty: Number(inv.quantity) || 0,
      avg: Number(inv.avg_buy_price) || 0,
      lotCount: 1,
    };
  };

  const totalDisplay = investments.reduce((s, i) => s + getDisplayValues(i).currentValue, 0);
  const totalInvested = investments.reduce((s, i) => s + getDisplayValues(i).investedValue, 0);


  const apiAssetSelected = isApiClass(form.asset_class);

  const formFxRate = form.currency === baseCurrency ? 1 : getRate(form.currency, baseCurrency);
  const formPreviewValue = apiAssetSelected
    ? (Number(form.quantity) || 0) * (Number(form.avg_buy_price) || 0)
    : Number(form.current_value) || 0;

  const handleAssetClassChange = (v: string) => {
    const defaultCur = DEFAULT_CURRENCY[v] || baseCurrency;
    setForm((f) => ({ ...f, asset_class: v, currency: defaultCur }));
  };

  const getAssetClassDisplay = (assetClass: string) => {
    switch (assetClass) {
      case "US Stocks":
        return "US Stocks";
      case "Indian Stocks":
        return "Indian Stocks";
      case "Mutual Funds":
        return "Mutual Funds";
      case "Global Funds":
        return "Global Funds";
      case "Crypto":
        return "Crypto";
      case "Commodities":
        return "Gold / Commodities";
      case "Gold":
        return "Gold";
      case "Fixed Deposits":
        return "Fixed Deposits";
      case "EPF":
        return "EPF";
      case "PPF":
        return "PPF";
      case "Real Estate":
        return "Real Estate";
      case "Vehicle":
        return "Vehicle";
      case "Custom Asset":
        return "Other Assets";
      case "NPS":
        return "NPS";
      case "Bonds":
        return "Bonds";
      case "ESOPs / RSUs":
        return "ESOPs / RSUs";
      default:
        return assetClass || "Select asset class";
    }
  };

  // Auto-fetch historical FX when form date or currency changes
  const handleFormDateChange = async (newDate: string) => {
    setForm((f) => ({ ...f, transaction_date: newDate }));
    if (form.currency !== baseCurrency && newDate) {
      setFormFxLoading(true);
      const rate = await fetchHistoricalFx(form.currency, baseCurrency, newDate);
      setFormHistoricalFx(rate);
      setFormFxLoading(false);
    } else {
      setFormHistoricalFx(null);
    }
  };

  // Also fetch FX when currency changes in the form
  useEffect(() => {
    if (form.currency !== baseCurrency && form.transaction_date) {
      setFormFxLoading(true);
      fetchHistoricalFx(form.currency, baseCurrency, form.transaction_date).then((rate) => {
        setFormHistoricalFx(rate);
        setFormFxLoading(false);
      });
    } else {
      setFormHistoricalFx(null);
    }
  }, [form.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investments</h1>
          <p className="text-muted-foreground text-sm">Track your portfolio across asset classes</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Currency display toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
            {["INR", "USD"].map((cur) => (
              <button
                key={cur}
                onClick={() => setDisplayCurrency(cur)}
                className={`px-3 py-1.5 font-medium transition-colors ${displayCurrency === cur ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {cur}
              </button>
            ))}
          </div>
          <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={refreshPrices} disabled={pricesLoading || fxLoading} className="gap-2 border-primary/40 text-primary hover:bg-primary/10">
            <RefreshCw className={`h-4 w-4 ${(pricesLoading || fxLoading) ? "animate-spin" : ""}`} />
            {!isMobile && "Refresh"}
          </Button>
          <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            {!isMobile && "Import"}
          </Button>
          <ImportInvestmentsDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            userId={user?.id || ""}
            baseCurrency={baseCurrency}
            existingTransactions={transactions}
            fetchHistoricalFx={fetchHistoricalFx}
            onImportComplete={fetchInvestments}
          />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size={isMobile ? "sm" : "default"} className="gradient-primary text-primary-foreground gap-2"><Plus className="h-4 w-4" />Add</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : form.mode === "add_lot" ? "Add Purchase Lot" : "Add"} Investment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Asset Class */}
                <div className="space-y-1.5">
              <Label>Asset Class</Label>
                  <Select value={form.asset_class} onValueChange={handleAssetClassChange} disabled={form.mode === "add_lot"}>
                    <SelectTrigger>
                      <span>{getAssetClassDisplay(form.asset_class)}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Live</div>
                      <SelectItem value="US Stocks">US Stocks</SelectItem>
                      <SelectItem value="Indian Stocks">Indian Stocks</SelectItem>
                      <SelectItem value="Mutual Funds">Mutual Funds</SelectItem>
                      <SelectItem value="Crypto">Crypto</SelectItem>
                      <SelectItem value="Commodities">Gold / Commodities</SelectItem>
                      <SelectItem value="Global Funds">Global Funds</SelectItem>

                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Manual Entry</div>
                      <SelectItem value="Fixed Deposits">Fixed Deposits</SelectItem>
                      <SelectItem value="Gold">Gold</SelectItem>
                      <SelectItem value="EPF">EPF</SelectItem>
                      <SelectItem value="PPF">PPF</SelectItem>
                      <SelectItem value="Real Estate">Real Estate</SelectItem>
                      <SelectItem value="Vehicle">Vehicle</SelectItem>
                      <SelectItem value="Custom Asset">Other Assets</SelectItem>
                      {/* Preserve existing manual asset types for backward compatibility */}
                      <SelectItem value="NPS">NPS</SelectItem>
                      <SelectItem value="Bonds">Bonds</SelectItem>
                      <SelectItem value="ESOPs / RSUs">ESOPs / RSUs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Currency */}
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))} disabled={form.mode === "add_lot"}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.currency !== baseCurrency && formFxRate > 0 && (
                    <p className="text-xs text-muted-foreground">
                      1 {form.currency} = {formFxRate.toFixed(4)} {baseCurrency}
                      {formPreviewValue > 0 && ` · ${form.currency} ${formPreviewValue.toLocaleString()} ≈ ${formatCurrency(formPreviewValue * formFxRate, baseCurrency)}`}
                    </p>
                  )}
                </div>

                {/* Existing ticker notice */}
                {apiAssetSelected && !editing && existingInvestmentForTicker && form.mode === "new" && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p className="font-medium text-foreground">You already hold {form.ticker_symbol}</p>
                    <p className="text-muted-foreground text-xs mt-1">Would you like to add another purchase lot instead?</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 text-xs"
                      onClick={() => setForm((f) => ({ ...f, mode: "add_lot" }))}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add purchase lot
                    </Button>
                  </div>
                )}

                {form.mode === "add_lot" && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                    Adding a new purchase lot for <span className="font-semibold text-foreground">{form.ticker_symbol}</span>. This will be tracked as a separate transaction.
                    <Button type="button" variant="link" size="sm" className="text-xs p-0 ml-2 h-auto" onClick={() => setForm((f) => ({ ...f, mode: "new" }))}>Cancel</Button>
                  </div>
                )}

                {apiAssetSelected ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>
                        {isCryptoClass(form.asset_class)
                          ? "Crypto Ticker"
                          : isCommodityClass(form.asset_class)
                          ? "Commodity"
                          : isMutualFundClass(form.asset_class)
                          ? "Scheme Code"
                          : "Ticker Symbol"}
                      </Label>
                      {isCommodityClass(form.asset_class) ? (
                        <Select value={form.ticker_symbol} onValueChange={(v) => setForm((f) => ({ ...f, ticker_symbol: v }))} disabled={form.mode === "add_lot"}>
                          <SelectTrigger><SelectValue placeholder="Select commodity" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(COMMODITY_TICKERS).map(([name, ticker]) => (
                              <SelectItem key={ticker} value={name}>{name} ({ticker})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={form.ticker_symbol}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              ticker_symbol: isMutualFundClass(form.asset_class)
                                ? e.target.value.trim()
                                : e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder={
                            isCryptoClass(form.asset_class)
                              ? "BTC-USD"
                              : isMutualFundClass(form.asset_class)
                              ? "e.g. 120503 (scheme code)"
                              : "AAPL"
                          }
                          required
                          disabled={form.mode === "add_lot"}
                        />
                      )}
                      {isCryptoClass(form.asset_class) && (
                        <p className="text-xs text-muted-foreground">Use Yahoo-style crypto tickers such as BTC-USD or ETH-USD.</p>
                      )}
                      {isCommodityClass(form.asset_class) && (
                        <p className="text-xs text-muted-foreground">
                          Price per unit (e.g., per troy oz for gold)
                        </p>
                      )}
                      {isMutualFundClass(form.asset_class) && (
                        <p className="text-xs text-muted-foreground">
                          Enter the mutual fund scheme code used by MFAPI.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{form.mode === "add_lot" ? "Lot Qty" : "Quantity"}</Label>
                      <Input type="number" step="any" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{form.mode === "add_lot" ? "Buy Price" : "Avg Buy Price"}</Label>
                      <Input type="number" step="any" value={form.avg_buy_price} onChange={(e) => setForm((f) => ({ ...f, avg_buy_price: e.target.value }))} required />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Asset Name</Label>
                      <Input value={form.asset_name} onChange={(e) => setForm((f) => ({ ...f, asset_name: e.target.value }))} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Invested Value ({form.currency})</Label>
                        <Input type="number" step="any" value={form.invested_value} onChange={(e) => setForm((f) => ({ ...f, invested_value: e.target.value }))} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Current Value ({form.currency})</Label>
                        <Input type="number" step="any" value={form.current_value} onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value }))} required />
                      </div>
                    </div>
                  </>
                )}

                {/* Transaction Date */}
                {apiAssetSelected && (
                  <div className="space-y-1.5">
                    <Label>Transaction Date</Label>
                    <Input type="date" value={form.transaction_date} onChange={(e) => handleFormDateChange(e.target.value)} />
                    {form.currency !== baseCurrency && (
                      <p className="text-xs text-muted-foreground">
                        {formFxLoading ? "Fetching FX rate…" : formHistoricalFx ? `FX rate (${form.transaction_date}): ${formHistoricalFx.toFixed(4)}` : ""}
                      </p>
                    )}
                  </div>
                )}

                {form.mode !== "add_lot" && (
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
                  </div>
                )}
                <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                  {editing ? "Update" : form.mode === "add_lot" ? "Add Purchase Lot" : "Add"} Investment
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <PrototypeSyncPanel
        title="Sync investments from your brokers"
        description="Choose what you want to sync first. WealthPulse would then ask for the right broker, registrar, or statement source with read-only consent."
        actions={[
          { label: "Sync demat account", detail: "Equities, ETFs, SGBs", providers: ["Zerodha", "Groww", "Upstox", "Angel One"] },
          { label: "Sync mutual funds", detail: "CAS, AMCs, registrar data", providers: ["Consolidated CAS", "CAMS", "KFintech", "Groww"] },
          { label: "Sync bonds", detail: "RBI bonds, SGBs, debt holdings", providers: ["RBI Retail Direct", "GoldenPi", "Wint Wealth", "Manual upload"] },
          { label: "Sync fixed income", detail: "FDs, RDs, NPS, PPF", providers: ["Bank statement", "NPS CRA", "EPFO", "Manual upload"] },
        ]}
        footnote="In a real build this would use broker/OAuth, CAS, or statement imports with read-only consent. In demo mode it only shows the intended product flow."
      />

      {/* Summary cards - Compact */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        <div className="glass-card rounded-xl p-3 sm:p-4">
          <div className="text-xs text-muted-foreground mb-0.5">Invested</div>
          <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalInvested, displayCurrency)}</div>
        </div>
        <div className="glass-card rounded-xl p-3 sm:p-4">
          <div className="text-xs text-muted-foreground mb-0.5">Current</div>
          <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalDisplay, displayCurrency)}</div>
        </div>
        <div className="glass-card rounded-xl p-3 sm:p-4 cursor-pointer select-none col-span-2 sm:col-span-1" onClick={() => setShowXirr((v) => !v)}>
          <div className="text-xs text-muted-foreground mb-0.5">{showXirr ? "XIRR" : "Returns"}</div>
          {(() => {
              if (showXirr) {
                // Build cashflows in displayCurrency terms
                const cashflows: { date: Date; amount: number }[] = [];

                const baseToDisplay =
                  displayCurrency === baseCurrency ? 1 : getRate(baseCurrency, displayCurrency);

                const txAmountToDisplay = (tx: Transaction, nativeAmt: number) => {
                  if (displayCurrency === tx.currency) return nativeAmt;

                  // Convert native -> base (prefer stored historical FX)
                  const fxToBase =
                    tx.currency === baseCurrency
                      ? 1
                      : Number(tx.fx_rate_at_purchase) || getRate(tx.currency, baseCurrency) || 0;

                  const baseAmt = fxToBase ? nativeAmt * fxToBase : 0;

                  if (displayCurrency === baseCurrency) return baseAmt;
                  if (!baseToDisplay) return 0;

                  return baseAmt * baseToDisplay;
                };

                for (const tx of transactions) {
                  const native = tx.quantity * tx.buy_price;
                  const amt = txAmountToDisplay(tx, native);

                  if (tx.transaction_type === "buy") {
                    cashflows.push({ date: new Date(tx.transaction_date), amount: -amt });
                  } else if (tx.transaction_type === "sell") {
                    cashflows.push({ date: new Date(tx.transaction_date), amount: amt });
                  }
                }
              if (cashflows.length === 0 || totalDisplay <= 0) {
                return (
                  <p className="text-xl font-bold text-muted-foreground">
                    N/A
                    <span className="text-xs text-muted-foreground ml-2">tap to toggle</span>
                  </p>
                );
              }
              cashflows.push({ date: new Date(), amount: totalDisplay });
              const xirr = calculateXirr(cashflows);
              return (
                <p className={`text-xl font-bold ${xirr !== null && xirr >= 0 ? "text-primary" : "text-destructive"}`}>
                  {xirr !== null ? `${xirr >= 0 ? "+" : ""}${xirr.toFixed(2)}%` : "N/A"}
                  <span className="text-xs text-muted-foreground ml-2">tap to toggle</span>
                </p>
              );
            }
            const absReturn = totalDisplay - totalInvested;
            const absPct = totalInvested > 0 ? (absReturn / totalInvested * 100).toFixed(1) : "0";
            return (
              <p className={`text-xl font-bold ${totalDisplay >= totalInvested ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(absReturn, displayCurrency)} ({absPct}%)
                <span className="text-xs text-muted-foreground ml-2">tap to toggle</span>
              </p>
            );
          })()}
        </div>
      </div>


      {/* Portfolio Analytics */}
      <PortfolioAnalytics
        investments={investments}
        transactions={transactions}
        displayCurrency={displayCurrency}
        baseCurrency={baseCurrency}
        getDisplayValues={getDisplayValues}
        toYahooTicker={toYahooTicker}
        mfPrices={mfPrices}
      />

      {/* Asset Class Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 min-w-max pb-1">
          {ASSET_CLASS_TABS.map((tab) => {
            const count = investments.filter((i) => tab.dbClasses.includes(i.asset_class)).length;
            if (count === 0 && tab.label !== activeAssetTab) return null;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveAssetTab(tab.label)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeAssetTab === tab.label
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {tab.label}
                {count > 0 && <span className="ml-1.5 text-xs opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Holdings for selected tab */}
      {(() => {
        const activeTab = ASSET_CLASS_TABS.find((t) => t.label === activeAssetTab);
        if (!activeTab) return null;
        const tabInvestments = investments.filter((i) => activeTab.dbClasses.includes(i.asset_class));
        
        if (tabInvestments.length === 0) {
          return (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No {activeAssetTab.toLowerCase()} investments yet.</p>
            </div>
          );
        }

        const sorted = [...tabInvestments].sort((a, b) => {
          const da = getDisplayValues(a);
          const db = getDisplayValues(b);
          let va = 0, vb = 0;
          if (sortBy === "invested") { va = da.investedValue * da.fxRate; vb = db.investedValue * db.fxRate; }
          else if (sortBy === "current") { va = da.baseCurrencyValue; vb = db.baseCurrencyValue; }
          else { va = da.pnl * da.fxRate; vb = db.pnl * db.fxRate; }
          return sortAsc ? va - vb : vb - va;
        });

        // For Equities tab, show sub-sections
        const isEquities = activeAssetTab === "Equities";
        const sections = isEquities
          ? EQUITIES_SECTIONS.map((s) => ({
              label: s.label,
              items: sorted.filter((i) => s.dbClasses.includes(i.asset_class)),
            })).filter((s) => s.items.length > 0)
          : [{ label: activeAssetTab, items: sorted }];

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-44 h-8 text-xs border-border/60 text-muted-foreground hover:text-foreground bg-background"><SelectValue placeholder="Sort by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invested">Invested Value</SelectItem>
                  <SelectItem value="current">Current Value</SelectItem>
                  <SelectItem value="pnl">Profit / Loss</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 border-border/60 text-muted-foreground hover:text-foreground" onClick={() => setSortAsc((v) => !v)}>
                {sortAsc ? "Ascending" : "Descending"}
              </Button>
            </div>

            {sections.map(({ label, items }) => (
              <div key={label} className="space-y-3">
                {isEquities && <h3 className="text-lg font-bold text-foreground px-1">{label}</h3>}

                {/* Mobile: Card layout */}
                {isMobile ? (
                  <div className="space-y-3">
                    {items.map((inv) => {
                      const d = getDisplayValues(inv);
                      const priceKey = inv.ticker_symbol
                        ? (isMutualFundClass(inv.asset_class) ? inv.ticker_symbol.trim() : normalizeApiTicker(inv.ticker_symbol, inv.asset_class))
                        : null;
                      const hasError = priceKey ? prices[priceKey]?.error : undefined;
                      const displayName = inv.asset_name && inv.asset_name !== inv.ticker_symbol ? inv.asset_name : inv.ticker_symbol;
                      const isManual = !inv.api_connected;
                      return (
                        <div key={inv.id} className="glass-card rounded-xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                                {isCryptoClass(inv.asset_class) && <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold shrink-0">₿</span>}
                                {isCommodityClass(inv.asset_class) && <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-yellow-500/20 text-yellow-500 text-[10px] font-bold shrink-0">◆</span>}
                                {displayName || inv.asset_name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {inv.ticker_symbol && <span className="text-xs text-muted-foreground">{inv.ticker_symbol}</span>}
                                {d.livePrice !== null && (
                                  <span className="text-xs text-foreground">{inv.currency} {d.livePrice.toFixed(2)}</span>
                                )}
                                {hasError && <span className="text-xs">⚠️</span>}
                                {d.livePrice !== null && d.hasPreviousClose && (
                                  <span className={`text-xs font-medium ${d.dailyChangePct >= 0 ? "text-primary" : "text-destructive"}`}>
                                    {d.dailyChangePct >= 0 ? "▲" : "▼"} {Math.abs(d.dailyChangePct).toFixed(2)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {!isManual && <p className="text-xs text-muted-foreground">{formatQty(d.qty)} Qty</p>}
                              {d.livePrice !== null && d.hasPreviousClose && (
                                <p className={`text-xs font-medium ${d.dailyChange >= 0 ? "text-primary" : "text-destructive"}`}>
                                  {d.dailyChange >= 0 ? "+" : ""}{formatCurrency(d.dailyChange, displayCurrency)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/30">
                            <div>
                              <p className="text-[11px] text-muted-foreground">Invested</p>
                              <p className="text-sm font-semibold text-foreground">{formatCurrency(d.investedValue, displayCurrency)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">Current Value</p>
                              <p className="text-sm font-semibold text-foreground">{formatCurrency(d.currentValue, displayCurrency)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[11px] text-muted-foreground">Total Return</p>
                              <p className={`text-xs font-medium ${d.pnlPct >= 0 ? "text-primary" : "text-destructive"}`}>
                                {d.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(d.pnlPct).toFixed(2)}%
                              </p>
                              <p className={`text-sm font-semibold ${d.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                                {d.pnl >= 0 ? "+" : ""}{formatCurrency(d.pnl, displayCurrency)}
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-end gap-1 pt-1">
                            {inv.api_connected && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}>
                                {expandedId === inv.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(inv)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(inv.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>

                          {expandedId === inv.id && inv.api_connected && (() => {
                            const agg = aggregatedHoldings.get(inv.id);
                            const txList = agg?.transactions || [];
                            return (
                              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Purchase History</h4>
                                  <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1" onClick={() => openTxDialog(inv.id)}>
                                    <Plus className="h-3 w-3" /> Add
                                  </Button>
                                </div>
                                {txList.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">No transaction records.</p>
                                ) : txList.map((tx) => {
                                  const txInvestedBase = Number(tx.quantity) * Number(tx.buy_price) * (Number(tx.fx_rate_at_purchase) || 1);
                                  return (
                                    <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                                      <div>
                                        <p className="text-xs text-foreground">{formatQty(Number(tx.quantity))} × {Number(tx.buy_price).toFixed(2)} {tx.currency}</p>
                                        <p className="text-[11px] text-muted-foreground">{tx.transaction_date} · FX {tx.fx_rate_at_purchase ? Number(tx.fx_rate_at_purchase).toFixed(2) : "—"}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-foreground">{formatCurrency(txInvestedBase, baseCurrency)}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openTxDialog(inv.id, tx)}><Pencil className="h-3 w-3" /></Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTxDeleteId(tx.id)}><Trash2 className="h-3 w-3" /></Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Desktop: Table layout */
                  <div className="glass-card rounded-xl p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="w-8 py-2"></th>
                            <th className="text-left py-2 pr-3">{items[0]?.api_connected ? "Ticker" : "Name"}</th>
                            {items[0]?.api_connected && <th className="text-left py-2 px-3">Name</th>}
                            {items[0]?.api_connected && <th className="text-right py-2 px-3">Qty</th>}
                            {items[0]?.api_connected && <th className="text-right py-2 px-3">Avg Buy</th>}
                            {items[0]?.api_connected && <th className="text-right py-2 px-3">Live Price</th>}
                            <th className="text-right py-2 px-3">Invested ({displayCurrency})</th>
                            <th className="text-right py-2 px-3">Current ({displayCurrency})</th>
                            <th className="text-right py-2 px-3">P&L</th>
                            <th className="text-right py-2 px-3">%</th>
                            <th className="text-right py-2 pl-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((inv) => {
                            const d = getDisplayValues(inv);
                            const priceKey = inv.ticker_symbol
                              ? (isMutualFundClass(inv.asset_class) ? inv.ticker_symbol.trim() : normalizeApiTicker(inv.ticker_symbol, inv.asset_class))
                              : null;
                            const hasError = priceKey ? prices[priceKey]?.error : undefined;
                            const isExpanded = expandedId === inv.id;
                            const agg = aggregatedHoldings.get(inv.id);
                            const txList = agg?.transactions || [];
                            const isApi = inv.api_connected;
                            return (
                              <React.Fragment key={inv.id}>
                                <tr className="border-b border-border/50 group hover:bg-muted/30 cursor-pointer" onClick={() => isApi && setExpandedId(isExpanded ? null : inv.id)}>
                                  <td className="py-2.5 pl-2">
                                    {isApi && txList.length > 0 ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : null}
                                  </td>
                                  <td className="py-2.5 pr-3 font-medium text-foreground">
                                    <span className="flex items-center gap-1.5">
                                      {isCryptoClass(inv.asset_class) && <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold shrink-0">₿</span>}
                                      {isCommodityClass(inv.asset_class) && <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-yellow-500/20 text-yellow-500 text-[10px] font-bold shrink-0">◆</span>}
                                      {isApi ? inv.ticker_symbol : inv.asset_name}
                                      {hasError && <span title="Price fetch failed" className="text-xs">⚠️</span>}
                                    </span>
                                  </td>
                                  {isApi && (
                                    <td className="py-2.5 px-3 text-muted-foreground text-xs truncate max-w-[160px]" title={inv.asset_name || inv.ticker_symbol || "—"}>
                                      {inv.asset_name && inv.asset_name !== inv.ticker_symbol ? inv.asset_name : (inv.ticker_symbol || "—")}
                                    </td>
                                  )}
                                  {isApi && <td className="text-right py-2.5 px-3 text-muted-foreground">{formatQty(d.qty)}</td>}
                                  {isApi && <td className="text-right py-2.5 px-3 text-muted-foreground">{d.avg.toFixed(2)}</td>}
                                  {isApi && <td className="text-right py-2.5 px-3 text-foreground">{d.livePrice !== null ? d.livePrice.toFixed(2) : "—"}</td>}
                                  <td className="text-right py-2.5 px-3 font-medium text-foreground">{formatCurrency(d.investedValue, displayCurrency)}</td>
                                  <td className="text-right py-2.5 px-3 font-medium text-foreground">{formatCurrency(d.currentValue, displayCurrency)}</td>
                                  <td className={`text-right py-2.5 px-3 font-medium ${d.pnl >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(d.pnl, displayCurrency)}</td>
                                  <td className={`text-right py-2.5 px-3 ${d.pnlPct >= 0 ? "text-primary" : "text-destructive"}`}>{d.pnlPct.toFixed(1)}%</td>
                                  <td className="text-right py-2.5 pl-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(inv)}><Pencil className="h-3 w-3" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(inv.id)}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && isApi && (
                                  <tr key={`${inv.id}-expand`}>
                                    <td colSpan={11} className="p-0">
                                      <div className="bg-muted/30 border-b border-border/50 px-6 py-4">
                                        <div className="flex items-center justify-between mb-3">
                                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Purchase History</h4>
                                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openTxDialog(inv.id)}>
                                            <Plus className="h-3 w-3" /> Add Purchase
                                          </Button>
                                        </div>
                                        {txList.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">No transaction records found.</p>
                                        ) : (
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="text-muted-foreground border-b border-border/30">
                                                <th className="text-left py-1.5 pr-3">Date</th>
                                                <th className="text-right py-1.5 px-3">Qty</th>
                                                <th className="text-right py-1.5 px-3">Buy Price ({inv.currency})</th>
                                                <th className="text-right py-1.5 px-3">FX Rate</th>
                                                <th className="text-right py-1.5 px-3">Invested ({baseCurrency})</th>
                                                <th className="text-right py-1.5 pl-3">Actions</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {txList.map((tx) => {
                                                const txInvestedBase = Number(tx.quantity) * Number(tx.buy_price) * (Number(tx.fx_rate_at_purchase) || 1);
                                                return (
                                                  <tr key={tx.id} className="border-b border-border/20 group/tx hover:bg-muted/40">
                                                    <td className="py-1.5 pr-3 text-muted-foreground">{tx.transaction_date}</td>
                                                    <td className="text-right py-1.5 px-3 text-foreground">{formatQty(Number(tx.quantity))}</td>
                                                    <td className="text-right py-1.5 px-3 text-foreground">{Number(tx.buy_price).toFixed(2)}</td>
                                                    <td className="text-right py-1.5 px-3 text-muted-foreground">{tx.fx_rate_at_purchase ? Number(tx.fx_rate_at_purchase).toFixed(4) : "—"}</td>
                                                    <td className="text-right py-1.5 px-3 font-medium text-foreground">{formatCurrency(txInvestedBase, baseCurrency)}</td>
                                                    <td className="text-right py-1.5 pl-3">
                                                      <div className="flex justify-end gap-1 opacity-0 group-hover/tx:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openTxDialog(inv.id, tx)}><Pencil className="h-3 w-3" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTxDeleteId(tx.id)}><Trash2 className="h-3 w-3" /></Button>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}


      {investments.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No investments yet. Add your first investment to get started.</p>
        </div>
      )}

      <AiInsightsSection context="investments" />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The investment and all its purchase lots will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transaction Add/Edit Dialog */}
      <Dialog open={txDialogOpen} onOpenChange={(v) => { if (!v) { setTxDialogOpen(false); setTxEditing(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{txEditing ? "Edit" : "Add"} Purchase Lot</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTxSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" step="any" value={txForm.quantity} onChange={(e) => setTxForm((f) => ({ ...f, quantity: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Buy Price</Label>
                <Input type="number" step="any" value={txForm.buy_price} onChange={(e) => setTxForm((f) => ({ ...f, buy_price: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={txForm.transaction_date} onChange={(e) => handleTxDateChange(e.target.value)} required />
            </div>
            {txFxLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">Fetching historical FX rate…</p>
            ) : txForm.fx_rate_at_purchase && txForm.fx_rate_at_purchase !== "1" ? (
              <p className="text-xs text-muted-foreground">
                FX rate ({txForm.transaction_date}): <span className="font-medium text-foreground">{Number(txForm.fx_rate_at_purchase).toFixed(4)}</span>
              </p>
            ) : null}
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">
              {txEditing ? "Update" : "Add"} Transaction
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transaction Delete Confirmation */}
      <AlertDialog open={!!txDeleteId} onOpenChange={(v) => { if (!v) setTxDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase lot?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the transaction and recalculate holdings accordingly.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTxDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Investments;
