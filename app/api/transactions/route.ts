import { NextResponse } from 'next/server';
import { merchantGroups, transactions } from '@/lib/analytics';

export const runtime = 'nodejs';
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = { basis: params.get('basis') === 'purchase' ? 'purchase' as const : 'statement' as const, from: params.get('from') || undefined, to: params.get('to') || undefined, card: params.get('card') || undefined, category: params.get('category') || undefined, merchant: params.get('merchant') || undefined, query: params.get('query') || undefined, includeExcluded: params.get('includeExcluded') === 'true' };
  if (params.get('groupBy') === 'merchant') return NextResponse.json(merchantGroups(filters, params.get('sort') === 'count' ? 'count' : 'spend'));
  return NextResponse.json(transactions(filters));
}
