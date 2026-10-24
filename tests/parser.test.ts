import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { normalizeMerchant, starterCategory } from '../lib/merchant';
import { parseStatement } from '../lib/parser';

async function statement(rows: Array<Record<string, string | number>>, includePending = false) {
  const worksheetRows: Array<Array<string | number>> = [];
  if (includePending) {
    worksheetRows.push(['עסקאות שטרם נקלטו']);
    worksheetRows.push(['תאריך רכישה', 'שם בית עסק', 'סכום עסקה', 'מטבע עסקה']);
    worksheetRows.push(['28.08.26', 'עסקה ממתינה', 30, '₪']);
    worksheetRows.push([]);
  }
  const headers = ['תאריך רכישה', 'שם בית עסק', 'סכום עסקה', 'מטבע עסקה', 'סכום חיוב', 'מטבע חיוב', "מס' שובר", 'פירוט נוסף'];
  worksheetRows.push(headers);
  rows.forEach((row) => worksheetRows.push(headers.map((header) => row[header] ?? '')));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(worksheetRows), 'Statement');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('statement parser', () => {
  it('rejects invalid statement months before opening a workbook', async () => {
    await expect(parseStatement('1111_13_2026.xlsx', Buffer.alloc(0))).rejects.toThrow('Expected file name');
  });
  it('rejects oversized input before opening a workbook', async () => {
    await expect(parseStatement('1111_01_2026.xlsx', Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow('at most 5 MB');
  });
  it('rejects excessive worksheet width before reading its rows', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([Array(65).fill('sample')]), 'Statement');
    await expect(parseStatement('1111_01_2026.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))).rejects.toThrow('64-column');
  });
  it('uses the billed header after a pending section and preserves foreign transaction fields', async () => {
    const file = await statement([{ 'תאריך רכישה': '31.12.25', 'שם בית עסק': 'סופר פארם סניף לדוגמה א', 'סכום עסקה': 20, 'מטבע עסקה': 'USD', 'סכום חיוב': 73.5, 'מטבע חיוב': '₪', "מס' שובר": '12345', 'פירוט נוסף': 'sample' }], true);
    const parsed = await parseStatement('1111_01_2026.xlsx', file);
    expect(parsed.cardLast4).toBe('1111');
    expect(parsed.statementMonth).toBe('2026-01');
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]).toMatchObject({ purchaseDate: '2025-12-31', chargedAmountIls: -73.5, originalAmount: 20, originalCurrency: 'USD', voucher: '12345' });
  });

  it('keeps refunds as positive credits and rejects unknown filenames', async () => {
    const file = await statement([{ 'תאריך רכישה': '01.01.26', 'שם בית עסק': 'חנות', 'סכום עסקה': -10, 'מטבע עסקה': '₪', 'סכום חיוב': -10, 'מטבע חיוב': '₪', "מס' שובר": 'refund' }]);
    await expect(parseStatement('wrong.xlsx', file)).rejects.toThrow('Expected file name');
    const parsed = await parseStatement('2222_01_2026.xlsx', file);
    expect(parsed.transactions[0].chargedAmountIls).toBe(10);
  });
});

describe('merchant normalization and starter rules', () => {
  it('normalizes punctuation without fuzzy-merging distinct merchants', () => {
    expect(normalizeMerchant(' סופר-פארם סניף לדוגמה א בע"מ ')).toBe('סופר פארם סניף לדוגמה א');
    expect(normalizeMerchant('סופר פארם סניף לדוגמה ב')).not.toBe(normalizeMerchant('סופר פארם סניף לדוגמה א'));
  });
  it('applies deterministic starter rules before AI', () => {
    expect(starterCategory('שופרסל סניף לדוגמה')).toBe('Groceries');
    expect(starterCategory('סופר פארם סניף לדוגמה א')).toBe('Pharmacy & medical');
  });
});
