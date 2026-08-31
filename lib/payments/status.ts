/** Internal normalized payment statuses (gateway-agnostic). */
export type InternalPaymentStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'reversed'
  | 'refunded'
  | 'partially_refunded';

/** Map order.payment_status (legacy) ↔ internal model. */
export function orderPaymentToInternal(status: string | null | undefined): InternalPaymentStatus {
  switch ((status || '').toLowerCase()) {
    case 'paid':
    case 'successful':
    case 'success':
      return 'successful';
    case 'partially_paid':
      return 'processing';
    case 'failed':
    case 'fail':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'processing':
      return 'processing';
    case 'refunded':
      return 'refunded';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

export function internalToOrderPayment(status: InternalPaymentStatus): string {
  switch (status) {
    case 'successful':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'processing':
      return 'processing';
    case 'refunded':
    case 'partially_refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

/** Moolre embed/callback status → internal. */
export function mapMoolreStatus(apiStatus: unknown, txStatus: unknown): InternalPaymentStatus {
  const apiOk = apiStatus === 1 || apiStatus === '1';
  const txOk = txStatus === 1 || txStatus === '1';
  const txFailed = txStatus === 2 || txStatus === '2';
  if (txFailed) return 'failed';
  if (apiOk && txOk) return 'successful';
  return 'pending';
}
