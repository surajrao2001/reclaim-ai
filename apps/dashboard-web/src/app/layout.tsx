import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReclaimAI Dashboard',
  description: 'Owner dashboard for ReclaimAI revenue & retention engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
