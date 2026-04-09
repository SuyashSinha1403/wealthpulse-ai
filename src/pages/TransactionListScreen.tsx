import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type TransactionItem = {
  id: string;
  user_id: string;
  amount: number;
  merchant: string | null;
  type: "debit" | "credit" | string;
  payment_method: string | null;
  created_at: string;
};

const formatInr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

const formatDay = (dateIso: string) =>
  new Date(dateIso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });

const getMonthBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, next };
};

const TransactionListScreen = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [selected, setSelected] = useState<TransactionItem | null>(null);
  const [editMerchant, setEditMerchant] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user?.id) return;
      setLoading(true);

      const { data, error } = await (supabase as any)
        .from("transactions")
        .select("id, user_id, amount, merchant, type, payment_method, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(error.message || "Failed to load transactions");
      } else {
        setTransactions((data ?? []) as TransactionItem[]);
      }

      setLoading(false);
    };

    fetchTransactions();
  }, [user?.id]);

  const { spentThisMonth, receivedThisMonth } = useMemo(() => {
    const { start, next } = getMonthBounds();
    let spent = 0;
    let received = 0;

    for (const tx of transactions) {
      const dt = new Date(tx.created_at);
      if (dt < start || dt >= next) continue;
      if (tx.type === "debit") spent += Number(tx.amount ?? 0);
      if (tx.type === "credit") received += Number(tx.amount ?? 0);
    }

    return { spentThisMonth: spent, receivedThisMonth: received };
  }, [transactions]);

  const openEditor = (tx: TransactionItem) => {
    setSelected(tx);
    setEditMerchant(tx.merchant ?? "");
    setEditAmount(String(tx.amount ?? ""));
  };

  const handleSave = async () => {
    if (!selected || !user?.id) return;

    const parsedAmount = Number(editAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    setSaving(true);
    const merchantValue = editMerchant.trim() || null;

    const { error } = await (supabase as any)
      .from("transactions")
      .update({
        merchant: merchantValue,
        amount: parsedAmount,
      })
      .eq("id", selected.id)
      .eq("user_id", user.id);

    if (error) {
      toast.error(error.message || "Failed to save transaction");
      setSaving(false);
      return;
    }

    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === selected.id
          ? { ...tx, merchant: merchantValue, amount: parsedAmount }
          : tx,
      ),
    );

    toast.success("Transaction updated");
    setSaving(false);
    setSelected(null);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        <p className="text-sm text-muted-foreground">Recent activity from your notifications</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-600">{formatInr(spentThisMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Received (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">{formatInr(receivedThisMonth)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin mr-2" />
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No transactions yet. Make a payment to get started.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => openEditor(tx)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-foreground truncate">
                      {tx.merchant?.trim() ? tx.merchant : "Unknown merchant"}
                    </p>
                    <p className="font-semibold shrink-0">{formatInr(Number(tx.amount ?? 0))}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className={tx.type === "debit" ? "text-red-600" : tx.type === "credit" ? "text-green-600" : "text-muted-foreground"}>
                      {tx.type}
                    </span>
                    <span className="text-muted-foreground">{formatDay(tx.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="merchant">Merchant</Label>
              <Input
                id="merchant"
                value={editMerchant}
                onChange={(e) => setEditMerchant(e.target.value)}
                placeholder="Merchant name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (INR)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionListScreen;
