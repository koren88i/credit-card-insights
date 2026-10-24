import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStage } from '../lib/import-service';

const temporary = vi.hoisted(() => ({ directory: '' }));
vi.mock('../lib/db', async () => {
  const path = await import('node:path');
  return { appDataPath: (...parts: string[]) => path.join(temporary.directory, ...parts), db: () => { throw new Error('Tests must not open a financial database.'); }, findCategoryId: vi.fn() };
});
beforeEach(() => {
  temporary.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-preview-test-'));
  fs.mkdirSync(path.join(temporary.directory, 'staging'));
});
afterEach(() => {
  if (!path.resolve(temporary.directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'insights-preview-test-')) throw new Error('Unexpected test directory');
  fs.rmSync(temporary.directory, { recursive: true, force: true });
});
describe('import previews', () => {
  it('rejects expired previews even if their filesystem timestamp is fresh', () => {
    const token = randomUUID();
    fs.writeFileSync(path.join(temporary.directory, 'staging', `${token}.json`), JSON.stringify({ token, imports: [], createdAt: '2000-01-01T00:00:00Z' }));
    expect(() => loadStage(token)).toThrow('expired');
  });
  it('removes only expired preview files and preserves a fresh preview', () => {
    const token = randomUUID(), old = randomUUID();
    const oldFile = path.join(temporary.directory, 'staging', `${old}-1111_01_2026.xlsx`);
    fs.writeFileSync(oldFile, 'synthetic');
    fs.utimesSync(oldFile, new Date('2000-01-01'), new Date('2000-01-01'));
    fs.writeFileSync(path.join(temporary.directory, 'staging', `${token}.json`), JSON.stringify({ token, imports: [], createdAt: new Date().toISOString() }));
    expect(loadStage(token).token).toBe(token);
    expect(fs.existsSync(oldFile)).toBe(false);
  });
  it('rejects traversal tokens before accessing a preview', () => {
    expect(() => loadStage('../../outside')).toThrow('Invalid');
  });
});
