'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import MerchantGroupsView from './merchant-groups-view';
import { INSIGHT_METHOD, type InsightReport } from '@/lib/insights';

type Category = { id: string; groupName: string; name: string };
type DashboardSummary = { spending: number; refunds: number; transactionCount: number; uncategorized: number; excludedSpending: number; excludedMerchants: number; excludedTransactionCount: number; excludedMerchantCount: number };
type Dashboard = { summary: DashboardSummary; categories: Point[]; months: Point[]; merchants: Point[]; cards: Point[]; monthlyByCategory: StackPoint[]; categoryKeys: string[]; monthlyByCard: StackPoint[]; cardKeys: string[]; filters: { cards: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }>; dateRange: { min: string; max: string } } };
type Point = { name: string; amount: number };
type StackPoint = Record<string, string | number>;
type Transaction = { id: string; merchantId: string; purchaseDate: string; statementMonth: string; cardLast4: string; rawMerchant: string; merchant: string; amount: number; originalAmount: number | null; originalCurrency: string | null; voucher: string | null; details: string | null; sourceFile: string; categoryId: string | null; category: string | null; categorySource: string | null; duplicateStatus: string; merchantExcluded: boolean };
type MerchantGroup = { merchantId: string; merchant: string; transactionCount: number; spend: number; refunds: number; categoryId: string | null; category: string | null; categoryCount: number; merchantExcluded: boolean };
type ReviewItem = { merchantId: string; merchant: string; suggestedCategoryId: string; suggestedCategory: string; confidence: number; reason: string | null; transactionCount: number; spend: number; firstDate: string; lastDate: string };
type CategoryAssignment = Pick<ReviewItem, 'merchantId' | 'merchant' | 'transactionCount'>;
type Stage = { token: string; imports: Array<{ fileName: string; cardLast4: string; statementMonth: string; parsedCount: number; ignoredCount: number; duplicateFile: boolean }> };
type Filters = { basis: 'purchase' | 'statement'; from: string; to: string; card: string; category: string; merchant: string; query: string; includeExcluded: boolean };
type InsightsPayload = { method: typeof INSIGHT_METHOD; report: InsightReport | null };

const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const colors = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#ea580c', '#db2777', '#4f46e5', '#65a30d', '#0f766e', '#9333ea',
  '#be123c', '#0284c7', '#ca8a04', '#059669', '#c2410c', '#9f1239',
  '#6366f1', '#15803d', '#a21caf', '#0369a1', '#b45309', '#0d9488',
  '#7e22ce', '#4d7c0f', '#e11d48', '#1d4ed8', '#047857', '#a16207',
];
const paletteColor = (key: string, orderedKeys: readonly string[]) => {
  const index = orderedKeys.indexOf(key);
  return index >= 0 ? colors[index % colors.length] : '#b9c1d1';
};
const textCollator = new Intl.Collator('he-IL', { numeric: true, sensitivity: 'base' });

type TransactionSortKey = 'purchaseDate' | 'statementMonth' | 'merchant' | 'category' | 'card' | 'amount' | 'originalAmount' | 'reference' | 'source';
type TransactionSort = { key: TransactionSortKey; direction: 'asc' | 'desc' };

function transactionSortValue(row: Transaction, key: TransactionSortKey): string | number | null {
  switch (key) {
    case 'purchaseDate': return row.purchaseDate;
    case 'statementMonth': return row.statementMonth;
    case 'merchant': return row.rawMerchant;
    case 'category': return row.category ?? 'Uncategorized';
    case 'card': return row.cardLast4;
    case 'amount': return row.amount;
    case 'originalAmount': return row.originalAmount;
    case 'reference': return `${row.voucher ?? ''} ${row.details ?? ''}`.trim() || null;
    case 'source': return row.sourceFile;
  }
}

