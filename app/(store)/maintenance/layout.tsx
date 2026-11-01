import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Maintenance',
  description: 'AbbyGlow Essentials is briefly down for maintenance.',
  path: '/maintenance',
  noindex: true,
});

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
