import { NextResponse } from 'next/server';
import { parseStatement } from '@/lib/parser';
import { saveStage, stageFile } from '@/lib/import-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Select one or more .xlsx statements.' }, { status: 400 });
    const staged = await Promise.all(files.map(async (file) => {
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error(`${file.name} is not an .xlsx file.`);
      const content = Buffer.from(await file.arrayBuffer());
      return stageFile(file.name, content, await parseStatement(file.name, content));
    }));
    const batch = saveStage(staged);
    return NextResponse.json({ token: batch.token, imports: staged.map((statement) => ({
      fileName: statement.fileName, cardLast4: statement.cardLast4, statementMonth: statement.statementMonth,
      ignoredCount: statement.ignoredCount, duplicateFile: statement.duplicateFile, parsedCount: statement.transactions.length,
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not parse statement.' }, { status: 400 });
  }
}
