import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATEGORIES, categoryId } from './categories';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'credit-card-insights.sqlite');
let database: Database.Database | undefined;

export function appDataPath(...parts: string[]) {
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, ...parts);
}

export function db() {
  if (database) return database;
  fs.mkdirSync(dataDir, { recursive: true });
  database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE,
      card_last4 TEXT, statement_month TEXT, source_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'committed', parsed_count INTEGER NOT NULL,
      ignored_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS merchant_groups (
      id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, group_name TEXT NOT NULL, name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(group_name, name)
    );
    CREATE TABLE IF NOT EXISTS merchant_rules (
      id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL UNIQUE REFERENCES merchant_groups(id),
      category_id TEXT NOT NULL REFERENCES categories(id), source TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id),
      merchant_id TEXT NOT NULL REFERENCES merchant_groups(id), raw_merchant TEXT NOT NULL,
      purchase_date TEXT NOT NULL, statement_month TEXT NOT NULL, card_last4 TEXT NOT NULL,
      charged_amount_ils REAL NOT NULL, original_amount REAL, original_currency TEXT,
      charged_currency TEXT, voucher TEXT, details TEXT, source_file TEXT NOT NULL,
      raw_row_json TEXT NOT NULL, category_id TEXT REFERENCES categories(id),
      category_source TEXT, duplicate_status TEXT NOT NULL DEFAULT 'clear',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS transaction_card_voucher
      ON transactions(card_last4, voucher) WHERE voucher IS NOT NULL AND voucher <> '';
    CREATE INDEX IF NOT EXISTS transactions_merchant_idx ON transactions(merchant_id);
    CREATE INDEX IF NOT EXISTS transactions_dates_idx ON transactions(purchase_date, statement_month);
    CREATE TABLE IF NOT EXISTS ai_suggestions (
      merchant_id TEXT PRIMARY KEY REFERENCES merchant_groups(id), category_id TEXT REFERENCES categories(id),
      confidence REAL NOT NULL, reason TEXT, model TEXT NOT NULL, status TEXT NOT NULL,
      batch_id TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY, model TEXT NOT NULL, requested_count INTEGER NOT NULL,
      completed_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
      error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, merchant_id TEXT REFERENCES merchant_groups(id),
      before_json TEXT, after_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      undone_at TEXT
    );
    CREATE TABLE IF NOT EXISTS insight_reports (
      id TEXT PRIMARY KEY, generated_at TEXT NOT NULL, basis TEXT NOT NULL,
      filters_json TEXT NOT NULL, report_json TEXT NOT NULL
    );
  `);
  const merchantColumns = database.prepare('PRAGMA table_info(merchant_groups)').all() as Array<{ name: string }>;
  if (!merchantColumns.some((column) => column.name === 'is_excluded')) {
    database.exec('ALTER TABLE merchant_groups ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0');
  }
  const insert = database.prepare('INSERT OR IGNORE INTO categories (id, group_name, name, sort_order) VALUES (?, ?, ?, ?)');
  DEFAULT_CATEGORIES.forEach(([group, name], index) => insert.run(categoryId(group, name), group, name, index));
  return database;
}

export function allCategories() {
  return db().prepare('SELECT id, group_name as groupName, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name').all() as Array<{ id: string; groupName: string; name: string }>;
}

export function findCategoryId(name: string) {
  return db().prepare('SELECT id FROM categories WHERE lower(name) = lower(?) AND is_active = 1').get(name) as { id: string } | undefined;
}
