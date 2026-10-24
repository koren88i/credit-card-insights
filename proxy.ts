import { NextResponse, type NextRequest } from 'next/server';
import { guardLocalRequest } from './lib/request-security';

export function proxy(request: NextRequest) {
  const response = guardLocalRequest(request) ?? NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = { matcher: ['/:path*'] };
