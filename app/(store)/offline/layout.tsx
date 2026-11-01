import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Offline',
  description: 'You are offline. Reconnect to keep shopping AbbyGlow Essentials.',
  path: '/offline',
  noindex: true,
});

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
