import { secureApi } from '@/lib/secure-api';
import { readJson, apiError } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
const schema = z.object({ merchantId: z.string().uuid(), excluded: z.boolean() });

async function handlePATCH(request: Request) {
  try {
    const { merchantId, excluded } = schema.parse(await readJson(request));
    const result = db().prepare('UPDATE merchant_groups SET is_excluded = ? WHERE id = ?').run(Number(excluded), merchantId);
    if (!result.changes) throw new Error('Merchant not found.');
    return NextResponse.json({ ok: true, excluded });
  } catch (error) {
    return apiError(error, 'Could not update merchant.');
  }
}

export const PATCH = secureApi(handlePATCH);
