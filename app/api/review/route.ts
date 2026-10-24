import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideMerchant, decideSuggestedMerchants, reviewQueue, undoDecision } from '@/lib/categorization';

export const runtime = 'nodejs';
export function GET() { return NextResponse.json(reviewQueue()); }
const decisionSchema = z.object({ merchantId: z.string().uuid(), categoryId: z.string().min(1) });
const undoSchema = z.object({ auditId: z.string().uuid() });
const bulkSchema = z.object({ merchantIds: z.array(z.string().uuid()).min(1) });
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === 'undo') { undoDecision(undoSchema.parse(body).auditId); return NextResponse.json({ ok: true }); }
    if (body.action === 'bulk') return NextResponse.json({ results: decideSuggestedMerchants(bulkSchema.parse(body).merchantIds) });
    const { merchantId, categoryId } = decisionSchema.parse(body);
    return NextResponse.json(decideMerchant(merchantId, categoryId));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update merchant rule.' }, { status: 400 }); }
}
