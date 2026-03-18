import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stanford Student Robotics HQ',
  description: 'Internal portal starter for Stanford Student Robotics HQ'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
