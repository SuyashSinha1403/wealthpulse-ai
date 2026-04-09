import React, { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2, Landmark, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

interface ImportedStatementRow {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  direction: "income" | "expense";
  incomeSource?: string;
  expenseCategory?: string;
  expenseGroup?: string;
  paymentMethod?: string;
  isRecurring?: boolean;
  error?: string;
  isDuplicate?: boolean;
}

interface ImportCashFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  baseCurrency: string;
  existingIncome: Array<{ source_name: string; amount: number; date_received: string }>;
  existingExpenses: Array<{ category: string; amount: number; date: string }>;
  getRate: (from: string, to: string) => number | null;
  onImportComplete: () => void;
}

type Step = "upload" | "preview" | "importing" | "done";
type DuplicateAction = "skip" | "import";

const ACCEPTED_TYPES = ".csv,.xlsx,.xls";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const VALID_SOURCES = ["Salary", "Freelance", "Business", "Dividends", "Interest", "Other"] as const;
const SHORT_CATEGORIES = ["Food", "Transport", "Shopping", "Entertainment", "Groceries", "Personal", "Other"] as const;
const LONG_CATEGORIES = ["Rent", "EMI", "Credit Card", "Insurance", "Travel", "Education", "Medical", "Other"] as const;
const PAYMENT_METHODS = ["Cash", "UPI", "Credit Card", "Debit Card", "Net Banking", "Other"] as const;

const normalizeKey = (k: string) => k.toLowerCase().trim().replace(/\s+/g, "_");

const parseDate = (raw: string): string | null => {
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().split("T")[0];

  const parts = raw.split(/[\/\-\.]/).map((part) => part.trim());
  if (parts.length !== 3) return null;

  const [a, b, c] = parts;
  const candidates = [
    `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`,
    `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`,
  ];

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  }

  return null;
};

const getString = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const getNumber = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const parsed = Number(String(value).replace(/,/g, ""));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const inferPaymentMethod = (description: string) => {
  const text = description.toLowerCase();
  if (text.includes("upi") || text.includes("gpay") || text.includes("phonepe") || text.includes("paytm")) return "UPI";
  if (text.includes("credit card") || text.includes("card xx") || text.includes("visa") || text.includes("mastercard")) return "Credit Card";
  if (text.includes("debit card") || text.includes("pos") || text.includes("atm")) return "Debit Card";
  if (text.includes("neft") || text.includes("rtgs") || text.includes("imps") || text.includes("bank transfer")) return "Net Banking";
  if (text.includes("cash")) return "Cash";
  return "Other";
};

const inferIncomeSource = (description: string) => {
  const text = description.toLowerCase();
  if (text.includes("salary") || text.includes("payroll") || text.includes("wages")) return "Salary";
  if (text.includes("freelance") || text.includes("consulting") || text.includes("client payment")) return "Freelance";
  if (text.includes("business") || text.includes("sales receipt")) return "Business";
  if (text.includes("dividend")) return "Dividends";
  if (text.includes("interest")) return "Interest";
  return "Other";
};

const inferExpenseCategory = (description: string) => {
  const text = description.toLowerCase();
  if (text.includes("rent") || text.includes("lease")) return { category: "Rent", expenseGroup: "Long" };
  if (text.includes("emi") || text.includes("loan")) return { category: "EMI", expenseGroup: "Long" };
  if (text.includes("credit card")) return { category: "Credit Card", expenseGroup: "Long" };
  if (text.includes("insurance")) return { category: "Insurance", expenseGroup: "Long" };
  if (text.includes("flight") || text.includes("hotel") || text.includes("travel")) return { category: "Travel", expenseGroup: "Long" };
  if (text.includes("school") || text.includes("college") || text.includes("tuition") || text.includes("course")) return { category: "Education", expenseGroup: "Long" };
  if (text.includes("hospital") || text.includes("clinic") || text.includes("pharmacy") || text.includes("medical")) return { category: "Medical", expenseGroup: "Long" };
  if (text.includes("grocery") || text.includes("supermarket") || text.includes("mart")) return { category: "Groceries", expenseGroup: "Short" };
  if (text.includes("uber") || text.includes("ola") || text.includes("fuel") || text.includes("petrol") || text.includes("metro") || text.includes("transport")) return { category: "Transport", expenseGroup: "Short" };
  if (text.includes("amazon") || text.includes("flipkart") || text.includes("shopping")) return { category: "Shopping", expenseGroup: "Short" };
  if (text.includes("movie") || text.includes("netflix") || text.includes("spotify") || text.includes("entertainment")) return { category: "Entertainment", expenseGroup: "Short" };
  if (text.includes("restaurant") || text.includes("swiggy") || text.includes("zomato") || text.includes("food")) return { category: "Food", expenseGroup: "Short" };
  return { category: "Other", expenseGroup: "Short" };
};

