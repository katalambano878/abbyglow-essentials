import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.categories);

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