function sortTransactions(rows: Transaction[], sort: TransactionSort) {
  return [...rows].sort((left, right) => {
    const leftValue = transactionSortValue(left, sort.key);
    const rightValue = transactionSortValue(right, sort.key);
    if (leftValue === null) return rightValue === null ? 0 : 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : textCollator.compare(String(leftValue), String(rightValue));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

function SortableHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: TransactionSortKey; sort: TransactionSort; onSort: (key: TransactionSortKey) => void }) {
  const active = sort.key === sortKey;
  return <th aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className={active ? 'sort-header active' : 'sort-header'} onClick={() => onSort(sortKey)}>{label}<span aria-hidden="true">{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>;
}

function ExcludedRowsToggle({ summary, includeExcluded, onToggle }: { summary: DashboardSummary | undefined; includeExcluded: boolean; onToggle: () => void }) {
  const rows = summary?.excludedTransactionCount ?? 0;
  const merchants = summary?.excludedMerchantCount ?? 0;
  const rowLabel = `${rows} excluded row${rows === 1 ? '' : 's'}`;
  const merchantLabel = `${merchants} excluded merchant${merchants === 1 ? '' : 's'}`;
  const label = includeExcluded ? `Showing ${rowLabel}` : rows ? `${merchantLabel} · ${rowLabel}` : 'No excluded rows for these filters';
  return <button className={includeExcluded ? 'exclusion-status active' : 'exclusion-status'} disabled={!summary || (!rows && !includeExcluded)} onClick={onToggle}>{label}</button>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed.');
  return data as T;
}

export default function InsightsApp() {
  const [tab, setTab] = useState<'overview' | 'insights' | 'import' | 'review' | 'transactions' | 'categories' | 'settings'>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [merchantGroups, setMerchantGroups] = useState<MerchantGroup[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<Filters>({ basis: 'statement', from: '', to: '', card: '', category: '', merchant: '', query: '', includeExcluded: false });
  const [notice, setNotice] = useState('');
  const [undoId, setUndoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingFor, setCreatingFor] = useState<CategoryAssignment | null>(null);
  const [overviewDrillMonth, setOverviewDrillMonth] = useState<string | null>(null);
  const [overviewDrill, setOverviewDrill] = useState<{ dashboard: Dashboard; transactions: Transaction[] } | null>(null);
  const [transactionView, setTransactionView] = useState<'rows' | 'merchants'>('merchants');
  const [merchantSort, setMerchantSort] = useState<'spend' | 'count'>('spend');
  const [insights, setInsights] = useState<InsightsPayload | null>(null);

  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value).map(([key, value]) => [key, String(value)])).toString(), [filters]);
  const overviewDrillQuery = useMemo(() => overviewDrillMonth ? new URLSearchParams(Object.entries({ ...filters, from: overviewDrillMonth, to: overviewDrillMonth }).filter(([, value]) => value).map(([key, value]) => [key, String(value)])).toString() : '', [filters, overviewDrillMonth]);
  const refresh = useCallback(async () => {
    try {
      const [summary, rows, groups, queue, categoryList, insightData] = await Promise.all([
        request<Dashboard>(`/api/dashboard?${query}`), request<Transaction[]>(`/api/transactions?${query}`),
        request<MerchantGroup[]>(`/api/transactions?${query}&groupBy=merchant&sort=${merchantSort}`),
        request<ReviewItem[]>('/api/review'), request<Category[]>('/api/categories'), request<InsightsPayload>(`/api/insights?${query}`),
      ]);
      setDashboard(summary); setTransactions(rows); setMerchantGroups(groups); setReview(queue); setCategories(categoryList); setInsights(insightData);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load local data.'); }
  }, [query, merchantSort]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!overviewDrillMonth) { setOverviewDrill(null); return; }
    let cancelled = false;
    void Promise.all([request<Dashboard>(`/api/dashboard?${overviewDrillQuery}`), request<Transaction[]>(`/api/transactions?${overviewDrillQuery}`)])
      .then(([drillDashboard, drillTransactions]) => { if (!cancelled) setOverviewDrill({ dashboard: drillDashboard, transactions: drillTransactions }); })
      .catch((error) => { if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not load the month drill-down.'); });
    return () => { cancelled = true; };
  }, [overviewDrillMonth, overviewDrillQuery]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const navigateCategory = (categoryName: string) => {
    const category = dashboard?.filters.categories.find((item) => item.name === categoryName);
    setFilter('category', category?.id ?? (categoryName === 'Uncategorized' ? 'uncategorized' : ''));
    setTab('transactions');
  };
  const viewMerchantRows = (item: CategoryAssignment) => {
    setFilters({ basis: 'statement', from: '', to: '', card: '', category: '', merchant: item.merchantId, query: '', includeExcluded: true });
    setTab('transactions');
    setNotice(`Showing all imported rows for ${item.merchant}. The suggested category is still pending review.`);
  };

  async function parseFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setNotice('');
    try {
      const data = new FormData(); Array.from(files).forEach((file) => data.append('files', file));
      const preview = await request<Stage>('/api/imports/parse', { method: 'POST', body: data });
      setStage(preview); setNotice('Review the parsed statements, then commit them to your local database.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not parse statements.'); }
    finally { setBusy(false); }
  }

  const [stage, setStage] = useState<Stage | null>(null);
  async function commitImport() {
    if (!stage) return;
    setBusy(true);
    try {
      const result = await request<{ importedFiles: number; insertedTransactions: number; duplicateTransactions: number; ambiguousTransactions: number }>('/api/imports/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: stage.token }) });
      setNotice(`Imported ${result.insertedTransactions} transactions from ${result.importedFiles} statements. ${result.duplicateTransactions} voucher duplicates were skipped; ${result.ambiguousTransactions} no-voucher rows were flagged.`);
      setStage(null); await refresh(); setTab('overview');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not commit import.'); }
    finally { setBusy(false); }
  }

  async function runAi() {
    setBusy(true);
    try { const result = await request<{ requested: number; completed: number }>('/api/categorization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gemma3:4b' }) }); setNotice(`Completed ${result.completed} AI suggestions across ${result.requested} merchant groups.`); await refresh(); setTab('review'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'AI categorization failed.'); }
    finally { setBusy(false); }
  }

  async function generateInsightReport() {
    setBusy(true);
    try {
      const result = await request<{ report: InsightReport }>('/api/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true, filters }) });
      setInsights((current) => ({ method: current?.method ?? INSIGHT_METHOD, report: result.report }));
      setNotice('The spending insights report was generated and saved locally.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not generate insights.'); }
    finally { setBusy(false); }
  }

  async function decide(item: ReviewItem, categoryId: string) {
    setBusy(true);
    try { const result = await request<{ auditId: string }>('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: item.merchantId, categoryId }) }); setUndoId(result.auditId); setNotice(`Applied category to all ${item.transactionCount} existing ${item.merchant} rows and future imports.`); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not apply merchant rule.'); }
    finally { setBusy(false); }
  }

  async function undoLastDecision() {
    if (!undoId) return;
    try { await request('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo', auditId: undoId }) }); setNotice('The merchant-wide category change was undone.'); setUndoId(null); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not undo change.'); }
  }

  async function approveAllSuggested() {
    if (!review.length) return;
    setBusy(true);
    try { const result = await request<{ results: unknown[] }>('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk', merchantIds: review.map((item) => item.merchantId) }) }); setNotice(`Applied ${result.results.length} suggested merchant-wide rules.`); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not apply suggestions.'); }
    finally { setBusy(false); }
  }

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await request('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupName: form.get('groupName'), name: form.get('name') }) }); event.currentTarget.reset(); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create category.'); }
  }

  async function createAndApplyCategory(groupName: string, name: string) {
    if (!creatingFor) return;
    setBusy(true);
    try {
      const category = await request<Category>('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupName, name }) });
      const result = await request<{ auditId: string }>('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: creatingFor.merchantId, categoryId: category.id }) });
      setUndoId(result.auditId);
      setNotice(`Created “${category.name}” and applied it to all ${creatingFor.transactionCount} existing ${creatingFor.merchant} rows and future imports.`);
      setCreatingFor(null);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create and apply category.'); }
    finally { setBusy(false); }
  }

  async function updateCategory(id: string, values: { groupName?: string; name?: string; isActive?: boolean }) {
    try { await request('/api/categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...values }) }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update category.'); }
  }

  async function toggleMerchantExcluded(row: Transaction) {
    const next = !row.merchantExcluded;
    const action = next ? 'exclude from reports' : 'include in reports';
    if (!window.confirm(`${next ? 'Exclude' : 'Include'} ${row.merchant} ${next ? 'from' : 'in'} all reports? This is reversible.`)) return;
    setBusy(true);
    try {
      await request('/api/merchants', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: row.merchantId, excluded: next }) });
      setNotice(`${row.merchant} will ${next ? 'no longer be counted' : 'now be counted'} in reports. Use “Include excluded merchants” to compare the impact.`);
      await refresh();
      if (overviewDrillMonth) {
        const [drillDashboard, drillTransactions] = await Promise.all([request<Dashboard>(`/api/dashboard?${overviewDrillQuery}`), request<Transaction[]>(`/api/transactions?${overviewDrillQuery}`)]);
        setOverviewDrill({ dashboard: drillDashboard, transactions: drillTransactions });
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : `Could not ${action} this merchant.`); }
    finally { setBusy(false); }
  }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span>₪</span><div>Credit Card<br /><strong>Insights</strong></div></div>
      {(['overview', 'insights', 'import', 'review', 'transactions', 'categories', 'settings'] as const).map((item) => <button key={item} className={tab === item ? 'nav active' : 'nav'} onClick={() => setTab(item)}>{item === 'review' && review.length ? `Review queue (${review.length})` : item}</button>)}
      <div className="sidebar-note">Private data<br />stays on this PC.</div></aside>
    <section className="content">
      <header><div><p className="eyebrow">LOCAL • XLSX • OLLAMA</p><h1>{tab === 'overview' ? 'Spending overview' : tab[0].toUpperCase() + tab.slice(1)}</h1></div><button className="primary" disabled={busy} onClick={() => void runAi()}>✦ Categorize unknown merchants</button></header>
      {notice && <div className="notice"><span>{notice}</span><span>{undoId && <button className="undo" onClick={() => void undoLastDecision()}>Undo</button>}<button onClick={() => setNotice('')}>×</button></span></div>}
      <FilterBar filters={filters} dashboard={dashboard} onChange={setFilter} onReset={() => setFilters({ basis: 'statement', from: '', to: '', card: '', category: '', merchant: '', query: '', includeExcluded: false })} />
      {tab === 'overview' && <><TimeSlider range={dashboard?.filters.dateRange} filters={filters} onRange={(from, to) => { setOverviewDrillMonth(null); setFilters((current) => ({ ...current, from, to })); }} /><Overview data={dashboard} drillMonth={overviewDrillMonth} drilldown={overviewDrill} onCloseDrill={() => setOverviewDrillMonth(null)} onCategory={navigateCategory} onMonth={(month) => { setOverviewDrillMonth(month); setNotice(`Showing the ${filters.basis === 'statement' ? 'statement-month' : 'purchase-date'} breakdown for ${month} below.`); }} onMerchant={(merchant) => { setFilter('query', merchant); setTab('transactions'); }} onToggleMerchantExcluded={(row) => void toggleMerchantExcluded(row)} /></>}
      {tab === 'overview' && dashboard && <CategoryShareCard data={dashboard} onCategory={navigateCategory} />}
      {tab === 'overview' && dashboard && <MonthlyCategoryShareCard rows={dashboard.monthlyByCategory} keys={dashboard.categoryKeys} onMonth={(month) => { setOverviewDrillMonth(month); setNotice(`Showing the ${filters.basis === 'statement' ? 'statement-month' : 'purchase-date'} breakdown for ${month} below.`); }} wide />}
      {tab === 'insights' && <InsightsPanel data={insights} filters={filters} busy={busy} onGenerate={() => void generateInsightReport()} />}
      {tab === 'import' && <ImportPanel stage={stage} busy={busy} onFiles={parseFiles} onCommit={() => void commitImport()} />}
      {tab === 'review' && <ReviewPanel items={review} categories={categories} busy={busy} onDecide={decide} onCreateCategory={(item) => setCreatingFor(item)} onViewRows={viewMerchantRows} onApproveAll={() => void approveAllSuggested()} />}
      {tab === 'transactions' && <div className="stack"><article className="panel transaction-tools"><div><p className="eyebrow">TRANSACTIONS</p><strong>Group and categorize merchants</strong><p className="muted">Filters above apply to both views. Category changes apply to all matching rows and future imports.</p></div><div className="transaction-controls"><div className="view-toggle"><button className={transactionView === 'merchants' ? 'primary' : 'quiet'} onClick={() => setTransactionView('merchants')}>By merchant</button><button className={transactionView === 'rows' ? 'primary' : 'quiet'} onClick={() => setTransactionView('rows')}>Individual rows</button></div><ExcludedRowsToggle summary={dashboard?.summary} includeExcluded={filters.includeExcluded} onToggle={() => setFilter('includeExcluded', !filters.includeExcluded)} />{transactionView === 'merchants' && <label>Sort groups<select value={merchantSort} onChange={(event) => setMerchantSort(event.target.value as 'spend' | 'count')}><option value="spend">Largest spend</option><option value="count">Most transactions</option></select></label>}</div></article>{transactionView === 'merchants' ? <MerchantGroupsView groups={merchantGroups} categories={categories} busy={busy} onChange={(group, categoryId) => void decide({ merchantId: group.merchantId, merchant: group.merchant, transactionCount: group.transactionCount } as ReviewItem, categoryId)} onCreateCategory={(group) => setCreatingFor({ merchantId: group.merchantId, merchant: group.merchant, transactionCount: group.transactionCount })} onViewRows={(group) => { setFilter('merchant', group.merchantId); setTransactionView('rows'); }} onToggleMerchantExcluded={(group) => void toggleMerchantExcluded({ merchantId: group.merchantId, merchant: group.merchant, merchantExcluded: group.merchantExcluded } as Transaction)} /> : <TransactionsTable rows={transactions} categories={categories} busy={busy} onChange={(row, categoryId) => void decide({ merchantId: row.merchantId, merchant: row.merchant, transactionCount: transactions.filter((item) => item.merchantId === row.merchantId).length } as ReviewItem, categoryId)} onCreateCategory={(row) => setCreatingFor({ merchantId: row.merchantId, merchant: row.merchant, transactionCount: transactions.filter((item) => item.merchantId === row.merchantId).length })} onToggleMerchantExcluded={(row) => void toggleMerchantExcluded(row)} />}</div>}
      {tab === 'categories' && <CategoriesPanel categories={categories} onAdd={addCategory} onUpdate={(id, values) => void updateCategory(id, values)} />}
      {tab === 'settings' && <SettingsPanel busy={busy} />}
      {creatingFor && <CreateCategoryDialog merchant={creatingFor.merchant} busy={busy} onClose={() => setCreatingFor(null)} onCreate={(groupName, name) => void createAndApplyCategory(groupName, name)} />}
    </section>
  </main>;
}

