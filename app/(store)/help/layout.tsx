import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center',
  description:
    'Answers about orders, delivery, pickup, payments, returns and your AbbyGlow Essentials account.',
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
