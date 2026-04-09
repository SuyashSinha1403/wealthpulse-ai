import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatCompactCurrency } from "@/lib/formatCompactCurrency";
import { calculateXirr } from "@/lib/xirr";
import {
  TrendingUp,
  Wallet,
  PiggyBank,
  AlertTriangle,
  Banknote,
  HeartPulse,
} from "lucide-react";
import { AiInsights } from "@/components/AiInsights";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  LabelList,
  Legend,
} from "recharts";

const DonutTooltip = ({ active, payload, total, currency }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border border-border/50 bg-card px-2.5 py-1.5 shadow-xl text-xs max-w-[200px]">
      <p className="font-medium text-foreground truncate">{name}</p>
      <p className="text-muted-foreground">{formatCurrency(value, currency)}</p>
      <p className="text-primary font-semibold">{pct}%</p>
    </div>
  );
};

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
const NW_COLORS = {
  investments: "hsl(var(--chart-1))",
  cash: "hsl(var(--chart-2))",
  liabilities: "hsl(var(--chart-3))",
};

interface DonutLegendProps {
  items: { name: string; value: number; color: string; pct?: string }[];
  currency: string;
  totalForPct?: number;
}

const DonutLegend = ({ items, currency }: DonutLegendProps) => (
  <div className="space-y-2 w-full">
    {items.map((item) => (
      <div key={item.name} className="flex items-center justify-between text-sm gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground truncate">{item.name}</span>
        </div>
        <span className="font-medium text-foreground shrink-0">
          {formatCurrency(item.value, currency)}
        </span>
      </div>
    ))}
  </div>
);

const toMonthly = (val: number, freq: string) => {
  if (freq === "Quarterly") return val / 3;
  if (freq === "Yearly") return val / 12;
  if (freq === "One-time") return 0;
  return val;
};

interface HealthCardProps {
  title: string;
  gradient: string;
  value: string;
  valueColor: string;
  formula: string;
  subtitle?: string;
  smallValue?: boolean;
}

