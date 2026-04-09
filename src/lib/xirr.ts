export type XirrCashflow = {
  date: Date;
  amount: number;
};

type CalcOptions = {
  maxIterations?: number;
  tolerance?: number;
};

function yearFraction(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function npv(rate: number, cashflows: XirrCashflow[], d0: Date): number {
  const onePlus = 1 + rate;
  if (onePlus <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const cf of cashflows) {
    const t = yearFraction(d0, cf.date);
    sum += cf.amount / Math.pow(onePlus, t);
  }
  return sum;
}

function dNpv(rate: number, cashflows: XirrCashflow[], d0: Date): number {
  const onePlus = 1 + rate;
  if (onePlus <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const cf of cashflows) {
    const t = yearFraction(d0, cf.date);
    // d/d(r) [A / (1+r)^t] = -t * A / (1+r)^(t+1)
    sum += (-t * cf.amount) / Math.pow(onePlus, t + 1);
  }
  return sum;
}

function hasBothSigns(cashflows: XirrCashflow[]) {
  let hasPos = false;
  let hasNeg = false;
  for (const cf of cashflows) {
    if (cf.amount > 0) hasPos = true;
    if (cf.amount < 0) hasNeg = true;
  }
  return hasPos && hasNeg;
}

function tryNewton(cashflows: XirrCashflow[], guess: number, options: Required<CalcOptions>): number | null {
  const d0 = cashflows.reduce((min, cf) => (cf.date < min ? cf.date : min), cashflows[0].date);

  let rate = guess;
  for (let i = 0; i < options.maxIterations; i++) {
    const f = npv(rate, cashflows, d0);
    const df = dNpv(rate, cashflows, d0);

    if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) return null;

    const next = rate - f / df;
    if (!Number.isFinite(next)) return null;

    if (Math.abs(next - rate) < options.tolerance) return next;
    rate = next;

    // keep rate in a sane domain to help convergence
    if (rate <= -0.999999) rate = -0.999999;
  }

  return Number.isFinite(rate) ? rate : null;
}

/**
 * Returns XIRR as a percentage (e.g. 12.5 means 12.5% annualized).
 */
export function calculateXirr(cashflows: XirrCashflow[], options?: CalcOptions): number | null {
  const opts: Required<CalcOptions> = {
    maxIterations: options?.maxIterations ?? 80,
    tolerance: options?.tolerance ?? 1e-8,
  };

  const clean = cashflows
    .filter((c) => c?.date instanceof Date && Number.isFinite(c.amount) && c.amount !== 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (clean.length < 2) return null;
  if (!hasBothSigns(clean)) return null;

  const guesses = [-0.5, 0.1, 0.3, 0.6, 1.0];
  for (const g of guesses) {
    const r = tryNewton(clean, g, opts);
    if (r === null) continue;

    const pct = r * 100;
    // avoid displaying nonsense if the solver “finds” an extreme rate
    if (!Number.isFinite(pct) || pct < -99.99 || pct > 1000) return null;

    return pct;
  }

  return null;
}
