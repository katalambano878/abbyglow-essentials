import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Account',
  description: 'Manage your AbbyGlow Essentials account, orders and addresses.',
  path: '/account',
  noindex: true,
});

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
