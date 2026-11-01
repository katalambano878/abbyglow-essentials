import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Simple in-memory cache for the public catalog (per instance).
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes — products don't change frequently
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
};
const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,80}$/i;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured') === 'true';
    const requestedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const categoryRaw = (searchParams.get('category') || '').trim();
    const category = SLUG_RE.test(categoryRaw) ? categoryRaw : null;

    const cacheKey = `${featured}-${limit}-${category || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.data, { headers: { ...CACHE_HEADERS, 'X-Cache': 'HIT' } });
    }

    try {
        let query = supabase
            .from('products')
            .select(`
                id, name, slug, price, compare_at_price, quantity, description, metadata, rating_avg, review_count,
                categories(id, name, slug),
                product_images(url, position),
                product_variants(id, name, price, quantity)
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (featured) {
            query = query.eq('featured', true);
        }

        if (category) {
            // Filter by category slug (resolve to id first; embed filters are not supported here).
            const { data: cat } = await supabase
                .from('categories')
                .select('id')
                .eq('slug', category)
                .maybeSingle();
            if (!cat) {
                return NextResponse.json([], { headers: { ...CACHE_HEADERS, 'X-Cache': 'MISS' } });
            }
            query = query.eq('category_id', cat.id);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Storefront API] Products error:', error);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
        }

        if (cache.size > 200) cache.clear();
        cache.set(cacheKey, { data, timestamp: Date.now() });

        return NextResponse.json(data, { headers: { ...CACHE_HEADERS, 'X-Cache': 'MISS' } });
    } catch (err: any) {
        console.error('[Storefront API] Error:', err);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}
