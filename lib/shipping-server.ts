import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_DELIVERY_RATES, normalizeDeliveryRates, type DeliveryRates } from '@/lib/shipping';

export const DELIVERY_RATES_KEY = 'delivery_rates';
const CACHE_MS = 30_000;

let cached: { rates: DeliveryRates; at: number } | null = null;

/** Delivery fees as saved by the admin, falling back to the env defaults. Cached for 30s per process. */
export async function getDeliveryRates(): Promise<DeliveryRates> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rates;
  try {
    const { data, error } = await supabaseAdmin
      .from('store_settings')
      .select('value')
      .eq('key', DELIVERY_RATES_KEY)
      .maybeSingle();
    if (error) throw error;
    const rates = data?.value ? normalizeDeliveryRates(data.value) : { ...DEFAULT_DELIVERY_RATES };
    cached = { rates, at: Date.now() };
    return rates;
  } catch (err) {
    console.warn('[shipping] could not load delivery rates, using defaults:', (err as Error)?.message);
    return { ...DEFAULT_DELIVERY_RATES };
  }
}

export async function saveDeliveryRates(input: unknown, updatedBy: string | null): Promise<DeliveryRates> {
  const rates = normalizeDeliveryRates(input);
  const { error } = await supabaseAdmin
    .from('store_settings')
    .upsert(
      {
        key: DELIVERY_RATES_KEY,
        value: { accra: rates.accra, outside_accra: rates.outsideAccra, free_threshold: rates.freeThreshold },
        description: 'Delivery fees charged at checkout and POS (GHS)',
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
  if (error) throw error;
  cached = { rates, at: Date.now() };
  return rates;
}
