/** DB stores `deposit_50` for historical orders; new checkouts use 60% deposit math. */
export type PaymentPlan = 'full' | 'deposit_50';

export const DEPOSIT_PERCENT = 60;
export const DEPOSIT_FRACTION = DEPOSIT_PERCENT / 100;

export type PaymentPlanBreakdown = {
  plan: PaymentPlan;
  total: number;
  amountDueNow: number;
  balanceDue: number;
};

export function isDepositPlan(plan: string | null | undefined): plan is 'deposit_50' {
  return plan === 'deposit_50';
}

export function depositPlanLabel(_plan?: string | null): string {
  return `${DEPOSIT_PERCENT}% deposit`;
}

/** Split order total into due-now + balance. Remainder stays on balance so cents never vanish. */
export function computePaymentPlan(
  total: number,
  plan: PaymentPlan | string | null | undefined
): PaymentPlanBreakdown {
  const safeTotal = Math.round(Math.max(0, Number(total) || 0) * 100) / 100;
  const normalized: PaymentPlan = isDepositPlan(plan) ? 'deposit_50' : 'full';

  if (normalized === 'full' || safeTotal <= 0) {
    return {
      plan: 'full',
      total: safeTotal,
      amountDueNow: safeTotal,
      balanceDue: 0,
    };
  }

  const amountDueNow = Math.round(safeTotal * DEPOSIT_FRACTION * 100) / 100;
  const balanceDue = Math.round((safeTotal - amountDueNow) * 100) / 100;

  return {
    plan: 'deposit_50',
    total: safeTotal,
    amountDueNow,
    balanceDue,
  };
}

export function purposeForPlan(plan: PaymentPlan, isBalance: boolean): 'full' | 'deposit' | 'balance' {
  if (isBalance) return 'balance';
  return isDepositPlan(plan) ? 'deposit' : 'full';
}
