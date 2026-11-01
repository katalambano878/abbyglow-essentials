/**
 * In-process background jobs (Node runtime only).
 *
 * Production runs on Coolify, which has no Vercel cron, so the payment-reminder
 * job is scheduled from the first Postgres pool creation in this process.
 * Disable with IN_PROCESS_CRON=false when an external cron calls
 * /api/cron/payment-reminders instead.
 */

const globalForJobs = globalThis as unknown as { __abbyglowJobsStarted?: boolean };

export function scheduleBackgroundJobs(): void {
  if (globalForJobs.__abbyglowJobsStarted) return;
  if (process.env.IN_PROCESS_CRON === 'false') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (typeof setInterval !== 'function') return;
  globalForJobs.__abbyglowJobsStarted = true;

  const intervalMs = Math.max(5, Number(process.env.PAYMENT_REMINDER_INTERVAL_MINUTES) || 30) * 60 * 1000;

  const tick = async () => {
    try {
      const { runPaymentReminders } = await import('@/lib/payments/reminders');
      const result = await runPaymentReminders();
      if (result.processed > 0) console.log('[Payment Reminders]', result);
    } catch (err) {
      console.error('[Payment Reminders] in-process run failed:', err);
    }
  };

  // First run a few minutes after boot so deploys don't fire a burst immediately.
  const first = setTimeout(tick, 3 * 60 * 1000);
  const every = setInterval(tick, intervalMs);
  (first as any).unref?.();
  (every as any).unref?.();
}
