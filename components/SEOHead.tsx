import { Metadata } from 'next';
import {
  buildPageMetadata,
  breadcrumbSchema,
  absoluteUrl,
  SITE_SHORT_NAME,
} from '@/lib/seo';

export function generateMetadataFromSEO(props: Parameters<typeof buildPageMetadata>[0]): Metadata {
  return buildPageMetadata(props);
}

// Backward-compatible alias used by older imports
export function generateMetadata(props: Parameters<typeof buildPageMetadata>[0]): Metadata {
  return buildPageMetadata(props);
}

export function generateProductSchema(product: {
  name: string;
  description: string;
  image: string;
  price: number;
  currency?: string;
  sku: string;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  brand?: string;
  category?: string;
  slug?: string;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand || SITE_SHORT_NAME },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency || 'GHS',
      availability:
        product.availability === 'in_stock'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      url: product.slug ? absoluteUrl(`/product/${product.slug}`) : undefined,
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  };

  if (product.rating && product.reviewCount) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (product.category) schema.category = product.category;
  return schema;
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return breadcrumbSchema(
    items.map((item) => ({
      name: item.name,
      path: item.url.replace(absoluteUrl(), '') || '/',
    }))
  );
}

export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_SHORT_NAME,
    url: absoluteUrl(),
  };
}

export function generateWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_SHORT_NAME,
    url: absoluteUrl(),
  };
}

export function StructuredData({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
