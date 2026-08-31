import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Wishlist',
  description: 'Your saved AbbyGlow Essentials products.',
  path: '/wishlist',
  noindex: true,
});

export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
