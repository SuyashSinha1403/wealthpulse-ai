import { useEffect, useState, useMemo, useCallback } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency, SUPPORTED_CURRENCIES } from "@/hooks/useBaseCurrency";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { formatCurrency } from "@/lib/formatCurrency";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, DollarSign, TrendingDown, PiggyBank, Percent, ArrowDownUp, ChevronDown, Upload } from "lucide-react";
import { ImportCashFlowDialog } from "@/components/ImportCashFlowDialog";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { CashFlowAnalytics } from "@/components/CashFlowAnalytics";
import { useIsMobile } from "@/hooks/use-mobile";
import { ExpensesSection } from "@/components/ExpensesSection";
import { CashFlowFilters, type RangeOption, type MetricMode, getDateRange } from "@/components/CashFlowFilters";
import { AiInsightsSection } from "@/components/AiInsightsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const INCOME_SOURCES = ["Salary", "Freelance", "Business", "Dividends", "Interest", "Other"];
const FREQUENCIES = ["Monthly", "Quarterly", "Yearly", "One-time"];

interface IncomeEntry {
  id: string;
  source_name: string;
  amount: number;
  currency: string;
  fx_rate: number | null;
  base_currency_value: number;
  frequency: string;
  date_received: string;
  notes: string | null;
}

interface ExpenseSummary {
  amount: number;
  base_currency_value: number;
  date: string;
  category: string;
}

function toMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "Quarterly": return amount / 3;
    case "Yearly": return amount / 12;
    case "One-time": return 0;
    default: return amount;
  }
}

