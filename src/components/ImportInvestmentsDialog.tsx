import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  type CanonicalImportField,
  type InvestmentAssetType,
  type ParsedImportRow,
  INVESTMENT_ASSET_TYPES,
  getAssetTypeDefinition,
  getSampleCsvForAssetType,
  parseInvestmentFile,
} from "@/lib/investment-import";

interface ImportInvestmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  baseCurrency: string;
  existingTransactions: Array<{
    ticker_symbol: string | null;
    asset_class: string;
    asset_name: string;
    transaction_date: string;
    quantity: number;
    buy_price: number;
  }>;
  fetchHistoricalFx: (from: string, to: string, date: string) => Promise<number>;
  onImportComplete: () => void;
}

type Step = "configure" | "preview" | "importing" | "done";
type DuplicateAction = "skip" | "import";

const ACCEPTED_TYPES = ".csv,.xlsx,.xls";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const FIELD_LABELS: Record<CanonicalImportField, string> = {
  ticker: "Ticker",
  scheme_code: "Scheme Code",
  date: "Date",
  quantity: "Quantity",
  avg_price: "Average Price",
  fund_name: "Fund Name",
  isin: "ISIN",
  units: "Units",
  nav: "NAV",
  coin: "Coin",
  wallet: "Wallet",
  bank_name: "Bank Name",
  amount: "Amount",
  interest_rate: "Interest Rate",
  start_date: "Start Date",
  maturity_date: "Maturity Date",
  type: "Type",
  issuer: "Issuer",
  face_value: "Face Value",
  coupon_rate: "Coupon Rate",
  name: "Name",
  unit_price: "Unit Price",
  total_value: "Total Value",
  currency: "Currency",
};

const getDuplicateKey = (row: ParsedImportRow) => {
  if (!row.normalized) return null;
  return [
    row.normalized.assetClass,
    row.normalized.tickerSymbol || row.normalized.name,
    row.normalized.date,
    row.normalized.quantity.toFixed(8),
    row.normalized.unitPrice.toFixed(8),
  ].join("|");
};

const shouldCreateTransaction = (row: ParsedImportRow) => !!row.normalized?.apiConnected;

