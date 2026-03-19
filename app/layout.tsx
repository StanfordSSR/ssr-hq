import type { Metadata } from 'next';
import { Inter, Jura } from 'next/font/google';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans'
});

const jura = Jura({
  subsets: ['latin'],
  variable: '--font-brand'
});

export const metadata: Metadata = {
  title: 'Stanford Student Robotics HQ',
  description: 'Internal operations portal for Stanford Student Robotics',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jura.variable}`}>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
