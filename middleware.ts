import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function isTrainingHost(host: string | null): boolean {
  if (!host) return false;
  const lower = host.toLowerCase().split(':')[0];
  return lower === 'training.stanfordssr.org' || lower.startsWith('training.');
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  const { pathname } = request.nextUrl;

  if (isTrainingHost(host)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.next();
    }

    // Don't expose the HQ portal from the training host.
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/login') || pathname.startsWith('/auth')) {
      const url = request.nextUrl.clone();
      url.pathname = '/training';
      url.search = '';
      return NextResponse.redirect(url);
    }

    if (!pathname.startsWith('/training')) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === '/' ? '/training' : `/training${pathname}`;
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
};
