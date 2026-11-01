import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'App Settings',
  description: 'Manage the AbbyGlow Essentials app installation, notifications and cache.',
  path: '/pwa-settings',
  noindex: true,
});

export default function PwaSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
