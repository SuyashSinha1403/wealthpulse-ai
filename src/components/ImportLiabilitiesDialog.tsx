import React, { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

interface ImportRow {
  liability_type: string;
  outstanding_amount: number;
  monthly_payment: number;
  interest_rate: number;
  currency?: string;
  original_loan_amount?: number;
  loan_tenure_months?: number;
  loan_start_date?: string;
  lender_name?: string;
  credit_limit?: number;
  min_payment_percent?: number;
  notes?: string;
  error?: string;
  isDuplicate?: boolean;
}

interface ImportLiabilitiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  baseCurrency: string;
  existingLiabilities: Array<{
    liability_type: string;
    outstanding_amount: number;
    interest_rate: number;
    currency: string;
    loan_start_date: string | null;
    lender_name: string | null;
  }>;
  getRate: (from: string, to: string) => number | null;
  onImportComplete: () => void;
}

type Step = "upload" | "preview" | "importing" | "done";
type DuplicateAction = "skip" | "import";

const ACCEPTED_TYPES = ".csv,.xlsx,.xls";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const VALID_TYPES = [
  "Home Loan", "Car Loan", "Personal Loan", "Education Loan", "Other",
  "Credit Card", "Overdraft", "Line of Credit",
];
const REVOLVING_TYPES = ["Credit Card", "Overdraft", "Line of Credit"];

