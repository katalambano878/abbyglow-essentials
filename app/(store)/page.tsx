import HomePage from './HomePage';
import { buildPageMetadata, STATIC_PAGE_SEO } from '@/lib/seo';

export const metadata = buildPageMetadata(STATIC_PAGE_SEO.home);

export default function Page() {
  return <HomePage />;
}
