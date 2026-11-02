import { NextResponse } from 'next/server';
import { getDeliveryRates } from '@/lib/shipping-server';

export const dynamic = 'force-dynamic';

/** Public: the delivery fees the checkout will charge. */
export async function GET() {
  const rates = await getDeliveryRates();
  return NextResponse.json(
    { success: true, rates },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } }
  );
}
