import { NextResponse } from 'next/server';
import { z } from 'zod';
import { commitStage } from '@/lib/import-service';

export const runtime = 'nodejs';
const bodySchema = z.object({ token: z.string().uuid() });

export async function POST(request: Request) {
  try { return NextResponse.json(commitStage(bodySchema.parse(await request.json()).token)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not commit import.' }, { status: 400 }); }
}
