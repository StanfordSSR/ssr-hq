import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SSR Training',
  description: 'Stanford Student Robotics member training'
};

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
