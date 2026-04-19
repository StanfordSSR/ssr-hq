import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';

function getSafeRedirectPath(request: NextRequest, value: string | null) {
  if (!value || !value.startsWith('/')) {
    return '/dashboard';
  }

  try {
    const target = new URL(value, request.url);
    const current = new URL(request.url);

    if (target.origin !== current.origin) {
      return '/dashboard';
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/dashboard';
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeRedirectPath(request, requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
