import { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/account/',
          '/auth/',
          '/checkout/',
          '/cart/',
          '/wishlist/',
          '/order-tracking/',
          '/order-success/',
          '/pay/',
          '/returns/confirmation/',
          '/offline/',
          '/maintenance/',
          '/pwa-settings/',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl(),
  };
}
