import { secureApi } from '@/lib/secure-api';
import { readJson, apiError } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ollamaStatus, runCategorization } from '@/lib/categorization';

export const runtime = 'nodejs';
async function handleGET() { return NextResponse.json(await ollamaStatus()); }
async function handlePOST(request: Request) {
  try {
    const { model } = z.object({ model: z.string().min(1).default('gemma3:4b') }).parse(await readJson(request));
    return NextResponse.json(await runCategorization(model));
  } catch (error) { return apiError(error, 'Categorization failed.'); }
}

export const GET = secureApi(handleGET);
export const POST = secureApi(handlePOST);