function CategoryShareCard({ data, onCategory }: { data: Dashboard; onCategory: (name: string) => void }) {
  const total = data.categories.reduce((sum, point) => sum + point.amount, 0);
  const top = data.categories.slice(0, 7);
  const other = data.categories.slice(7).reduce((sum, point) => sum + point.amount, 0);
  const chartData = [...top, ...(other > 0 ? [{ name: 'Other', amount: other }] : [])].map((point) => ({ ...point, share: total ? point.amount / total : 0 }));
  return <ChartCard title="Share of spending by category"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={chartData} dataKey="share" nameKey="name" innerRadius={68} outerRadius={100} onClick={(point) => { if (point?.name && point.name !== 'Other') onCategory(point.name); }}>{chartData.map((point) => <Cell key={point.name} fill={point.name === 'Other' ? '#b9c1d1' : paletteColor(point.name, data.categoryKeys)} />)}</Pie><Tooltip formatter={(value) => `${(Number(value ?? 0) * 100).toFixed(1)}%`} /></PieChart></ResponsiveContainer><div className="share-legend">{chartData.slice(0, 5).map((point) => <button key={point.name} onClick={() => onCategory(point.name)}><span>{point.name}</span><strong>{(point.share * 100).toFixed(1)}%</strong></button>)}</div></ChartCard>;
}

