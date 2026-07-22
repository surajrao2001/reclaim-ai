import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claim Cashback | ReclaimAI',
  description: 'Claim your instant UPI cashback',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
