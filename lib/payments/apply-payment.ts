import { supabaseAdmin } from '@/lib/supabase-admin';

export type ApplyPaymentKind = 'checkout' | 'balance' | 'admin_settle';

export async function applyOrderPayment(input: {
  orderNumber: string;
  amount: number;
  gateway: string;
  gatewayRef: string;
  kind?: ApplyPaymentKind;
}): Promise<{ order: any | null; error: string | null }> {
  const { data, error } = await supabaseAdmin.rpc('apply_order_payment', {
    order_ref: input.orderNumber,
    p_amount: input.amount,
    p_gateway: input.gateway,
    gateway_ref: input.gatewayRef,
    kind: input.kind || 'checkout',
  });

  if (error) {
    return { order: null, error: error.message || 'apply_order_payment failed' };
  }
  return { order: data, error: null };
}