export function ImportInvestmentsDialog({
  open,
  onOpenChange,
  userId,
  baseCurrency,
  existingTransactions,
  fetchHistoricalFx,
  onImportComplete,
}: ImportInvestmentsDialogProps) {
  const [step, setStep] = useState<Step>("configure");
  const [assetType, setAssetType] = useState<InvestmentAssetType>("equities");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<CanonicalImportField, string>>>({});
  const [parseState, setParseState] = useState<{
    loading: boolean;
    headers: string[];
    missingRequirements: string[];
    rows: ParsedImportRow[];
    validRows: ParsedImportRow[];
    invalidRows: ParsedImportRow[];
  }>({
    loading: false,
    headers: [],
    missingRequirements: [],
    rows: [],
    validRows: [],
    invalidRows: [],
  });
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, skipped: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const definition = useMemo(() => getAssetTypeDefinition(assetType), [assetType]);

  const reset = () => {
    setStep("configure");
    setSourceFile(null);
    setFileName("");
    setMapping({});
    setParseState({
      loading: false,
      headers: [],
      missingRequirements: [],
      rows: [],
      validRows: [],
      invalidRows: [],
    });
    setDuplicateAction("skip");
    setImportProgress(0);
    setImportTotal(0);
    setImportResults({ success: 0, skipped: 0, failed: 0 });
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    let cancelled = false;

    const runParse = async () => {
      if (!sourceFile) return;

      setParseState((current) => ({ ...current, loading: true }));

      try {
        const result = await parseInvestmentFile(sourceFile, assetType, mapping);
        if (cancelled) return;

        if (Object.keys(mapping).length === 0 && Object.keys(result.mapping).length > 0) {
          setMapping(result.mapping);
        }
        setParseState({
          loading: false,
          headers: result.headers,
          missingRequirements: result.missingRequirements,
          rows: result.rows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to parse investment file", error);
        setParseState({
          loading: false,
          headers: [],
          missingRequirements: ["Failed to parse file"],
          rows: [],
          validRows: [],
          invalidRows: [],
        });
      }
    };

    void runParse();

    return () => {
      cancelled = true;
    };
  }, [assetType, mapping, sourceFile]);

  const rowsWithDuplicates = useMemo(() => {
    const existing = new Set(
      existingTransactions.map((transaction) =>
        [
          transaction.asset_class,
          transaction.ticker_symbol || transaction.asset_name,
          transaction.transaction_date,
          Number(transaction.quantity).toFixed(8),
          Number(transaction.buy_price).toFixed(8),
        ].join("|")
      )
    );

    return parseState.rows.map((row) => {
      const key = getDuplicateKey(row);
      return {
        ...row,
        isDuplicate: key ? existing.has(key) : false,
      };
    });
  }, [existingTransactions, parseState.rows]);

  const validRows = useMemo(
    () => rowsWithDuplicates.filter((row) => row.errors.length === 0 && row.normalized),
    [rowsWithDuplicates]
  );
  const invalidRows = useMemo(
    () => rowsWithDuplicates.filter((row) => row.errors.length > 0),
    [rowsWithDuplicates]
  );
  const duplicateRows = useMemo(
    () => validRows.filter((row) => row.isDuplicate),
    [validRows]
  );
  const rowsToImport = useMemo(
    () => (duplicateAction === "skip" ? validRows.filter((row) => !row.isDuplicate) : validRows),
    [duplicateAction, validRows]
  );

  const fieldOptions = useMemo(() => {
    const seen = new Set<CanonicalImportField>();
    return definition.requirements.flatMap((requirement) =>
      requirement.fieldOptions.filter((field) => {
        if (seen.has(field)) return false;
        seen.add(field);
        return true;
      })
    );
  }, [definition.requirements]);

  const handleAssetTypeChange = (value: string) => {
    const nextAssetType = value as InvestmentAssetType;
    setAssetType(nextAssetType);
    setMapping({});
    setStep("configure");
  };

  const updateFieldMapping = (field: CanonicalImportField, header: string) => {
    setMapping((current) => {
      const next = { ...current };
      next[field] = header === "__none__" ? "" : header;
      return next;
    });
  };

  const prepareFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 5 MB limit");
      return;
    }

    setSourceFile(file);
    setFileName(file.name);
    setStep("configure");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) prepareFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) prepareFile(file);
  };

  const downloadSampleCsv = () => {
    const csv = getSampleCsvForAssetType(assetType);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${assetType}-sample.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleReviewImport = () => {
    if (!sourceFile) {
      toast.error("Choose a file first");
      return;
    }
    if (parseState.missingRequirements.length > 0) {
      toast.error(`Map the required columns: ${parseState.missingRequirements.join(", ")}`);
      return;
    }
    setStep("preview");
  };

  const handleImport = async () => {
    if (rowsToImport.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setStep("importing");
    setImportTotal(rowsToImport.length);

    let success = 0;
    let failed = 0;
    const skipped = duplicateAction === "skip" ? duplicateRows.length : 0;

    for (let index = 0; index < rowsToImport.length; index += 1) {
      const row = rowsToImport[index];
      const normalized = row.normalized;
      setImportProgress(index + 1);

      if (!normalized) {
        failed += 1;
        continue;
      }

      try {
        const fxRate =
          normalized.currency === baseCurrency
            ? 1
            : await fetchHistoricalFx(normalized.currency, baseCurrency, normalized.date);

        const investmentPayload = {
          user_id: userId,
          asset_class: normalized.assetClass,
          asset_name: normalized.name,
          quantity: normalized.quantity,
          avg_buy_price: normalized.unitPrice,
          invested_value: normalized.totalValue,
          current_value: normalized.apiConnected ? null : normalized.totalValue,
          currency: normalized.currency,
          ticker_symbol: normalized.tickerSymbol || null,
          fx_rate: fxRate,
          base_currency_value: normalized.totalValue * fxRate,
          api_connected: normalized.apiConnected,
          current_price: null,
          last_price_update: null,
          last_updated: new Date().toISOString(),
          notes: normalized.metadata ? JSON.stringify(normalized.metadata) : null,
        };

        const { data: inserted, error } = await supabase
          .from("investments")
          .insert(investmentPayload as any)
          .select()
          .single();

        if (error) throw error;

        if (inserted && shouldCreateTransaction(row)) {
          const { error: txError } = await supabase.from("investment_transactions").insert({
            user_id: userId,
            investment_id: (inserted as any).id,
            ticker_symbol: normalized.tickerSymbol || null,
            asset_class: normalized.assetClass,
            asset_name: normalized.name,
            quantity: normalized.quantity,
            buy_price: normalized.unitPrice,
            currency: normalized.currency,
            fx_rate_at_purchase: fxRate,
            transaction_date: normalized.date,
            transaction_type: "buy",
          } as any);

          if (txError) throw txError;
        }

        success += 1;
      } catch (error) {
        console.error(`Import failed for row ${row.rowNumber}`, error);
        failed += 1;
      }
    }

    setImportResults({ success, skipped, failed });
    setStep("done");
    if (success > 0) onImportComplete();
  };

  const previewFields = definition.previewFields.filter(
    (field) => mapping[field] || field === "currency"
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Investments
          </DialogTitle>
        </DialogHeader>

        {step === "configure" && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label htmlFor="asset-type">Asset Type</Label>
                <Select value={assetType} onValueChange={handleAssetTypeChange}>
                  <SelectTrigger id="asset-type">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVESTMENT_ASSET_TYPES.map((option) => (
                      <SelectItem key={option.type} value={option.type}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{definition.description}</p>
              </div>

              <div className="space-y-2">
                <Label>Sample Template</Label>
                <Button variant="outline" className="w-full gap-2" onClick={downloadSampleCsv}>
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Expected fields</p>
              <div className="flex flex-wrap gap-2">
                {definition.requirements.map((requirement) => (
                  <Badge key={requirement.key} variant={requirement.optional ? "secondary" : "outline"}>
                    {requirement.label}
                    {requirement.optional ? " optional" : ""}
                  </Badge>
                ))}
              </div>
            </div>

            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Drop a file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, XLSX, or XLS. Max 5 MB.</p>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {sourceFile && (
              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {parseState.headers.length} detected column{parseState.headers.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                      <RefreshCw className="mr-1 h-4 w-4" />
                      Change file
                    </Button>
                    <Button onClick={handleReviewImport} disabled={parseState.loading}>
                      Review import
                    </Button>
                  </div>
                </div>

                {parseState.loading && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Parsing file
                    </div>
                    <Progress value={40} />
                  </div>
                )}

                {parseState.missingRequirements.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Missing required mappings: {parseState.missingRequirements.join(", ")}
                    </AlertDescription>
                  </Alert>
                )}

                {parseState.headers.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Column mapping</p>
                      <p className="text-xs text-muted-foreground">
                        Map your file headers to the normalized import schema.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {fieldOptions.map((field) => (
                        <div key={field} className="space-y-1.5">
                          <Label>{FIELD_LABELS[field]}</Label>
                          <Select
                            value={mapping[field] ?? "__none__"}
                            onValueChange={(value) => updateFieldMapping(field, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Not mapped</SelectItem>
                              {parseState.headers.map((header) => (
                                <SelectItem key={`${field}-${header}`} value={header}>
                                  {header}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">
                  <span className="font-medium">{fileName}</span> for {definition.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {rowsWithDuplicates.length} parsed rows, {validRows.length} valid, {invalidRows.length} invalid
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("configure")}>
                  Back
                </Button>
                <Button variant="ghost" onClick={reset}>
                  <X className="mr-1 h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {invalidRows.length} invalid
                </Badge>
              )}
              {duplicateRows.length > 0 && (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                  {duplicateRows.length} duplicates
                </Badge>
              )}
            </div>

            {duplicateRows.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {duplicateRows.length} potential duplicate transaction{duplicateRows.length === 1 ? "" : "s"}
                </p>
                <RadioGroup
                  value={duplicateAction}
                  onValueChange={(value) => setDuplicateAction(value as DuplicateAction)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="skip" id="skip-duplicates" />
                    <Label htmlFor="skip-duplicates" className="text-sm">
                      Skip duplicates
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="import" id="import-duplicates" />
                    <Label htmlFor="import-duplicates" className="text-sm">
                      Import anyway
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {invalidRows.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Invalid rows will be skipped. The preview table marks row-level errors inline.
                </AlertDescription>
              </Alert>
            )}

            <div className="max-h-[46vh] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Row</TableHead>
                    {previewFields.map((field) => (
                      <TableHead key={field} className="text-xs">
                        {FIELD_LABELS[field]}
                      </TableHead>
                    ))}
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithDuplicates.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={row.errors.length > 0 ? "bg-destructive/5" : row.isDuplicate ? "bg-amber-500/5" : ""}
                    >
                      <TableCell className="text-xs text-muted-foreground">#{row.rowNumber}</TableCell>
                      {previewFields.map((field) => (
                        <TableCell key={`${row.rowNumber}-${field}`} className="text-xs">
                          {row.preview[field] || "-"}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs">
                        {row.errors.length > 0 ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            {row.errors.join(", ")}
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
              <Button variant="outline" onClick={() => setStep("configure")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={rowsToImport.length === 0} className="gap-2">
                <Upload className="h-4 w-4" />
                Import {rowsToImport.length} row{rowsToImport.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <div className="space-y-2">
              <p className="text-sm text-foreground">
                Importing {importProgress} of {importTotal}
              </p>
              <Progress value={importTotal > 0 ? (importProgress / importTotal) * 100 : 0} />
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-foreground">Import finished</p>
                <p className="text-sm text-muted-foreground">
                  {importResults.success} imported, {importResults.skipped} skipped, {importResults.failed} failed
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
