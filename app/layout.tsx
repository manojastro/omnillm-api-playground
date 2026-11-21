import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppProviders } from '@/components/app-providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'InsightAI — ITSM Data Intelligence',
  description:
    'Upload service-management data and turn it into verified operational intelligence.',
  metadataBase: new URL('https://example.com'),
  openGraph: {
    title: 'InsightAI — ITSM Data Intelligence',
    description: 'Verified operational intelligence from your service-management data.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'InsightAI — ITSM Data Intelligence' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InsightAI — ITSM Data Intelligence',
    description: 'Verified operational intelligence from your service-management data.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
