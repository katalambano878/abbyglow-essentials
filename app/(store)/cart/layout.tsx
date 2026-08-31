import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Shopping Cart',
  description: 'Review items in your AbbyGlow Essentials cart.',
  path: '/cart',
  noindex: true,
});

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
