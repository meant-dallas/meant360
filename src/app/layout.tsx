import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Providers from '@/components/layout/Providers';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MEANT Operations',
  description: 'Operations management for nonprofit associations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
