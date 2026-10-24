import type { Filters, TransactionRow } from './analytics';

export const INSIGHT_METHOD = {
  version: '1.0',
  title: 'Deterministic spending review',
  purpose: 'Compare spending across categories and time, then surface only signals with visible supporting evidence.',
  steps: [
    'Use the active purchase-date or statement-month basis and all active filters.',
    'Count negative charges as spending and positive charges as refunds or credits; excluded merchants stay out unless included in the filters.',
    'Compare the latest three periods with the three periods immediately before them. If fewer periods exist, compare equally sized windows of one period.',
    'Rank categories by total spend, share of spend, and change between comparison windows.',
    'Identify recurring merchants that appear in at least three periods.',
    'Flag unusually large charges using a robust IQR threshold and show the transaction evidence.',
    'Report data-quality limits: uncategorized rows, refunds, excluded merchants, and the covered period.',
  ],
  thresholds: {
    comparisonWindowPeriods: 3,
    recurringMerchantMinimumPeriods: 3,
    unusualChargeRule: 'amount > Q3 + 1.5 × IQR and amount >= 2 × median',
    minimumSignalChange: '10% and at least ₪100 absolute change where applicable',
  },
} as const;

type InsightKind = 'trend' | 'category' | 'pattern' | 'outlier' | 'dataQuality';

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  summary: string;
  evidence: string[];
  severity: 'positive' | 'neutral' | 'watch';
};

export type InsightPeriod = {
  period: string;
  spending: number;
  refunds: number;
  transactionCount: number;
};

export type InsightCategory = {
  name: string;
  spending: number;
  share: number;
  transactionCount: number;
  activePeriods: number;
  recentSpending: number;
  previousSpending: number;
  change: number | null;
  changePercent: number | null;
};

export type InsightMerchant = {
  name: string;
  category: string;
  spending: number;
  activePeriods: number;
  transactionCount: number;
};

export type InsightCard = {
  name: string;
  spending: number;
  share: number;
  activePeriods: number;
  transactionCount: number;
};

export type InsightOutlier = {
  date: string;
  merchant: string;
  category: string;
  amount: number;
  period: string;
};

export type InsightReport = {
  methodVersion: string;
  basis: 'purchase' | 'statement';
  filters: Pick<Filters, 'from' | 'to' | 'card' | 'category' | 'merchant' | 'query' | 'includeExcluded'>;
  generatedAt: string;
  coverage: {
    from: string | null;
    to: string | null;
    periods: number;
    transactionCount: number;
    spending: number;
    refunds: number;
    averageCharge: number;
    uncategorizedCount: number;
    excludedSpending: number;
    excludedMerchants: number;
  };
  comparison: {
    recentPeriods: string[];
    previousPeriods: string[];
    recentSpending: number;
    previousSpending: number;
    change: number | null;
    changePercent: number | null;
  };
  periods: InsightPeriod[];
  categories: InsightCategory[];
  cards: InsightCard[];
  topMerchants: InsightMerchant[];
  peakPeriod: InsightPeriod | null;
  recurringMerchants: InsightMerchant[];
  outliers: InsightOutlier[];
  insights: Insight[];
};

type InsightRow = Pick<TransactionRow, 'purchaseDate' | 'statementMonth' | 'cardLast4' | 'merchant' | 'amount' | 'category' | 'categoryId' | 'merchantExcluded'>;

const round = (value: number) => Math.round(value * 100) / 100;
const percentage = (value: number | null) => value === null ? null : round(value * 100);
const amountText = (value: number) => `₪${Math.round(value).toLocaleString('en-US')}`;

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quartile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function periodFor(row: InsightRow, basis: 'purchase' | 'statement') {
  return basis === 'statement' ? row.statementMonth : row.purchaseDate.slice(0, 7);
}

function changeBetween(recent: number, previous: number) {
  if (!previous) return recent ? null : 0;
  return round(recent - previous);
}

function changePercentBetween(recent: number, previous: number) {
  if (!previous) return recent ? null : 0;
  return round((recent - previous) / previous);
}

