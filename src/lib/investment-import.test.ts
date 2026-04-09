import { describe, expect, it } from "vitest";
import { parseInvestmentFile } from "@/lib/investment-import";

const makeCsvFile = (name: string, content: string) =>
  ({
    name,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  }) as File;

describe("parseInvestmentFile", () => {
  it("normalizes equity imports from aliased headers", async () => {
    const file = makeCsvFile(
      "equities.csv",
      [
        "Stock Symbol,Trade Date,Shares,Price",
        "INFY.NS,2025-01-15,12,1640",
      ].join("\n")
    );

    const result = await parseInvestmentFile(file, "equities");

    expect(result.missingRequirements).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].normalized).toMatchObject({
      assetType: "equities",
      assetClass: "Indian Stocks",
      tickerSymbol: "INFY.NS",
      quantity: 12,
      unitPrice: 1640,
      totalValue: 19680,
      currency: "INR",
      date: "2025-01-15",
    });
  });

  it("surfaces invalid fixed-deposit rows without blocking valid ones", async () => {
    const file = makeCsvFile(
      "fd.csv",
      [
        "bank_name,amount,interest_rate,start_date,maturity_date",
        "HDFC Bank,250000,7.1,2025-01-01,2026-01-01",
        "ICICI Bank,0,6.8,2025-01-01,2026-01-01",
      ].join("\n")
    );

    const result = await parseInvestmentFile(file, "fixed_deposits");

    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].errors).toContain("Invalid amount");
  });

  it("keeps imported mutual funds API-connected when a scheme code is provided", async () => {
    const file = makeCsvFile(
      "mf.csv",
      [
        "scheme_code,fund_name,date,units,nav",
        "120503,Axis Bluechip Fund,2025-01-08,125.45,58.23",
      ].join("\n")
    );

    const result = await parseInvestmentFile(file, "mutual_funds");

    expect(result.missingRequirements).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].normalized).toMatchObject({
      assetType: "mutual_funds",
      assetClass: "Mutual Funds",
      name: "Axis Bluechip Fund",
      tickerSymbol: "120503",
      apiConnected: true,
      quantity: 125.45,
      unitPrice: 58.23,
      totalValue: 7304.9535,
      currency: "INR",
      date: "2025-01-08",
    });
  });

  it("uses purchase date instead of maturity date for bond imports", async () => {
    const file = makeCsvFile(
      "bonds.csv",
      [
        "issuer,date,face_value,quantity,coupon_rate,maturity_date",
        "GOI 2033,2025-01-20,1000,40,7.3,2033-08-15",
      ].join("\n")
    );

    const result = await parseInvestmentFile(file, "bonds");

    expect(result.missingRequirements).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].normalized).toMatchObject({
      assetType: "bonds",
      assetClass: "Bonds",
      name: "GOI 2033",
      quantity: 40,
      unitPrice: 1000,
      totalValue: 40000,
      currency: "INR",
      date: "2025-01-20",
      metadata: {
        coupon_rate: 7.3,
        maturity_date: "2033-08-15",
        face_value: 1000,
      },
    });
  });
});
