import type { PaymentPlan } from './plans';
import { computePaymentPlan } from './plans';

export type ChargePurpose = 'checkout' | 'balance';

export type OrderMoneyFields = {
  total: number | string;
  payment_plan?: string | null;
  payment_status?: string | null;
  amount_due_now?: number | string | null;
  amount_paid?: number | string | null;
  balance_due?: number | string | null;
};

/** Server-side amount to charge — never trust the client. */
export function getChargeableAmount(
  order: OrderMoneyFields,
  purpose: ChargePurpose = 'checkout'
): { amount: number; kind: ChargePurpose; error?: string } {
  const total = Number(order.total) || 0;
  const paid = Number(order.amount_paid) || 0;
  const plan = (order.payment_plan || 'full') as PaymentPlan;
  const breakdown = computePaymentPlan(total, plan);

  const remaining = Math.max(
    0,
    Math.round((total - paid) * 100) / 100
  );

  if (order.payment_status === 'paid' || remaining <= 0.01) {
    return { amount: 0, kind: purpose, error: 'Order is already paid' };
  }

  if (purpose === 'balance') {
    if (paid <= 0) {
      return { amount: 0, kind: 'balance', error: 'Deposit has not been paid yet' };
    }
    const balance =
      order.balance_due != null
        ? Number(order.balance_due)
        : remaining;
    const amount = Math.min(remaining, Math.round(Math.max(0, balance) * 100) / 100);
    if (amount <= 0) {
      return { amount: 0, kind: 'balance', error: 'No balance due' };
    }
    return { amount, kind: 'balance' };
  }

  // First payment (checkout / deposit)
  if (paid > 0) {
    // Already have a deposit — charge remaining as balance
    return {
      amount: remaining,
      kind: 'balance',
    };
  }

  const dueNow =
    order.amount_due_now != null
      ? Number(order.amount_due_now)
      : breakdown.amountDueNow;

  const amount = Math.min(remaining, Math.round(Math.max(0, dueNow) * 100) / 100);
  if (amount <= 0) {
    return { amount: 0, kind: 'checkout', error: 'Invalid charge amount' };
  }
  return { amount, kind: 'checkout' };
}
