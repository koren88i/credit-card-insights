import { secureApi } from '@/lib/secure-api';
import { NextResponse } from 'next/server';
import { parseStatement } from '@/lib/parser';
import { saveStage, stageFile } from '@/lib/import-service';
import { apiError, HttpError, MAX_UPLOAD_BYTES, readBody } from '@/lib/request-body';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const bytes = await readBody(request, MAX_UPLOAD_BYTES);
    const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Select one or more .xlsx statements.' }, { status: 400 });
    if (files.length > 20) throw new HttpError('Select at most 20 statements per batch.', 413);
    // Parse the whole batch before writing any previews, so failed batches leave no files behind.
    const parsed = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error(`${file.name} is not an .xlsx file.`);
      if (file.size > 5 * 1024 * 1024) throw new HttpError('Each statement must be at most 5 MB.', 413);
      const content = Buffer.from(await file.arrayBuffer());
      parsed.push({ name: file.name, content, statement: await parseStatement(file.name, content) });
    }
    const staged = parsed.map((file) => stageFile(file.name, file.content, file.statement));
    const batch = saveStage(staged);
    return NextResponse.json({ token: batch.token, imports: staged.map((statement) => ({
      fileName: statement.fileName, cardLast4: statement.cardLast4, statementMonth: statement.statementMonth,
      ignoredCount: statement.ignoredCount, duplicateFile: statement.duplicateFile, parsedCount: statement.transactions.length,
    })) });
  } catch (error) {
    return apiError(error, 'Could not parse statement.');
  }
}

export const POST = secureApi(handlePOST);