const CashFlow = () => {
  const { user, loading } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const { fetchRates, getRate } = useExchangeRates();
  const isMobile = useIsMobile();

  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [incomeListOpen, setIncomeListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Filter state
  const [range, setRange] = useState<RangeOption>("this_month");
  const [metric, setMetric] = useState<MetricMode>("average");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  const [form, setForm] = useState({
    source_name: "Salary",
    amount: "",
    currency: "INR" as string,
    frequency: "Monthly",
    date_received: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const fetchData = useCallback(async () => {
    if (loading) return;

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("Current user:", authUser?.id);
    console.log("AUTH USER UUID:", authUser?.id);

    if (authError) {
      console.error("Cash flow auth lookup failed", authError);
      toast.error(authError.message || "Failed to verify current user");
      return;
    }

    if (!authUser) return;

    const [incRes, expRes] = await Promise.all([
      (async () => {
        console.log("Querying income_entries for:", authUser?.id);
        const result = await supabase
          .from("income_entries")
          .select("*")
          .eq("user_id", authUser.id)
          .order("date_received", { ascending: false });
        console.log("Income entry rows:", result.data?.length ?? 0, result.error ?? null);
        return result;
      })(),
      (async () => {
        console.log("Querying expenses for:", authUser?.id);
        const result = await supabase
          .from("expenses")
          .select("amount, base_currency_value, date, category")
          .eq("user_id", authUser.id);
        console.log("Expense rows:", result.data?.length ?? 0, result.error ?? null);
        return result;
      })(),
    ]);

    console.log("Cash flow query result:", {
      incomeEntries: incRes.data,
      expenses: expRes.data,
    });

    const anyError = incRes.error || expRes.error;
    if (anyError) {
      console.error("Cash flow query failed", anyError);
      toast.error(anyError.message || "Failed to load cash flow data");
      return;
    }

    setIncomeEntries((incRes.data as IncomeEntry[]) || []);
    setExpenses((expRes.data as ExpenseSummary[]) || []);
  }, [loading]);

  useEffect(() => {
    if (loading || !user) return;
    fetchData();
  }, [fetchData, loading, user]);

  const resetForm = () => {
    setForm({ source_name: "Salary", amount: "", currency: baseCurrency, frequency: "Monthly", date_received: new Date().toISOString().split("T")[0], notes: "" });
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = Number(form.amount);
    let fxRate = 1;
    if (form.currency !== baseCurrency) {
      try {
        const url = `${SUPABASE_URL}/functions/v1/exchange-rate?pairs=${form.currency}-${baseCurrency}`;
        const res = await fetch(url, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
        const json = await res.json();
        fxRate = json.data?.[`${form.currency}-${baseCurrency}`]?.rate || getRate(form.currency, baseCurrency) || 1;
      } catch {
        fxRate = getRate(form.currency, baseCurrency) || 1;
      }
    }
    const baseValue = amount * fxRate;

    const payload = {
      user_id: user.id,
      source_name: form.source_name,
      amount,
      currency: form.currency,
      fx_rate: fxRate,
      base_currency_value: baseValue,
      frequency: form.frequency,
      date_received: form.date_received,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await supabase.from("income_entries").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Income updated");
    } else {
      const { error } = await supabase.from("income_entries").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Income added");
    }

    setOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("income_entries").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); } else { toast.success("Deleted"); }
    setDeleteId(null);
    fetchData();
  };

  const handleEdit = (entry: IncomeEntry) => {
    setEditing(entry);
    setForm({
      source_name: entry.source_name,
      amount: entry.amount.toString(),
      currency: entry.currency,
      frequency: entry.frequency,
      date_received: entry.date_received,
      notes: entry.notes || "",
    });
    setOpen(true);
  };

  const handleExpenseChange = useCallback(() => {
    fetchData();
    setRefreshKey(k => k + 1);
  }, [fetchData]);

  // Date range
  const { start: rangeStart, end: rangeEnd, monthCount } = useMemo(
    () => getDateRange(range, customStart, customEnd),
    [range, customStart, customEnd]
  );

  const filteredIncome = useMemo(() => {
    return incomeEntries.filter(e => {
      const d = new Date(e.date_received);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [incomeEntries, rangeStart, rangeEnd]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [expenses, rangeStart, rangeEnd]);

  const totalIncome = useMemo(() => {
    return filteredIncome.reduce((s, e) => s + toMonthlyEquivalent(Number(e.base_currency_value), e.frequency), 0);
  }, [filteredIncome]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0);
  }, [filteredExpenses]);

  const totalSavings = totalIncome - totalExpenses;

  const displayIncome = metric === "average" ? totalIncome / monthCount : totalIncome;
  const displayExpenses = metric === "average" ? totalExpenses / monthCount : totalExpenses;
  const displaySavings = metric === "average" ? totalSavings / monthCount : totalSavings;
  const savingsRate = displayIncome > 0 ? ((displaySavings / displayIncome) * 100).toFixed(1) : "0.0";

  const cardPrefix = metric === "average" ? "Avg Monthly " : "";

  // Chart: actual monthly values for each month in range
  const chartData = useMemo(() => {
    const months: { label: string; month: number; year: number }[] = [];
    const startMonth = rangeStart.getMonth();
    const startYear = rangeStart.getFullYear();
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(startYear, startMonth + i, 1);
      months.push({
        label: d.toLocaleString("default", { month: "short", year: monthCount > 6 ? "2-digit" : undefined }),
        month: d.getMonth(),
        year: d.getFullYear(),
      });
    }

    return months.map(m => {
      const inc = incomeEntries
        .filter(e => {
          const d = new Date(e.date_received);
          return d.getMonth() === m.month && d.getFullYear() === m.year;
        })
        .reduce((s, e) => s + toMonthlyEquivalent(Number(e.base_currency_value), e.frequency), 0);

      const exp = expenses
        .filter(e => {
          const d = new Date(e.date);
          return d.getMonth() === m.month && d.getFullYear() === m.year;
        })
        .reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0);

      return { name: m.label, Income: Math.round(inc), Expenses: Math.round(exp), Savings: Math.round(inc - exp) };
    });
  }, [incomeEntries, expenses, rangeStart, monthCount]);

  // Income sources aggregation (from filtered data)
  const incomeSources = useMemo(() => {
    const map: Record<string, number> = {};
    filteredIncome.forEach(e => {
      const monthly = toMonthlyEquivalent(Number(e.base_currency_value), e.frequency);
      map[e.source_name] = (map[e.source_name] || 0) + monthly;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredIncome]);

  const fxPreview = form.amount && form.currency !== baseCurrency ? (() => {
    const rate = getRate(form.currency, baseCurrency);
    if (!rate) return null;
    return `${form.currency} ${Number(form.amount).toLocaleString()} = ${formatCurrency(Number(form.amount) * rate, baseCurrency)} @ ${rate.toFixed(4)}`;
  })() : null;

  const chartHeight = isMobile ? 220 : 280;

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Cash Flow</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">Track income, expenses & savings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size={isMobile ? "sm" : "default"} className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            {!isMobile && "Import Statement"}
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size={isMobile ? "sm" : "default"} className="gradient-primary text-primary-foreground gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {!isMobile && "Add Income"}
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Income</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source_name} onValueChange={v => setForm(f => ({ ...f, source_name: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INCOME_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => { setForm(f => ({ ...f, currency: v })); if (v !== baseCurrency) fetchRates([{ from: v, to: baseCurrency }]); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
              </div>
              {fxPreview && <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg">{fxPreview}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date Received</Label>
                  <Input type="date" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground">{editing ? "Update" : "Add"} Income</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <ImportCashFlowDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        userId={user?.id || ""}
        baseCurrency={baseCurrency}
        existingIncome={incomeEntries.map(e => ({ source_name: e.source_name, amount: e.amount, date_received: e.date_received }))}
        existingExpenses={expenses.map(e => ({ category: e.category, amount: e.amount, date: e.date }))}
        getRate={getRate}
        onImportComplete={() => { fetchData(); setRefreshKey(k => k + 1); }}
      />

      {/* Filters */}
      <CashFlowFilters
        range={range} onRangeChange={setRange}
        metric={metric} onMetricChange={setMetric}
        customStart={customStart} customEnd={customEnd}
        onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title={`${cardPrefix}Income`} value={formatCurrency(displayIncome, baseCurrency)} icon={DollarSign} />
        <StatCard title={`${cardPrefix}Expenses`} value={formatCurrency(displayExpenses, baseCurrency)} icon={TrendingDown} />
        <StatCard title={`${cardPrefix}Savings`} value={formatCurrency(displaySavings, baseCurrency)} icon={PiggyBank}
          trend={displaySavings !== 0 ? { value: formatCurrency(Math.abs(displaySavings), baseCurrency), positive: displaySavings > 0 } : undefined}
        />
        <StatCard title="Savings Rate" value={`${savingsRate}%`} icon={Percent} />
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-sm mx-auto h-10">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="income" className="text-xs sm:text-sm">Income</TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs sm:text-sm">Expenses</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-5 mt-5">
          {/* Cash Flow Chart */}
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <h3 className="font-semibold text-foreground text-sm sm:text-base mb-4">Income vs Expenses</h3>
            {chartData.some(d => d.Income > 0 || d.Expenses > 0) ? (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={chartData} margin={{ left: isMobile ? -15 : 0, right: 4, top: 4, bottom: 0 }} barGap={isMobile ? 2 : 4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: isMobile ? 9 : 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} width={isMobile ? 35 : 60} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))", fontSize: isMobile ? 11 : 12 }}
                    formatter={(value: number, name: string) => [formatCurrency(value, baseCurrency), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? 10 : 12, paddingTop: 8 }} />
                  <Bar dataKey="Income" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} barSize={isMobile ? 16 : 28} />
                  <Bar dataKey="Expenses" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} barSize={isMobile ? 16 : 28} />
                  <Bar dataKey="Savings" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} barSize={isMobile ? 16 : 28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Add income entries to see cash flow trends</p>
              </div>
            )}
          </div>

          {/* Analytics */}
          <CashFlowAnalytics expenses={expenses as any} incomeEntries={incomeEntries as any} baseCurrency={baseCurrency} />
        </TabsContent>

        {/* Income Tab */}
        <TabsContent value="income" className="space-y-5 mt-5">
          {/* Income Sources */}
          <div className="glass-card rounded-xl p-4 sm:p-6">
            <h3 className="font-semibold text-foreground text-sm sm:text-base mb-4">Income Sources</h3>
            {incomeSources.length > 0 ? (
              <div className="space-y-2">
                {incomeSources.map((s, i) => {
                  const totalVal = incomeSources.reduce((sum, x) => sum + x.value, 0);
                  const pct = totalVal > 0 ? ((s.value / totalVal) * 100).toFixed(0) : "0";
                  return (
                    <div key={s.name} className="flex items-center gap-3 p-3 rounded-lg bg-accent/5 hover:bg-accent/10 transition-colors">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `hsl(var(--chart-${(i % 5) + 1}) / 0.15)` }}>
                        <DollarSign className="h-3.5 w-3.5" style={{ color: `hsl(var(--chart-${(i % 5) + 1}))` }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                          <span className="font-semibold text-foreground text-sm">{formatCurrency(s.value, baseCurrency)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: `hsl(var(--chart-${(i % 5) + 1}))` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-sm">No income sources yet</p>
              </div>
            )}
          </div>

          {/* Income Entries List (Collapsible) */}
          {incomeEntries.length > 0 && (
            <Collapsible open={incomeListOpen} onOpenChange={setIncomeListOpen}>
              <div className="glass-card rounded-xl p-4 sm:p-6">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent mb-3">
                    <h3 className="font-semibold text-foreground text-sm sm:text-base">All Income ({incomeEntries.length})</h3>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${incomeListOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2">
                  {incomeEntries.map(entry => (
                    <div key={entry.id} className="rounded-lg p-3 bg-accent/5 hover:bg-accent/10 transition-colors flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                          <ArrowDownUp className="h-3.5 w-3.5 text-accent-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{entry.source_name}{entry.notes ? ` — ${entry.notes}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{entry.date_received} · {entry.frequency}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="font-semibold text-foreground text-sm">{formatCurrency(Number(entry.amount), entry.currency)}</span>
                          {entry.currency !== baseCurrency && (
                            <p className="text-xs text-muted-foreground">≈ {formatCurrency(Number(entry.base_currency_value), baseCurrency)}</p>
                          )}
                        </div>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(entry)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(entry.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-5 mt-5">
          <ExpensesSection onExpenseChange={handleExpenseChange} />
        </TabsContent>
      </Tabs>

      {/* AI Insights */}
      <AiInsightsSection context="cashflow" />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Income Entry</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The income entry will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CashFlow;
