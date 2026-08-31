import { Metadata } from 'next';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { buildPageMetadata, absoluteUrl, productSchema, breadcrumbSchema } from '@/lib/seo';
import ProductDetailClient from './ProductDetailClient';
import { StructuredData } from '@/components/SEOHead';

function getCategoryName(categories: unknown): string | undefined {
  if (!categories) return undefined;
  if (Array.isArray(categories)) return (categories[0] as { name?: string })?.name;
  return (categories as { name?: string }).name;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  const { data: product } = await supabase
    .from('products')
    .select('name, slug, description, price, quantity, product_images(url, position), categories(name)')
    .eq('slug', slug)
    .eq('status', 'active')
    .single();

  if (!product) {
    return buildPageMetadata({
      title: 'Product Not Found',
      path: `/product/${slug}`,
      noindex: true,
    });
  }

  const image = product.product_images?.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))?.[0]?.url;
  const description =
    product.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) ||
    `Shop ${product.name} at AbbyGlow Essentials. Quality products delivered across Ghana.`;

  const categoryName = getCategoryName(product.categories);

  return buildPageMetadata({
    title: product.name,
    description,
    path: `/product/${product.slug}`,
    keywords: [
      product.name,
      categoryName || 'online shopping',
      'buy online Ghana',
    ],
    ogImage: image || '/og-image.png',
    ogType: 'website',
  });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: product } = await supabase
    .from('products')
    .select('name, slug, description, price, quantity, sku, product_images(url, position), categories(name)')
    .eq('slug', slug)
    .eq('status', 'active')
    .single();

  const image = product?.product_images?.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))?.[0]?.url;

  const categoryName = getCategoryName(product?.categories);

  const structuredData = product
    ? [
        productSchema({
          name: product.name,
          description:
            product.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ||
            `Shop ${product.name} at AbbyGlow Essentials.`,
          image: image || absoluteUrl('/og-image.png'),
          slug: product.slug,
          price: Number(product.price),
          sku: product.sku || product.slug,
          inStock: Number(product.quantity) > 0,
          category: categoryName,
        }),
        breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Shop', path: '/shop' },
          { name: product.name, path: `/product/${product.slug}` },
        ]),
      ]
    : [];

  return (
    <>
      {structuredData.map((schema, index) => (
        <StructuredData key={index} data={schema} />
      ))}
      <ProductDetailClient slug={slug} />
    </>
  );
}
