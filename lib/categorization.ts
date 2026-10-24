import { randomUUID } from 'node:crypto';
import { allCategories, db, findCategoryId } from './db';
import { starterCategory } from './merchant';

const OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'gemma3:4b';
const AUTO_CONFIDENCE = 0.95;

export async function ollamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json() as { models?: Array<{ name: string }> };
    const models = data.models?.map((model) => model.name) ?? [];
    return { reachable: true, models, defaultModel: DEFAULT_MODEL, installed: models.some((name) => name === DEFAULT_MODEL || name.startsWith(`${DEFAULT_MODEL}:`)) };
  } catch {
    return { reachable: false, models: [], defaultModel: DEFAULT_MODEL, installed: false };
  }
}

type ModelAnswer = { merchantId: string; categoryId: string; confidence: number; reason?: string };

function applyRule(merchantId: string, categoryId: string, source: 'ai' | 'user') {
  const database = db();
  database.prepare(`INSERT INTO merchant_rules (id, merchant_id, category_id, source, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(merchant_id) DO UPDATE SET category_id = excluded.category_id, source = excluded.source, active = 1, updated_at = CURRENT_TIMESTAMP`)
    .run(randomUUID(), merchantId, categoryId, source);
  database.prepare('UPDATE transactions SET category_id = ?, category_source = ? WHERE merchant_id = ?')
    .run(categoryId, source === 'user' ? 'user-rule' : 'ai-rule', merchantId);
}

export async function runCategorization(model = DEFAULT_MODEL) {
  const status = await ollamaStatus();
  if (!status.reachable) throw new Error('Ollama is not running. Start it and try again.');
  if (!status.models.some((name) => name === model || name.startsWith(`${model}:`))) throw new Error(`${model} is not installed. Run: ollama pull ${model}`);
  const database = db();
  const merchants = database.prepare(`SELECT m.id, m.display_name as displayName, m.normalized_name as normalizedName
    FROM merchant_groups m
    WHERE m.is_excluded = 0 AND NOT EXISTS (SELECT 1 FROM merchant_rules r WHERE r.merchant_id = m.id AND r.active = 1)
      AND NOT EXISTS (SELECT 1 FROM ai_suggestions s WHERE s.merchant_id = m.id AND s.status IN ('pending', 'applied'))
    ORDER BY m.display_name`).all() as Array<{ id: string; displayName: string; normalizedName: string }>;
  const categories = allCategories();
  const categoryIds = new Set(categories.map((category) => category.id));
  const runId = randomUUID();
  database.prepare('INSERT INTO ai_runs (id, model, requested_count, status) VALUES (?, ?, ?, ?)').run(runId, model, merchants.length, 'running');
  let completed = 0;
  try {
    for (let offset = 0; offset < merchants.length; offset += 50) {
      const group = merchants.slice(offset, offset + 50);
      const prompt = `Classify each merchant into exactly one allowed category. Return JSON only: {"results":[{"merchantId":"...","categoryId":"...","confidence":0..1,"reason":"short"}]}. Do not invent categories.\nAllowed categories: ${JSON.stringify(categories)}\nMerchants: ${JSON.stringify(group)}`;
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0 }, messages: [{ role: 'system', content: 'You are a careful financial transaction classifier. Preserve uncertainty.' }, { role: 'user', content: prompt }] }),
      });
      if (!response.ok) throw new Error(`Ollama returned ${response.status} for batch ${offset / 50 + 1}.`);
      const body = await response.json() as { message?: { content?: string } };
      let answers: ModelAnswer[] = [];
      try { answers = JSON.parse(body.message?.content ?? '{}').results ?? []; } catch { answers = []; }
      const validMerchantIds = new Set(group.map((merchant) => merchant.id));
      for (const answer of answers) {
        if (!validMerchantIds.has(answer.merchantId) || !categoryIds.has(answer.categoryId) || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) continue;
        const applied = answer.confidence >= AUTO_CONFIDENCE;
        database.prepare(`INSERT INTO ai_suggestions (merchant_id, category_id, confidence, reason, model, status, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(merchant_id) DO UPDATE SET
          category_id = excluded.category_id, confidence = excluded.confidence, reason = excluded.reason,
          model = excluded.model, status = excluded.status, batch_id = excluded.batch_id, updated_at = CURRENT_TIMESTAMP`)
          .run(answer.merchantId, answer.categoryId, answer.confidence, answer.reason ?? null, model, applied ? 'applied' : 'pending', runId);
        if (applied) applyRule(answer.merchantId, answer.categoryId, 'ai');
        completed++;
      }
    }
    database.prepare('UPDATE ai_runs SET completed_count = ?, status = ? WHERE id = ?').run(completed, 'completed', runId);
    return { runId, requested: merchants.length, completed };
  } catch (error) {
    database.prepare('UPDATE ai_runs SET completed_count = ?, status = ?, error = ? WHERE id = ?').run(completed, 'failed', error instanceof Error ? error.message : String(error), runId);
    throw error;
  }
}