const inferRecurring = (description: string) => {
  const text = description.toLowerCase();
  return ["rent", "emi", "subscription", "insurance", "bill", "sip"].some((token) => text.includes(token));
};

export function ImportCashFlowDialog({
  open, onOpenChange, userId, baseCurrency, existingIncome, existingExpenses, getRate, onImportComplete,
}: ImportCashFlowDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportedStatementRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, skipped: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setRows([]);
    setFileName("");
    setDuplicateAction("skip");
    setImportProgress(0);
    setImportTotal(0);
    setImportResults({ success: 0, skipped: 0, failed: 0 });
  };

  const handleClose = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const isIncomeDuplicate = useCallback(
    (source: string, amount: number, date: string) =>
      existingIncome.some(
        (entry) => entry.source_name === source && Math.abs(entry.amount - amount) < 0.01 && entry.date_received === date,
      ),
    [existingIncome],
  );

  const isExpenseDuplicate = useCallback(
    (category: string, amount: number, date: string) =>
      existingExpenses.some(
        (entry) => entry.category === category && Math.abs(entry.amount - amount) < 0.01 && entry.date === date,
      ),
    [existingExpenses],
  );

  const buildStatementRow = (row: Record<string, unknown>): ImportedStatementRow => {
    const rawDate = getString(row, ["date", "transaction_date", "value_date", "posted_date"]);
    const description = getString(row, ["description", "narration", "details", "remarks", "merchant", "reference", "transaction_details"]);
    const currency = getString(row, ["currency"]) || undefined;

    const debit = getNumber(row, ["debit", "withdrawal", "withdrawals", "outflow"]);
    const credit = getNumber(row, ["credit", "deposit", "deposits", "inflow"]);
    const amount = getNumber(row, ["amount", "transaction_amount", "value"]);
    const transactionType = getString(row, ["type", "transaction_type", "dr_cr", "dr/cr"]).toLowerCase();

    const parsedDate = parseDate(rawDate);
    let direction: "income" | "expense" | null = null;
    let normalizedAmount: number | null = null;

    if (credit !== null && credit > 0) {
      direction = "income";
      normalizedAmount = credit;
    } else if (debit !== null && debit > 0) {
      direction = "expense";
      normalizedAmount = debit;
    } else if (amount !== null) {
      if (transactionType.includes("credit") || transactionType === "cr") {
        direction = "income";
        normalizedAmount = Math.abs(amount);
      } else if (transactionType.includes("debit") || transactionType === "dr") {
        direction = "expense";
        normalizedAmount = Math.abs(amount);
      } else if (amount < 0) {
        direction = "expense";
        normalizedAmount = Math.abs(amount);
      } else if (amount > 0) {
        direction = "income";
        normalizedAmount = amount;
      }
    }

    let error: string | undefined;
    if (!parsedDate) error = `Invalid date: ${rawDate || "missing"}`;
    else if (!description) error = "Missing description";
    else if (!normalizedAmount || normalizedAmount <= 0) error = "Missing debit/credit or amount";
    else if (!direction) error = "Unable to determine inflow or outflow";

    const paymentMethod = description ? inferPaymentMethod(description) : "Other";
    const incomeSource = description ? inferIncomeSource(description) : "Other";
    const expenseMeta = description ? inferExpenseCategory(description) : { category: "Other", expenseGroup: "Short" };
    const isRecurring = description ? inferRecurring(description) : false;

    const duplicate = !error && parsedDate
      ? direction === "income"
        ? isIncomeDuplicate(incomeSource, normalizedAmount!, parsedDate)
        : isExpenseDuplicate(expenseMeta.category, normalizedAmount!, parsedDate)
      : false;

    return {
      date: parsedDate || rawDate,
      description,
      amount: normalizedAmount || 0,
      currency,
      direction: direction || "expense",
      incomeSource,
      expenseCategory: expenseMeta.category,
      expenseGroup: expenseMeta.expenseGroup,
      paymentMethod,
      isRecurring,
      error,
      isDuplicate: duplicate,
    };
  };

  const parseFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 5 MB limit");
      return;
    }

    setFileName(file.name);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let jsonData: Record<string, unknown>[];

      if (ext === "csv") {
        const text = await file.text();
        const workbook = XLSX.read(text, { type: "string" });
        jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      }

      if (jsonData.length === 0) {
        toast.error("File is empty");
        return;
      }

      const normalized = jsonData.map((entry) => {
        const output: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entry)) output[normalizeKey(key)] = value;
        return output;
      });

      const firstRow = normalized[0];
      const hasDate = ["date", "transaction_date", "value_date", "posted_date"].some((key) => key in firstRow);
      const hasDescription = ["description", "narration", "details", "remarks", "merchant", "reference", "transaction_details"].some((key) => key in firstRow);
      const hasAmount = ["amount", "transaction_amount", "value", "debit", "credit", "withdrawal", "deposit", "outflow", "inflow"].some((key) => key in firstRow);

      if (!hasDate || !hasDescription || !hasAmount) {
        toast.error("Bank statement must include date, description, and amount or debit/credit columns");
        return;
      }

      const parsedRows = normalized.map(buildStatementRow);
      setRows(parsedRows);
      setStep("preview");
    } catch (error) {
      console.error("Statement parse error:", error);
      toast.error("Failed to parse file. Please check the statement format.");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) parseFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const validRows = rows.filter((row) => !row.error);
  const errorRows = rows.filter((row) => !!row.error);
  const duplicateRows = validRows.filter((row) => row.isDuplicate);
  const rowsToImport = duplicateAction === "skip" ? validRows.filter((row) => !row.isDuplicate) : validRows;
  const incomeRows = rowsToImport.filter((row) => row.direction === "income");
  const expenseRows = rowsToImport.filter((row) => row.direction === "expense");

  const handleImport = async () => {
    if (rowsToImport.length === 0) {
      toast.error("No valid statement rows to import");
      return;
    }

    setStep("importing");
    setImportTotal(rowsToImport.length);

    let success = 0;
    let failed = 0;
    const skipped = duplicateAction === "skip" ? duplicateRows.length : 0;

    for (let index = 0; index < rowsToImport.length; index++) {
      const row = rowsToImport[index];
      setImportProgress(index + 1);

      try {
        const currency = row.currency || baseCurrency;
        const fxRate = currency !== baseCurrency ? (getRate(currency, baseCurrency) || 1) : 1;
        const baseValue = row.amount * fxRate;

        if (row.direction === "income") {
          const { error } = await supabase.from("income_entries").insert({
            user_id: userId,
            source_name: VALID_SOURCES.includes((row.incomeSource || "Other") as typeof VALID_SOURCES[number]) ? row.incomeSource : "Other",
            amount: row.amount,
            currency,
            fx_rate: fxRate,
            base_currency_value: baseValue,
            frequency: "One-time",
            date_received: row.date,
            notes: row.description || null,
          });

          if (error) throw error;
        } else {
          const category = row.expenseCategory || "Other";
          const expenseGroup = row.expenseGroup === "Long" ? "Long" : "Short";
          const paymentMethod = PAYMENT_METHODS.includes((row.paymentMethod || "Other") as typeof PAYMENT_METHODS[number]) ? row.paymentMethod : "Other";

          const { error } = await supabase.from("expenses").insert({
            user_id: userId,
            category,
            amount: row.amount,
            currency,
            fx_rate: fxRate,
            base_currency_value: baseValue,
            date: row.date,
            description: row.description || null,
            expense_group: expenseGroup,
            is_recurring: row.isRecurring || false,
            payment_method: paymentMethod,
          });

          if (error) throw error;
        }

        success++;
      } catch (error) {
        console.error("Failed to import statement row:", error);
        failed++;
      }
    }

    setImportResults({ success, skipped, failed });
    setStep("done");
    if (success > 0) onImportComplete();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Import Bank Statement
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card/40 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Upload a bank statement. WealthPulse will split inflows and outflows automatically.</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    We detect transaction direction from signed amounts or debit and credit columns, then classify income sources and expense categories from transaction descriptions.
                  </p>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Drop a bank statement here or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">CSV, XLSX, or XLS. Max 5 MB.</p>
              <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleFileChange} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Supported statement columns</p>
                <code className="block rounded bg-muted p-2 text-xs text-foreground">date, description, amount</code>
                <p className="text-xs text-muted-foreground">Or use separate debit and credit columns instead of a signed amount.</p>
                <p className="text-xs text-muted-foreground">Also supported: narration, remarks, merchant, transaction_type, currency.</p>
              </div>

              <div className="rounded-xl border border-border p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">What happens automatically</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>1. Inflows become income entries.</p>
                  <p>2. Outflows become expense entries.</p>
                  <p>3. Descriptions are categorised into sources, spending categories, and payment methods.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Example statement format</p>
              <code className="block whitespace-pre rounded bg-muted p-3 text-xs text-foreground">
{`date,description,debit,credit
2025-03-01,Salary credit,,85000
2025-03-02,UPI Swiggy order,640,
2025-03-03,Rent payment,25000,
2025-03-05,Interest credit,,425`}
              </code>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-foreground">
                <span className="font-medium">{fileName}</span> - {rows.length} transaction rows parsed
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="mr-1 h-4 w-4" />
                Change file
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <Badge variant="secondary" className="justify-center gap-1 py-1.5">
                <CheckCircle2 className="h-3 w-3" /> {validRows.length} ready
              </Badge>
              <Badge variant="secondary" className="justify-center gap-1 py-1.5">
                <ArrowDownCircle className="h-3 w-3" /> {incomeRows.length} inflows
              </Badge>
              <Badge variant="secondary" className="justify-center gap-1 py-1.5">
                <ArrowUpCircle className="h-3 w-3" /> {expenseRows.length} outflows
              </Badge>
              {errorRows.length > 0 ? (
                <Badge variant="destructive" className="justify-center gap-1 py-1.5">
                  <AlertCircle className="h-3 w-3" /> {errorRows.length} errors
                </Badge>
              ) : (
                <Badge variant="outline" className="justify-center py-1.5">
                  0 errors
                </Badge>
              )}
            </div>

            {duplicateRows.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">{duplicateRows.length} duplicate(s) found</p>
                <RadioGroup value={duplicateAction} onValueChange={(value) => setDuplicateAction(value as DuplicateAction)} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="skip" id="statement-skip" />
                    <Label htmlFor="statement-skip" className="text-sm">Skip duplicates</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="import" id="statement-import" />
                    <Label htmlFor="statement-import" className="text-sm">Import anyway</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Flow</TableHead>
                    <TableHead className="text-xs">Auto category</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.date}-${row.description}-${index}`} className={row.error ? "bg-destructive/5" : row.isDuplicate ? "bg-amber-500/5" : ""}>
                      <TableCell className="text-xs">{row.date}</TableCell>
                      <TableCell className="text-xs font-medium text-foreground max-w-[220px] truncate">{row.description}</TableCell>
                      <TableCell className="text-xs">
                        {row.direction === "income" ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <ArrowDownCircle className="h-3 w-3" />
                            Inflow
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <ArrowUpCircle className="h-3 w-3" />
                            Outflow
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.direction === "income" ? row.incomeSource : row.expenseCategory}
                      </TableCell>
                      <TableCell className="text-xs text-right">{row.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {row.error ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            {row.error}
                          </span>
                        ) : row.isDuplicate ? (
                          <span className="text-amber-600">Duplicate</span>
                        ) : (
                          <span className="text-primary">Ready</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={rowsToImport.length === 0} className="gap-2">
                <Upload className="h-4 w-4" />
                Import {rowsToImport.length} transactions
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-4 py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-foreground">Importing {importProgress} of {importTotal} transactions...</p>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(importProgress / importTotal) * 100}%` }} />
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="text-lg font-semibold text-foreground">Statement import complete</p>
            <div className="flex justify-center gap-4 text-sm">
              <span className="text-primary">{importResults.success} imported</span>
              {importResults.skipped > 0 && <span className="text-amber-600">{importResults.skipped} skipped</span>}
              {importResults.failed > 0 && <span className="text-destructive">{importResults.failed} failed</span>}
            </div>
            <Button onClick={() => handleClose(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
