import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";

const SettingsPage = () => {
  const exportCSV = async (table: "investments" | "expenses" | "bank_accounts" | "liabilities") => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from(table).select("*").eq("user_id", user.id);
    if (error || !data || data.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((r) => Object.values(r).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${table} exported`);
  };

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your data exports.</p>
      </div>

      <div className="glass-card rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Export Data</h3>
        <div className="flex flex-wrap gap-3">
          {(["investments", "expenses", "bank_accounts", "liabilities"] as const).map((t) => (
            <Button key={t} variant="outline" size="sm" className="gap-2" onClick={() => exportCSV(t)}>
              <Download className="h-3.5 w-3.5" />
              Export {t.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

    </div>
  );
};

export default SettingsPage;
