import type { Metadata } from 'next';
import { Inter, Jura } from 'next/font/google';
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
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jura.variable}`}>{children}</body>
    </html>
  );
}
