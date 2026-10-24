'use client';

import { useEffect, useState } from 'react';

export type MerchantGroup = {
  merchantId: string;
  merchant: string;
  transactionCount: number;
  spend: number;
  refunds: number;
  categoryId: string | null;
  category: string | null;
  categoryCount: number;
  merchantExcluded: boolean;
};

type Category = { id: string; groupName: string; name: string };

const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });

export default function MerchantGroupsView({ groups, categories, busy, onChange, onCreateCategory, onViewRows, onToggleMerchantExcluded }: { groups: MerchantGroup[]; categories: Category[]; busy: boolean; onChange: (group: MerchantGroup, categoryId: string) => void; onCreateCategory: (group: MerchantGroup) => void; onViewRows: (group: MerchantGroup) => void; onToggleMerchantExcluded: (group: MerchantGroup) => void }) {
  return <article className="panel table-panel"><p className="eyebrow">{groups.length} MERCHANT GROUPS</p><div className="table-wrap"><table><thead><tr><th>Merchant</th><th>Transactions</th><th>Spend</th><th>Refunds</th><th>Category</th><th>Actions</th></tr></thead><tbody>{groups.map((group) => <tr key={group.merchantId}><td><strong>{group.merchant}</strong><button className="link merchant-action" disabled={busy} onClick={() => onToggleMerchantExcluded(group)}>{group.merchantExcluded ? 'Include in reports' : 'Exclude from reports'}</button></td><td>{group.transactionCount}</td><td>{money.format(group.spend)}</td><td className={group.refunds > 0 ? 'credit' : ''}>{money.format(group.refunds)}</td><td><MerchantCategoryControl group={group} categories={categories} busy={busy} onChange={onChange} onCreateCategory={onCreateCategory} /></td><td><button className="quiet" disabled={busy} onClick={() => onViewRows(group)}>View rows</button></td></tr>)}</tbody></table></div></article>;
}

function MerchantCategoryControl({ group, categories, busy, onChange, onCreateCategory }: { group: MerchantGroup; categories: Category[]; busy: boolean; onChange: (group: MerchantGroup, categoryId: string) => void; onCreateCategory: (group: MerchantGroup) => void }) {
  const [value, setValue] = useState(group.categoryId ?? '');
  useEffect(() => setValue(group.categoryId ?? ''), [group.categoryId]);
  const label = group.categoryCount > 1 ? 'Mixed categories' : 'Uncategorized';
  return <div className="inline-change"><select value={value} onChange={(event) => { const selected = event.target.value; if (selected === '__new__') { onCreateCategory(group); return; } setValue(selected); }}><option value="">{label}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="__new__">+ Create new category...</option></select><button className="quiet" disabled={busy || !value} onClick={() => onChange(group, value)}>Apply</button></div>;
}
