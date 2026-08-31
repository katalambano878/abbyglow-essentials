import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.returns);

export default function ReturnsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