const HealthCard = ({ title, gradient, value, valueColor, formula, subtitle, smallValue }: HealthCardProps) => {
  const [showFormula, setShowFormula] = useState(false);
  return (
    <div
      className={`rounded-lg bg-gradient-to-br ${gradient} border p-4 cursor-pointer transition-all duration-200 active:scale-[0.97] min-h-[100px] flex flex-col justify-between`}
      onClick={() => setShowFormula((p) => !p)}
    >
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      {showFormula ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{formula}</p>
      ) : (
        <>
          <p className={`${smallValue ? "text-lg" : "text-xl"} font-bold ${valueColor}`}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { baseCurrency } = useBaseCurrency();
  const isMobile = useIsMobile();
  const nwSectionRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({
    investments: 0,
    bankBalance: 0,
    expenses: 0,
    liabilities: 0,
  });
  const [allocation, setAllocation] = useState<{ name: string; value: number }[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<{ category: string; amount: number }[]>([]);
  const [liabilityBreakdown, setLiabilityBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; netWorth: number }[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [lastMonthExpenses, setLastMonthExpenses] = useState(0);
  const [lastMonthIncome, setLastMonthIncome] = useState(0);
  const [largestHolding, setLargestHolding] = useState<{ name: string; pct: number } | null>(null);
  const [portfolioReturn, setPortfolioReturn] = useState<number | null>(null);
  const [cashFlowTrend, setCashFlowTrend] = useState<{ month: string; income: number; expenses: number }[]>([]);
  const [monthlyInvestmentAdded, setMonthlyInvestmentAdded] = useState(0);
  const [avgMonthlyExpenses, setAvgMonthlyExpenses] = useState(0);
  const [avgMonthlyIncome, setAvgMonthlyIncome] = useState(0);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;

    const fetchData = async () => {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      console.log("Current user:", authUser?.id);
      console.log("AUTH USER UUID:", authUser?.id);
      if (authError) {
        toast.error(authError.message || "Failed to verify current user");
        return;
      }
      if (!authUser) {
        console.warn("Dashboard fetch skipped: no authenticated user");
        return;
      }

      if (user && authUser.id !== user.id) {
        console.warn("Dashboard auth mismatch", {
          contextUserId: user.id,
          authUserId: authUser.id,
        });
      }

      const [
        invRes,
        bankRes,
        expRes,
        liabRes,
        bankTxRes,
        incRes,
        invTxRes,
      ] = await Promise.all([
        (async () => {
          console.log("Querying investments for:", authUser?.id);
          const result = await supabase
            .from("investments")
            .select(
              "asset_class, asset_name, ticker_symbol, current_value, base_currency_value, invested_value"
            )
            .eq("user_id", authUser.id);
          console.log("Investments rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
        (async () => {
          console.log("Querying bank_accounts for:", authUser?.id);
          const result = await supabase
            .from("bank_accounts")
            .select("balance, base_currency_value")
            .eq("user_id", authUser.id);
          console.log("Bank account rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
        (async () => {
          console.log("Querying expenses for:", authUser?.id);
          const result = await supabase
            .from("expenses")
            .select("amount, base_currency_value, category, date")
            .eq("user_id", authUser.id);
          console.log("Expense rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
        (async () => {
          console.log("Querying liabilities for:", authUser?.id);
          const result = await supabase
            .from("liabilities")
            .select("outstanding_amount, base_currency_value, liability_type")
            .eq("user_id", authUser.id);
          console.log("Liability rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
        (async () => {
          console.log("Querying bank_transactions for:", authUser?.id);
          const result = await supabase
            .from("bank_transactions")
            .select("amount, transaction_type, transaction_date")
            .eq("user_id", authUser.id)
            .order("transaction_date", { ascending: true });
          console.log("Bank transaction rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
        (async () => {
          console.log("Querying income_entries for:", authUser?.id);
          const result = await supabase
            .from("income_entries")
            .select("base_currency_value, frequency, date_received")
            .eq("user_id", authUser.id);
          console.log("Income entry rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
        (async () => {
          console.log("Querying investment_transactions for:", authUser?.id);
          const result = await supabase
            .from("investment_transactions")
            .select("transaction_date, transaction_type, buy_price, quantity, fx_rate_at_purchase")
            .eq("user_id", authUser.id);
          console.log("Investment transaction rows:", result.data?.length ?? 0, result.error ?? null);
          return result;
        })(),
      ]);

      const anyError = invRes.error || bankRes.error || expRes.error || liabRes.error || bankTxRes.error || incRes.error || invTxRes.error;
      if (anyError) {
        toast.error(anyError.message || "Failed to load dashboard data");
        return;
      }

      const investments = (invRes.data || []).reduce(
        (s, i) => s + Number(i.base_currency_value ?? i.current_value ?? 0),
        0
      );
      const bankBalance = (bankRes.data || []).reduce(
        (s, b) => s + Number(b.base_currency_value ?? b.balance ?? 0),
        0
      );
      const now = new Date();
      const thisMonth = (expRes.data || []).filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const expenses = thisMonth.reduce(
        (s, e) => s + Number(e.base_currency_value ?? e.amount ?? 0),
        0
      );
      const liabilities = (liabRes.data || []).reduce(
        (s, l) => s + Number(l.base_currency_value ?? l.outstanding_amount ?? 0),
        0
      );
      const lastMo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthExp = (expRes.data || []).filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === lastMo.getMonth() && d.getFullYear() === lastMo.getFullYear();
      });
      const lastMonthExpTotal = lastMonthExp.reduce(
        (s, e) => s + Number(e.base_currency_value ?? e.amount ?? 0),
        0
      );

      if (cancelled) return;

      setStats({ investments, bankBalance, expenses, liabilities });
      setLastMonthExpenses(lastMonthExpTotal);

      // Compute average monthly expenses across all months with expense data
      const expMonthMap: Record<string, number> = {};
      (expRes.data || []).forEach((e) => {
        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        expMonthMap[key] = (expMonthMap[key] || 0) + Number(e.base_currency_value || e.amount);
      });
      const expMonthValues = Object.values(expMonthMap);
      const avgExpenses = expMonthValues.length > 0
        ? expMonthValues.reduce((s, v) => s + v, 0) / expMonthValues.length
        : 0;
      setAvgMonthlyExpenses(avgExpenses);

      // Compute average monthly income across all months with income data
      // For recurring income, attribute to each month from date_received onward up to now
      const incMonthMap: Record<string, number> = {};
      (incRes.data || []).forEach((inc: any) => {
        const freq = inc.frequency;
        const d = new Date(inc.date_received);
        const val = Number(inc.base_currency_value);
        if (freq === "One-time") {
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          incMonthMap[key] = (incMonthMap[key] || 0) + val;
        } else {
          // Attribute recurring income to each month from start to now
          const monthly = toMonthly(val, freq);
          const startMonth = new Date(d.getFullYear(), d.getMonth(), 1);
          const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          let cur = new Date(startMonth);
          while (cur <= endMonth) {
            const key = `${cur.getFullYear()}-${cur.getMonth()}`;
            incMonthMap[key] = (incMonthMap[key] || 0) + monthly;
            cur.setMonth(cur.getMonth() + 1);
          }
        }
      });
      const incMonthValues = Object.values(incMonthMap);
      const avgIncome = incMonthValues.length > 0
        ? incMonthValues.reduce((s, v) => s + v, 0) / incMonthValues.length
        : 0;
      setAvgMonthlyIncome(avgIncome);

      // Monthly income (current month - for stat card)
      const totalMonthlyIncome = (incRes.data || []).reduce(
        (s: number, e: any) => s + toMonthly(Number(e.base_currency_value), e.frequency),
        0
      );
      setMonthlyIncome(totalMonthlyIncome);
      // Approximate last month income as same (recurring)
      setLastMonthIncome(totalMonthlyIncome);

      // Monthly investment added (this month's buy transactions)
      const thisMonthInvAdded = (invTxRes.data || []).filter((tx: any) => {
        const d = new Date(tx.transaction_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() &&
          String(tx.transaction_type || "buy").toLowerCase().includes("buy");
      }).reduce((s: number, tx: any) => {
        const fx = Number(tx.fx_rate_at_purchase ?? 1);
        return s + Number(tx.buy_price || 0) * Number(tx.quantity || 0) * (Number.isFinite(fx) ? fx : 1);
      }, 0);
      setMonthlyInvestmentAdded(thisMonthInvAdded);

      // Allocation
      const allocationMap: Record<string, number> = {};
      (invRes.data || []).forEach((i) => {
        allocationMap[i.asset_class] =
          (allocationMap[i.asset_class] || 0) +
          Number(i.base_currency_value ?? i.current_value ?? 0);
      });
      if (bankBalance > 0) allocationMap["Cash"] = bankBalance;
      setAllocation(Object.entries(allocationMap).map(([name, value]) => ({ name, value })));

      // Monthly expenses by category (sorted desc)
      const catMap: Record<string, number> = {};
      thisMonth.forEach((e) => {
        catMap[e.category] = (catMap[e.category] || 0) + Number(e.base_currency_value ?? e.amount ?? 0);
      });
      setMonthlyExpenses(
        Object.entries(catMap)
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8)
      );

      // Liability breakdown
      const liabMap: Record<string, number> = {};
      (liabRes.data || []).forEach((l) => {
        liabMap[l.liability_type] =
          (liabMap[l.liability_type] || 0) +
          Number(l.base_currency_value ?? l.outstanding_amount ?? 0);
      });
      setLiabilityBreakdown(Object.entries(liabMap).map(([name, value]) => ({ name, value })));

      // Largest holding
      const invList = invRes.data || [];
      const totalInvValue = invList.reduce(
        (s: number, i: any) => s + Number(i.base_currency_value ?? i.current_value ?? 0),
        0
      );
      setLargestHolding(null);
      if (totalInvValue > 0) {
        let maxVal = 0, maxName = "";
        invList.forEach((i: any) => {
          const v = Number(i.base_currency_value ?? i.current_value ?? 0);
          if (v > maxVal) {
            maxVal = v;
            maxName = i.ticker_symbol || i.asset_name;
          }
        });
        setLargestHolding({ name: maxName, pct: (maxVal / totalInvValue) * 100 });
      }

      // Portfolio XIRR
      setPortfolioReturn(null);
      const invTxList = invTxRes.data || [];
      const cashflows: { date: Date; amount: number }[] = [];
      for (const tx of invTxList) {
        const date = new Date(tx.transaction_date);
        const fx = Number(tx.fx_rate_at_purchase ?? 1);
        const baseAmt = Number(tx.buy_price || 0) * Number(tx.quantity || 0) * (Number.isFinite(fx) ? fx : 1);
        if (!Number.isFinite(baseAmt) || baseAmt === 0) continue;
        const t = String(tx.transaction_type || "buy").toLowerCase();
        const signed = t.includes("sell") ? baseAmt : -baseAmt;
        cashflows.push({ date, amount: signed });
      }
      if (totalInvValue > 0) cashflows.push({ date: now, amount: totalInvValue });
      const xirrPct = calculateXirr(cashflows);
      if (xirrPct !== null) setPortfolioReturn(xirrPct);

      // Net Worth Trend
      const currentNetWorth = investments + bankBalance - liabilities;
      const txList = bankTxRes.data || [];
      if (txList.length > 0) {
        const dailyMap = new Map<string, number>();
        txList.forEach((tx) => {
          const date = tx.transaction_date;
          const amt = Number(tx.amount);
          const delta = tx.transaction_type === "DEBIT" ? -amt : amt;
          dailyMap.set(date, (dailyMap.get(date) || 0) + delta);
        });
        const sortedDates = [...dailyMap.keys()].sort();
        const today = now.toISOString().split("T")[0];
        if (!dailyMap.has(today)) sortedDates.push(today);
        let runningCashDelta = 0;
        const trend: { date: string; netWorth: number }[] = [];
        const totalCashDelta = [...dailyMap.values()].reduce((s, v) => s + v, 0);
        for (const date of sortedDates) {
          if (date === today) {
            trend.push({ date, netWorth: Math.round(currentNetWorth * 100) / 100 });
          } else {
            runningCashDelta += dailyMap.get(date) || 0;
            const estimatedNW = currentNetWorth - (totalCashDelta - runningCashDelta);
            trend.push({ date, netWorth: Math.round(estimatedNW * 100) / 100 });
          }
        }
        if (!cancelled) setTrendData(trend);
      } else {
        if (!cancelled) setTrendData([{ date: now.toISOString().split("T")[0], netWorth: Math.round(currentNetWorth * 100) / 100 }]);
      }

      // Cash Flow Trend (last 6 months)
      const cfTrend: { month: string; income: number; expenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mKey = m.toLocaleString("default", { month: "short", year: "2-digit" });
        const mExpenses = (expRes.data || []).filter((e) => {
          const d = new Date(e.date);
          return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
        }).reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0);

        // For income: use recurring monthly income as approximation for each month
        // but for months with actual date_received entries, sum those
        const mIncome = (incRes.data || []).reduce((s: number, inc: any) => {
          const freq = inc.frequency;
          if (freq === "One-time") {
            const d = new Date(inc.date_received);
            if (d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear()) {
              return s + Number(inc.base_currency_value);
            }
            return s;
          }
          return s + toMonthly(Number(inc.base_currency_value), freq);
        }, 0);

        cfTrend.push({ month: mKey, income: Math.round(mIncome), expenses: Math.round(mExpenses) });
      }
      if (!cancelled) setCashFlowTrend(cfTrend);
    };

    fetchData();
    return () => { cancelled = true; };
  }, [loading, user]);

  const netWorth = useMemo(() => stats.investments + stats.bankBalance - stats.liabilities, [stats]);
  const monthlySavings = useMemo(() => monthlyIncome - stats.expenses, [monthlyIncome, stats.expenses]);
  const lastMonthSavings = useMemo(() => lastMonthIncome - lastMonthExpenses, [lastMonthIncome, lastMonthExpenses]);

  const nwComposition = useMemo(() => {
    const positiveBase = stats.investments + stats.bankBalance;
    if (positiveBase === 0 && stats.liabilities === 0) return [];
    const result: { name: string; value: number; color: string; pct: string }[] = [];
    if (stats.investments > 0) result.push({ name: "Investments", value: stats.investments, color: NW_COLORS.investments, pct: positiveBase > 0 ? ((stats.investments / positiveBase) * 100).toFixed(1) : "0" });
    if (stats.bankBalance > 0) result.push({ name: "Cash", value: stats.bankBalance, color: NW_COLORS.cash, pct: positiveBase > 0 ? ((stats.bankBalance / positiveBase) * 100).toFixed(1) : "0" });
    if (stats.liabilities > 0) result.push({ name: "Liabilities", value: stats.liabilities, color: NW_COLORS.liabilities, pct: positiveBase > 0 ? ((stats.liabilities / positiveBase) * 100).toFixed(1) : "0" });
    return result;
  }, [stats]);

  // Financial health computed values
  const emergencyRunway = useMemo(() => {
    if (avgMonthlyExpenses <= 0) return null;
    return stats.bankBalance / avgMonthlyExpenses;
  }, [stats.bankBalance, avgMonthlyExpenses]);

  const investmentRate = useMemo(() => {
    if (monthlyIncome <= 0) return 0;
    return (monthlyInvestmentAdded / monthlyIncome) * 100;
  }, [monthlyInvestmentAdded, monthlyIncome]);

  const diversification = useMemo(() => {
    if (!largestHolding) return null;
    if (largestHolding.pct > 25) return { label: "Concentrated", color: "text-destructive" };
    if (largestHolding.pct > 10) return { label: "Moderate", color: "text-yellow-500" };
    return { label: "Well Diversified", color: "text-primary" };
  }, [largestHolding]);

  const donutInnerSm = 28;
  const donutOuterSm = 48;
  const donutInner = isMobile ? donutInnerSm : 50;
  const donutOuter = isMobile ? donutOuterSm : 80;
  const chartHeight = isMobile ? 160 : 200;
  const donutHeight = isMobile ? 130 : 200;

  const allocationTotal = useMemo(() => allocation.reduce((s, a) => s + a.value, 0), [allocation]);
  const liabilityTotal = useMemo(() => liabilityBreakdown.reduce((s, a) => s + a.value, 0), [liabilityBreakdown]);
  const totalMonthlyExpenses = useMemo(() => monthlyExpenses.reduce((s, e) => s + e.amount, 0), [monthlyExpenses]);

  // Expense chart data with percentages and highlight
  const expenseChartData = useMemo(() => {
    if (totalMonthlyExpenses === 0) return monthlyExpenses;
    const maxAmount = Math.max(...monthlyExpenses.map((e) => e.amount));
    return monthlyExpenses.map((e) => ({
      ...e,
      pct: ((e.amount / totalMonthlyExpenses) * 100).toFixed(0),
      fill: e.amount === maxAmount ? "hsl(var(--chart-1))" : "hsl(var(--primary) / 0.6)",
    }));
  }, [monthlyExpenses, totalMonthlyExpenses]);

  // Savings trend info
  const savingsTrend = useMemo(() => {
    if (lastMonthSavings === 0 && monthlySavings === 0) return null;
    const diff = monthlySavings - lastMonthSavings;
    if (lastMonthSavings === 0) return null;
    const pctChange = ((diff / Math.abs(lastMonthSavings)) * 100).toFixed(0);
    return { value: `${Math.abs(Number(pctChange))}% vs last month`, positive: diff >= 0 };
  }, [monthlySavings, lastMonthSavings]);

  const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value) return null;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={isMobile ? 8 : 10} fontWeight={600}>
        {formatCompactCurrency(value, baseCurrency)}
      </text>
    );
  };

  const ExpenseTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border/50 bg-card px-2.5 py-1.5 shadow-xl text-xs">
        <p className="font-medium text-foreground">{d.category}</p>
        <p className="text-muted-foreground">{formatCurrency(d.amount, baseCurrency)} ({d.pct}%)</p>
      </div>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <div className="brand-panel rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="brand-kicker">Your money, in one view</div>
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Your financial command center</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
                Track your net worth, cash flow, and investments — and see what needs your attention today.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            title={`Net Worth (${baseCurrency})`}
            value={formatCurrency(netWorth, baseCurrency)}
            icon={Wallet}
            onClick={() => nwSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
          />
        </div>
        <StatCard title="Investments" value={formatCompactCurrency(stats.investments, baseCurrency)} icon={TrendingUp} onClick={() => navigate("/investments")} onLongPress={() => navigate("/investments")} />
        <StatCard title="Cash" value={formatCurrency(stats.bankBalance, baseCurrency)} icon={Banknote} onClick={() => navigate("/bank-accounts")} onLongPress={() => navigate("/bank-accounts")} />
        <StatCard
          title="Monthly Savings"
          value={formatCurrency(monthlySavings, baseCurrency)}
          icon={PiggyBank}
          trend={savingsTrend || undefined}
          onClick={() => navigate("/cash-flow")}
          onLongPress={() => navigate("/cash-flow")}
        />
        <StatCard title="Liabilities" value={formatCurrency(stats.liabilities, baseCurrency)} icon={AlertTriangle} onClick={() => navigate("/liabilities")} onLongPress={() => navigate("/liabilities")} />
      </div>

      {/* Financial Health Indicators */}
      <div className="glass-card rounded-xl p-4 sm:p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" />
          Financial Health Indicators
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <HealthCard
            title="Savings Rate"
            gradient="from-emerald-500/10 to-emerald-500/5 border-emerald-500/20"
            value={avgMonthlyIncome > 0 ? `${(((avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome) * 100).toFixed(1)}%` : "0.0%"}
            valueColor={avgMonthlyIncome > 0 && (avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome >= 0.3 ? "text-primary" : "text-destructive"}
            formula="(Avg Monthly Income − Avg Monthly Expenses) ÷ Avg Monthly Income × 100"
          />
          <HealthCard
            title="Expense Ratio"
            gradient="from-amber-500/10 to-amber-500/5 border-amber-500/20"
            value={(() => { const r = avgMonthlyIncome > 0 ? (avgMonthlyExpenses / avgMonthlyIncome) * 100 : 0; return `${r.toFixed(1)}%`; })()}
            valueColor={(() => { const r = avgMonthlyIncome > 0 ? (avgMonthlyExpenses / avgMonthlyIncome) * 100 : 0; return r < 50 ? "text-primary" : r < 70 ? "text-yellow-500" : "text-destructive"; })()}
            formula="Avg Monthly Expenses ÷ Avg Monthly Income × 100"
          />
          <HealthCard
            title="Portfolio XIRR"
            gradient="from-blue-500/10 to-blue-500/5 border-blue-500/20"
            value={portfolioReturn !== null ? `${portfolioReturn >= 0 ? "+" : ""}${portfolioReturn.toFixed(2)}%` : "—"}
            valueColor={portfolioReturn !== null && portfolioReturn >= 0 ? "text-primary" : "text-destructive"}
            formula="Annualized return (XIRR) on all buy/sell transactions vs current portfolio value"
          />
          <HealthCard
            title="Emergency Runway"
            gradient="from-orange-500/10 to-orange-500/5 border-orange-500/20"
            value={emergencyRunway !== null ? `${emergencyRunway.toFixed(1)} months` : "—"}
            valueColor={emergencyRunway === null ? "text-muted-foreground" : emergencyRunway < 3 ? "text-destructive" : emergencyRunway < 6 ? "text-yellow-500" : "text-primary"}
            formula="Total Cash (Bank Balances) ÷ Avg Monthly Expenses"
          />
          <HealthCard
            title="Investment Rate"
            gradient="from-cyan-500/10 to-cyan-500/5 border-cyan-500/20"
            value={monthlyIncome > 0 ? `${investmentRate.toFixed(1)}%` : "—"}
            valueColor={investmentRate >= 20 ? "text-primary" : investmentRate >= 10 ? "text-yellow-500" : "text-destructive"}
            formula="This Month's Investment Purchases ÷ Monthly Income × 100"
          />
          <HealthCard
            title="Diversification"
            gradient="from-purple-500/10 to-purple-500/5 border-purple-500/20"
            value={diversification?.label || "—"}
            valueColor={diversification?.color || "text-muted-foreground"}
            subtitle={largestHolding ? `Top: ${largestHolding.name} (${largestHolding.pct.toFixed(0)}%)` : "No data"}
            formula="Largest holding >25% → Concentrated, 10-25% → Moderate, <10% → Well Diversified"
            smallValue
          />
        </div>
      </div>

      {/* Donut Charts Row — side by side on all screens */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Net Worth Composition */}
        <div ref={nwSectionRef} className="glass-card rounded-xl p-3 sm:p-5">
          <h3 className="font-semibold text-foreground mb-3 text-xs sm:text-sm">Net Worth</h3>
          {nwComposition.length > 0 ? (
            <div className="flex flex-col items-center gap-2">
              <ResponsiveContainer width="100%" height={donutHeight}>
                <PieChart>
                  <Pie data={nwComposition} cx="50%" cy="50%" innerRadius={donutInner} outerRadius={donutOuter} dataKey="value" stroke="none" activeIndex={-1}>
                    {nwComposition.map((item, i) => (<Cell key={i} fill={item.color} stroke="none" />))}
                  </Pie>
                  <Tooltip content={<DonutTooltip total={stats.investments + stats.bankBalance + stats.liabilities} currency={baseCurrency} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full">
                {nwComposition.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-medium text-foreground shrink-0 text-xs">
                      {formatCompactCurrency(item.name === "Liabilities" ? -item.value : item.value, baseCurrency)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-border/50 pt-1 flex items-center justify-between text-xs font-semibold">
                  <span className="text-foreground">Net</span>
                  <span className={netWorth >= 0 ? "text-primary" : "text-destructive"}>{formatCompactCurrency(netWorth, baseCurrency)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs py-8 text-center">Add assets to see composition</p>
          )}
        </div>

        {/* Asset Allocation */}
        <div className="glass-card rounded-xl p-3 sm:p-5">
          <h3 className="font-semibold text-foreground mb-3 text-xs sm:text-sm">Asset Allocation</h3>
          {allocation.length > 0 ? (
            <div className="flex flex-col items-center gap-2">
              <ResponsiveContainer width="100%" height={donutHeight}>
                <PieChart>
                  <Pie data={allocation} cx="50%" cy="50%" innerRadius={donutInner} outerRadius={donutOuter} dataKey="value" stroke="none" activeIndex={-1}>
                    {allocation.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />))}
                  </Pie>
                  <Tooltip content={<DonutTooltip total={allocationTotal} currency={baseCurrency} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full">
                {allocation.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-medium text-foreground shrink-0 text-xs">
                      {formatCompactCurrency(item.value, baseCurrency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs py-8 text-center">Add investments to see allocation</p>
          )}
        </div>

        {/* Liability Breakdown */}
        <div className="glass-card rounded-xl p-3 sm:p-5 col-span-2 lg:col-span-1">
          <h3 className="font-semibold text-foreground mb-3 text-xs sm:text-sm">Liabilities</h3>
          {liabilityBreakdown.length > 0 ? (
            <div className={`flex ${isMobile ? "items-center gap-4" : "flex-col items-center gap-2"}`}>
              <ResponsiveContainer width={isMobile ? "50%" : "100%"} height={donutHeight}>
                <PieChart>
                  <Pie data={liabilityBreakdown} cx="50%" cy="50%" innerRadius={donutInner} outerRadius={donutOuter} dataKey="value" stroke="none" activeIndex={-1}>
                    {liabilityBreakdown.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />))}
                  </Pie>
                  <Tooltip content={<DonutTooltip total={liabilityTotal} currency={baseCurrency} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 w-full">
                {liabilityBreakdown.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-medium text-foreground shrink-0 text-xs">
                      {formatCompactCurrency(item.value, baseCurrency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs py-8 text-center">No liabilities</p>
          )}
        </div>
      </div>

      {/* Line & Bar Charts — full width stacked, 2-col on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Net Worth Trend */}
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-foreground mb-4 text-sm">Net Worth Trend</h3>
          {trendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={trendData} margin={{ left: isMobile ? -10 : 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: isMobile ? 9 : 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} interval={isMobile ? "preserveStartEnd" : undefined} />
                <YAxis tick={{ fontSize: isMobile ? 9 : 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} width={isMobile ? 40 : 60} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))", fontSize: isMobile ? 11 : 12 }} formatter={(value: number) => [formatCurrency(value, baseCurrency), "Net Worth"]} labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                <Line type="monotone" dataKey="netWorth" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-muted-foreground text-sm">Current: <span className="font-medium text-foreground">{formatCurrency(netWorth, baseCurrency)}</span></p>
              <p className="text-muted-foreground text-xs mt-1">Trend appears as transactions accumulate</p>
            </div>
          )}
        </div>

        {/* Cash Flow Trend */}
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-foreground mb-4 text-sm">Cash Flow Trend</h3>
          {cashFlowTrend.some((d) => d.income > 0 || d.expenses > 0) ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={cashFlowTrend} margin={{ left: isMobile ? -10 : 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: isMobile ? 9 : 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: isMobile ? 9 : 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} width={isMobile ? 40 : 60} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))", fontSize: isMobile ? 11 : 12 }} formatter={(value: number, name: string) => [formatCurrency(value, baseCurrency), name === "income" ? "Income" : "Expenses"]} />
                <Legend formatter={(value) => (value === "income" ? "Income" : "Expenses")} wrapperStyle={{ fontSize: isMobile ? 10 : 12 }} />
                <Line type="monotone" dataKey="income" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="income" />
                <Line type="monotone" dataKey="expenses" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} name="expenses" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-10 text-center">Add income and expenses to see trend</p>
          )}
        </div>

        {/* Monthly Expense Breakdown */}
        <div className="glass-card rounded-xl p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground text-sm">Monthly Expense Breakdown</h3>
            {totalMonthlyExpenses > 0 && (
              <span className="text-sm font-semibold text-primary">{formatCurrency(totalMonthlyExpenses, baseCurrency)}</span>
            )}
          </div>
          {expenseChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={chartHeight + 40}>
              <BarChart data={expenseChartData} margin={{ left: isMobile ? -10 : 0, right: 8, top: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: isMobile ? 8 : 11, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 60 : 30}
                />
                <YAxis tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--muted-foreground))" }} width={isMobile ? 40 : 60} />
                <Tooltip content={<ExpenseTooltipContent />} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={isMobile ? 24 : 36}>
                  {expenseChartData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.fill || "hsl(var(--primary))"} />
                  ))}
                  <LabelList content={<CustomBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-10 text-center">Add expenses to see breakdown</p>
          )}
        </div>
      </div>

      {/* AI Financial Insights */}
      <AiInsights
        context="dashboard"
        financialData={{
          totalIncome: avgMonthlyIncome,
          totalExpenses: avgMonthlyExpenses,
          savingsRate: avgMonthlyIncome > 0 ? Number((((avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome) * 100).toFixed(1)) : 0,
          totalInvestments: stats.investments,
          totalLiabilities: stats.liabilities,
          netWorth,
          expenseRatio: avgMonthlyIncome > 0 ? Number(((avgMonthlyExpenses / avgMonthlyIncome) * 100).toFixed(1)) : 0,
          portfolioReturn,
          allocation,
          topExpenseCategories: monthlyExpenses.slice(0, 5),
        }}
        currency={baseCurrency}
      />
    </div>
  );
};

export default Dashboard;
