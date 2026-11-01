import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Sign In',
  description: 'Sign in to or create your AbbyGlow Essentials account.',
  path: '/auth/login',
  noindex: true,
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
