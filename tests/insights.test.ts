import { describe, expect, it } from 'vitest';
import { generateInsights } from '../lib/insights';

const row = (purchaseDate: string, merchant: string, amount: number, category: string | null, categoryId = category ? category.toLowerCase() : null) => ({
  purchaseDate, statementMonth: purchaseDate.slice(0, 7), cardLast4: '0000', merchant, amount, category, categoryId, merchantExcluded: false,
});

describe('generateInsights', () => {
  it('compares time windows and ranks category concentration', () => {
    const report = generateInsights([
      row('2026-01-05', 'Market', -100, 'Groceries'), row('2026-01-12', 'Cafe', -50, 'Dining'),
      row('2026-02-05', 'Market', -100, 'Groceries'), row('2026-02-12', 'Cafe', -50, 'Dining'),
      row('2026-03-05', 'Market', -100, 'Groceries'), row('2026-03-12', 'Cafe', -50, 'Dining'),
      row('2026-04-05', 'Market', -250, 'Groceries'), row('2026-04-12', 'Cafe', -50, 'Dining'),
    ], { basis: 'purchase' }, '2026-05-01T00:00:00.000Z');

    expect(report.coverage.spending).toBe(750);
    expect(report.comparison.previousPeriods).toEqual(['2026-01', '2026-02']);
    expect(report.comparison.recentPeriods).toEqual(['2026-03', '2026-04']);
    expect(report.comparison.change).toBe(150);
    expect(report.categories[0]).toMatchObject({ name: 'Groceries', spending: 550, recentSpending: 350, previousSpending: 200 });
    expect(report.categories[0].change).toBe(150);
  });

  it('finds recurring merchants and robustly flags a large charge', () => {
    const report = generateInsights([
      row('2026-01-05', 'Transit', -20, 'Transport'), row('2026-02-05', 'Transit', -20, 'Transport'), row('2026-03-05', 'Transit', -20, 'Transport'),
      row('2026-01-08', 'Small shop', -10, 'Shopping'), row('2026-02-08', 'Small shop', -11, 'Shopping'), row('2026-03-08', 'Small shop', -9, 'Shopping'),
      row('2026-03-20', 'Furniture', -500, 'Shopping'),
    ]);

    expect(report.recurringMerchants).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Transit', activePeriods: 3 })]));
    expect(report.outliers[0]).toMatchObject({ merchant: 'Furniture', amount: 500 });
    expect(report.insights.some((insight) => insight.id === 'unusual-charge')).toBe(true);
  });

  it('keeps credits separate and reports uncategorized rows', () => {
    const report = generateInsights([row('2026-01-01', 'Unknown', -40, null, null), row('2026-01-02', 'Refund', 10, 'Shopping')]);
    expect(report.coverage.spending).toBe(40);
    expect(report.coverage.refunds).toBe(10);
    expect(report.coverage.uncategorizedCount).toBe(1);
    expect(report.categories[0].name).toBe('Uncategorized');
    expect(report.insights.map((insight) => insight.id)).toEqual(expect.arrayContaining(['uncategorized', 'refunds']));
  });
});
