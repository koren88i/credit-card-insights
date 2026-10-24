import { db } from './db';

export type Filters = { basis?: 'purchase' | 'statement'; from?: string; to?: string; card?: string; category?: string; merchant?: string; query?: string; includeExcluded?: boolean };

export type TransactionRow = {
  id: string; merchantId: string; purchaseDate: string; statementMonth: string; cardLast4: string; rawMerchant: string;
  merchant: string; amount: number; originalAmount: number | null; originalCurrency: string | null;
  voucher: string | null; details: string | null; sourceFile: string; categoryId: string | null;
  category: string | null; categorySource: string | null; duplicateStatus: string; merchantExcluded: boolean;
};

export type MerchantGroupRow = {
  merchantId: string; merchant: string; transactionCount: number; spend: number; refunds: number;
  categoryId: string | null; category: string | null; categoryCount: number; merchantExcluded: boolean;
};

function queryRows(filters: Filters = {}, limit = 1000) {
  const dateColumn = filters.basis === 'statement' ? 't.statement_month' : 't.purchase_date';
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.from) {
    clauses.push(`${dateColumn} >= ?`);
    values.push(filters.basis === 'statement' ? filters.from : `${filters.from}-01`);
  }
  if (filters.to) {
    if (filters.basis === 'statement') { clauses.push(`${dateColumn} <= ?`); values.push(filters.to); }
    else {
      const [year, month] = filters.to.split('-').map(Number);
      const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
      clauses.push(`${dateColumn} < ?`); values.push(`${nextMonth}-01`);
    }
  }
  if (filters.card) { clauses.push('t.card_last4 = ?'); values.push(filters.card); }
  if (filters.category === 'uncategorized') clauses.push('t.category_id IS NULL');
  else if (filters.category) { clauses.push('t.category_id = ?'); values.push(filters.category); }
  if (filters.merchant) { clauses.push('m.id = ?'); values.push(filters.merchant); }
  if (filters.query) { clauses.push('(t.raw_merchant LIKE ? OR m.display_name LIKE ?)'); values.push(`%${filters.query}%`, `%${filters.query}%`); }
  if (!filters.includeExcluded) clauses.push('m.is_excluded = 0');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db().prepare(`SELECT t.id, m.id as merchantId, t.purchase_date as purchaseDate, t.statement_month as statementMonth,
    t.card_last4 as cardLast4, t.raw_merchant as rawMerchant, m.display_name as merchant,
    t.charged_amount_ils as amount, t.original_amount as originalAmount, t.original_currency as originalCurrency,
    t.voucher, t.details, t.source_file as sourceFile, t.category_id as categoryId, c.name as category,
    t.category_source as categorySource, t.duplicate_status as duplicateStatus, m.is_excluded as merchantExcluded
    FROM transactions t JOIN merchant_groups m ON m.id = t.merchant_id
    LEFT JOIN categories c ON c.id = t.category_id ${where}
    ORDER BY t.purchase_date DESC, t.created_at DESC LIMIT ?`).all(...values, limit) as TransactionRow[];
}

export function transactions(filters: Filters) {
  return queryRows(filters, filters.merchant ? 10000 : 1000);
}

export function insightTransactions(filters: Filters) {
  return queryRows(filters, 1000000);
}

export function merchantGroups(filters: Filters, sort: 'spend' | 'count' = 'spend') {
  const dateColumn = filters.basis === 'statement' ? 't.statement_month' : 't.purchase_date';
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.from) { clauses.push(`${dateColumn} >= ?`); values.push(filters.from); }
  if (filters.to) { clauses.push(`${dateColumn} <= ?`); values.push(filters.to); }
  if (filters.card) { clauses.push('t.card_last4 = ?'); values.push(filters.card); }
  if (filters.category === 'uncategorized') clauses.push('t.category_id IS NULL');
  else if (filters.category) { clauses.push('t.category_id = ?'); values.push(filters.category); }
  if (filters.merchant) { clauses.push('m.id = ?'); values.push(filters.merchant); }
  if (filters.query) { clauses.push('(t.raw_merchant LIKE ? OR m.display_name LIKE ?)'); values.push(`%${filters.query}%`, `%${filters.query}%`); }
  if (!filters.includeExcluded) clauses.push('m.is_excluded = 0');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const order = sort === 'count' ? 'transactionCount DESC, spend DESC' : 'spend DESC, transactionCount DESC';
  return db().prepare(`SELECT m.id as merchantId, m.display_name as merchant, count(t.id) as transactionCount,
    round(sum(CASE WHEN t.charged_amount_ils < 0 THEN -t.charged_amount_ils ELSE 0 END), 2) as spend,
    round(sum(CASE WHEN t.charged_amount_ils > 0 THEN t.charged_amount_ils ELSE 0 END), 2) as refunds,
    count(DISTINCT coalesce(t.category_id, '__uncategorized__')) as categoryCount,
    CASE WHEN count(DISTINCT coalesce(t.category_id, '__uncategorized__')) = 1 AND min(t.category_id) IS NOT NULL THEN min(t.category_id) ELSE NULL END as categoryId,
    CASE WHEN count(DISTINCT coalesce(t.category_id, '__uncategorized__')) = 1 AND min(t.category_id) IS NOT NULL THEN min(c.name) ELSE NULL END as category,
    m.is_excluded as merchantExcluded
    FROM transactions t JOIN merchant_groups m ON m.id = t.merchant_id
    LEFT JOIN categories c ON c.id = t.category_id ${where}
    GROUP BY m.id, m.display_name, m.is_excluded
    ORDER BY ${order}, merchant`).all(...values) as MerchantGroupRow[];
}

