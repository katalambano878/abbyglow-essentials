import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Support',
  description: 'Create and track AbbyGlow Essentials support tickets.',
  path: '/support/ticket',
  noindex: true,
});

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
