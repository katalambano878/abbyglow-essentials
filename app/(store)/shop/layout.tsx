import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.shop);

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
