import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { appDataPath, db, findCategoryId } from './db';
import { normalizeMerchant, starterCategory } from './merchant';
import type { ParsedStatement } from './parser';

export type StagedImport = ParsedStatement & { fileHash: string; stagingPath: string; duplicateFile: boolean };
export type StagedBatch = { token: string; imports: StagedImport[]; createdAt: string };

const stagingDir = () => appDataPath('staging');
const uploadsDir = () => appDataPath('uploads');
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

function pruneExpiredStages() {
  const directory = stagingDir();
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    if (!/^[a-f0-9-]{36}(?:\.json|-\d{4}_(?:0[1-9]|1[0-2])_[1-9]\d{3}\.xlsx)$/i.test(name)) continue;
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isFile() && Date.now() - stat.mtimeMs > PREVIEW_TTL_MS) fs.unlinkSync(file);
  }
}

export function stageFile(name: string, content: Buffer, parsed: ParsedStatement): StagedImport {
  fs.mkdirSync(stagingDir(), { recursive: true });
  pruneExpiredStages();
  const fileHash = crypto.createHash('sha256').update(content).digest('hex');
  const stagingPath = path.join(stagingDir(), `${randomUUID()}-${name}`);
  fs.writeFileSync(stagingPath, content);
  const duplicateFile = Boolean(db().prepare('SELECT 1 FROM imports WHERE file_hash = ?').get(fileHash));
  return { ...parsed, fileHash, stagingPath, duplicateFile };
}

export function saveStage(imports: StagedImport[]) {
  const token = randomUUID();
  const batch: StagedBatch = { token, imports, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(stagingDir(), `${token}.json`), JSON.stringify(batch));
  return batch;
}

export function loadStage(token: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)) throw new Error('Invalid import preview token.');
  pruneExpiredStages();
  const source = path.join(stagingDir(), `${token}.json`);
  if (!fs.existsSync(source)) throw new Error('This import preview has expired. Please select the files again.');
  const batch = JSON.parse(fs.readFileSync(source, 'utf8')) as StagedBatch;
  const createdAt = Date.parse(batch.createdAt);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > PREVIEW_TTL_MS) throw new Error('This import preview has expired. Please select the files again.');
  return batch;
}

function merchantFor(rawMerchant: string) {
  const database = db();
  const normalized = normalizeMerchant(rawMerchant);
  const existing = database.prepare('SELECT id FROM merchant_groups WHERE normalized_name = ?').get(normalized) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  database.prepare('INSERT INTO merchant_groups (id, normalized_name, display_name) VALUES (?, ?, ?)').run(id, normalized, rawMerchant);
  return id;
}

function resolveCategory(merchantId: string, rawMerchant: string) {
  const database = db();
  const rule = database.prepare('SELECT category_id as categoryId, source FROM merchant_rules WHERE merchant_id = ? AND active = 1').get(merchantId) as { categoryId: string; source: string } | undefined;
  if (rule) return { categoryId: rule.categoryId, source: rule.source === 'user' ? 'user-rule' : 'ai-rule' };
  const starter = starterCategory(rawMerchant);
  const category = starter ? findCategoryId(starter) : undefined;
  return category ? { categoryId: category.id, source: 'starter-rule' } : { categoryId: null, source: null };
}

export function commitStage(token: string) {
  const batch = loadStage(token);
  const database = db();
  fs.mkdirSync(uploadsDir(), { recursive: true });
  let importedFiles = 0;
  let insertedTransactions = 0;
  let duplicateTransactions = 0;
  let ambiguousTransactions = 0;

  const commit = database.transaction(() => {
    for (const statement of batch.imports) {
      if (statement.duplicateFile || database.prepare('SELECT 1 FROM imports WHERE file_hash = ?').get(statement.fileHash)) continue;
      const importId = randomUUID();
      const targetPath = path.join(uploadsDir(), `${importId}-${statement.fileName}`);
      database.prepare(`INSERT INTO imports
        (id, file_name, file_hash, card_last4, statement_month, source_path, parsed_count, ignored_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(importId, statement.fileName, statement.fileHash, statement.cardLast4, statement.statementMonth, targetPath, statement.transactions.length, statement.ignoredCount);
      for (const transaction of statement.transactions) {
        if (transaction.voucher && database.prepare('SELECT 1 FROM transactions WHERE card_last4 = ? AND voucher = ?').get(statement.cardLast4, transaction.voucher)) {
          duplicateTransactions++;
          continue;
        }
        const merchantId = merchantFor(transaction.rawMerchant);
        const duplicateCandidate = !transaction.voucher && database.prepare(`SELECT 1 FROM transactions
          WHERE card_last4 = ? AND purchase_date = ? AND raw_merchant = ? AND charged_amount_ils = ? LIMIT 1`)
          .get(statement.cardLast4, transaction.purchaseDate, transaction.rawMerchant, transaction.chargedAmountIls);
        const category = resolveCategory(merchantId, transaction.rawMerchant);
        database.prepare(`INSERT INTO transactions
          (id, import_id, merchant_id, raw_merchant, purchase_date, statement_month, card_last4,
           charged_amount_ils, original_amount, original_currency, charged_currency, voucher, details,
           source_file, raw_row_json, category_id, category_source, duplicate_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), importId, merchantId, transaction.rawMerchant, transaction.purchaseDate,
            statement.statementMonth, statement.cardLast4, transaction.chargedAmountIls,
            transaction.originalAmount, transaction.originalCurrency, transaction.chargedCurrency,
            transaction.voucher, transaction.details, statement.fileName, JSON.stringify(transaction.rawRow),
            category.categoryId, category.source, duplicateCandidate ? 'ambiguous' : 'clear');
        insertedTransactions++;
        if (duplicateCandidate) ambiguousTransactions++;
      }
      fs.copyFileSync(statement.stagingPath, targetPath);
      importedFiles++;
    }
  });
  commit();
  for (const statement of batch.imports) {
    if (fs.existsSync(statement.stagingPath)) fs.unlinkSync(statement.stagingPath);
  }
  const stageFile = path.join(stagingDir(), `${token}.json`);
  if (fs.existsSync(stageFile)) fs.unlinkSync(stageFile);
  return { importedFiles, insertedTransactions, duplicateTransactions, ambiguousTransactions };
}