function comparisonWindows(periods: string[]) {
  const windowSize = Math.max(1, Math.min(INSIGHT_METHOD.thresholds.comparisonWindowPeriods, Math.floor(periods.length / 2)));
  return {
    previous: periods.slice(Math.max(0, periods.length - windowSize * 2), periods.length - windowSize),
    recent: periods.slice(Math.max(0, periods.length - windowSize)),
  };
}

export function generateInsights(rows: InsightRow[], filters: Filters = {}, generatedAt = new Date().toISOString()): InsightReport {
  const basis = filters.basis ?? 'purchase';
  const spendingRows = rows.filter((row) => row.amount < 0);
  const periods = [...new Set(rows.map((row) => periodFor(row, basis)))].sort();
  const windows = comparisonWindows(periods);
  const recentSet = new Set(windows.recent);
  const previousSet = new Set(windows.previous);
  const spending = round(spendingRows.reduce((sum, row) => sum - row.amount, 0));
  const refunds = round(rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0));
  const charges = spendingRows.map((row) => -row.amount);
  const uncategorizedCount = rows.filter((row) => !row.categoryId).length;
  const excludedRows = rows.filter((row) => row.merchantExcluded);
  const excludedSpending = round(excludedRows.filter((row) => row.amount < 0).reduce((sum, row) => sum - row.amount, 0));
  const excludedMerchants = new Set(excludedRows.map((row) => row.merchant)).size;
  const totalsByPeriod = new Map<string, InsightPeriod>(periods.map((period) => [period, { period, spending: 0, refunds: 0, transactionCount: 0 }]));
  rows.forEach((row) => {
    const point = totalsByPeriod.get(periodFor(row, basis));
    if (!point) return;
    point.transactionCount += 1;
    if (row.amount < 0) point.spending = round(point.spending - row.amount);
    if (row.amount > 0) point.refunds = round(point.refunds + row.amount);
  });

  const categoryMap = new Map<string, { spending: number; transactionCount: number; activePeriods: Set<string>; recent: number; previous: number }>();
  spendingRows.forEach((row) => {
    const name = row.category ?? 'Uncategorized';
    const point = categoryMap.get(name) ?? { spending: 0, transactionCount: 0, activePeriods: new Set<string>(), recent: 0, previous: 0 };
    const period = periodFor(row, basis);
    const value = -row.amount;
    point.spending = round(point.spending + value);
    point.transactionCount += 1;
    point.activePeriods.add(period);
    if (recentSet.has(period)) point.recent = round(point.recent + value);
    if (previousSet.has(period)) point.previous = round(point.previous + value);
    categoryMap.set(name, point);
  });
  const categories = [...categoryMap.entries()].map(([name, point]) => ({
    name,
    spending: round(point.spending),
    share: spending ? round(point.spending / spending) : 0,
    transactionCount: point.transactionCount,
    activePeriods: point.activePeriods.size,
    recentSpending: round(point.recent),
    previousSpending: round(point.previous),
    change: windows.previous.length ? changeBetween(point.recent, point.previous) : null,
    changePercent: windows.previous.length ? percentage(changePercentBetween(point.recent, point.previous)) : null,
  })).sort((a, b) => b.spending - a.spending);

  const merchantMap = new Map<string, { category: string; spending: number; periods: Set<string>; transactionCount: number }>();
  spendingRows.forEach((row) => {
    const point = merchantMap.get(row.merchant) ?? { category: row.category ?? 'Uncategorized', spending: 0, periods: new Set<string>(), transactionCount: 0 };
    point.spending = round(point.spending - row.amount);
    point.periods.add(periodFor(row, basis));
    point.transactionCount += 1;
    merchantMap.set(row.merchant, point);
  });
  const topMerchants = [...merchantMap.entries()]
    .map(([name, point]) => ({ name, category: point.category, spending: round(point.spending), activePeriods: point.periods.size, transactionCount: point.transactionCount }))
    .sort((a, b) => b.spending - a.spending)
    .slice(0, 8);
  const recurringMerchants = [...merchantMap.entries()]
    .filter(([, point]) => point.periods.size >= INSIGHT_METHOD.thresholds.recurringMerchantMinimumPeriods)
    .map(([name, point]) => ({ name, category: point.category, spending: round(point.spending), activePeriods: point.periods.size, transactionCount: point.transactionCount }))
    .sort((a, b) => b.spending - a.spending)
    .slice(0, 8);

  const cardMap = new Map<string, { spending: number; periods: Set<string>; transactionCount: number }>();
  spendingRows.forEach((row) => {
    const card = row.cardLast4;
    const point = cardMap.get(card) ?? { spending: 0, periods: new Set<string>(), transactionCount: 0 };
    point.spending = round(point.spending - row.amount);
    point.periods.add(periodFor(row, basis));
    point.transactionCount += 1;
    cardMap.set(card, point);
  });
  const cards = [...cardMap.entries()].map(([name, point]) => ({ name: `Card ${name}`, spending: round(point.spending), share: spending ? round(point.spending / spending) : 0, activePeriods: point.periods.size, transactionCount: point.transactionCount })).sort((a, b) => b.spending - a.spending);

  const q1 = quartile(charges, 0.25);
  const q3 = quartile(charges, 0.75);
  const medianCharge = median(charges);
  const unusualThreshold = Math.max(q3 + 1.5 * (q3 - q1), medianCharge * 2);
  const outliers = spendingRows
    .filter((row) => -row.amount >= unusualThreshold)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 8)
    .map((row) => ({ date: row.purchaseDate, merchant: row.merchant, category: row.category ?? 'Uncategorized', amount: round(-row.amount), period: periodFor(row, basis) }));

  const recentSpending = round(windows.recent.reduce((sum, period) => sum + (totalsByPeriod.get(period)?.spending ?? 0), 0));
  const previousSpending = round(windows.previous.reduce((sum, period) => sum + (totalsByPeriod.get(period)?.spending ?? 0), 0));
  const totalChange = windows.previous.length ? changeBetween(recentSpending, previousSpending) : null;
  const totalChangePercent = windows.previous.length ? percentage(changePercentBetween(recentSpending, previousSpending)) : null;
  const peakPeriod = [...totalsByPeriod.values()].sort((a, b) => b.spending - a.spending)[0] ?? null;
  const insights: Insight[] = [];
  const topCategory = categories[0];
  if (topCategory) {
    insights.push({ id: 'top-category', kind: 'category', title: `${topCategory.name} is the largest spending category`, summary: `${amountText(topCategory.spending)} of spending is in ${topCategory.name}.`, evidence: [`${Math.round(topCategory.share * 100)}% of total spending`, `${topCategory.transactionCount} charges across ${topCategory.activePeriods} period${topCategory.activePeriods === 1 ? '' : 's'}`], severity: topCategory.share >= 0.4 ? 'watch' : 'neutral' });
  }
  if (categories.length >= 3) {
    const topThree = categories.slice(0, 3).reduce((sum, category) => sum + category.spending, 0);
    insights.push({ id: 'category-concentration', kind: 'category', title: 'Most spending is concentrated in three categories', summary: `The top three categories account for ${Math.round((topThree / Math.max(spending, 1)) * 100)}% of spending.`, evidence: categories.slice(0, 3).map((category) => `${category.name}: ${amountText(category.spending)}`), severity: topThree / Math.max(spending, 1) >= 0.75 ? 'watch' : 'neutral' });
  }
  if (windows.previous.length && totalChange !== null && Math.abs(totalChange) >= 100 && (totalChangePercent === null || Math.abs(totalChangePercent) >= 10)) {
    insights.push({ id: 'period-change', kind: 'trend', title: totalChange > 0 ? 'Spending increased in the latest periods' : 'Spending decreased in the latest periods', summary: `${amountText(Math.abs(totalChange))} ${totalChange > 0 ? 'more' : 'less'} was spent in ${windows.recent.join(', ')} than in ${windows.previous.join(', ')}.`, evidence: [`Recent: ${amountText(recentSpending)}`, `Previous: ${amountText(previousSpending)}`, `${totalChangePercent === null ? 'Change rate unavailable' : `${Math.abs(totalChangePercent)}% change`}`], severity: totalChange > 0 ? 'watch' : 'positive' });
  }
  const biggestIncrease = categories.filter((category) => category.change !== null).sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
  if (biggestIncrease && biggestIncrease.change !== null && biggestIncrease.change >= 100 && (biggestIncrease.changePercent === null || biggestIncrease.changePercent >= 10)) {
    insights.push({ id: 'category-increase', kind: 'category', title: `${biggestIncrease.name} drove the largest category increase`, summary: `${biggestIncrease.name} rose by ${amountText(biggestIncrease.change)} between the comparison windows.`, evidence: [`Recent window: ${amountText(biggestIncrease.recentSpending)}`, `Previous window: ${amountText(biggestIncrease.previousSpending)}`, `${biggestIncrease.changePercent === null ? 'Percentage change unavailable' : `${biggestIncrease.changePercent}% change`}`], severity: 'watch' });
  }
  if (recurringMerchants.length) {
    const recurring = recurringMerchants[0];
    insights.push({ id: 'recurring-merchant', kind: 'pattern', title: `${recurring.name} appears repeatedly over time`, summary: `${amountText(recurring.spending)} was spent at ${recurring.name} across ${recurring.activePeriods} periods.`, evidence: [`${recurring.transactionCount} charges`, `Category: ${recurring.category}`, `Minimum recurring threshold: ${INSIGHT_METHOD.thresholds.recurringMerchantMinimumPeriods} periods`], severity: 'neutral' });
  }
  if (cards.length) {
    const leadingCard = cards[0];
    insights.push({ id: 'card-concentration', kind: 'pattern', title: `${leadingCard.name} carries the largest share`, summary: `${amountText(leadingCard.spending)} of spending is assigned to ${leadingCard.name}.`, evidence: [`${Math.round(leadingCard.share * 100)}% of total spending`, `${leadingCard.transactionCount} charges across ${leadingCard.activePeriods} periods`], severity: leadingCard.share >= 0.5 ? 'watch' : 'neutral' });
  }
  if (peakPeriod && peakPeriod.spending > 0) {
    insights.push({ id: 'peak-period', kind: 'trend', title: `${peakPeriod.period} was the highest-spend period`, summary: `${amountText(peakPeriod.spending)} was spent during ${peakPeriod.period}.`, evidence: [`${peakPeriod.transactionCount} total rows in that period`, `Basis: ${basis === 'statement' ? 'statement month' : 'purchase date'}`], severity: 'watch' });
  }
  if (outliers.length) {
    const largest = outliers[0];
    insights.push({ id: 'unusual-charge', kind: 'outlier', title: 'Large individual charges need a quick look', summary: `${largest.merchant} has the largest charge identified by the robust outlier rule at ${amountText(largest.amount)}.`, evidence: [`${outliers.length} charge${outliers.length === 1 ? '' : 's'} above the threshold`, `Threshold: ${amountText(unusualThreshold)}`, `Largest charge date: ${largest.date}`], severity: 'watch' });
  }
  if (uncategorizedCount) {
    insights.push({ id: 'uncategorized', kind: 'dataQuality', title: 'Some transactions are still uncategorized', summary: `${uncategorizedCount} of ${rows.length} rows do not have a category yet.`, evidence: [`${rows.length ? Math.round((uncategorizedCount / rows.length) * 100) : 0}% of rows`, 'Category comparisons treat these rows as “Uncategorized”'], severity: 'watch' });
  }
  if (refunds) {
    insights.push({ id: 'refunds', kind: 'dataQuality', title: 'Refunds and credits are tracked separately', summary: `${amountText(refunds)} in positive credits is excluded from spending totals.`, evidence: [`${rows.filter((row) => row.amount > 0).length} credit rows`, 'Spending totals use negative charges only'], severity: 'positive' });
  }

  return {
    methodVersion: INSIGHT_METHOD.version,
    basis,
    filters: { from: filters.from, to: filters.to, card: filters.card, category: filters.category, merchant: filters.merchant, query: filters.query, includeExcluded: filters.includeExcluded },
    generatedAt,
    coverage: { from: periods[0] ?? null, to: periods.at(-1) ?? null, periods: periods.length, transactionCount: rows.length, spending, refunds, averageCharge: charges.length ? round(spending / charges.length) : 0, uncategorizedCount, excludedSpending, excludedMerchants },
    comparison: { recentPeriods: windows.recent, previousPeriods: windows.previous, recentSpending, previousSpending, change: totalChange, changePercent: totalChangePercent },
    periods: [...totalsByPeriod.values()],
    categories,
    cards,
    topMerchants,
    peakPeriod,
    recurringMerchants,
    outliers,
    insights,
  };
}
