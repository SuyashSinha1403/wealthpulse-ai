import * as XLSX from "xlsx";

export type InvestmentAssetType =
  | "equities"
  | "mutual_funds"
  | "crypto"
  | "fixed_deposits"
  | "gold"
  | "bonds"
  | "other";

export type CanonicalImportField =
  | "ticker"
  | "scheme_code"
  | "date"
  | "quantity"
  | "avg_price"
  | "fund_name"
  | "isin"
  | "units"
  | "nav"
  | "coin"
  | "wallet"
  | "bank_name"
  | "amount"
  | "interest_rate"
  | "start_date"
  | "maturity_date"
  | "type"
  | "issuer"
  | "face_value"
  | "coupon_rate"
  | "name"
  | "unit_price"
  | "total_value"
  | "currency";

export interface ColumnRequirement {
  key: string;
  label: string;
  fieldOptions: CanonicalImportField[];
  optional?: boolean;
}

export interface AssetTypeDefinition {
  type: InvestmentAssetType;
  label: string;
  description: string;
  defaultCurrency: string;
  requirements: ColumnRequirement[];
  previewFields: CanonicalImportField[];
  aliases: Partial<Record<CanonicalImportField, string[]>>;
  sampleHeaders: CanonicalImportField[];
  sampleRows: Partial<Record<CanonicalImportField, string | number>>[];
}

export interface NormalizedInvestmentImport {
  assetType: InvestmentAssetType;
  assetClass: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  currency: string;
  date: string;
  metadata: Record<string, string | number>;
  tickerSymbol: string | null;
  apiConnected: boolean;
}

export interface ParsedImportRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  values: Partial<Record<CanonicalImportField, string>>;
  preview: Partial<Record<CanonicalImportField, string>>;
  normalized?: NormalizedInvestmentImport;
  errors: string[];
  isDuplicate?: boolean;
}

export interface ParsedInvestmentFileResult {
  headers: string[];
  mapping: Partial<Record<CanonicalImportField, string>>;
  missingRequirements: string[];
  rows: ParsedImportRow[];
  validRows: ParsedImportRow[];
  invalidRows: ParsedImportRow[];
}

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[%()]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const parseDate = (raw: unknown): string | null => {
  if (!raw) return null;

  const numericRaw = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (Number.isFinite(numericRaw) && numericRaw > 20000) {
    const parsed = XLSX.SSF.parse_date_code(numericRaw);
    if (parsed) {
      const year = String(parsed.y).padStart(4, "0");
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  const text = String(raw).trim();

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().split("T")[0];
  }

  const parts = text.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map((part) => part.trim());
    if (Number(c) > 100) {
      const guess = new Date(`${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`);
      if (!Number.isNaN(guess.getTime())) return guess.toISOString().split("T")[0];
    }
  }

  return null;
};

