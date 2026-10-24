import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export function GET() {
  const database = db();
  const payload = {
    exportedAt: new Date().toISOString(),
    categories: database.prepare('SELECT * FROM categories').all(),
    merchants: database.prepare('SELECT * FROM merchant_groups').all(),
    rules: database.prepare('SELECT * FROM merchant_rules').all(),
    transactions: database.prepare('SELECT * FROM transactions').all(),
  };
  return new NextResponse(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="credit-card-insights-backup.json"' } });
}
