import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.blog);

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