const toNumber = (raw: unknown): number | null => {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const normalized = String(raw).replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (raw: unknown): string => {
  if (raw == null) return "";
  return String(raw).trim();
};

const buildAliases = (aliases: string[] = []) => aliases.map(normalizeHeader);

const ASSET_TYPE_DEFINITIONS: Record<InvestmentAssetType, AssetTypeDefinition> = {
  equities: {
    type: "equities",
    label: "Equities",
    description: "Stocks and listed shares",
    defaultCurrency: "USD",
    requirements: [
      { key: "ticker", label: "Ticker", fieldOptions: ["ticker"] },
      { key: "date", label: "Date", fieldOptions: ["date"] },
      { key: "quantity", label: "Quantity", fieldOptions: ["quantity"] },
      { key: "avg_price", label: "Average Price", fieldOptions: ["avg_price"] },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["ticker", "date", "quantity", "avg_price", "currency"],
    aliases: {
      ticker: ["symbol", "stock_symbol", "stock", "security", "stock_ticker"],
      date: ["purchase_date", "trade_date", "investment_date"],
      quantity: ["qty", "shares", "units"],
      avg_price: ["price", "avg_cost", "average_price", "buy_price", "purchase_price"],
      currency: ["ccy"],
    },
    sampleHeaders: ["ticker", "date", "quantity", "avg_price", "currency"],
    sampleRows: [
      { ticker: "AAPL", date: "2025-01-15", quantity: 10, avg_price: 185.5, currency: "USD" },
      { ticker: "INFY.NS", date: "2025-02-02", quantity: 25, avg_price: 1640, currency: "INR" },
    ],
  },
  mutual_funds: {
    type: "mutual_funds",
    label: "Mutual Funds",
    description: "Funds tracked by scheme code with optional fund metadata",
    defaultCurrency: "INR",
    requirements: [
      { key: "scheme_code", label: "Scheme Code", fieldOptions: ["scheme_code"] },
      { key: "fund_name", label: "Fund Name", fieldOptions: ["fund_name"], optional: true },
      { key: "isin", label: "ISIN", fieldOptions: ["isin"], optional: true },
      { key: "date", label: "Date", fieldOptions: ["date"] },
      { key: "units", label: "Units", fieldOptions: ["units"] },
      { key: "nav", label: "NAV", fieldOptions: ["nav"] },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["scheme_code", "fund_name", "isin", "date", "units", "nav", "currency"],
    aliases: {
      scheme_code: ["amfi_code", "code", "scheme", "scheme_id", "ticker"],
      fund_name: ["scheme_name", "fund", "scheme", "name"],
      isin: ["fund_isin"],
      date: ["purchase_date", "allotment_date"],
      units: ["qty", "quantity"],
      nav: ["avg_price", "price", "purchase_nav"],
      currency: ["ccy"],
    },
    sampleHeaders: ["scheme_code", "fund_name", "isin", "date", "units", "nav", "currency"],
    sampleRows: [
      {
        scheme_code: 120503,
        fund_name: "Axis Bluechip Fund",
        isin: "INF846K01EW2",
        date: "2025-01-08",
        units: 125.45,
        nav: 58.23,
        currency: "INR",
      },
    ],
  },
  crypto: {
    type: "crypto",
    label: "Crypto",
    description: "Coins and tokens across wallets",
    defaultCurrency: "USD",
    requirements: [
      { key: "coin", label: "Coin", fieldOptions: ["coin"] },
      { key: "date", label: "Date", fieldOptions: ["date"] },
      { key: "quantity", label: "Quantity", fieldOptions: ["quantity"] },
      { key: "avg_price", label: "Average Price", fieldOptions: ["avg_price"] },
      { key: "wallet", label: "Wallet", fieldOptions: ["wallet"], optional: true },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["coin", "date", "quantity", "avg_price", "wallet", "currency"],
    aliases: {
      coin: ["token", "symbol", "asset"],
      date: ["purchase_date", "trade_date"],
      quantity: ["qty", "units"],
      avg_price: ["price", "cost_basis", "buy_price"],
      wallet: ["exchange", "platform", "account"],
      currency: ["quote_currency", "ccy"],
    },
    sampleHeaders: ["coin", "date", "quantity", "avg_price", "wallet", "currency"],
    sampleRows: [
      { coin: "BTC", date: "2025-01-10", quantity: 0.15, avg_price: 94120, wallet: "Ledger", currency: "USD" },
    ],
  },
  fixed_deposits: {
    type: "fixed_deposits",
    label: "Fixed Deposits",
    description: "Bank deposits with maturity details",
    defaultCurrency: "INR",
    requirements: [
      { key: "bank_name", label: "Bank Name", fieldOptions: ["bank_name"] },
      { key: "amount", label: "Amount", fieldOptions: ["amount"] },
      { key: "interest_rate", label: "Interest Rate", fieldOptions: ["interest_rate"] },
      { key: "start_date", label: "Start Date", fieldOptions: ["start_date"] },
      { key: "maturity_date", label: "Maturity Date", fieldOptions: ["maturity_date"] },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["bank_name", "amount", "interest_rate", "start_date", "maturity_date", "currency"],
    aliases: {
      bank_name: ["bank", "institution", "issuer"],
      amount: ["principal", "deposit_amount", "value"],
      interest_rate: ["rate", "roi", "interest"],
      start_date: ["date", "booking_date", "investment_date"],
      maturity_date: ["end_date", "maturity"],
      currency: ["ccy"],
    },
    sampleHeaders: ["bank_name", "amount", "interest_rate", "start_date", "maturity_date", "currency"],
    sampleRows: [
      {
        bank_name: "HDFC Bank",
        amount: 250000,
        interest_rate: 7.1,
        start_date: "2025-01-01",
        maturity_date: "2026-01-01",
        currency: "INR",
      },
    ],
  },
  gold: {
    type: "gold",
    label: "Gold",
    description: "Physical gold or sovereign bonds",
    defaultCurrency: "INR",
    requirements: [
      { key: "type", label: "Type", fieldOptions: ["type"] },
      { key: "quantity", label: "Quantity (grams)", fieldOptions: ["quantity"] },
      { key: "avg_price", label: "Average Price", fieldOptions: ["avg_price"] },
      { key: "date", label: "Date", fieldOptions: ["date"] },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["type", "quantity", "avg_price", "date", "currency"],
    aliases: {
      type: ["gold_type", "holding_type", "asset_type"],
      quantity: ["grams", "qty"],
      avg_price: ["price", "price_per_gram", "buy_price"],
      date: ["purchase_date", "issue_date"],
      currency: ["ccy"],
    },
    sampleHeaders: ["type", "quantity", "avg_price", "date", "currency"],
    sampleRows: [
      { type: "SGB", quantity: 20, avg_price: 6235, date: "2025-02-14", currency: "INR" },
    ],
  },
  bonds: {
    type: "bonds",
    label: "Bonds",
    description: "Government and corporate bonds",
    defaultCurrency: "INR",
    requirements: [
      { key: "issuer", label: "Issuer", fieldOptions: ["issuer"] },
      { key: "date", label: "Purchase Date", fieldOptions: ["date"] },
      { key: "face_value", label: "Face Value", fieldOptions: ["face_value"] },
      { key: "quantity", label: "Quantity", fieldOptions: ["quantity"] },
      { key: "coupon_rate", label: "Coupon Rate", fieldOptions: ["coupon_rate"] },
      { key: "maturity_date", label: "Maturity Date", fieldOptions: ["maturity_date"] },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["issuer", "date", "face_value", "quantity", "coupon_rate", "maturity_date", "currency"],
    aliases: {
      issuer: ["bond_name", "name"],
      date: ["purchase_date", "investment_date", "booking_date"],
      face_value: ["par_value", "unit_price", "price"],
      quantity: ["qty", "units"],
      coupon_rate: ["coupon", "interest_rate"],
      maturity_date: ["maturity", "end_date"],
      currency: ["ccy"],
    },
    sampleHeaders: ["issuer", "date", "face_value", "quantity", "coupon_rate", "maturity_date", "currency"],
    sampleRows: [
      { issuer: "GOI 2033", date: "2025-01-20", face_value: 1000, quantity: 40, coupon_rate: 7.3, maturity_date: "2033-08-15", currency: "INR" },
    ],
  },
  other: {
    type: "other",
    label: "Other",
    description: "Custom assets with manual mapping",
    defaultCurrency: "INR",
    requirements: [
      { key: "name", label: "Name", fieldOptions: ["name"] },
      { key: "date", label: "Date", fieldOptions: ["date"] },
      { key: "quantity", label: "Quantity", fieldOptions: ["quantity"] },
      { key: "unit_price", label: "Unit Price", fieldOptions: ["unit_price"] },
      { key: "currency", label: "Currency", fieldOptions: ["currency"], optional: true },
    ],
    previewFields: ["name", "date", "quantity", "unit_price", "currency"],
    aliases: {
      name: ["asset_name", "holding_name", "instrument"],
      date: ["purchase_date", "investment_date"],
      quantity: ["qty", "units"],
      unit_price: ["price", "avg_price", "buy_price", "face_value"],
      total_value: ["amount", "value"],
      currency: ["ccy"],
    },
    sampleHeaders: ["name", "date", "quantity", "unit_price", "currency"],
    sampleRows: [
      { name: "Unlisted Startup Shares", date: "2025-01-20", quantity: 100, unit_price: 125, currency: "INR" },
    ],
  },
};

export const INVESTMENT_ASSET_TYPES = Object.values(ASSET_TYPE_DEFINITIONS);

export const getAssetTypeDefinition = (assetType: InvestmentAssetType) => ASSET_TYPE_DEFINITIONS[assetType];

export const getSampleCsvForAssetType = (assetType: InvestmentAssetType) => {
  const definition = getAssetTypeDefinition(assetType);
  const rows = [definition.sampleHeaders.join(",")];

  definition.sampleRows.forEach((row) => {
    rows.push(
      definition.sampleHeaders
        .map((header) => {
          const value = row[header];
          return typeof value === "string" && value.includes(",") ? `"${value}"` : String(value ?? "");
        })
        .join(",")
    );
  });

  return rows.join("\n");
};

const inferCurrency = (
  assetType: InvestmentAssetType,
  values: Partial<Record<CanonicalImportField, string>>
) => {
  const explicit = values.currency?.trim().toUpperCase();
  if (explicit) return explicit;

  if (assetType === "equities") {
    const ticker = values.ticker?.toUpperCase() ?? "";
    if (ticker.endsWith(".NS") || ticker.endsWith(".BO")) return "INR";
  }

  return getAssetTypeDefinition(assetType).defaultCurrency;
};

const normalizeEquityTicker = (ticker: string) => {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return "";
  if (upper.endsWith(".NS") || upper.endsWith(".BO")) return upper;
  return upper;
};

const normalizeCryptoTicker = (coin: string) => {
  const upper = coin.trim().toUpperCase();
  if (!upper) return "";
  return upper.endsWith("-USD") ? upper : `${upper}-USD`;
};

const toPreviewValue = (value: unknown) => (value == null ? "" : String(value));

const normalizeRow = (
  assetType: InvestmentAssetType,
  values: Partial<Record<CanonicalImportField, string>>
): { normalized?: NormalizedInvestmentImport; errors: string[] } => {
  const errors: string[] = [];
  const currency = inferCurrency(assetType, values);

  switch (assetType) {
    case "equities": {
      const ticker = toText(values.ticker).toUpperCase();
      const date = parseDate(toText(values.date));
      const quantity = toNumber(values.quantity);
      const unitPrice = toNumber(values.avg_price);
      if (!ticker) errors.push("Missing ticker");
      if (!date) errors.push("Invalid date");
      if (quantity == null || quantity <= 0) errors.push("Invalid quantity");
      if (unitPrice == null || unitPrice <= 0) errors.push("Invalid average price");
      if (errors.length > 0) return { errors };

      const normalizedTicker = normalizeEquityTicker(ticker);
      return {
        errors,
        normalized: {
          assetType,
          assetClass: normalizedTicker.endsWith(".NS") || normalizedTicker.endsWith(".BO") ? "Indian Stocks" : "US Stocks",
          name: normalizedTicker,
          quantity: quantity!,
          unitPrice: unitPrice!,
          totalValue: quantity! * unitPrice!,
          currency,
          date: date!,
          metadata: {},
          tickerSymbol: normalizedTicker,
          apiConnected: true,
        },
      };
    }
    case "mutual_funds": {
      const schemeCode = toText(values.scheme_code);
      const fundName = toText(values.fund_name);
      const isin = toText(values.isin).toUpperCase();
      const date = parseDate(toText(values.date));
      const quantity = toNumber(values.units);
      const unitPrice = toNumber(values.nav);
      const name = fundName || schemeCode || isin;
      if (!schemeCode) errors.push("Missing scheme code");
      if (!date) errors.push("Invalid date");
      if (quantity == null || quantity <= 0) errors.push("Invalid units");
      if (unitPrice == null || unitPrice <= 0) errors.push("Invalid NAV");
      if (errors.length > 0) return { errors };

      return {
        errors,
        normalized: {
          assetType,
          assetClass: "Mutual Funds",
          name,
          quantity: quantity!,
          unitPrice: unitPrice!,
          totalValue: quantity! * unitPrice!,
          currency,
          date: date!,
          metadata: {
            scheme_code: schemeCode,
            ...(fundName ? { fund_name: fundName } : {}),
            ...(isin ? { isin } : {}),
            nav: unitPrice!,
          },
          tickerSymbol: schemeCode,
          apiConnected: true,
        },
      };
    }
    case "crypto": {
      const coin = toText(values.coin).toUpperCase();
      const date = parseDate(toText(values.date));
      const quantity = toNumber(values.quantity);
      const unitPrice = toNumber(values.avg_price);
      const wallet = toText(values.wallet);
      if (!coin) errors.push("Missing coin");
      if (!date) errors.push("Invalid date");
      if (quantity == null || quantity <= 0) errors.push("Invalid quantity");
      if (unitPrice == null || unitPrice <= 0) errors.push("Invalid average price");
      if (errors.length > 0) return { errors };

      return {
        errors,
        normalized: {
          assetType,
          assetClass: "Crypto",
          name: coin,
          quantity: quantity!,
          unitPrice: unitPrice!,
          totalValue: quantity! * unitPrice!,
          currency,
          date: date!,
          metadata: wallet ? { wallet } : {},
          tickerSymbol: normalizeCryptoTicker(coin),
          apiConnected: true,
        },
      };
    }
    case "fixed_deposits": {
      const bankName = toText(values.bank_name);
      const amount = toNumber(values.amount);
      const interestRate = toNumber(values.interest_rate);
      const startDate = parseDate(toText(values.start_date));
      const maturityDate = parseDate(toText(values.maturity_date));
      if (!bankName) errors.push("Missing bank name");
      if (amount == null || amount <= 0) errors.push("Invalid amount");
      if (interestRate == null || interestRate < 0) errors.push("Invalid interest rate");
      if (!startDate) errors.push("Invalid start date");
      if (!maturityDate) errors.push("Invalid maturity date");
      if (errors.length > 0) return { errors };

      return {
        errors,
        normalized: {
          assetType,
          assetClass: "Fixed Deposits",
          name: bankName,
          quantity: 1,
          unitPrice: amount!,
          totalValue: amount!,
          currency,
          date: startDate!,
          metadata: {
            interest_rate: interestRate!,
            maturity_date: maturityDate!,
            start_date: startDate!,
          },
          tickerSymbol: null,
          apiConnected: false,
        },
      };
    }
    case "gold": {
      const goldType = toText(values.type);
      const quantity = toNumber(values.quantity);
      const unitPrice = toNumber(values.avg_price);
      const date = parseDate(toText(values.date));
      if (!goldType) errors.push("Missing gold type");
      if (quantity == null || quantity <= 0) errors.push("Invalid quantity");
      if (unitPrice == null || unitPrice <= 0) errors.push("Invalid average price");
      if (!date) errors.push("Invalid date");
      if (errors.length > 0) return { errors };

      return {
        errors,
        normalized: {
          assetType,
          assetClass: "Gold",
          name: `Gold (${goldType})`,
          quantity: quantity!,
          unitPrice: unitPrice!,
          totalValue: quantity! * unitPrice!,
          currency,
          date: date!,
          metadata: { type: goldType },
          tickerSymbol: null,
          apiConnected: false,
        },
      };
    }
    case "bonds": {
      const issuer = toText(values.issuer);
      const date = parseDate(toText(values.date));
      const unitPrice = toNumber(values.face_value);
      const quantity = toNumber(values.quantity);
      const couponRate = toNumber(values.coupon_rate);
      const maturityDate = parseDate(toText(values.maturity_date));
      if (!issuer) errors.push("Missing issuer");
      if (!date) errors.push("Invalid purchase date");
      if (unitPrice == null || unitPrice <= 0) errors.push("Invalid face value");
      if (quantity == null || quantity <= 0) errors.push("Invalid quantity");
      if (couponRate == null || couponRate < 0) errors.push("Invalid coupon rate");
      if (!maturityDate) errors.push("Invalid maturity date");
      if (errors.length > 0) return { errors };

      return {
        errors,
        normalized: {
          assetType,
          assetClass: "Bonds",
          name: issuer,
          quantity: quantity!,
          unitPrice: unitPrice!,
          totalValue: quantity! * unitPrice!,
          currency,
          date: date!,
          metadata: {
            coupon_rate: couponRate!,
            maturity_date: maturityDate!,
            face_value: unitPrice!,
          },
          tickerSymbol: null,
          apiConnected: false,
        },
      };
    }
    case "other": {
      const name = toText(values.name);
      const date = parseDate(toText(values.date));
      const quantity = toNumber(values.quantity);
      const unitPrice = toNumber(values.unit_price);
      const totalValue = toNumber(values.total_value);
      if (!name) errors.push("Missing name");
      if (!date) errors.push("Invalid date");
      if (quantity == null || quantity <= 0) errors.push("Invalid quantity");
      if (unitPrice == null || unitPrice <= 0) errors.push("Invalid unit price");
      if (errors.length > 0) return { errors };

      return {
        errors,
        normalized: {
          assetType,
          assetClass: "Custom Asset",
          name,
          quantity: quantity!,
          unitPrice: unitPrice!,
          totalValue: totalValue && totalValue > 0 ? totalValue : quantity! * unitPrice!,
          currency,
          date: date!,
          metadata: {},
          tickerSymbol: null,
          apiConnected: false,
        },
      };
    }
  }
};

const readRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const extension = file.name.split(".").pop()?.toLowerCase();

  let workbook: XLSX.WorkBook;
  if (extension === "csv") {
    const text =
      typeof file.text === "function"
        ? await file.text()
        : new TextDecoder().decode(await file.arrayBuffer());
    workbook = XLSX.read(text, { type: "string" });
  } else {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};

const buildSuggestedMapping = (
  headers: string[],
  assetType: InvestmentAssetType
): Partial<Record<CanonicalImportField, string>> => {
  const definition = getAssetTypeDefinition(assetType);
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapping: Partial<Record<CanonicalImportField, string>> = {};

  Object.entries(definition.aliases).forEach(([field, aliases]) => {
    const options = new Set([field, ...buildAliases(aliases)]);
    for (const option of options) {
      const match = normalizedHeaders.get(option);
      if (match) {
        mapping[field as CanonicalImportField] = match;
        break;
      }
    }
  });

  return mapping;
};

const collectMissingRequirements = (
  definition: AssetTypeDefinition,
  mapping: Partial<Record<CanonicalImportField, string>>
) =>
  definition.requirements
    .filter((requirement) => {
      if (requirement.optional) return false;
      return !requirement.fieldOptions.some((field) => !!mapping[field]);
    })
    .map((requirement) => requirement.label);

export async function parseInvestmentFile(
  file: File,
  assetType: InvestmentAssetType,
  providedMapping?: Partial<Record<CanonicalImportField, string>>
): Promise<ParsedInvestmentFileResult> {
  const rawRows = await readRows(file);
  if (rawRows.length === 0) {
    return {
      headers: [],
      mapping: {},
      missingRequirements: ["The file has no data rows"],
      rows: [],
      validRows: [],
      invalidRows: [],
    };
  }

  const headers = Object.keys(rawRows[0]);
  const suggestedMapping = buildSuggestedMapping(headers, assetType);
  const mapping = { ...suggestedMapping, ...providedMapping };
  const definition = getAssetTypeDefinition(assetType);
  const missingRequirements = collectMissingRequirements(definition, mapping);

  const rows = rawRows.map((raw, index) => {
    const values: Partial<Record<CanonicalImportField, string>> = {};

    Object.keys(mapping).forEach((key) => {
      const field = key as CanonicalImportField;
      const sourceHeader = mapping[field];
      if (!sourceHeader) return;
      values[field] = toPreviewValue(raw[sourceHeader]);
    });

    const { normalized, errors } =
      missingRequirements.length === 0 ? normalizeRow(assetType, values) : { normalized: undefined, errors: [] };

    return {
      rowNumber: index + 2,
      raw,
      values,
      preview: values,
      normalized,
      errors,
    } satisfies ParsedImportRow;
  });

  return {
    headers,
    mapping,
    missingRequirements,
    rows,
    validRows: rows.filter((row) => row.errors.length === 0 && row.normalized),
    invalidRows: rows.filter((row) => row.errors.length > 0),
  };
}
