import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.terms);

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
