import { secureApi } from '@/lib/secure-api';
import { NextResponse } from 'next/server';
import { availableFilters, dashboard } from '@/lib/analytics';
import { parseFilterParams } from '@/lib/filters';
import { apiError } from '@/lib/request-body';

export const runtime = 'nodejs';
function handleGET(request: Request) {
  try {
    const filters = parseFilterParams(new URL(request.url).searchParams);
    return NextResponse.json({ ...dashboard(filters), filters: availableFilters(filters.basis) });
  } catch (error) { return apiError(error, 'Invalid dashboard filters.'); }
}

export const GET = secureApi(handleGET);
