export const MAX_JSON_BYTES = 256 * 1024;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function readBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError('Request body is too large.', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}
export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError('Use application/json.', 415);
  return JSON.parse(new TextDecoder().decode(await readBody(request, MAX_JSON_BYTES)));
}
export function apiError(error: unknown, fallback: string) {
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: error instanceof HttpError ? error.status : 400 });
}
