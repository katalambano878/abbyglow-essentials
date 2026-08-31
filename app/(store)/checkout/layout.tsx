import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Checkout',
  description: 'Complete your AbbyGlow Essentials order.',
  path: '/checkout',
  noindex: true,
});

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
