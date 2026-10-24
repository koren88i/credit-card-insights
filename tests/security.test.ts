import { describe, expect, it } from 'vitest';
import { guardLocalRequest } from '../lib/request-security';
import { readJson } from '../lib/request-body';

const token = 'a'.repeat(64);
function request(method = 'GET', extra: Record<string, string> = {}, body?: string) {
  return new Request('http://127.0.0.1:3000/api/categories', { method, headers: { host: '127.0.0.1:3000', 'x-insights-token': token, ...extra }, body });
}
const check = (req: Request) => guardLocalRequest(req, () => token);

describe('local API boundary', () => {
  it('allows authenticated local reads and same-origin JSON writes', () => {
    expect(check(request())).toBeNull();
    expect(check(request('POST', { origin: 'http://127.0.0.1:3000', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, '{}'))).toBeNull();
  });
  it('blocks anonymous export and forged Host requests', () => {
    expect(check(request('GET', { 'x-insights-token': '' }))?.status).toBe(403);
    expect(check(request('GET', { host: 'attacker.invalid:3000' }))?.status).toBe(403);
    expect(check(request('GET', { host: '127.0.0.1.attacker.invalid' }))?.status).toBe(403);
    expect(check(request('GET', { 'x-insights-token': '\u00e9'.repeat(64) }))?.status).toBe(403);
  });
  it('blocks foreign origins and cross-origin browser requests even with a token', () => {
    expect(check(request('POST', { origin: 'http://untrusted.invalid', 'content-type': 'text/plain' }, '{}'))?.status).toBe(403);
    expect(check(request('GET', { 'sec-fetch-site': 'same-site' }))?.status).toBe(403);
    expect(check(request('GET', { origin: 'null' }))?.status).toBe(403);
  });
  it('rejects simple text/plain writes and oversized requests', () => {
    expect(check(request('POST', { 'content-type': 'text/plain' }, '{}'))?.status).toBe(415);
    expect(check(request('POST', { 'content-type': 'application/json', 'content-length': '9999999' }, '{}'))?.status).toBe(413);
  });
  it('bounds streamed bodies even when Content-Length is absent', async () => {
    const req = request('POST', { 'content-type': 'application/json' }, JSON.stringify({ value: 'x'.repeat(300_000) }));
    await expect(readJson(req)).rejects.toThrow('too large');
  });
  it('does not require an API token to open the local app shell', () => {
    expect(check(new Request('http://localhost:3000/', { headers: { host: 'localhost:3000' } }))).toBeNull();
  });
});
