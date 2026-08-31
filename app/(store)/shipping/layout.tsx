import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.shipping);

export default function ShippingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
