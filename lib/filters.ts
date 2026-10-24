import { z } from 'zod';

export const MAX_REPORT_MONTHS = 240;
const month = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Use a valid YYYY-MM month.');
function monthIndex(value: string) {
  month.parse(value);
  const [year, number] = value.split('-').map(Number);
  return year * 12 + number - 1;
}
export function monthRange(from?: string, to?: string): string[] {
  if (!from || !to) return [];
  const start = monthIndex(from), end = monthIndex(to);
  const count = end - start + 1;
  if (count < 1 || count > MAX_REPORT_MONTHS) throw new Error(`Choose an ordered period of at most ${MAX_REPORT_MONTHS} months.`);
  return Array.from({ length: count }, (_, offset) => {
    const value = start + offset;
    return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`;
  });
}
export const filterSchema = z.object({
  basis: z.enum(['purchase', 'statement']).default('statement'),
  from: z.preprocess((value) => value === '' ? undefined : value, month.optional()),
  to: z.preprocess((value) => value === '' ? undefined : value, month.optional()), card: z.string().max(4).optional(),
  category: z.string().max(1000).optional(), merchant: z.string().max(100).optional(),
  query: z.string().max(200).optional(), includeExcluded: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.from && value.to) {
    try { monthRange(value.from, value.to); }
    catch { context.addIssue({ code: 'custom', message: `Choose an ordered period of at most ${MAX_REPORT_MONTHS} months.`, path: ['to'] }); }
  }
});
export function parseFilterParams(params: URLSearchParams) {
  return filterSchema.parse({
    basis: params.get('basis') ?? 'statement', from: params.get('from') || undefined, to: params.get('to') || undefined,
    card: params.get('card') || undefined, category: params.get('category') || undefined,
    merchant: params.get('merchant') || undefined, query: params.get('query') || undefined,
    includeExcluded: params.get('includeExcluded') === 'true',
  });
}