function FilterBar({ filters, dashboard, onChange, onReset }: { filters: Filters; dashboard: Dashboard | null; onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void; onReset: () => void }) {
  return <div className="filters"><label>Analyze by <select value={filters.basis} onChange={(event) => onChange('basis', event.target.value as Filters['basis'])}><option value="purchase">Purchase date</option><option value="statement">Statement month</option></select></label><label>From <input type="month" value={filters.from} onChange={(event) => onChange('from', event.target.value)} /></label><label>To <input type="month" value={filters.to} onChange={(event) => onChange('to', event.target.value)} /></label><label>Card <select value={filters.card} onChange={(event) => onChange('card', event.target.value)}><option value="">All cards</option>{dashboard?.filters.cards.map((card) => <option key={card.id} value={card.id}>•••• {card.name}</option>)}</select></label><label>Category <select value={filters.category} onChange={(event) => onChange('category', event.target.value)}><option value="">All categories</option><option value="uncategorized">Uncategorized</option>{dashboard?.filters.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="search">Search <input placeholder="Merchant text" value={filters.query} onChange={(event) => onChange('query', event.target.value)} /></label><label className="toggle"><input type="checkbox" checked={filters.includeExcluded} onChange={(event) => onChange('includeExcluded', event.target.checked)} /> Include excluded merchants</label>{filters.merchant && <span className="merchant-filter">Merchant drill-down</span>}<button className="quiet" onClick={onReset}>Reset</button></div>;
}

function TimeSlider({ range, filters, onRange }: { range: { min: string; max: string } | undefined; filters: Filters; onRange: (from: string, to: string) => void }) {
  if (!range?.min || !range.max) return null;
  const months: string[] = [];
  for (let value = range.min; value <= range.max;) {
    months.push(value);
    const [year, month] = value.split('-').map(Number);
    value = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
  }
  const start = Math.max(0, filters.from ? months.indexOf(filters.from) : 0);
  const end = Math.max(start, filters.to ? months.indexOf(filters.to) : months.length - 1);
  const label = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
  const apply = (nextStart: number, nextEnd: number) => onRange(nextStart === 0 ? '' : months[nextStart], nextEnd === months.length - 1 ? '' : months[nextEnd]);
  return <section className="time-slider panel"><div><p className="eyebrow">OVERVIEW PERIOD</p><h2>{label(months[start])} — {label(months[end])}</h2></div><div className="range-controls"><input aria-label="Start month" type="range" min="0" max={months.length - 1} value={start} onChange={(event) => apply(Math.min(Number(event.target.value), end), end)} /><input aria-label="End month" type="range" min="0" max={months.length - 1} value={end} onChange={(event) => apply(start, Math.max(Number(event.target.value), start))} /></div><div className="range-labels"><span>{label(range.min)}</span><span>{label(range.max)}</span></div></section>;
}
function OverviewLegacy({ data, onCategory, onMerchant }: { data: Dashboard | null; onCategory: (name: string) => void; onMerchant: (name: string) => void }) {
  if (!data) return <div className="empty">Loading local insights…</div>;
  const cards = [{ label: 'Spending', value: money.format(data.summary.spending), tone: 'purple' }, { label: 'Refunds & credits', value: money.format(data.summary.refunds), tone: 'green' }, { label: 'Transactions', value: data.summary.transactionCount.toString(), tone: 'blue' }, { label: 'Needs review', value: data.summary.uncategorized.toString(), tone: 'orange' }];
  return <><div className="metrics">{cards.map((card) => <article className={`metric ${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong></article>)}</div><div className="chart-grid"><ChartCard title="Spending by category"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data.categories.slice(0, 8)} dataKey="amount" nameKey="name" innerRadius={68} outerRadius={100} onClick={(point) => point?.name && onCategory(point.name)}>{data.categories.slice(0, 8).map((point, index) => <Cell key={point.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value ?? 0))} /></PieChart></ResponsiveContainer></ChartCard><ChartCard title="Monthly spending"><ResponsiveContainer width="100%" height={300}><BarChart data={data.months}><XAxis dataKey="name" /><YAxis tickFormatter={(value) => `₪${value}`} /><Tooltip formatter={(value) => money.format(Number(value ?? 0))} /><Bar dataKey="amount" fill="#7c5cff" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Top merchants"><div className="rankings">{data.merchants.map((point, index) => <button key={point.name} onClick={() => onMerchant(point.name)}><span>{index + 1}. {point.name}</span><strong>{money.format(point.amount)}</strong></button>)}</div></ChartCard><ChartCard title="Spend by card"><div className="rankings">{data.cards.map((point) => <div key={point.name}><span>{point.name}</span><strong>{money.format(point.amount)}</strong></div>)}</div></ChartCard></div></>;
}

function OverviewBaseLegacy({ data, onCategory, onMonth, onMerchant }: { data: Dashboard | null; onCategory: (name: string) => void; onMonth: (month: string) => void; onMerchant: (name: string) => void }) {
  if (!data) return <div className="empty">Loading local insights…</div>;
  const cards = [
    { label: 'Spending', value: money.format(data.summary.spending), tone: 'purple' },
    { label: 'Refunds & credits', value: money.format(data.summary.refunds), tone: 'green' },
    { label: 'Transactions', value: data.summary.transactionCount.toString(), tone: 'blue' },
    { label: 'Needs review', value: data.summary.uncategorized.toString(), tone: 'orange' },
  ];
  return <><div className="metrics">{cards.map((card) => <article className={`metric ${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong></article>)}</div>{data.summary.excludedMerchants > 0 && <p className="excluded-note">Excluded from the totals: {data.summary.excludedMerchants} merchant{data.summary.excludedMerchants === 1 ? '' : 's'}, {money.format(data.summary.excludedSpending)}. Turn on “Include excluded merchants” above to compare.</p>}<div className="chart-grid"><StackedBarCard title="Monthly spending by category" rows={data.monthlyByCategory} keys={data.categoryKeys} onMonth={onMonth} wide /><ChartCard title="Spending by category"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data.categories.slice(0, 8)} dataKey="amount" nameKey="name" innerRadius={68} outerRadius={100} onClick={(point) => point?.name && onCategory(point.name)}>{data.categories.slice(0, 8).map((point, index) => <Cell key={point.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value ?? 0))} /></PieChart></ResponsiveContainer></ChartCard><StackedBarCard title="Monthly spending by card" rows={data.monthlyByCard} keys={data.cardKeys} onMonth={onMonth} /><ChartCard title="Top merchants"><div className="rankings">{data.merchants.map((point, index) => <button key={point.name} onClick={() => onMerchant(point.name)}><span>{index + 1}. {point.name}</span><strong>{money.format(point.amount)}</strong></button>)}</div></ChartCard><ChartCard title="Spend by card"><div className="rankings">{data.cards.map((point) => <div key={point.name}><span>{point.name}</span><strong>{money.format(point.amount)}</strong></div>)}</div></ChartCard></div></>;
}
function Overview({ data, drillMonth, drilldown, onCloseDrill, onCategory, onMonth, onMerchant, onToggleMerchantExcluded }: { data: Dashboard | null; drillMonth: string | null; drilldown: { dashboard: Dashboard; transactions: Transaction[] } | null; onCloseDrill: () => void; onCategory: (name: string) => void; onMonth: (month: string) => void; onMerchant: (name: string) => void; onToggleMerchantExcluded: (row: Transaction) => void }) { if (!data) return <div className="empty">Loading local insights…</div>; const cards = [{ label: 'Spending', value: money.format(data.summary.spending), tone: 'purple' }, { label: 'Refunds & credits', value: money.format(data.summary.refunds), tone: 'green' }, { label: 'Transactions', value: data.summary.transactionCount.toString(), tone: 'blue' }, { label: 'Needs review', value: data.summary.uncategorized.toString(), tone: 'orange' }]; return <><div className="metrics">{cards.map((card) => <article className={`metric ${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong></article>)}</div>{data.summary.excludedMerchants > 0 && <p className="excluded-note">Excluded from the totals: {data.summary.excludedMerchants} merchant{data.summary.excludedMerchants === 1 ? '' : 's'}, {money.format(data.summary.excludedSpending)}. Turn on “Include excluded merchants” above to compare.</p>}<div className="chart-grid"><StackedBarCard title="Monthly spending by category" rows={data.monthlyByCategory} keys={data.categoryKeys} onMonth={onMonth} wide /></div>{drillMonth && <OverviewMonthDrilldown month={drillMonth} data={drilldown} colorKeys={data.categoryKeys} onClose={onCloseDrill} onToggleMerchantExcluded={onToggleMerchantExcluded} />}<div className="chart-grid overview-secondary"><ChartCard title="Spending by category"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data.categories.slice(0, 8)} dataKey="amount" nameKey="name" innerRadius={68} outerRadius={100} onClick={(point) => point?.name && onCategory(point.name)}>{data.categories.slice(0, 8).map((point) => <Cell key={point.name} fill={colors[Math.max(0, data.categoryKeys.indexOf(point.name)) % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value ?? 0))} /></PieChart></ResponsiveContainer></ChartCard><StackedBarCard title="Monthly spending by card" rows={data.monthlyByCard} keys={data.cardKeys} onMonth={onMonth} /><ChartCard title="Top merchants"><div className="rankings">{data.merchants.map((point, index) => <button key={point.name} onClick={() => onMerchant(point.name)}><span>{index + 1}. {point.name}</span><strong>{money.format(point.amount)}</strong></button>)}</div></ChartCard><ChartCard title="Spend by card"><div className="rankings">{data.cards.map((point) => <div key={point.name}><span>{point.name}</span><strong>{money.format(point.amount)}</strong></div>)}</div></ChartCard></div></>; }
function OverviewMonthDrilldown({ month, data, colorKeys, onClose, onToggleMerchantExcluded }: { month: string; data: { dashboard: Dashboard; transactions: Transaction[] } | null; colorKeys: string[]; onClose: () => void; onToggleMerchantExcluded: (row: Transaction) => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<TransactionSort>({ key: 'purchaseDate', direction: 'desc' });
  useEffect(() => { setSelectedCategory(null); setSort({ key: 'purchaseDate', direction: 'desc' }); }, [month]);
  if (!data) return <section className="panel overview-drill"><p>Loading {month} breakdown…</p></section>;
  const colorFor = (name: string) => paletteColor(name, colorKeys);
  const visibleTransactions = selectedCategory ? data.transactions.filter((row) => (row.category ?? 'Uncategorized') === selectedCategory) : data.transactions;
  const sortedTransactions = sortTransactions(visibleTransactions, sort);
  const onSort = (key: TransactionSortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  return <section className="panel overview-drill"><header className="drill-header"><div><p className="eyebrow">MONTH DRILL-DOWN</p><h2>{month} · {money.format(data.dashboard.summary.spending)} spending · {visibleTransactions.length}{selectedCategory ? ` ${selectedCategory}` : ''} transactions</h2></div><button className="quiet" onClick={onClose}>Close</button></header><div className="drill-grid"><div><h3>Spend by category</h3><ResponsiveContainer width="100%" height={270}><PieChart><Pie data={data.dashboard.categories} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={92} onClick={(point) => { const categoryName = point?.name; if (typeof categoryName === 'string') setSelectedCategory((current) => current === categoryName ? null : categoryName); }}>{data.dashboard.categories.map((point) => <Cell key={point.name} fill={colorFor(point.name)} cursor="pointer" opacity={selectedCategory && selectedCategory !== point.name ? 0.35 : 1} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value ?? 0))} /></PieChart></ResponsiveContainer></div><div className="drill-transactions"><h3>Transactions{selectedCategory ? ` · ${selectedCategory}` : ''} {selectedCategory && <button className="quiet" onClick={() => setSelectedCategory(null)}>Show all</button>}</h3><div className="table-wrap"><table><thead><tr><SortableHeader label="Purchase" sortKey="purchaseDate" sort={sort} onSort={onSort} /><SortableHeader label="Merchant" sortKey="merchant" sort={sort} onSort={onSort} /><SortableHeader label="Category" sortKey="category" sort={sort} onSort={onSort} /><SortableHeader label="Card" sortKey="card" sort={sort} onSort={onSort} /><SortableHeader label="Amount" sortKey="amount" sort={sort} onSort={onSort} /><th>Reports</th></tr></thead><tbody>{sortedTransactions.map((row) => <tr key={row.id}><td>{row.purchaseDate}</td><td>{row.rawMerchant}</td><td>{row.category ?? 'Uncategorized'}</td><td>•••• {row.cardLast4}</td><td className={row.amount > 0 ? 'credit' : ''}>{money.format(row.amount)}</td><td><button className="link merchant-action" onClick={() => onToggleMerchantExcluded(row)}>{row.merchantExcluded ? 'Include in reports' : 'Exclude from reports'}</button></td></tr>)}</tbody></table></div></div></div></section>;
}
type ChartTooltipItem = { dataKey?: string | number; name?: string | number; value?: unknown; payload?: { total?: number } };
function MonthlySpendTooltip({ active, payload, label, keys }: { active?: boolean; payload?: ChartTooltipItem[]; label?: string | number; keys: string[] }) {
  if (!active || !payload?.length) return null;
  const values = payload.filter((item) => keys.includes(String(item.dataKey ?? item.name))).sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
  const total = values.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const largest = Number(values[0]?.value ?? 0);
  return <div className="chart-tooltip"><strong>{label}</strong><b>Total spent: {money.format(total)}</b>{values.map((item, index) => { const amount = Number(item.value ?? 0); const name = String(item.name ?? item.dataKey); const color = paletteColor(String(item.dataKey ?? item.name), keys); return <div className="tooltip-row" key={name}><em>{index + 1}</em><div className="tooltip-category"><div className="tooltip-category-line"><span><i style={{ background: color }} />{name}</span><strong>{money.format(amount)} ({total ? (amount / total * 100).toFixed(1) : '0.0'}%)</strong></div><div className="tooltip-meter"><span style={{ background: color, width: `${largest ? amount / largest * 100 : 0}%` }} /></div></div></div>; })}</div>;
}
function MonthlyShareTooltip({ active, payload, label, keys }: { active?: boolean; payload?: ChartTooltipItem[]; label?: string | number; keys: string[] }) {
  if (!active || !payload?.length) return null;
  const values = payload.filter((item) => keys.includes(String(item.dataKey ?? item.name))).sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
  const total = Number(payload[0]?.payload?.total ?? 0);
  const largest = Number(values[0]?.value ?? 0);
  return <div className="chart-tooltip"><strong>{label}</strong><b>Total spent: {money.format(total)}</b>{values.map((item, index) => { const share = Number(item.value ?? 0); const name = String(item.name ?? item.dataKey); const color = paletteColor(String(item.dataKey ?? item.name), keys); return <div className="tooltip-row" key={name}><em>{index + 1}</em><div className="tooltip-category"><div className="tooltip-category-line"><span><i style={{ background: color }} />{name}</span><strong>{share.toFixed(1)}%</strong></div><div className="tooltip-meter"><span style={{ background: color, width: `${largest ? share / largest * 100 : 0}%` }} /></div></div></div>; })}</div>;
}
function MonthlyCategoryShareCard({ rows, keys, onMonth, wide = false }: { rows: StackPoint[]; keys: string[]; onMonth: (month: string) => void; wide?: boolean }) {
  const percentageRows = rows.map((row) => {
    const total = keys.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
    return { name: row.name, total, ...Object.fromEntries(keys.map((key) => [key, total ? Number(row[key] ?? 0) / total * 100 : 0])) };
  });
  return <ChartCard title="Monthly spending by category (%)" wide={wide}><ResponsiveContainer width="100%" height={360}><BarChart data={percentageRows} margin={{ bottom: 42 }}><XAxis dataKey="name" /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><Tooltip content={<MonthlyShareTooltip keys={keys} />} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 30, pointerEvents: 'none' }} /><Legend verticalAlign="bottom" height={46} />{keys.map((key, index) => <Bar key={key} dataKey={key} stackId="percentage" fill={colors[index % colors.length]} cursor="pointer" onClick={(data) => { const month = data.payload?.name; if (typeof month === 'string') onMonth(month); }} />)}</BarChart></ResponsiveContainer></ChartCard>;
}
function StackedBarCard({ title, rows, keys, onMonth, wide = false }: { title: string; rows: StackPoint[]; keys: string[]; onMonth: (month: string) => void; wide?: boolean }) { return <ChartCard title={title} wide={wide}><ResponsiveContainer width="100%" height={360}><BarChart data={rows} margin={{ bottom: 42 }}><XAxis dataKey="name" /><YAxis tickFormatter={(value) => `₪${value}`} /><Tooltip content={<MonthlySpendTooltip keys={keys} />} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 30, pointerEvents: 'none' }} /><Legend verticalAlign="bottom" height={46} />{keys.map((key, index) => <Bar key={key} dataKey={key} stackId="spend" fill={colors[index % colors.length]} cursor="pointer" onClick={(data) => { const month = data.payload?.name; if (typeof month === 'string') onMonth(month); }} />)}</BarChart></ResponsiveContainer></ChartCard>; }
function ChartCard({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) { return <article className={`panel chart ${wide ? 'chart-wide' : ''}`}><h2>{title}</h2>{children}</article>; }
function InsightsPanel({ data, filters, busy, onGenerate }: { data: InsightsPayload | null; filters: Filters; busy: boolean; onGenerate: () => void }) {
  const [approved, setApproved] = useState(false);
  const report = data?.report;
  return <div className="stack insights-page">
    <article className="panel method-panel">
      <div><p className="eyebrow">INSIGHT METHOD {INSIGHT_METHOD.version}</p><h2>{INSIGHT_METHOD.title}</h2><p>{INSIGHT_METHOD.purpose}</p></div>
      <div className="method-grid">{INSIGHT_METHOD.steps.map((step, index) => <div key={step}><strong>{index + 1}</strong><span>{step}</span></div>)}</div>
      <div className="method-thresholds"><strong>Rules used</strong><span>Comparison: latest 3 periods vs previous 3</span><span>Recurring: merchant appears in at least 3 periods</span><span>Outlier: IQR threshold plus at least 2× median</span></div>
      <label className="approval"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> I approve this method for the current filters</label>
      <button className="primary" disabled={!approved || busy} onClick={onGenerate}>{report ? 'Generate updated report' : 'Generate report'}</button>
      <p className="muted">Current scope: {filters.basis === 'statement' ? 'statement month' : 'purchase date'}{filters.from || filters.to ? ` · ${filters.from || 'first available'} to ${filters.to || 'latest available'}` : ' · all available periods'}{filters.includeExcluded ? ' · including excluded merchants' : ''}.</p>
    </article>
    {!report ? <div className="empty">Approve the method above to generate the first personalized report. The report will be saved in the local SQLite database.</div> : <InsightReportView report={report} />}
  </div>;
}
function InsightReportView({ report }: { report: InsightReport }) {
  const formatChange = (value: number | null, percent: number | null) => value === null ? 'Not enough prior periods' : `${value >= 0 ? '+' : ''}${money.format(value)}${percent === null ? '' : ` (${percent >= 0 ? '+' : ''}${percent}%)`}`;
  return <div className="stack insight-report">
    <div className="report-heading"><div><p className="eyebrow">PERSONALIZED REPORT · METHOD {report.methodVersion}</p><h2>{report.coverage.from ?? 'No data'} — {report.coverage.to ?? 'No data'}</h2></div><span className="muted">Generated {new Date(report.generatedAt).toLocaleString()}</span></div>
    <div className="metrics"><article className="metric"><span>Spending</span><strong>{money.format(report.coverage.spending)}</strong></article><article className="metric green"><span>Refunds & credits</span><strong>{money.format(report.coverage.refunds)}</strong></article><article className="metric blue"><span>Periods covered</span><strong>{report.coverage.periods}</strong></article><article className="metric orange"><span>Average charge</span><strong>{money.format(report.coverage.averageCharge)}</strong></article></div>
    <div className="insight-columns"><article className="panel"><p className="eyebrow">KEY FINDINGS</p>{report.insights.length ? <div className="insight-list">{report.insights.map((insight) => <div className={`insight-card ${insight.severity}`} key={insight.id}><div className="insight-card-heading"><span>{insight.kind}</span><strong>{insight.title}</strong></div><p>{insight.summary}</p><ul>{insight.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div> : <p>No signals met the method thresholds for this scope.</p>}</article><article className="panel comparison-panel"><p className="eyebrow">TIME COMPARISON</p><h2>{formatChange(report.comparison.change, report.comparison.changePercent)}</h2><p className="muted">Latest: {report.comparison.recentPeriods.join(', ') || '—'}<br />Previous: {report.comparison.previousPeriods.join(', ') || '—'}</p><div className="comparison-values"><span><small>Latest</small><strong>{money.format(report.comparison.recentSpending)}</strong></span><span><small>Previous</small><strong>{money.format(report.comparison.previousSpending)}</strong></span></div><h3>Largest categories</h3><div className="rankings">{report.categories.slice(0, 6).map((category) => <div key={category.name}><span>{category.name}</span><strong>{money.format(category.spending)}</strong></div>)}</div></article></div>
    <div className="two-col"><article className="panel"><p className="eyebrow">CATEGORY DETAIL</p><div className="table-wrap"><table><thead><tr><th>Category</th><th>Share</th><th>Periods</th><th>Change</th></tr></thead><tbody>{report.categories.map((category) => <tr key={category.name}><td>{category.name}<small>{category.transactionCount} charges</small></td><td>{Math.round(category.share * 100)}%</td><td>{category.activePeriods}</td><td className={category.change !== null && category.change > 0 ? 'credit-negative' : ''}>{formatChange(category.change, category.changePercent)}</td></tr>)}</tbody></table></div></article><article className="panel"><p className="eyebrow">RECURRING MERCHANTS</p>{report.recurringMerchants.length ? <div className="rankings">{report.recurringMerchants.map((merchant) => <div key={merchant.name}><span>{merchant.name}<small>{merchant.category} · {merchant.activePeriods} periods</small></span><strong>{money.format(merchant.spending)}</strong></div>)}</div> : <p>No merchant appeared in at least three periods.</p>}<p className="eyebrow report-subhead">LARGE CHARGES</p>{report.outliers.length ? <div className="rankings">{report.outliers.slice(0, 5).map((outlier) => <div key={`${outlier.date}-${outlier.merchant}-${outlier.amount}`}><span>{outlier.merchant}<small>{outlier.date} · {outlier.category}</small></span><strong>{money.format(outlier.amount)}</strong></div>)}</div> : <p>No charges met the unusual-spend threshold.</p>}</article></div>
    <div className="two-col"><article className="panel"><p className="eyebrow">CARD DISTRIBUTION</p><div className="rankings">{report.cards.map((card) => <div key={card.name}><span>{card.name}<small>{card.transactionCount} charges · {card.activePeriods} periods</small></span><strong>{Math.round(card.share * 100)}% · {money.format(card.spending)}</strong></div>)}</div>{report.peakPeriod && <p className="muted report-callout">Peak period: <strong>{report.peakPeriod.period}</strong> · {money.format(report.peakPeriod.spending)}</p>}</article><article className="panel"><p className="eyebrow">TOP MERCHANTS</p>{report.topMerchants.length ? <div className="rankings">{report.topMerchants.map((merchant) => <div key={merchant.name}><span>{merchant.name}<small>{merchant.category} · {merchant.transactionCount} charges</small></span><strong>{money.format(merchant.spending)}</strong></div>)}</div> : <p>No spending merchants found.</p>}</article></div>
    <p className="muted report-footnote">Coverage: {report.coverage.transactionCount} rows · {report.coverage.uncategorizedCount} uncategorized · {report.coverage.excludedMerchants} excluded merchants contributing {money.format(report.coverage.excludedSpending)}.</p>
  </div>;
}
function ImportPanel({ stage, busy, onFiles, onCommit }: { stage: Stage | null; busy: boolean; onFiles: (files: FileList | null) => void; onCommit: () => void }) { return <div className="stack"><article className="panel upload"><h2>Import credit-card statements</h2><p>Select one or many `.xlsx` exports. The app reads the billed-transaction table, preserves source fields, and stores a private local copy only after you confirm.</p><input type="file" accept=".xlsx" multiple disabled={busy} onChange={(event) => onFiles(event.target.files)} /></article>{stage && <article className="panel"><h2>Import review</h2><table><thead><tr><th>File</th><th>Card</th><th>Statement</th><th>Parsed</th><th>Ignored</th><th>Status</th></tr></thead><tbody>{stage.imports.map((item) => <tr key={item.fileName}><td>{item.fileName}</td><td>•••• {item.cardLast4}</td><td>{item.statementMonth}</td><td>{item.parsedCount}</td><td>{item.ignoredCount}</td><td>{item.duplicateFile ? 'Already imported' : 'Ready'}</td></tr>)}</tbody></table><button className="primary" disabled={busy || stage.imports.every((item) => item.duplicateFile)} onClick={onCommit}>Commit locally</button></article>}</div>; }
function ReviewPanel({ items, categories, busy, onDecide, onCreateCategory, onViewRows, onApproveAll }: { items: ReviewItem[]; categories: Category[]; busy: boolean; onDecide: (item: ReviewItem, category: string) => void; onCreateCategory: (item: CategoryAssignment) => void; onViewRows: (item: CategoryAssignment) => void; onApproveAll: () => void }) { if (!items.length) return <div className="empty">No pending merchant groups. Run batch categorization after importing statements.</div>; return <div className="queue"><div className="queue-tools"><span>{items.length} merchant groups await a single decision that affects all their matching rows.</span><button className="quiet" disabled={busy} onClick={onApproveAll}>Accept all suggestions</button></div>{items.map((item) => <article className="panel queue-item" key={item.merchantId}><div><p className="eyebrow">{Math.round(item.confidence * 100)}% CONFIDENCE • {item.transactionCount} ROWS • {money.format(item.spend)}</p><h2>{item.merchant}</h2><p>{item.firstDate} to {item.lastDate}{item.reason ? ` · ${item.reason}` : ''}</p></div><div className="decision"><select defaultValue={item.suggestedCategoryId} onChange={(event) => { if (event.target.value === '__new__') { event.currentTarget.value = item.suggestedCategoryId; onCreateCategory(item); } }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.groupName} · {category.name}</option>)}<option value="__new__">+ Create new category…</option></select><button className="quiet" disabled={busy} onClick={() => onViewRows(item)}>View all rows</button><button className="primary" disabled={busy} onClick={(event) => onDecide(item, (event.currentTarget.previousElementSibling?.previousElementSibling as HTMLSelectElement).value)}>Apply to all merchant rows</button></div></article>)}</div>; }
function TransactionsTableLegacy({ rows, categories, busy, onChange, onCreateCategory }: { rows: Transaction[]; categories: Category[]; busy: boolean; onChange: (row: Transaction, categoryId: string) => void; onCreateCategory: (row: Transaction) => void }) { return <article className="panel table-panel"><p className="eyebrow">{rows.length < 1000 ? `${rows.length} MATCHING TRANSACTIONS` : 'UP TO 1,000 MATCHING TRANSACTIONS'} • CHANGES APPLY TO ALL MATCHING MERCHANT ROWS</p><div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Statement</th><th>Merchant</th><th>Category</th><th>Card</th><th>Amount</th><th>Original</th><th>Voucher / details</th><th>Source</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.purchaseDate}</td><td>{row.statementMonth}</td><td>{row.rawMerchant}{row.duplicateStatus === 'ambiguous' && <small>duplicate candidate</small>}</td><td><TransactionCategoryControl row={row} categories={categories} busy={busy} onChange={onChange} onCreateCategory={onCreateCategory} /><small>{row.categorySource ?? ''}</small></td><td>•••• {row.cardLast4}</td><td className={row.amount > 0 ? 'credit' : ''}>{money.format(row.amount)}</td><td>{row.originalAmount !== null ? `${row.originalAmount} ${row.originalCurrency ?? ''}` : '—'}</td><td>{row.voucher ?? '—'}{row.details && <small>{row.details}</small>}</td><td>{row.sourceFile}</td></tr>)}</tbody></table></div></article>; }
function TransactionsTable({ rows, categories, busy, onChange, onCreateCategory, onToggleMerchantExcluded }: { rows: Transaction[]; categories: Category[]; busy: boolean; onChange: (row: Transaction, categoryId: string) => void; onCreateCategory: (row: Transaction) => void; onToggleMerchantExcluded: (row: Transaction) => void }) {
  const [sort, setSort] = useState<TransactionSort>({ key: 'purchaseDate', direction: 'desc' });
  const sortedRows = useMemo(() => sortTransactions(rows, sort), [rows, sort]);
  const onSort = (key: TransactionSortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  return <article className="panel table-panel"><p className="eyebrow">{rows.length < 1000 ? `${rows.length} MATCHING TRANSACTIONS` : 'UP TO 1,000 MATCHING TRANSACTIONS'} • CHANGES APPLY TO ALL MATCHING MERCHANT ROWS</p><div className="table-wrap"><table><thead><tr><SortableHeader label="Purchase" sortKey="purchaseDate" sort={sort} onSort={onSort} /><SortableHeader label="Statement" sortKey="statementMonth" sort={sort} onSort={onSort} /><SortableHeader label="Merchant" sortKey="merchant" sort={sort} onSort={onSort} /><SortableHeader label="Category" sortKey="category" sort={sort} onSort={onSort} /><SortableHeader label="Card" sortKey="card" sort={sort} onSort={onSort} /><SortableHeader label="Amount" sortKey="amount" sort={sort} onSort={onSort} /><SortableHeader label="Original" sortKey="originalAmount" sort={sort} onSort={onSort} /><SortableHeader label="Voucher / details" sortKey="reference" sort={sort} onSort={onSort} /><SortableHeader label="Source" sortKey="source" sort={sort} onSort={onSort} /></tr></thead><tbody>{sortedRows.map((row) => <tr key={row.id}><td>{row.purchaseDate}</td><td>{row.statementMonth}</td><td>{row.rawMerchant}{row.duplicateStatus === 'ambiguous' && <small>duplicate candidate</small>}<button className="link merchant-action" disabled={busy} onClick={() => onToggleMerchantExcluded(row)}>{row.merchantExcluded ? 'Include in reports' : 'Exclude from reports'}</button></td><td><TransactionCategoryControl row={row} categories={categories} busy={busy} onChange={onChange} onCreateCategory={onCreateCategory} /><small>{row.categorySource ?? ''}</small></td><td>•••• {row.cardLast4}</td><td className={row.amount > 0 ? 'credit' : ''}>{money.format(row.amount)}</td><td>{row.originalAmount !== null ? `${row.originalAmount} ${row.originalCurrency ?? ''}` : '—'}</td><td>{row.voucher ?? '—'}{row.details && <small>{row.details}</small>}</td><td>{row.sourceFile}</td></tr>)}</tbody></table></div></article>;
}
function TransactionCategoryControl({ row, categories, busy, onChange, onCreateCategory }: { row: Transaction; categories: Category[]; busy: boolean; onChange: (row: Transaction, categoryId: string) => void; onCreateCategory: (row: Transaction) => void }) { const [value, setValue] = useState(row.categoryId ?? ''); useEffect(() => setValue(row.categoryId ?? ''), [row.categoryId]); return <div className="inline-change"><select value={value} onChange={(event) => { const selected = event.target.value; if (selected === '__new__') { onCreateCategory(row); return; } setValue(selected); }}><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="__new__">+ Create new category…</option></select><button className="quiet" disabled={busy || !value} onClick={() => onChange(row, value)}>All rows</button></div>; }
function CreateCategoryDialog({ merchant, busy, onClose, onCreate }: { merchant: string; busy: boolean; onClose: () => void; onCreate: (groupName: string, name: string) => void }) { return <div className="modal-backdrop" role="presentation"><form className="modal panel form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onCreate(String(form.get('groupName')), String(form.get('name'))); }}><h2>Create category for {merchant}</h2><p>This will create the category, then apply it to every matching merchant row—past and future.</p><label>Group<input name="groupName" required placeholder="e.g. Food" autoFocus /></label><label>Category<input name="name" required placeholder="e.g. Bakery" /></label><div className="modal-actions"><button type="button" className="quiet" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>Create & apply</button></div></form></div>; }
function CategoriesPanel({ categories, onAdd, onUpdate }: { categories: Category[]; onAdd: (event: React.FormEvent<HTMLFormElement>) => void; onUpdate: (id: string, values: { groupName?: string; name?: string; isActive?: boolean }) => void }) { return <div className="two-col"><article className="panel"><h2>Active categories</h2>{Object.entries(categories.reduce<Record<string, Category[]>>((groups, category) => { (groups[category.groupName] ??= []).push(category); return groups; }, {})).map(([group, list]) => <div className="category-group" key={group}><h3>{group}</h3>{list.map((category) => <form className="category-edit" key={category.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdate(category.id, { groupName: String(form.get('groupName')), name: String(form.get('name')) }); }}><input name="groupName" defaultValue={category.groupName} aria-label={`${category.name} group`} /><input name="name" defaultValue={category.name} aria-label={`${category.name} name`} /><button className="quiet">Save</button><button type="button" className="quiet" onClick={() => onUpdate(category.id, { isActive: false })}>Disable</button></form>)}</div>)}</article><form className="panel form" onSubmit={onAdd}><h2>Add a category</h2><label>Group<input name="groupName" required placeholder="e.g. Food" /></label><label>Category<input name="name" required placeholder="e.g. Bakery" /></label><button className="primary">Add category</button></form></div>; }
function SettingsPanel({ busy }: { busy: boolean }) { const [status, setStatus] = useState<{ reachable: boolean; installed: boolean; models: string[]; defaultModel: string } | null>(null); useEffect(() => { void request<typeof status>('/api/categorization').then(setStatus).catch(() => setStatus({ reachable: false, installed: false, models: [], defaultModel: 'gemma3:4b' })); }, []); return <div className="two-col"><article className="panel"><h2>Local AI</h2><p>{status?.reachable ? 'Ollama is running locally.' : 'Ollama is not reachable.'}</p><p>Default: <code>gemma3:4b</code> {status?.installed ? '✓ installed' : '— not installed'}</p>{!status?.installed && <pre>ollama pull gemma3:4b</pre>}<p className="muted">The app sends only batched merchant groups and category choices to your local Ollama server.</p></article><article className="panel"><h2>Backup</h2><p>Download a JSON export of transactions, categories, merchants, and rules. Uploaded statements and SQLite data never leave this PC.</p><a className={busy ? 'disabled button' : 'primary button'} href="/api/export">Download local backup</a></article></div>; }
