import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency, SUPPORTED_CURRENCIES } from "@/hooks/useBaseCurrency";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, AlertTriangle, TrendingDown, Calculator, BarChart3, Landmark, CreditCard, Upload } from "lucide-react";
import { ImportLiabilitiesDialog } from "@/components/ImportLiabilitiesDialog";
import { toast } from "sonner";
import { AiInsightsSection } from "@/components/AiInsightsSection";
import { LoanPlanner } from "@/components/LoanPlanner";
import { LoanAnalytics } from "@/components/LoanAnalytics";
import { DebtHealthMetrics } from "@/components/DebtHealthMetrics";
import { PrototypeSyncPanel } from "@/components/PrototypeSyncPanel";
import { getLoanStatus, isRevolvingCredit, REVOLVING_TYPES } from "@/lib/loanCalculations";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

const LOAN_TYPES = ["Home Loan", "Car Loan", "Personal Loan", "Education Loan", "Other"];
const REVOLVING_CREDIT_TYPES = ["Credit Card", "Overdraft", "Line of Credit"];
const ALL_LIABILITY_TYPES = [...LOAN_TYPES, ...REVOLVING_CREDIT_TYPES];

export interface Liability {
  id: string; liability_type: string; outstanding_amount: number; monthly_payment: number;
  interest_rate: number; notes: string | null; currency: string; fx_rate: number | null; base_currency_value: number;
  original_loan_amount: number; loan_tenure_months: number | null; loan_start_date: string | null; lender_name: string | null;
  credit_limit: number; min_payment_percent: number;
}

type LiabilityRow = Database["public"]["Tables"]["liabilities"]["Row"];
type LiabilityInsert = Database["public"]["Tables"]["liabilities"]["Insert"];