export function reviewQueue() {
  return db().prepare(`SELECT m.id as merchantId, m.display_name as merchant, s.category_id as suggestedCategoryId,
    c.name as suggestedCategory, s.confidence, s.reason, COUNT(t.id) as transactionCount,
    ROUND(SUM(CASE WHEN t.charged_amount_ils < 0 THEN -t.charged_amount_ils ELSE 0 END), 2) as spend,
    MIN(t.purchase_date) as firstDate, MAX(t.purchase_date) as lastDate
    FROM ai_suggestions s JOIN merchant_groups m ON m.id = s.merchant_id
    LEFT JOIN categories c ON c.id = s.category_id JOIN transactions t ON t.merchant_id = m.id
    WHERE s.status = 'pending' AND m.is_excluded = 0 GROUP BY m.id ORDER BY s.confidence DESC, spend DESC`).all();
}

export function decideMerchant(merchantId: string, categoryId: string) {
  const database = db();
  const before = database.prepare('SELECT category_id as categoryId, source FROM merchant_rules WHERE merchant_id = ?').get(merchantId) ?? null;
  const auditId = randomUUID();
  database.prepare('INSERT INTO audit_events (id, type, merchant_id, before_json, after_json) VALUES (?, ?, ?, ?, ?)')
    .run(auditId, 'merchant-rule', merchantId, JSON.stringify(before), JSON.stringify({ categoryId, source: 'user' }));
  applyRule(merchantId, categoryId, 'user');
  database.prepare("UPDATE ai_suggestions SET status = 'reviewed', updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(merchantId);
  return { auditId };
}

export function decideSuggestedMerchants(merchantIds: string[]) {
  const database = db();
  const suggested = database.prepare("SELECT merchant_id as merchantId, category_id as categoryId FROM ai_suggestions WHERE merchant_id = ? AND status = 'pending'");
  return merchantIds.flatMap((merchantId) => {
    const item = suggested.get(merchantId) as { merchantId: string; categoryId: string } | undefined;
    return item ? [decideMerchant(item.merchantId, item.categoryId)] : [];
  });
}

export function undoDecision(auditId: string) {
  const database = db();
  const audit = database.prepare('SELECT * FROM audit_events WHERE id = ? AND undone_at IS NULL').get(auditId) as { merchant_id: string; before_json: string | null } | undefined;
  if (!audit) throw new Error('Nothing to undo.');
  const before = audit.before_json ? JSON.parse(audit.before_json) as { categoryId?: string; source?: string } : null;
  if (before?.categoryId && before.source) applyRule(audit.merchant_id, before.categoryId, before.source as 'ai' | 'user');
  else {
    database.prepare('DELETE FROM merchant_rules WHERE merchant_id = ?').run(audit.merchant_id);
    const merchant = database.prepare('SELECT display_name as displayName FROM merchant_groups WHERE id = ?').get(audit.merchant_id) as { displayName: string };
    const starter = starterCategory(merchant.displayName);
    const category = starter ? findCategoryId(starter) : undefined;
    database.prepare('UPDATE transactions SET category_id = ?, category_source = ? WHERE merchant_id = ?')
      .run(category?.id ?? null, category ? 'starter-rule' : null, audit.merchant_id);
    database.prepare("UPDATE ai_suggestions SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND status = 'reviewed'").run(audit.merchant_id);
  }
  database.prepare('UPDATE audit_events SET undone_at = CURRENT_TIMESTAMP WHERE id = ?').run(auditId);
}
