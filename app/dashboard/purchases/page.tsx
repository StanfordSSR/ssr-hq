import { redirect } from 'next/navigation';

export default async function PurchasesPage({
  searchParams
}: {
  searchParams?: Promise<{ scope?: string | string[] }>;
}) {
  const scope = (await searchParams)?.scope;
  redirect(scope === 'all' ? '/dashboard/expenses?range=all_time' : '/dashboard/expenses');
}
