import { NextResponse } from 'next/server';
import { availableFilters, dashboard } from '@/lib/analytics';

export const runtime = 'nodejs';
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = { basis: params.get('basis') === 'purchase' ? 'purchase' as const : 'statement' as const, from: params.get('from') || undefined, to: params.get('to') || undefined, card: params.get('card') || undefined, category: params.get('category') || undefined, merchant: params.get('merchant') || undefined, query: params.get('query') || undefined, includeExcluded: params.get('includeExcluded') === 'true' };
  return NextResponse.json({ ...dashboard(filters), filters: availableFilters(filters.basis) });
}
