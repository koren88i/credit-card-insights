import { timingSafeEqual } from 'node:crypto';
import { MAX_JSON_BYTES, MAX_UPLOAD_BYTES } from './request-body';

export function guardLocalRequest(request: Request, getToken?: () => string): Response | null {
  const deny = (error: string, status = 403) => Response.json({ error }, { status });
  const host = request.headers.get('host');
  let origin: string;
  try {
    const url = new URL(`${new URL(request.url).protocol}//${host}`);
    if (!host || url.host.toLowerCase() !== host.toLowerCase() || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return deny('Local requests only.');
    origin = url.origin;
  } catch { return deny('Invalid Host.'); }
  if (request.headers.has('origin') && request.headers.get('origin') !== origin) return deny('Cross-origin requests are blocked.');
  const url = new URL(request.url);
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return null;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return deny('Cross-origin requests are blocked.');
  const supplied = request.headers.get('x-insights-token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(supplied)) return deny('Open the app locally before using its API.');
  // Route handlers verify the secret as well as the early proxy checks.
  if (getToken) {
    const expected = getToken();
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return deny('Open the app locally before using its API.');
  }
  if (['GET', 'HEAD'].includes(request.method)) return null;
  const upload = url.pathname === '/api/imports/parse';
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== (upload ? 'multipart/form-data' : 'application/json')) return deny('Unsupported content type.', 415);
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > (upload ? MAX_UPLOAD_BYTES : MAX_JSON_BYTES))) return deny('Request body is too large.', 413);
  return null;
}
