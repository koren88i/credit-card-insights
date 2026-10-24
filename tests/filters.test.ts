import { describe, expect, it } from 'vitest';
import { filterSchema, monthRange, parseFilterParams } from '../lib/filters';

describe('bounded calendar filters', () => {
  it.each(['2026-13', '2026-00', '2026-1', 'x', '0000-01'])('rejects invalid month %s', (from) => {
    expect(() => filterSchema.parse({ from, to: '2027-01' })).toThrow();
    expect(() => monthRange(from, '2027-01')).toThrow();
  });
  it('rejects reversed and excessive periods before iterating', () => {
    expect(() => filterSchema.parse({ from: '2026-02', to: '2026-01' })).toThrow();
    expect(() => monthRange('1900-01', '9999-12')).toThrow();
  });
  it('handles year rollover and bounded empty data', () => {
    expect(monthRange('2025-12', '2026-02')).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(monthRange(undefined, undefined)).toEqual([]);
    expect(filterSchema.parse({ from: '', to: '' }).from).toBeUndefined();
  });
  it('validates query-string filters and the date basis', () => {
    expect(parseFilterParams(new URLSearchParams('basis=statement&from=2026-01&to=2026-06')).from).toBe('2026-01');
    expect(() => parseFilterParams(new URLSearchParams('basis=unexpected'))).toThrow();
  });
});
