import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency, SUPPORTED_CURRENCIES, SupportedCurrency } from "@/hooks/useBaseCurrency";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Building2, CirclePlus, Landmark, Pencil, PiggyBank, Plus, Trash2, Wallet, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AiInsightsSection } from "@/components/AiInsightsSection";
import { PrototypeSyncPanel } from "@/components/PrototypeSyncPanel";

interface BankAccount {
  id: string; bank_name: string; account_type: string; balance: number; notes: string | null;
  currency: string; fx_rate: number | null; base_currency_value: number;
}

const ACCOUNT_TYPES = ["Savings", "Current", "Salary", "Fixed Deposit", "Recurring Deposit", "NRI", "Wallet", "Cash", "Other"];

const BankAccounts = () => {
  const { user, loading } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const { fetchRates, getRate } = useExchangeRates();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ bank_name: "", account_type: "Savings", balance: "", notes: "", currency: "INR" as string });

  const fetchAccounts = async () => {
    if (loading) return;

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("Current user:", authUser?.id);
    console.log("AUTH USER UUID:", authUser?.id);

    if (authError) {
      console.error("Bank accounts auth lookup failed", authError);
      toast.error(authError.message || "Failed to verify current user");
      return;
    }

    if (!authUser) return;

    console.log("Querying bank_accounts for:", authUser?.id);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", authUser.id)
      .order("created_at");
    console.log("Bank account rows:", data?.length ?? 0, error ?? null);

    console.log("Bank accounts query result:", data);

    if (error) {
      console.error("Bank accounts query failed", error);
      toast.error(error.message || "Failed to load bank accounts");
      return;
    }

    const accts = (data as BankAccount[]) || [];
    setAccounts(accts);

    // Fetch FX rates for non-base currencies
    const pairs = accts.filter(a => a.currency !== baseCurrency).map(a => ({ from: a.currency, to: baseCurrency }));
    if (pairs.length > 0) fetchRates(pairs);
  };

  useEffect(() => {
    if (loading || !user) return;
    fetchAccounts();
  }, [baseCurrency, loading, user]);

  const resetForm = () => { setForm({ bank_name: "", account_type: "Savings", balance: "", notes: "", currency: baseCurrency }); setEditing(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const balance = Number(form.balance);
    const fxRate = form.currency === baseCurrency ? 1 : getRate(form.currency, baseCurrency);
    const baseValue = fxRate ? balance * fxRate : balance;

    const payload = {
      user_id: user.id, bank_name: form.bank_name, account_type: form.account_type,
      balance, notes: form.notes || null, currency: form.currency,
      fx_rate: fxRate || null, base_currency_value: baseValue,
    };
    if (editing) {
      const { error } = await supabase.from("bank_accounts").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("bank_accounts").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Account added");
    }
    setOpen(false); resetForm(); fetchAccounts();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("bank_accounts").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); } else { toast.success("Deleted"); }
    setDeleteId(null);
    fetchAccounts();
  };

  const handleEdit = (a: BankAccount) => {
    setEditing(a);
    setForm({ bank_name: a.bank_name, account_type: a.account_type, balance: a.balance.toString(), notes: a.notes || "", currency: a.currency || baseCurrency });
    setOpen(true);
  };

  const trackOptions = [
    { title: "Savings account", description: "Track balances from banks not connected yet", bankName: "", accountType: "Savings", action: "Track", icon: Landmark },
    { title: "Salary account", description: "Track monthly salary inflow and balance", bankName: "", accountType: "Salary", action: "Track", icon: Building2 },
    { title: "Fixed Deposit", description: "Track principal, maturity value, and liquidity", bankName: "", accountType: "Fixed Deposit", action: "Track", icon: PiggyBank },
    { title: "Recurring Deposit", description: "Track monthly deposits and target maturity", bankName: "", accountType: "Recurring Deposit", action: "Track", icon: WalletCards },
    { title: "UPI / wallet", description: "Track Paytm, PhonePe, GPay, or prepaid wallet balance", bankName: "", accountType: "Wallet", action: "Track", icon: Wallet },
    { title: "Cash", description: "Track cash kept outside bank accounts", bankName: "Cash", accountType: "Cash", action: "Add", icon: CirclePlus },
    { title: "Other bank", description: "Track a bank not listed in sync providers", bankName: "", accountType: "Other", action: "Add", icon: CirclePlus },
  ];

  const openTrackAccount = (bankName: string, accountType: string) => {
    setEditing(null);
    setForm({
      bank_name: bankName,
      account_type: accountType,
      balance: "",
      notes: "",
      currency: baseCurrency,
    });
    setOpen(true);
  };

  const total = accounts.reduce((s, a) => {
    if (a.currency === baseCurrency) return s + Number(a.balance);
    const rate = getRate(a.currency, baseCurrency);
    return s + (rate ? Number(a.balance) * rate : Number(a.base_currency_value));
  }, 0);

  const fxPreview = form.balance && form.currency !== baseCurrency ? (() => {
    const rate = getRate(form.currency, baseCurrency);
    if (!rate) return null;
    return `${form.currency} ${Number(form.balance).toLocaleString()} = ${formatCurrency(Number(form.balance) * rate, baseCurrency)} @ ${rate.toFixed(4)}`;
  })() : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
          <p className="text-muted-foreground text-sm">Manage your bank balances</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground gap-2"><Plus className="h-4 w-4" />Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Bank Account</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5"><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} required /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Account Type</Label>
                  <Select value={form.account_type} onValueChange={v => setForm(f => ({ ...f, account_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => { setForm(f => ({ ...f, currency: v })); if (v !== baseCurrency) fetchRates([{ from: v, to: baseCurrency }]); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Balance</Label><Input type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} required /></div>
              </div>
              {fxPreview && <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg">{fxPreview}</p>}
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground">{editing ? "Update" : "Add"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <PrototypeSyncPanel
        title="Link bank accounts for cash-flow intelligence"
        description="Choose the account type first, then select your bank or upload a statement. Unsupported banks can still be tracked manually."
        actions={[
          { label: "Sync bank account", detail: "Savings, salary, current", providers: ["HDFC Bank", "SBI", "ICICI Bank", "Axis Bank", "Other bank"] },
          { label: "Sync deposits", detail: "FD, RD, sweep balances", providers: ["HDFC Bank", "SBI", "ICICI Bank", "Bank statement"] },
          { label: "Sync UPI / wallet", detail: "Wallet and UPI cash-flow signals", providers: ["Paytm", "PhonePe", "Google Pay", "Manual upload"] },
          { label: "Upload statement", detail: "PDF/CSV fallback", providers: ["Bank PDF", "Bank CSV", "Account aggregator export", "Manual entry"] },
        ]}
        footnote="Prototype mode does not connect to real accounts. It demonstrates the consent screen and future integration path."
      />

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Track more accounts</h2>
            <p className="text-sm text-muted-foreground">If your bank or wallet is not synced, add it manually so WealthPulse can include it in cash-flow planning.</p>
          </div>
        </div>
        <div className="divide-y divide-border/70">
          {trackOptions.map(({ title, description, bankName, accountType, action, icon: Icon }) => (
            <button
              key={title}
              type="button"
              onClick={() => openTrackAccount(bankName, accountType)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10">
                <Icon className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
                {action}
                <CirclePlus className="h-5 w-5 text-emerald-300" />
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="stat-card">
        <p className="text-sm text-muted-foreground">Total Bank Balance ({baseCurrency})</p>
        <p className="text-2xl font-bold text-foreground">{formatCurrency(total, baseCurrency)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(a => (
          <div key={a.id} className="glass-card rounded-xl p-5 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><Building2 className="h-5 w-5 text-accent-foreground" /></div>
                <div>
                  <p className="font-semibold text-foreground">{a.bank_name}</p>
                  <p className="text-xs text-muted-foreground">{a.account_type} · {a.currency}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(a)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
            <p className="text-xl font-bold text-foreground mt-4">{formatCurrency(Number(a.balance), a.currency)}</p>
            {a.currency !== baseCurrency && (
              <p className="text-xs text-muted-foreground">≈ {formatCurrency(Number(a.base_currency_value) || Number(a.balance) * (getRate(a.currency, baseCurrency) || 1), baseCurrency)}</p>
            )}
            {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
          </div>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No bank accounts added yet.</p>
        </div>
      )}

      <AiInsightsSection context="bank_accounts" />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The bank account will be permanently removed.</AlertDialogDescription>
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

export default BankAccounts;
