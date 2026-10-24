import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
const schema = z.object({ merchantId: z.string().uuid(), excluded: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const { merchantId, excluded } = schema.parse(await request.json());
    const result = db().prepare('UPDATE merchant_groups SET is_excluded = ? WHERE id = ?').run(Number(excluded), merchantId);
    if (!result.changes) throw new Error('Merchant not found.');
    return NextResponse.json({ ok: true, excluded });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update merchant.' }, { status: 400 });
  }
}
