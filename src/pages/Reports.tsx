import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/formatCurrency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { AiInsightsSection } from "@/components/AiInsightsSection";

const Reports = () => {
  const { user } = useAuth();
  const [monthlySpending, setMonthlySpending] = useState<{ month: string; amount: number }[]>([]);
  const [topCategories, setTopCategories] = useState<{ category: string; amount: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchReports = async () => {
      const { data: expenses } = await supabase.from("expenses").select("amount, category, date").eq("user_id", user.id);
      if (!expenses) return;

      // Monthly spending (last 6 months)
      const monthMap: Record<string, number> = {};
      expenses.forEach(e => {
        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthMap[key] = (monthMap[key] || 0) + Number(e.amount);
      });
      const months = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([month, amount]) => ({ month, amount }));
      setMonthlySpending(months);

      // Top categories
      const catMap: Record<string, number> = {};
      expenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
      setTopCategories(Object.entries(catMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8));
    };
    fetchReports();
  }, [user]);

  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground text-sm">Spending trends and analytics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="glass-card rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Monthly Spending Trend</h3>
          {monthlySpending.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlySpending}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-muted-foreground text-sm py-10 text-center">No data yet</p>}
        </div>

        <div className="glass-card rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Top Expense Categories</h3>
          {topCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCategories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="category" type="category" width={80} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted-foreground text-sm py-10 text-center">No data yet</p>}
        </div>
      </div>

      <AiInsightsSection />
    </div>
  );
};

export default Reports;
