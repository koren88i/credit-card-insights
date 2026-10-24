import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ollamaStatus, runCategorization } from '@/lib/categorization';

export const runtime = 'nodejs';
export async function GET() { return NextResponse.json(await ollamaStatus()); }
export async function POST(request: Request) {
  try {
    const { model } = z.object({ model: z.string().min(1).default('gemma3:4b') }).parse(await request.json());
    return NextResponse.json(await runCategorization(model));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Categorization failed.' }, { status: 400 }); }
}
