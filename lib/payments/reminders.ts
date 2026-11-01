import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendPaymentLink } from '@/lib/notifications';

/**
 * Payment reminders for orders that were placed but not paid.
 *
 * Runs from /api/cron/payment-reminders (external cron with CRON_SECRET) and
 * from the in-process scheduler in instrumentation.ts, because production runs
 * on Coolify where vercel.json crons are ignored. The `payment_reminder_sent`
 * flag makes the job idempotent, so overlapping runs cannot double-send.
 */
export async function runPaymentReminders(opts: { minAgeMinutes?: number; maxAgeHours?: number; limit?: number } = {}) {
  const minAgeMinutes = opts.minAgeMinutes ?? 15;
  const maxAgeHours = opts.maxAgeHours ?? 72;
  const limit = opts.limit ?? 50;

  const newestAllowed = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString();
  const oldestAllowed = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data: pendingOrders, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, email, phone, total, amount_due_now, amount_paid, balance_due, status, shipping_address, metadata')
    .in('payment_status', ['pending', 'failed'])
    .eq('payment_reminder_sent', false)
    .lt('created_at', newestAllowed)
    .gt('created_at', oldestAllowed)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const order of pendingOrders || []) {
    if (order.status === 'cancelled' || order.status === 'refunded') {
      await supabaseAdmin.from('orders').update({ payment_reminder_sent: true }).eq('id', order.id);
      continue;
    }
    try {
      await sendPaymentLink(order);
      await supabaseAdmin
        .from('orders')
        .update({ payment_reminder_sent: true, payment_reminder_sent_at: new Date().toISOString() })
        .eq('id', order.id);
      sent++;
    } catch (err) {
      console.error(`[Payment Reminders] Failed for order ${order.order_number}:`, err);
      failed++;
    }
  }

  return { processed: (pendingOrders || []).length, sent, failed };
}
