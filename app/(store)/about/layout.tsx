import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.about);

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
