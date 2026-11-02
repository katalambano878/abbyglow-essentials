import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/admin/require-staff';
import { getDeliveryRates, saveDeliveryRates } from '@/lib/shipping-server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff.ok) return NextResponse.json({ success: false, message: staff.message }, { status: staff.status });
  return NextResponse.json({ success: true, rates: await getDeliveryRates() });
}

/** Admin saves the delivery fees. Numbers must be zero or positive. */
export async function PUT(req: Request) {
  const staff = await requireStaff(req);
  if (!staff.ok) return NextResponse.json({ success: false, message: staff.message }, { status: staff.status });
  if (staff.role !== 'admin' && staff.role !== 'super_admin') {
    return NextResponse.json({ success: false, message: 'Only admins can change delivery fees' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fields: Array<[string, unknown]> = [
    ['accra', body?.accra],
    ['outsideAccra', body?.outsideAccra],
    ['freeThreshold', body?.freeThreshold],
  ];
  for (const [name, value] of fields) {
    const n = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isFinite(n) || n < 0 || n > 100000) {
      return NextResponse.json({ success: false, message: `${name} must be a number from 0 upwards` }, { status: 400 });
    }
  }

  try {
    const rates = await saveDeliveryRates(body, staff.userId);
    return NextResponse.json({ success: true, rates });
  } catch (err: any) {
    console.error('[admin/delivery-rates] save failed:', err);
    return NextResponse.json({ success: false, message: 'Could not save delivery fees' }, { status: 500 });
  }
}
