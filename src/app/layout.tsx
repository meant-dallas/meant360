import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Providers from '@/components/layout/Providers';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import DevBanner from '@/components/ui/DevBanner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MEANT 360',
  description: 'MEANT 360 - The MEANT Community Platform',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <DevBanner />
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
