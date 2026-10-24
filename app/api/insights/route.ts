import { secureApi } from '@/lib/secure-api';
import { NextResponse } from 'next/server';
import { filterSchema, parseFilterParams } from '@/lib/filters';
import { apiError, readJson } from '@/lib/request-body';
import { insightTransactions, type Filters } from '@/lib/analytics';
import { db } from '@/lib/db';
import { generateInsights, INSIGHT_METHOD, type InsightReport } from '@/lib/insights';

export const runtime = 'nodejs';

function reportFilters(filters: Filters) {
  return { from: filters.from || undefined, to: filters.to || undefined, card: filters.card || undefined, category: filters.category || undefined, merchant: filters.merchant || undefined, query: filters.query || undefined, includeExcluded: Boolean(filters.includeExcluded) };
}

function filterKey(filters: Filters) {
  return JSON.stringify({ basis: filters.basis ?? 'statement', ...reportFilters(filters) });
}

function handleGET(request: Request) {
  try {
    const filters = parseFilterParams(new URL(request.url).searchParams);
    const row = db().prepare('SELECT report_json as reportJson FROM insight_reports WHERE filters_json = ? ORDER BY generated_at DESC LIMIT 1').get(filterKey(filters)) as { reportJson: string } | undefined;
    return NextResponse.json({ method: INSIGHT_METHOD, report: row ? JSON.parse(row.reportJson) as InsightReport : null });
  } catch (error) { return apiError(error, 'Invalid insight filters.'); }
}

async function handlePOST(request: Request) {
  try {
    const body = await readJson(request) as { approved?: boolean; filters?: unknown };
    if (body.approved !== true) return NextResponse.json({ error: 'The method must be approved before generating a report.' }, { status: 400 });
    const filters = filterSchema.parse(body.filters ?? {} as unknown) as Filters;
    const generatedAt = new Date().toISOString();
    const report = generateInsights(insightTransactions(filters), filters, generatedAt);
    db().prepare('INSERT INTO insight_reports (id, generated_at, basis, filters_json, report_json) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), generatedAt, filters.basis, filterKey(filters), JSON.stringify(report));
    return NextResponse.json({ report });
  } catch (error) {
    return apiError(error, 'Could not generate insights.');
  }
}

export const GET = secureApi(handleGET);
export const POST = secureApi(handlePOST);
