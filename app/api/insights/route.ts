import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insightTransactions, type Filters } from '@/lib/analytics';
import { db } from '@/lib/db';
import { generateInsights, INSIGHT_METHOD, type InsightReport } from '@/lib/insights';

export const runtime = 'nodejs';

const filterSchema = z.object({
  basis: z.enum(['purchase', 'statement']).default('statement'),
  from: z.string().optional(), to: z.string().optional(), card: z.string().optional(),
  category: z.string().optional(), merchant: z.string().optional(), query: z.string().optional(),
  includeExcluded: z.boolean().default(false),
});

function reportFilters(filters: Filters) {
  return { from: filters.from || undefined, to: filters.to || undefined, card: filters.card || undefined, category: filters.category || undefined, merchant: filters.merchant || undefined, query: filters.query || undefined, includeExcluded: Boolean(filters.includeExcluded) };
}

function filterKey(filters: Filters) {
  return JSON.stringify({ basis: filters.basis ?? 'statement', ...reportFilters(filters) });
}

function parseFilters(params: URLSearchParams) {
  return filterSchema.parse({
    basis: params.get('basis') ?? 'statement', from: params.get('from') || undefined, to: params.get('to') || undefined,
    card: params.get('card') || undefined, category: params.get('category') || undefined, merchant: params.get('merchant') || undefined,
    query: params.get('query') || undefined, includeExcluded: params.get('includeExcluded') === 'true',
  }) as Filters;
}

export function GET(request: Request) {
  const filters = parseFilters(new URL(request.url).searchParams);
  const row = db().prepare('SELECT report_json as reportJson FROM insight_reports WHERE filters_json = ? ORDER BY generated_at DESC LIMIT 1').get(filterKey(filters)) as { reportJson: string } | undefined;
  return NextResponse.json({ method: INSIGHT_METHOD, report: row ? JSON.parse(row.reportJson) as InsightReport : null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { approved?: boolean; filters?: unknown };
    if (body.approved !== true) return NextResponse.json({ error: 'The method must be approved before generating a report.' }, { status: 400 });
    const filters = filterSchema.parse(body.filters ?? {} as unknown) as Filters;
    const generatedAt = new Date().toISOString();
    const report = generateInsights(insightTransactions(filters), filters, generatedAt);
    db().prepare('INSERT INTO insight_reports (id, generated_at, basis, filters_json, report_json) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), generatedAt, filters.basis, filterKey(filters), JSON.stringify(report));
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not generate insights.' }, { status: 400 });
  }
}