const Liabilities = () => {
  const { user, loading } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const { fetchRates, getRate } = useExchangeRates();
  const [items, setItems] = useState<Liability[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addType, setAddType] = useState<"loan" | "credit_card" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({
    liability_type: "Home Loan", outstanding_amount: "", monthly_payment: "", interest_rate: "",
    notes: "", currency: "INR" as string, original_loan_amount: "", loan_tenure_months: "",
    loan_start_date: undefined as Date | undefined, lender_name: "",
    credit_limit: "", min_payment_percent: "5",
  });

  const isRevolving = isRevolvingCredit(form.liability_type);

  const fetchData = async () => {
    if (loading) return;

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("Current user:", authUser?.id);

    if (authError) {
      console.error("Liabilities auth lookup failed", authError);
      toast.error(authError.message || "Failed to verify current user");
      return;
    }

    if (!authUser) return;

    const { data, error } = await supabase
      .from("liabilities")
      .select("*")
      .eq("user_id", authUser.id)
      .order("created_at");

    console.log("Liabilities query result:", data);

    if (error) {
      console.error("Liabilities query failed", error);
      toast.error(error.message || "Failed to load liabilities");
      return;
    }

    const liabs = ((data as LiabilityRow[] | null) || []).map((d) => ({
      ...d,
      original_loan_amount: Number(d.original_loan_amount || 0),
      loan_tenure_months: d.loan_tenure_months ? Number(d.loan_tenure_months) : null,
      loan_start_date: d.loan_start_date || null,
      lender_name: d.lender_name || null,
      credit_limit: Number(d.credit_limit || 0),
      min_payment_percent: Number(d.min_payment_percent || 5),
    })) as Liability[];
    setItems(liabs);
    const pairs = liabs.filter(l => l.currency !== baseCurrency).map(l => ({ from: l.currency, to: baseCurrency }));
    if (pairs.length > 0) fetchRates(pairs);
  };

  useEffect(() => {
    if (loading || !user) return;
    fetchData();
  }, [baseCurrency, loading, user]);

  const resetForm = () => {
    setForm({
      liability_type: "Home Loan", outstanding_amount: "", monthly_payment: "", interest_rate: "",
      notes: "", currency: baseCurrency, original_loan_amount: "", loan_tenure_months: "",
      loan_start_date: undefined, lender_name: "",
      credit_limit: "", min_payment_percent: "5",
    });
    setEditing(null);
    setAddType(null);
  };

  const openAddDialog = (type: "loan" | "credit_card") => {
    resetForm();
    setAddType(type);
    if (type === "credit_card") {
      setForm(f => ({ ...f, liability_type: "Credit Card" }));
    }
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const outstanding = Number(form.outstanding_amount);
    const fxRate = form.currency === baseCurrency ? 1 : getRate(form.currency, baseCurrency);
    const baseValue = fxRate ? outstanding * fxRate : outstanding;

    const payload: LiabilityInsert = {
      user_id: user.id, liability_type: form.liability_type,
      outstanding_amount: outstanding, monthly_payment: Number(form.monthly_payment),
      interest_rate: Number(form.interest_rate), notes: form.notes || null,
      currency: form.currency, fx_rate: fxRate || null, base_currency_value: baseValue,
      original_loan_amount: isRevolving ? 0 : (Number(form.original_loan_amount) || outstanding),
      loan_tenure_months: isRevolving ? null : (form.loan_tenure_months ? Number(form.loan_tenure_months) : null),
      loan_start_date: isRevolving ? null : (form.loan_start_date ? format(form.loan_start_date, "yyyy-MM-dd") : null),
      lender_name: form.lender_name || null,
      credit_limit: isRevolving ? Number(form.credit_limit) || 0 : 0,
      min_payment_percent: isRevolving ? Number(form.min_payment_percent) || 5 : 5,
    };
    if (editing) {
      const { error } = await supabase.from("liabilities").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("liabilities").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(editing ? "Updated" : "Added");
    setOpen(false); resetForm(); fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("liabilities").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); } else { toast.success("Deleted"); }
    setDeleteId(null);
    fetchData();
  };

  const handleEdit = (l: Liability) => {
    setEditing(l);
    setAddType(isRevolvingCredit(l.liability_type) ? "credit_card" : "loan");
    setForm({
      liability_type: l.liability_type, outstanding_amount: l.outstanding_amount.toString(),
      monthly_payment: l.monthly_payment.toString(), interest_rate: l.interest_rate.toString(),
      notes: l.notes || "", currency: l.currency || baseCurrency,
      original_loan_amount: l.original_loan_amount ? l.original_loan_amount.toString() : "",
      loan_tenure_months: l.loan_tenure_months ? l.loan_tenure_months.toString() : "",
      loan_start_date: l.loan_start_date ? new Date(l.loan_start_date) : undefined,
      lender_name: l.lender_name || "",
      credit_limit: l.credit_limit ? l.credit_limit.toString() : "",
      min_payment_percent: l.min_payment_percent ? l.min_payment_percent.toString() : "5",
    });
    setOpen(true);
  };

  const getBaseValue = (l: Liability) => {
    if (l.currency === baseCurrency) return Number(l.outstanding_amount);
    const rate = getRate(l.currency, baseCurrency);
    return rate ? Number(l.outstanding_amount) * rate : Number(l.base_currency_value);
  };

  const total = items.reduce((s, l) => s + getBaseValue(l), 0);
  const totalMonthly = items.reduce((s, l) => {
    if (l.currency === baseCurrency) return s + Number(l.monthly_payment);
    const rate = getRate(l.currency, baseCurrency);
    return s + Number(l.monthly_payment) * (rate || 1);
  }, 0);

  const highInterestCount = items.filter(l =>
    isRevolvingCredit(l.liability_type) ? l.interest_rate >= 30 : l.interest_rate >= 15
  ).length;

  const fxPreview = form.outstanding_amount && form.currency !== baseCurrency ? (() => {
    const rate = getRate(form.currency, baseCurrency);
    if (!rate) return null;
    return `${form.currency} ${Number(form.outstanding_amount).toLocaleString()} = ${formatCurrency(Number(form.outstanding_amount) * rate, baseCurrency)} @ ${rate.toFixed(4)}`;
  })() : null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Debt Management</h1>
          <p className="text-muted-foreground text-sm">Track loans, credit cards & repayment analytics</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" className="gradient-primary text-primary-foreground gap-1.5 h-9">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Liability</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-2" align="end">
              <Button variant="ghost" className="w-full justify-start text-sm gap-2" onClick={() => openAddDialog("loan")}>
                <Landmark className="h-4 w-4" /> Loan
              </Button>
              <Button variant="ghost" className="w-full justify-start text-sm gap-2" onClick={() => openAddDialog("credit_card")}>
                <CreditCard className="h-4 w-4" /> Credit Card
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <PrototypeSyncPanel
        title="Sync loans and credit cards"
        description="For the prototype, this shows how WealthPulse would pull liability data from lenders and credit bureaus to keep debt plans accurate."
        actions={[
          { label: "Sync credit cards", detail: "Outstanding, due date, limit" },
          { label: "Sync home loan", detail: "EMI, tenure, rate changes" },
          { label: "Sync education loan", detail: "Moratorium and EMI plan" },
          { label: "Upload loan statement", detail: "PDF/CSV fallback" },
        ]}
        footnote="This is read-only and advisory. WealthPulse does not initiate repayments or change loan terms."
      />

      <ImportLiabilitiesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        userId={user?.id || ""}
        baseCurrency={baseCurrency}
        existingLiabilities={items.map(l => ({
          liability_type: l.liability_type,
          outstanding_amount: l.outstanding_amount,
          interest_rate: l.interest_rate,
          currency: l.currency,
          loan_start_date: l.loan_start_date,
          lender_name: l.lender_name,
        }))}
        getRate={getRate}
        onImportComplete={fetchData}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {isRevolving ? "Credit Card" : "Loan"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRevolving ? "Type" : "Loan Type"}</Label>
                <Select value={form.liability_type} onValueChange={v => setForm(f => ({ ...f, liability_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(addType === "credit_card" ? REVOLVING_CREDIT_TYPES : LOAN_TYPES).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={v => { setForm(f => ({ ...f, currency: v })); if (v !== baseCurrency) fetchRates([{ from: v, to: baseCurrency }]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {isRevolving ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Outstanding Balance</Label>
                    <Input type="number" value={form.outstanding_amount} onChange={e => setForm(f => ({ ...f, outstanding_amount: e.target.value }))} required placeholder="Current balance" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Credit Limit</Label>
                    <Input type="number" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="e.g. 100000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Interest % (Annual)</Label>
                    <Input type="number" step="0.01" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} required placeholder="e.g. 36" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Payment %</Label>
                    <Input type="number" step="0.1" value={form.min_payment_percent} onChange={e => setForm(f => ({ ...f, min_payment_percent: e.target.value }))} placeholder="5" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Monthly Payment</Label>
                    <Input type="number" value={form.monthly_payment} onChange={e => setForm(f => ({ ...f, monthly_payment: e.target.value }))} required placeholder="Actual payment" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Original Loan Amount</Label>
                    <Input type="number" value={form.original_loan_amount} onChange={e => setForm(f => ({ ...f, original_loan_amount: e.target.value }))} placeholder="Total borrowed" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Current Outstanding</Label>
                    <Input type="number" value={form.outstanding_amount} onChange={e => setForm(f => ({ ...f, outstanding_amount: e.target.value }))} required placeholder="Remaining balance" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Monthly EMI</Label>
                    <Input type="number" value={form.monthly_payment} onChange={e => setForm(f => ({ ...f, monthly_payment: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Interest %</Label>
                    <Input type="number" step="0.01" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tenure (months)</Label>
                    <Input type="number" value={form.loan_tenure_months} onChange={e => setForm(f => ({ ...f, loan_tenure_months: e.target.value }))} placeholder="e.g. 120" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs", !form.loan_start_date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {form.loan_start_date ? format(form.loan_start_date, "PPP") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={form.loan_start_date} onSelect={d => setForm(f => ({ ...f, loan_start_date: d }))} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lender</Label>
                    <Input value={form.lender_name} onChange={e => setForm(f => ({ ...f, lender_name: e.target.value }))} placeholder="e.g. SBI, HDFC" />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">{isRevolving ? "Card Name / Issuer" : "Lender"}</Label>
              <Input value={form.lender_name} onChange={e => setForm(f => ({ ...f, lender_name: e.target.value }))} placeholder={isRevolving ? "e.g. HDFC Credit Card" : "e.g. SBI, HDFC"} />
            </div>
            {fxPreview && <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg">{fxPreview}</p>}
            <div className="space-y-1"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground">{editing ? "Update" : "Add"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-4 w-4 text-destructive" /><p className="text-xs text-muted-foreground">Total Debt</p></div>
          <p className="text-lg font-bold text-destructive">{formatCurrency(total, baseCurrency)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><Landmark className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Monthly Payments</p></div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(totalMonthly, baseCurrency)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><BarChart3 className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Active Debts</p></div>
          <p className="text-lg font-bold text-foreground">{items.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-destructive" /><p className="text-xs text-muted-foreground">High Interest</p></div>
          <p className="text-lg font-bold text-destructive">{highInterestCount}</p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="loans" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="loans" className="text-xs">Loans</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
          <TabsTrigger value="planner" className="text-xs">Planner</TabsTrigger>
          <TabsTrigger value="health" className="text-xs">Health</TabsTrigger>
        </TabsList>

        {/* TAB: Loans */}
        <TabsContent value="loans" className="space-y-3 mt-3">
          {items.map(l => {
            const revolving = isRevolvingCredit(l.liability_type);
            return (
              <div key={l.id} className="glass-card rounded-xl p-4 flex items-center justify-between group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", revolving ? "bg-chart-2/10" : "bg-destructive/10")}>
                    {revolving ? <CreditCard className="h-4 w-4 text-chart-2" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">
                      {l.lender_name || l.liability_type}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {l.liability_type} · {l.interest_rate}% · {formatCurrency(Number(l.monthly_payment), l.currency)}/mo
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-bold text-foreground text-sm">{formatCurrency(Number(l.outstanding_amount), l.currency)}</span>
                    {l.currency !== baseCurrency && (
                      <p className="text-[10px] text-muted-foreground">≈ {formatCurrency(getBaseValue(l), baseCurrency)}</p>
                    )}
                    {revolving && l.credit_limit > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Limit: {formatCurrency(l.credit_limit, l.currency)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(l)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(l.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No debts tracked yet. Add a loan or credit card to get started.</p>
            </div>
          )}
        </TabsContent>

        {/* TAB: Analytics */}
        <TabsContent value="analytics" className="mt-3">
          <LoanAnalytics loans={items} />
        </TabsContent>

        {/* TAB: Planner */}
        <TabsContent value="planner" className="mt-3">
          <LoanPlanner />
        </TabsContent>

        {/* TAB: Health */}
        <TabsContent value="health" className="mt-3">
          <DebtHealthMetrics loans={items} totalMonthlyEMI={totalMonthly} totalOutstanding={total} />
        </TabsContent>
      </Tabs>

      <AiInsightsSection context="liabilities" />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this liability?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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

export default Liabilities;