const parseDate = (raw: string): string | null => {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  const parts = raw.split(/[/.-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (Number(c) > 100) {
      const attempt = new Date(`${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`);
      if (!isNaN(attempt.getTime())) return attempt.toISOString().split("T")[0];
    }
  }
  return null;
};

export function ImportLiabilitiesDialog({
  open, onOpenChange, userId, baseCurrency, existingLiabilities, getRate, onImportComplete,
}: ImportLiabilitiesDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, skipped: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload"); setRows([]); setFileName("");
    setImportProgress(0); setImportTotal(0);
    setImportResults({ success: 0, skipped: 0, failed: 0 });
  };

  const handleClose = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const isDuplicate = useCallback(
    (
      type: string,
      amount: number,
      lender: string | undefined,
      currency: string | undefined,
      interestRate: number,
      loanStartDate?: string
    ) =>
      existingLiabilities.some(
        (l) =>
          l.liability_type === type &&
          Math.abs(l.outstanding_amount - amount) < 0.01 &&
          Math.abs(l.interest_rate - interestRate) < 0.01 &&
          l.currency === (currency || baseCurrency) &&
          (l.loan_start_date || "") === (loanStartDate || "") &&
          (l.lender_name || "").toLowerCase() === (lender || "").toLowerCase()
      ),
    [baseCurrency, existingLiabilities]
  );

  const parseFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) { toast.error("File size exceeds 5 MB limit"); return; }
    setFileName(file.name);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let jsonData: Record<string, unknown>[];
      if (ext === "csv") {
        const text = await file.text();
        const wb = XLSX.read(text, { type: "string" });
        jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }
      if (jsonData.length === 0) { toast.error("File is empty"); return; }

      const normalizeKey = (k: string) => k.toLowerCase().trim().replace(/\s+/g, "_");
      const normalized = jsonData.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v;
        return out;
      });

      const firstRow = normalized[0];
      const hasRequired = ["liability_type", "outstanding_amount", "monthly_payment", "interest_rate"]
        .every((col) => col in firstRow);
      if (!hasRequired) {
        toast.error("Missing required columns: liability_type, outstanding_amount, monthly_payment, interest_rate");
        return;
      }

      const parsed: ImportRow[] = normalized.map((row) => {
        const liability_type = String(row.liability_type || "").trim();
        const outstanding_amount = Number(row.outstanding_amount);
        const monthly_payment = Number(row.monthly_payment);
        const interest_rate = Number(row.interest_rate);
        const currency = row.currency ? String(row.currency).toUpperCase() : undefined;
        const isRevolving = REVOLVING_TYPES.includes(liability_type);
        const lender_name = row.lender_name ? String(row.lender_name) : undefined;
        const original_loan_amount = row.original_loan_amount ? Number(row.original_loan_amount) : undefined;
        const loan_tenure_months = row.loan_tenure_months ? Number(row.loan_tenure_months) : undefined;
        const rawLoanStartDate = row.loan_start_date ? String(row.loan_start_date).trim() : "";
        const loan_start_date = rawLoanStartDate ? parseDate(rawLoanStartDate) || undefined : undefined;
        const credit_limit = row.credit_limit ? Number(row.credit_limit) : undefined;
        const min_payment_percent = row.min_payment_percent ? Number(row.min_payment_percent) : undefined;
        const notes = row.notes ? String(row.notes) : undefined;

        let error: string | undefined;
        if (!liability_type || !VALID_TYPES.includes(liability_type)) error = `Invalid type: ${liability_type}`;
        else if (isNaN(outstanding_amount) || outstanding_amount < 0) error = "Invalid outstanding amount";
        else if (isNaN(monthly_payment) || monthly_payment < 0) error = "Invalid monthly payment";
        else if (isNaN(interest_rate) || interest_rate < 0) error = "Invalid interest rate";
        else if (!isRevolving && rawLoanStartDate && !loan_start_date) error = "Invalid loan start date";
        else if (!isRevolving && loan_tenure_months != null && loan_tenure_months <= 0) error = "Invalid loan tenure";
        else if (!isRevolving && original_loan_amount != null && original_loan_amount < outstanding_amount) error = "Original loan amount cannot be less than outstanding amount";
        else if (isRevolving && credit_limit != null && credit_limit < 0) error = "Invalid credit limit";
        else if (isRevolving && min_payment_percent != null && (min_payment_percent <= 0 || min_payment_percent > 100)) error = "Invalid minimum payment percent";

        const dup = !error
          ? isDuplicate(
              liability_type,
              outstanding_amount,
              lender_name,
              currency,
              interest_rate,
              loan_start_date
            )
          : false;

        return {
          liability_type, outstanding_amount, monthly_payment, interest_rate,
          currency, lender_name, original_loan_amount, loan_tenure_months,
          loan_start_date, credit_limit, min_payment_percent, notes, error, isDuplicate: dup,
        };
      });

      setRows(parsed);
      setStep("preview");
    } catch (err) {
      console.error("Parse error:", err);
      toast.error("Failed to parse file. Please check the format.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => !!r.error);
  const duplicateRows = validRows.filter((r) => r.isDuplicate);
  const rowsToImport = duplicateAction === "skip" ? validRows.filter((r) => !r.isDuplicate) : validRows;

  const handleImport = async () => {
    if (rowsToImport.length === 0) { toast.error("No valid rows to import"); return; }
    setStep("importing");
    setImportTotal(rowsToImport.length);
    let success = 0, failed = 0;
    const skipped = duplicateAction === "skip" ? duplicateRows.length : 0;

    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      setImportProgress(i + 1);
      try {
        const currency = row.currency || baseCurrency;
        const fxRate = currency !== baseCurrency ? getRate(currency, baseCurrency) : 1;
        if (currency !== baseCurrency && !fxRate) {
          throw new Error(`Missing FX rate for ${currency} to ${baseCurrency}`);
        }
        const resolvedFxRate = fxRate ?? 1;
        const baseValue = row.outstanding_amount * resolvedFxRate;
        const isRevolving = REVOLVING_TYPES.includes(row.liability_type);
        const originalLoanAmount = isRevolving
          ? 0
          : row.original_loan_amount ?? 0;

        const { error } = await supabase.from("liabilities").insert({
          user_id: userId,
          liability_type: row.liability_type,
          outstanding_amount: row.outstanding_amount,
          monthly_payment: row.monthly_payment,
          interest_rate: row.interest_rate,
          currency,
          fx_rate: resolvedFxRate,
          base_currency_value: baseValue,
          original_loan_amount: originalLoanAmount,
          loan_tenure_months: isRevolving ? null : (row.loan_tenure_months || null),
          loan_start_date: isRevolving ? null : (row.loan_start_date || null),
          lender_name: row.lender_name || null,
          credit_limit: isRevolving ? (row.credit_limit || 0) : 0,
          min_payment_percent: isRevolving ? (row.min_payment_percent || 5) : 5,
          notes: row.notes || null,
        });

        if (error) throw error;
        success++;
      } catch (err) {
        console.error(`Failed to import liability:`, err);
        failed++;
      }
    }

    setImportResults({ success, skipped, failed });
    setStep("done");
    if (success > 0) onImportComplete();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Liabilities
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Drop a file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, XLSX, or XLS — Max 5 MB</p>
              <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleFileChange} />
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Required columns:</p>
              <code className="block text-xs bg-muted p-2 rounded text-foreground">
                liability_type, outstanding_amount, monthly_payment, interest_rate
              </code>
              <p className="text-xs text-muted-foreground">
                Optional: currency, lender_name, original_loan_amount, loan_tenure_months, loan_start_date, credit_limit, min_payment_percent, notes
              </p>
              <p className="text-xs text-muted-foreground">
                Valid types: {VALID_TYPES.join(", ")}
              </p>
              <p className="text-sm font-medium text-foreground mt-3">Example:</p>
              <code className="block text-xs bg-muted p-2 rounded text-foreground whitespace-pre">
{`liability_type,outstanding_amount,monthly_payment,interest_rate,lender_name
Home Loan,2500000,25000,8.5,SBI
Credit Card,45000,5000,36,HDFC
Car Loan,800000,18000,9.2,ICICI`}
              </code>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground">
                <span className="font-medium">{fileName}</span> — {rows.length} rows parsed
              </p>
              <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4 mr-1" /> Change file</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {validRows.length} valid</Badge>
              {errorRows.length > 0 && <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> {errorRows.length} errors</Badge>}
              {duplicateRows.length > 0 && <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">{duplicateRows.length} duplicates</Badge>}
            </div>
            {duplicateRows.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">{duplicateRows.length} duplicate(s) found</p>
                <RadioGroup value={duplicateAction} onValueChange={(v) => setDuplicateAction(v as DuplicateAction)} className="flex gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="skip" id="l-skip" /><Label htmlFor="l-skip" className="text-sm">Skip duplicates</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="import" id="l-import" /><Label htmlFor="l-import" className="text-sm">Import anyway</Label></div>
                </RadioGroup>
              </div>
            )}
            <div className="max-h-[40vh] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Outstanding</TableHead>
                    <TableHead className="text-xs text-right">EMI/Payment</TableHead>
                    <TableHead className="text-xs text-right">Rate %</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className={row.error ? "bg-destructive/5" : row.isDuplicate ? "bg-amber-500/5" : ""}>
                      <TableCell className="text-xs font-medium">{row.liability_type}</TableCell>
                      <TableCell className="text-xs text-right">{row.outstanding_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{row.monthly_payment.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{row.interest_rate}%</TableCell>
                      <TableCell className="text-xs">
                        {row.error ? (
                          <span className="text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {row.error}</span>
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
                Import {rowsToImport.length} liabilit{rowsToImport.length !== 1 ? "ies" : "y"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-foreground">Importing {importProgress} of {importTotal}…</p>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(importProgress / importTotal) * 100}%` }} />
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
            <p className="text-lg font-semibold text-foreground">Import Complete</p>
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
