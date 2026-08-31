import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.faqs);

export default function FaqsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
