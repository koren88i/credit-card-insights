import { secureApi } from '@/lib/secure-api';
import { NextResponse } from 'next/server';
import { merchantGroups, transactions } from '@/lib/analytics';
import { parseFilterParams } from '@/lib/filters';
import { apiError } from '@/lib/request-body';

export const runtime = 'nodejs';
function handleGET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const filters = parseFilterParams(params);
    if (params.get('groupBy') === 'merchant') return NextResponse.json(merchantGroups(filters, params.get('sort') === 'count' ? 'count' : 'spend'));
    return NextResponse.json(transactions(filters));
  } catch (error) { return apiError(error, 'Invalid transaction filters.'); }
}

export const GET = secureApi(handleGET);
