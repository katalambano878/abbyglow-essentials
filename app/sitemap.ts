import { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { isPlainPostgres } from '@/lib/db/mode';

export const dynamic = 'force-dynamic';

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/shop', changeFrequency: 'daily', priority: 0.95 },
  { path: '/categories', changeFrequency: 'weekly', priority: 0.85 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.75 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.75 },
  { path: '/faqs', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/shipping', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/returns', changeFrequency: 'monthly', priority: 0.55 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.55 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

const BLOG_POST_IDS = ['1', '2', '3'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const blogPages: MetadataRoute.Sitemap = BLOG_POST_IDS.map((id) => ({
    url: absoluteUrl(`/blog/${id}`),
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];

  // Only query DB when plain Postgres is configured — avoids hanging builds
  // that point supabase-js at localhost without a live shim.
  if (isPlainPostgres()) {
    try {
      const { supabaseAdmin } = await import('@/lib/supabase-admin');

      const { data: products } = await supabaseAdmin
        .from('products')
        .select('slug, updated_at')
        .eq('status', 'active');

      if (products) {
        productPages = products.map((product: { slug: string; updated_at?: string }) => ({
          url: absoluteUrl(`/product/${product.slug}`),
          lastModified: product.updated_at ? new Date(product.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));
      }

      const { data: categories } = await supabaseAdmin
        .from('categories')
        .select('slug, updated_at')
        .eq('status', 'active');

      if (categories) {
        categoryPages = categories.map((category: { slug: string; updated_at?: string }) => ({
          url: absoluteUrl(`/shop?category=${category.slug}`),
          lastModified: category.updated_at ? new Date(category.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }));
      }
    } catch (error) {
      console.error('Error generating sitemap product/category entries:', error);
    }
  }

  return [...staticPages, ...blogPages, ...productPages, ...categoryPages];
}
