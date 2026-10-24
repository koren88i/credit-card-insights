import { secureApi } from '@/lib/secure-api';
import { readJson, apiError } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { commitStage } from '@/lib/import-service';

export const runtime = 'nodejs';
const bodySchema = z.object({ token: z.string().uuid() });

async function handlePOST(request: Request) {
  try { return NextResponse.json(commitStage(bodySchema.parse(await readJson(request)).token)); }
  catch (error) { return apiError(error, 'Could not commit import.'); }
}

export const POST = secureApi(handlePOST);
