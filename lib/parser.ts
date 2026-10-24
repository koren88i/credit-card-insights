import * as XLSX from 'xlsx';

export const MAX_WORKSHEET_ROWS = 20_000;

export type ParsedTransaction = {
  rawMerchant: string; purchaseDate: string; chargedAmountIls: number; originalAmount: number | null;
  originalCurrency: string | null; chargedCurrency: string | null; voucher: string | null;
  details: string | null; rawRow: Record<string, string>;
};

export type ParsedStatement = {
  fileName: string; cardLast4: string; statementMonth: string; transactions: ParsedTransaction[]; ignoredCount: number;
};

const REQUIRED = ['תאריך רכישה', 'שם בית עסק', 'סכום חיוב', "מס' שובר"];
const text = (value: unknown) => value === undefined || value === null ? '' : String(value).trim();

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(2000 + Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.valueOf()) || date.getUTCDate() !== Number(day) || date.getUTCMonth() + 1 !== Number(month) ? null : date.toISOString().slice(0, 10);
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[₪,\s\u200e\u200f]/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function fileMetadata(fileName: string) {
  const match = fileName.match(/^(\d{4})_(0[1-9]|1[0-2])_([1-9]\d{3})\.xlsx$/i);
  if (!match) throw new Error(`Expected file name in NNNN_MM_YYYY.xlsx format, such as 1111_01_2026.xlsx; received ${fileName}.`);
  return { cardLast4: match[1], statementMonth: `${match[3]}-${match[2]}` };
}

export async function parseStatement(fileName: string, content: Buffer): Promise<ParsedStatement> {
  const { cardLast4, statementMonth } = fileMetadata(fileName);
  if (content.byteLength > 5 * 1024 * 1024) throw new Error('Each statement must be at most 5 MB.');
  const workbook = XLSX.read(content, { type: 'buffer', raw: false, sheetRows: MAX_WORKSHEET_ROWS + 1 });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error(`${fileName} has no worksheet.`);
  const range = XLSX.utils.decode_range(workbook.Sheets[firstSheet]['!ref'] ?? 'A1');
  if (range.e.c >= 64 || range.e.r >= MAX_WORKSHEET_ROWS) throw new Error('Statement exceeds the 20,000-row or 64-column limit.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], { header: 1, defval: '', raw: false });

  let headerRow = -1;
  let columns = new Map<string, number>();
  for (let index = 0; index < rows.length; index++) {
    const labels = rows[index].map(text);
    if (labels.includes('תאריך רכישה') && labels.includes('סכום חיוב')) {
      headerRow = index;
      labels.forEach((label, column) => { if (label) columns.set(label, column); });
      break;
    }
  }
  if (headerRow < 0 || REQUIRED.some((name) => !columns.has(name))) throw new Error(`${fileName} does not contain the supported billed-transactions header.`);

  const transactions: ParsedTransaction[] = [];
  let ignoredCount = 0;
  for (const row of rows.slice(headerRow + 1)) {
    const get = (label: string) => text(row[columns.get(label) ?? -1]);
    const date = parseDate(get('תאריך רכישה'));
    const merchant = get('שם בית עסק');
    const charged = parseAmount(get('סכום חיוב'));
    if (!date || !merchant || charged === null) {
      if (row.some((value) => text(value))) ignoredCount++;
      continue;
    }
    const rawRow: Record<string, string> = {};
    columns.forEach((column, label) => { rawRow[label] = text(row[column]); });
    transactions.push({ rawMerchant: merchant, purchaseDate: date, chargedAmountIls: -charged,
      originalAmount: parseAmount(get('סכום עסקה')), originalCurrency: get('מטבע עסקה') || null,
      chargedCurrency: get('מטבע חיוב') || null, voucher: get("מס' שובר") || null,
      details: get('פירוט נוסף') || null, rawRow });
  }
  return { fileName, cardLast4, statementMonth, transactions, ignoredCount };
}