export function dashboard(filters: Filters) {
  const rows = queryRows(filters, 10000);
  const rowsWithExcluded = filters.includeExcluded ? rows : queryRows({ ...filters, includeExcluded: true }, 10000);
  const excludedRows = rowsWithExcluded.filter((row) => row.merchantExcluded);
  const spending = rows.filter((row) => row.amount < 0).reduce((sum, row) => sum - row.amount, 0);
  const refunds = rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const group = (key: (row: TransactionRow) => string) => Object.entries(rows.filter((row) => row.amount < 0).reduce<Record<string, number>>((groups, row) => {
    const label = key(row); groups[label] = (groups[label] ?? 0) + -row.amount; return groups;
  }, {})).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
  const basis = filters.basis === 'statement' ? (row: TransactionRow) => row.statementMonth : (row: TransactionRow) => row.purchaseDate.slice(0, 7);
  const monthsInPeriod = () => {
    const present = rows.map(basis).sort();
    const start = filters.from ?? present[0];
    const end = filters.to ?? present.at(-1);
    if (!start || !end || start > end) return [];
    const months: string[] = [];
    for (let value = start; value <= end;) {
      months.push(value);
      const [year, month] = value.split('-').map(Number);
      value = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
    }
    return months;
  };
  const stacked = (key: (row: TransactionRow) => string) => {
    const values = new Map<string, Record<string, string | number>>();
    const keys = new Set<string>();
    for (const month of monthsInPeriod()) values.set(month, { name: month });
    for (const row of rows.filter((item) => item.amount < 0)) {
      const month = basis(row); const label = key(row); keys.add(label);
      const value = values.get(month) ?? { name: month };
      value[label] = Number(value[label] ?? 0) + -row.amount;
      values.set(month, value);
    }
    return { keys: [...keys].sort(), rows: [...values.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))) };
  };
  const byCategory = stacked((row) => row.category ?? 'Uncategorized');
  const byCard = stacked((row) => `Card ${row.cardLast4}`);
  return {
    summary: {
      spending: Math.round(spending * 100) / 100, refunds: Math.round(refunds * 100) / 100,
      transactionCount: rows.length, uncategorized: rows.filter((row) => !row.categoryId).length,
      excludedSpending: filters.includeExcluded ? 0 : Math.round(excludedRows.filter((row) => row.amount < 0).reduce((sum, row) => sum - row.amount, 0) * 100) / 100,
      excludedMerchants: filters.includeExcluded ? 0 : new Set(excludedRows.map((row) => row.merchantId)).size,
      excludedTransactionCount: excludedRows.length,
      excludedMerchantCount: new Set(excludedRows.map((row) => row.merchantId)).size,
    },
    categories: group((row) => row.category ?? 'Uncategorized'),
    months: group(basis).sort((a, b) => a.name.localeCompare(b.name)),
    merchants: group((row) => row.merchant).slice(0, 10),
    cards: group((row) => `Card ${row.cardLast4}`),
    monthlyByCategory: byCategory.rows, categoryKeys: byCategory.keys,
    monthlyByCard: byCard.rows, cardKeys: byCard.keys,
  };
}

export function availableFilters(basis: 'purchase' | 'statement' = 'statement') {
  const database = db();
  const dateColumn = basis === 'statement' ? 'statement_month' : 'purchase_date';
  return {
    cards: database.prepare('SELECT DISTINCT card_last4 as id, card_last4 as name FROM transactions ORDER BY card_last4').all(),
    categories: database.prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name").all(),
    dateRange: database.prepare(`SELECT substr(MIN(${dateColumn}), 1, 7) as min, substr(MAX(${dateColumn}), 1, 7) as max FROM transactions`).get(),
  };
}
