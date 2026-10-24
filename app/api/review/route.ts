import { secureApi } from '@/lib/secure-api';
import { readJson, apiError } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideMerchant, decideSuggestedMerchants, reviewQueue, undoDecision } from '@/lib/categorization';

export const runtime = 'nodejs';
function handleGET() { return NextResponse.json(reviewQueue()); }
const decisionSchema = z.object({ merchantId: z.string().uuid(), categoryId: z.string().min(1) });
const undoSchema = z.object({ auditId: z.string().uuid() });
const bulkSchema = z.object({ merchantIds: z.array(z.string().uuid()).min(1).max(500) });
const bodySchema = z.union([decisionSchema, undoSchema.extend({ action: z.literal('undo') }), bulkSchema.extend({ action: z.literal('bulk') })]);
async function handlePOST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    if ('action' in body && body.action === 'undo') { undoDecision(body.auditId); return NextResponse.json({ ok: true }); }
    if ('action' in body && body.action === 'bulk') return NextResponse.json({ results: decideSuggestedMerchants(body.merchantIds) });
    const { merchantId, categoryId } = decisionSchema.parse(body);
    return NextResponse.json(decideMerchant(merchantId, categoryId));
  } catch (error) { return apiError(error, 'Could not update merchant rule.'); }
}

export const GET = secureApi(handleGET);
export const POST = secureApi(handlePOST);
