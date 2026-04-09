import { useEffect, useState } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, Receipt, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const SHORT_CATEGORIES = ["Food", "Transport", "Shopping", "Entertainment", "Groceries", "Personal", "Other"];
const LONG_CATEGORIES = ["Rent", "EMI", "Credit Card", "Insurance", "Travel", "Education", "Medical", "Other"];
const PAYMENT_METHODS = ["Cash", "UPI", "Credit Card", "Debit Card", "Net Banking", "Other"];

interface Expense {
  id: string; amount: number; category: string; expense_group: string;
  payment_method: string | null; description: string | null; is_recurring: boolean; date: string;
  currency: string; fx_rate: number | null; base_currency_value: number;
}

interface BankAccount {
  id: string; bank_name: string; balance: number; currency: string; account_type: string;
}

interface ExpensesSectionProps {
  onExpenseChange?: () => void;
}

export function ExpensesSection({ onExpenseChange }: ExpensesSectionProps) {
  const { user } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const { fetchRates, getRate } = useExchangeRates();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [tab, setTab] = useState("Short");
  const [expenseListOpen, setExpenseListOpen] = useState(false);
  const [form, setForm] = useState({
    amount: "", category: "Food", expense_group: "Short", payment_method: "UPI",
    description: "", date: new Date().toISOString().split("T")[0], is_recurring: false,
    currency: "INR" as string, bank_account_id: "" as string,
  });

  const fetchExpenses = async () => {
    if (!user) return;
    const { data } = await supabase.from("expenses").select("*").eq("user_id", user.id).order("date", { ascending: false });
    setExpenses((data as Expense[]) || []);
  };

  const fetchBankAccounts = async () => {
    if (!user) return;
    const { data } = await supabase.from("bank_accounts").select("id, bank_name, balance, currency, account_type").eq("user_id", user.id);
    setBankAccounts((data as BankAccount[]) || []);
  };

  useEffect(() => { fetchExpenses(); fetchBankAccounts(); }, [user]);

  const resetForm = () => {
    setForm({ amount: "", category: tab === "Short" ? "Food" : "Rent", expense_group: tab, payment_method: "UPI", description: "", date: new Date().toISOString().split("T")[0], is_recurring: false, currency: baseCurrency, bank_account_id: "" });
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = Number(form.amount);
    let fxRate = 1;
    if (form.currency !== baseCurrency) {
      const pairsParam = `${form.currency}-${baseCurrency}`;
      try {
        const url = `${SUPABASE_URL}/functions/v1/exchange-rate?pairs=${pairsParam}`;
        const res = await fetch(url, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
        const json = await res.json();
        const key = `${form.currency}-${baseCurrency}`;
        fxRate = json.data?.[key]?.rate || getRate(form.currency, baseCurrency) || 1;
      } catch {
        fxRate = getRate(form.currency, baseCurrency) || 1;
      }
    }
    const baseValue = amount * fxRate;

    const bankId = form.bank_account_id && form.bank_account_id !== "none" ? form.bank_account_id : null;
    const shouldDeductBank = form.payment_method === "UPI" && bankId && !editing;

    if (shouldDeductBank) {
      const selectedAccount = bankAccounts.find(a => a.id === bankId);
      if (selectedAccount && selectedAccount.balance < amount) {
        toast.error("Insufficient balance in selected bank account");
        return;
      }

      const { data, error } = await supabase.rpc("create_expense_with_deduction", {
        p_user_id: user.id,
        p_amount: amount,
        p_category: form.category,
        p_expense_group: form.expense_group,
        p_payment_method: form.payment_method,
        p_description: form.description || null,
        p_date: form.date,
        p_is_recurring: form.is_recurring,
        p_currency: form.currency,
        p_fx_rate: fxRate,
        p_base_currency_value: baseValue,
        p_bank_account_id: bankId,
      });

      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result && !result.success) {
        toast.error(result.error || "Failed to create expense");
        return;
      }
      toast.success("Expense added & bank balance updated");
    } else {
      const payload = {
        user_id: user.id, amount, category: form.category,
        expense_group: form.expense_group, payment_method: form.payment_method,
        description: form.description || null, date: form.date, is_recurring: form.is_recurring,
        currency: form.currency, fx_rate: fxRate, base_currency_value: baseValue,
      };

      if (editing) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (error) { toast.error(error.message); return; }
        toast.success("Expense updated");
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) { toast.error(error.message); return; }
        toast.success("Expense added");
      }
    }

    setOpen(false);
    resetForm();
    fetchExpenses();
    fetchBankAccounts();
    onExpenseChange?.();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("expenses").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); } else { toast.success("Deleted"); }
    setDeleteId(null);
    fetchExpenses();
    onExpenseChange?.();
  };

  const handleEdit = (exp: Expense) => {
    setEditing(exp);
    setForm({
      amount: exp.amount.toString(), category: exp.category, expense_group: exp.expense_group,
      payment_method: exp.payment_method || "UPI", description: exp.description || "",
      date: exp.date, is_recurring: exp.is_recurring, currency: exp.currency || baseCurrency,
      bank_account_id: "",
    });
    setOpen(true);
  };

  const filtered = expenses.filter(e => e.expense_group === tab);
  const thisMonth = filtered.filter(e => {
    const d = new Date(e.date); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyTotal = thisMonth.reduce((s, e) => s + Number(e.base_currency_value || e.amount), 0);

  const fxPreview = form.amount && form.currency !== baseCurrency ? (() => {
    const rate = getRate(form.currency, baseCurrency);
    if (!rate) return null;
    return `${form.currency} ${Number(form.amount).toLocaleString()} = ${formatCurrency(Number(form.amount) * rate, baseCurrency)} @ ${rate.toFixed(4)}`;
  })() : null;

  const showBankDropdown = form.payment_method === "UPI" && !editing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-lg">Expenses</h3>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground gap-2"><Plus className="h-4 w-4" />Add Expense</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Expense</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.expense_group} onValueChange={v => setForm(f => ({ ...f, expense_group: v, category: v === "Short" ? "Food" : "Rent" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Short">Daily / Short</SelectItem>
                      <SelectItem value="Long">Big / Long</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(form.expense_group === "Short" ? SHORT_CATEGORIES : LONG_CATEGORIES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v, bank_account_id: "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {showBankDropdown && (
                <div className="space-y-1.5">
                  <Label>Deduct from Bank Account</Label>
                  <Select value={form.bank_account_id} onValueChange={v => setForm(f => ({ ...f, bank_account_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="None (no deduction)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (no deduction)</SelectItem>
                      {bankAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.bank_name} ({a.account_type}) — {formatCurrency(a.balance, a.currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              </div>
              {form.expense_group === "Long" && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} className="rounded border-border" />
                  Mark as recurring expense
                </label>
              )}
              <Button type="submit" className="w-full gradient-primary text-primary-foreground">{editing ? "Update" : "Add"} Expense</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Monthly Summary */}
      <div className="glass-card rounded-xl p-5 sm:p-7">
        <p className="text-sm text-muted-foreground mb-1">This Month ({tab} Expenses)</p>
        <p className="text-3xl font-bold text-foreground">{formatCurrency(monthlyTotal, baseCurrency)}</p>
      </div>

      {/* Expense Type Toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        <button
          onClick={() => setTab("Short")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "Short"
              ? "bg-foreground text-background"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          Daily / Short
        </button>
        <button
          onClick={() => setTab("Long")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "Long"
              ? "bg-foreground text-background"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          Big / Long
        </button>
      </div>

      {/* Expense Entries List (Collapsible) */}
      {filtered.length > 0 && (
        <Collapsible open={expenseListOpen} onOpenChange={setExpenseListOpen}>
          <div className="glass-card rounded-xl p-5 sm:p-7">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent mb-4">
                <h3 className="font-semibold text-foreground text-lg">All {tab} Expenses ({filtered.length})</h3>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${expenseListOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
              {filtered.map(exp => (
                <div key={exp.id} className="rounded-lg p-4 bg-accent/5 hover:bg-accent/10 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <Receipt className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{exp.category}{exp.description ? ` — ${exp.description}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{exp.date} · {exp.payment_method}{exp.is_recurring ? " · 🔄" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-semibold text-foreground">{formatCurrency(Number(exp.amount), exp.currency)}</span>
                      {exp.currency !== baseCurrency && (
                        <p className="text-xs text-muted-foreground">≈ {formatCurrency(Number(exp.base_currency_value), baseCurrency)}</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(exp)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(exp.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {filtered.length === 0 && (
        <div className="glass-card rounded-xl p-5 sm:p-7">
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No {tab.toLowerCase()} expenses yet</p>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The expense will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
