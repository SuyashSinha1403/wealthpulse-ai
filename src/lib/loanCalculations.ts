export function calculateEMI(principal: number, annualRate: number, tenureMonths: number): number {
  if (annualRate === 0) return principal / tenureMonths;
  const r = annualRate / 12 / 100;
  const n = tenureMonths;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function calculateMaxLoan(emi: number, annualRate: number, tenureMonths: number): number {
  if (annualRate === 0) return emi * tenureMonths;
  const r = annualRate / 12 / 100;
  const n = tenureMonths;
  return emi * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
}

export function calculateTenure(principal: number, annualRate: number, emi: number): number {
  if (annualRate === 0) return Math.ceil(principal / emi);
  const r = annualRate / 12 / 100;
  if (emi <= principal * r) return Infinity; // EMI too low
  return Math.ceil(Math.log(emi / (emi - principal * r)) / Math.log(1 + r));
}

export interface AmortizationRow {
  month: number;
  emi: number;
  interest: number;
  principal: number;
  balance: number;
}

export function generateAmortization(
  loanAmount: number,
  annualRate: number,
  tenureMonths: number,
  startDate?: Date
): AmortizationRow[] {
  const emi = calculateEMI(loanAmount, annualRate, tenureMonths);
  const r = annualRate / 12 / 100;
  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let i = 1; i <= tenureMonths; i++) {
    const interest = annualRate === 0 ? 0 : balance * r;
    const principalPart = emi - interest;
    balance = Math.max(0, balance - principalPart);
    rows.push({
      month: i,
      emi: Math.round(emi),
      interest: Math.round(interest),
      principal: Math.round(principalPart),
      balance: Math.round(balance),
    });
  }
  return rows;
}

export function calculatePrepaymentImpact(
  currentBalance: number,
  annualRate: number,
  currentEMI: number,
  remainingMonths: number,
  extraPayment: number,
  type: "lumpsum" | "increased_emi" = "lumpsum"
) {
  const totalWithout = currentEMI * remainingMonths;
  const interestWithout = totalWithout - currentBalance;

  const r = annualRate / 12 / 100;
  let balance = type === "lumpsum" ? currentBalance - extraPayment : currentBalance;
  const newEMI = type === "increased_emi" ? currentEMI + extraPayment : currentEMI;
  let months = 0;
  let totalInterest = 0;

  while (balance > 0 && months < 600) {
    const interest = annualRate === 0 ? 0 : balance * r;
    const principalPart = newEMI - interest;
    if (principalPart <= 0) break;
    totalInterest += interest;
    balance -= principalPart;
    months++;
  }

  return {
    newMonths: months,
    monthsSaved: remainingMonths - months,
    interestSaved: Math.round(interestWithout - totalInterest),
    yearsSaved: Number(((remainingMonths - months) / 12).toFixed(1)),
  };
}

export function getLoanStatus(
  originalAmount: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date
) {
  const schedule = generateAmortization(originalAmount, annualRate, tenureMonths, startDate);
  const now = new Date();
  const monthsElapsed = Math.max(0,
    (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth())
  );
  const paidMonths = Math.min(monthsElapsed, tenureMonths);

  let principalPaid = 0;
  let interestPaid = 0;
  for (let i = 0; i < paidMonths; i++) {
    principalPaid += schedule[i].principal;
    interestPaid += schedule[i].interest;
  }

  const remainingBalance = paidMonths > 0 && paidMonths <= schedule.length
    ? schedule[paidMonths - 1].balance
    : originalAmount;

  let totalInterestRemaining = 0;
  for (let i = paidMonths; i < schedule.length; i++) {
    totalInterestRemaining += schedule[i].interest;
  }

  return {
    remainingBalance,
    principalPaid,
    interestPaid,
    monthsRemaining: tenureMonths - paidMonths,
    totalInterestRemaining,
    completionPercent: Number(((paidMonths / tenureMonths) * 100).toFixed(1)),
    paidMonths,
    emi: schedule[0]?.emi || 0,
  };
}

// ─── Revolving Credit (Credit Card) Calculations ───

export const REVOLVING_TYPES = ["Credit Card", "Overdraft", "Line of Credit"];

export function isRevolvingCredit(liabilityType: string): boolean {
  return REVOLVING_TYPES.includes(liabilityType);
}

export interface CreditCardPayoffResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
  schedule: { month: number; payment: number; interest: number; principal: number; balance: number }[];
}

export function calculateCreditCardPayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
  maxMonths = 600
): CreditCardPayoffResult {
  const r = annualRate / 12 / 100;
  let remaining = balance;
  let months = 0;
  let totalInterest = 0;
  const schedule: CreditCardPayoffResult["schedule"] = [];

  while (remaining > 0.01 && months < maxMonths) {
    const interest = remaining * r;
    const principalPart = Math.min(remaining, monthlyPayment - interest);
    if (principalPart <= 0) {
      return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, schedule };
    }
    remaining = Math.max(0, remaining - principalPart);
    totalInterest += interest;
    months++;
    schedule.push({
      month: months,
      payment: Math.round(Math.min(monthlyPayment, principalPart + interest)),
      interest: Math.round(interest),
      principal: Math.round(principalPart),
      balance: Math.round(remaining),
    });
  }

  return {
    months,
    totalInterest: Math.round(totalInterest),
    totalPaid: Math.round(balance + totalInterest),
    schedule,
  };
}

export function getCreditUtilization(balance: number, creditLimit: number): number {
  if (creditLimit <= 0) return 0;
  return (balance / creditLimit) * 100;
}

export function getCreditUtilizationLabel(utilization: number): { label: string; color: string; bg: string } {
  if (utilization < 30) return { label: "Healthy", color: "text-primary", bg: "bg-primary/10" };
  if (utilization < 50) return { label: "Moderate", color: "text-yellow-500", bg: "bg-yellow-500/10" };
  return { label: "Risky", color: "text-destructive", bg: "bg-destructive/10" };
}
