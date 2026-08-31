import { NextResponse } from 'next/server';
import { listConfiguredGateways } from '@/lib/payments/gateways';

export const dynamic = 'force-dynamic';

/** Public: which online gateways are available for checkout. */
export async function GET() {
  return NextResponse.json({
    success: true,
    gateways: listConfiguredGateways(),
  });
}
