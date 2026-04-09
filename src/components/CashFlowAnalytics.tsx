import { useMemo } from "react";
import { formatCurrency } from "@/lib/formatCurrency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { TrendingUp, TrendingDown, AlertTriangle, Percent } from "lucide-react";

interface ExpenseRow {
  amount: number;
  base_currency_value: number;
  date: string;
  category: string;
}

interface IncomeRow {
  base_currency_value: number;
  frequency: string;
  date_received: string;
}

function toMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "Quarterly": return amount / 3;
    case "Yearly": return amount / 12;
    case "One-time": return 0;
    default: return amount;
  }
}

interface Props {
  expenses: ExpenseRow[];
  incomeEntries: IncomeRow[];
  baseCurrency: string;
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
};

export function CashFlowAnalytics({ expenses, incomeEntries, baseCurrency }: Props) {
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 220 : 250;

  // Last 6 months spending trend
  const monthlySpending = useMemo(() => {
    const monthMap: Record<string, number> = {};
    expenses.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap[key] = (monthMap[key] || 0) + Number(e.base_currency_value || e.amount);
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({ month, amount: Math.round(amount) }));
  }, [expenses]);

  // Top 5 categories
  const topCategories = useMemo(() => {
    const catMap: Record<string, number> = {};
    expenses.forEach((e) => {
      catMap[e.category] = (catMap[e.category] || 0) + Number(e.base_currency_value || e.amount);
    });
    return Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [expenses]);

  // Expense growth rate (current vs previous month)
  const expenseGrowth = useMemo(() => {
    if (monthlySpending.length < 2) return null;
    const current = monthlySpending[monthlySpending.length - 1].amount;
    const previous = monthlySpending[monthlySpending.length - 2].amount;
    if (previous === 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return { pct, current, previous };
  }, [monthlySpending]);

  // Expense to income ratio (current month)
  const expenseToIncomeRatio = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const monthExpense = expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === curMonth && d.getFullYear() === curYear;
      })
      .reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0);

    const monthIncome = incomeEntries
      .filter((e) => {
        const d = new Date(e.date_received);
        return d.getMonth() === curMonth && d.getFullYear() === curYear;
      })
      .reduce((s, e) => s + toMonthlyEquivalent(Number(e.base_currency_value), e.frequency), 0);

    if (monthIncome <= 0) return null;
    return { ratio: (monthExpense / monthIncome) * 100, expense: monthExpense, income: monthIncome };
  }, [expenses, incomeEntries]);

  // Find the earliest data point across expenses and income
  const earliestDataMonth = useMemo(() => {
    let earliest: Date | null = null;
    expenses.forEach(e => {
      const d = new Date(e.date);
      if (!earliest || d < earliest) earliest = d;
    });
    incomeEntries.forEach(e => {
      const d = new Date(e.date_received);
      if (!earliest || d < earliest) earliest = d;
    });
    return earliest;
  }, [expenses, incomeEntries]);

  // Generate month keys from earliest data to now (max 6 months)
  const dataMonths = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    if (!earliestDataMonth) return months;

    const startDate = new Date(
      Math.max(
        earliestDataMonth.getTime(),
        new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime()
      )
    );
    const startMonth = startDate.getMonth();
    const startYear = startDate.getFullYear();
    const endMonth = now.getMonth();
    const endYear = now.getFullYear();

    let y = startYear, m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return months;
  }, [earliestDataMonth]);

  // Savings rate trend (only months with data)
  const savingsRateTrend = useMemo(() => {
    if (dataMonths.length === 0) return [];

    return dataMonths.map((key) => {
      const [y, m] = key.split("-").map(Number);

      const exp = expenses
        .filter((e) => {
          const d = new Date(e.date);
          return d.getMonth() === m - 1 && d.getFullYear() === y;
        })
        .reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0);

      const inc = incomeEntries
        .filter((e) => {
          const d = new Date(e.date_received);
          return d.getMonth() === m - 1 && d.getFullYear() === y;
        })
        .reduce((s, e) => s + toMonthlyEquivalent(Number(e.base_currency_value), e.frequency), 0);

      const savings = inc - exp;
      const rate = inc > 0 ? (savings / inc) * 100 : 0;
      const label = new Date(y, m - 1).toLocaleString("default", { month: "short" });
      return { name: label, rate: Math.round(rate * 10) / 10 };
    });
  }, [expenses, incomeEntries, dataMonths]);

  // Category spending trend (top 3 categories, only months with data)
  const categoryTrend = useMemo(() => {
    const topCats = topCategories.slice(0, 3).map((c) => c.category);
    if (topCats.length === 0 || dataMonths.length === 0) return [];

    return dataMonths.map((key) => {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1).toLocaleString("default", { month: "short" });
      const row: Record<string, any> = { name: label };
      for (const cat of topCats) {
        row[cat] = Math.round(
          expenses
            .filter((e) => {
              const d = new Date(e.date);
              return d.getMonth() === m - 1 && d.getFullYear() === y && e.category === cat;
            })
            .reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0)
        );
      }
      return row;
    });
  }, [expenses, topCategories, dataMonths]);

  const topCatNames = topCategories.slice(0, 3).map((c) => c.category);
  const catColors = ["hsl(var(--chart-1))", "hsl(var(--chart-3))", "hsl(var(--chart-7)))", "hsl(var(--chart-7))"];

  const ratioColor = expenseToIncomeRatio
    ? expenseToIncomeRatio.ratio > 70
      ? "text-destructive"
      : expenseToIncomeRatio.ratio > 50
      ? "text-yellow-500"
      : "text-primary"
    : "text-muted-foreground";

  const hasData = expenses.length > 0;
  if (!hasData) return null;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Spending Analytics</h2>

      {/* Row 1: Expense Growth + Expense-to-Income Ratio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {expenseGrowth && (
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              {expenseGrowth.pct >= 0 ? (
                <TrendingUp className="h-4 w-4 text-destructive" />
              ) : (
                <TrendingDown className="h-4 w-4 text-primary" />
              )}
              <h3 className="font-semibold text-foreground text-sm">Expense Growth</h3>
            </div>
            <p className={`text-2xl font-bold ${expenseGrowth.pct >= 0 ? "text-destructive" : "text-primary"}`}>
              {expenseGrowth.pct >= 0 ? "+" : ""}{expenseGrowth.pct.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Expenses {expenseGrowth.pct >= 0 ? "increased" : "decreased"} vs last month
            </p>
          </div>
        )}

        {expenseToIncomeRatio && (
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground text-sm">Expense-to-Income Ratio</h3>
            </div>
            <p className={`text-2xl font-bold ${ratioColor}`}>
              {expenseToIncomeRatio.ratio.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {expenseToIncomeRatio.ratio > 70
                ? "High — consider reducing expenses"
                : expenseToIncomeRatio.ratio > 50
                ? "Moderate spending level"
                : "Healthy spending level"}
            </p>
          </div>
        )}
      </div>

      {/* Row 2: Monthly Spending Trend + Top Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-foreground mb-4 text-sm">Monthly Spending Trend</h3>
          {monthlySpending.length > 0 ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={monthlySpending}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [formatCurrency(value, baseCurrency), "Expenses"]} />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-10 text-center">No data yet</p>
          )}
        </div>

        <div className="glass-card rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-foreground mb-4 text-sm">Top Expense Categories</h3>
          {topCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={topCategories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <YAxis dataKey="category" type="category" width={80} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [formatCurrency(value, baseCurrency), "Spent"]} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-10 text-center">No data yet</p>
          )}
        </div>
      </div>

      {/* Row 3: Savings Rate Trend + Category Spending Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-foreground mb-4 text-sm">Savings Rate Trend</h3>
          {savingsRateTrend.some((d) => d.rate !== 0) ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={savingsRateTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}%`, "Savings Rate"]} />
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ fill: "hsl(var(--chart-1))" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-10 text-center">No data yet</p>
          )}
        </div>

        {categoryTrend.length > 0 && topCatNames.length > 0 && (
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <h3 className="font-semibold text-foreground mb-4 text-sm">Category Spending Trend</h3>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={categoryTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [formatCurrency(value, baseCurrency), name]} />
                <Legend />
                {topCatNames.map((cat, i) => (
                  <Line key={cat} type="monotone" dataKey={cat} stroke={catColors[i]} strokeWidth={2} dot={{ fill: catColors[i] }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
