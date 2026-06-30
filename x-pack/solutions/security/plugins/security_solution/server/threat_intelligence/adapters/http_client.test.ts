/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { assertSafeUrl, fetchUrl } from './http_client';

// ---------------------------------------------------------------------------
// assertSafeUrl — SSRF guard unit tests
// ---------------------------------------------------------------------------

describe('assertSafeUrl', () => {
  it('allows normal public https URL', () => {
    expect(() => assertSafeUrl('https://example.com/feed.xml')).not.toThrow();
  });

  it('allows normal public http URL', () => {
    expect(() => assertSafeUrl('http://example.com/feed.xml')).not.toThrow();
  });

  it('rejects non-http/https scheme', () => {
    expect(() => assertSafeUrl('ftp://example.com/file')).toThrow(/scheme/i);
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(/scheme/i);
  });

  it('rejects loopback IPv4 (127.0.0.1)', () => {
    expect(() => assertSafeUrl('http://127.0.0.1/secret')).toThrow(/restricted/i);
  });

  it('rejects loopback IPv4 (127.x.x.x subnet)', () => {
    expect(() => assertSafeUrl('http://127.0.0.99/secret')).toThrow(/restricted/i);
  });

  it('rejects cloud IMDS link-local (169.254.169.254)', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data/')).toThrow(/restricted/i);
  });

  it('rejects RFC-1918 10.x.x.x', () => {
    expect(() => assertSafeUrl('http://10.0.0.1/internal')).toThrow(/restricted/i);
  });

  it('rejects RFC-1918 172.16.x.x', () => {
    expect(() => assertSafeUrl('http://172.16.0.1/internal')).toThrow(/restricted/i);
  });

  it('rejects RFC-1918 172.31.x.x (top of range)', () => {
    expect(() => assertSafeUrl('http://172.31.255.255/internal')).toThrow(/restricted/i);
  });

  it('allows 172.32.x.x (just outside RFC-1918 range)', () => {
    expect(() => assertSafeUrl('http://172.32.0.1/feed')).not.toThrow();
  });

  it('rejects RFC-1918 192.168.x.x', () => {
    expect(() => assertSafeUrl('http://192.168.1.1/internal')).toThrow(/restricted/i);
  });

  it('rejects unspecified 0.0.0.0', () => {
    expect(() => assertSafeUrl('http://0.0.0.0/')).toThrow(/restricted/i);
  });

  it('rejects IPv6 loopback ::1', () => {
    expect(() => assertSafeUrl('http://[::1]/secret')).toThrow(/restricted/i);
  });

  it('rejects IPv6 link-local fe80::', () => {
    expect(() => assertSafeUrl('http://[fe80::1]/secret')).toThrow(/restricted/i);
  });

  it('rejects IPv6 unique-local fc00::', () => {
    expect(() => assertSafeUrl('http://[fc00::1]/secret')).toThrow(/restricted/i);
  });

  it('rejects IPv6 unique-local fd00::', () => {
    expect(() => assertSafeUrl('http://[fd00::1]/secret')).toThrow(/restricted/i);
  });

  it('rejects an invalid URL', () => {
    expect(() => assertSafeUrl('not-a-url')).toThrow(/Invalid URL/i);
  });

  // --- Bypass 1: obfuscated IPv4 encodings ---
  // The WHATWG URL parser normalizes all of these to canonical dotted-quad
  // before our code sees them, so they are caught by the IPv4 range check
  // (not a separate "obfuscated" branch).

  it('rejects decimal-encoded IPv4 (2130706433 → normalized to 127.0.0.1)', () => {
    // URL parser: 2130706433 → 127.0.0.1 → caught by loopback range check
    expect(() => assertSafeUrl('http://2130706433/')).toThrow();
  });

  it('rejects hex-integer IPv4 (0x7f000001 → normalized to 127.0.0.1)', () => {
    // URL parser: 0x7f000001 → 127.0.0.1 → caught by loopback range check
    expect(() => assertSafeUrl('http://0x7f000001/')).toThrow();
  });

  it('rejects hex-dotted IPv4 (0x7f.0.0.1 → normalized to 127.0.0.1)', () => {
    expect(() => assertSafeUrl('http://0x7f.0.0.1/')).toThrow();
  });

  it('rejects octal-dotted IPv4 (0177.0.0.1 → normalized to 127.0.0.1)', () => {
    // URL parser normalizes octal-looking segments to decimal before our check
    expect(() => assertSafeUrl('http://0177.0.0.1/')).toThrow();
  });

  // --- Bypass 2: IPv4-mapped IPv6 ---
  // The WHATWG URL parser canonicalizes the dotted form to hex groups, so
  // ::ffff:169.254.169.254 → ::ffff:a9fe:a9fe (and similar).

  it('rejects IPv4-mapped IPv6 ::ffff:169.254.169.254 (URL parser → ::ffff:a9fe:a9fe)', () => {
    expect(() => assertSafeUrl('http://[::ffff:169.254.169.254]/')).toThrow(/restricted/i);
  });

  it('rejects IPv4-mapped IPv6 ::ffff:a9fe:a9fe (hex groups, IMDS)', () => {
    expect(() => assertSafeUrl('http://[::ffff:a9fe:a9fe]/')).toThrow(/restricted/i);
  });

  it('rejects IPv4-mapped IPv6 ::ffff:127.0.0.1 (URL parser → ::ffff:7f00:1)', () => {
    expect(() => assertSafeUrl('http://[::ffff:127.0.0.1]/')).toThrow(/restricted/i);
  });

  it('rejects IPv4-compatible ::169.254.169.254 (URL parser → ::a9fe:a9fe)', () => {
    expect(() => assertSafeUrl('http://[::169.254.169.254]/')).toThrow(/restricted/i);
  });

  // --- Still allowed: normal public addresses ---

  it('allows a normal public hostname', () => {
    expect(() => assertSafeUrl('https://feeds.example.com/rss')).not.toThrow();
  });

  it('allows a normal public IPv4 literal (93.184.216.34)', () => {
    expect(() => assertSafeUrl('https://93.184.216.34/')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fetchUrl — redirect re-validation
// ---------------------------------------------------------------------------

const makeResponse = (
  status: number,
  headers: Record<string, string> = {},
  body = ''
): Response => {
  const headerMap = new Headers(headers);
  return {
    status,
    statusText: String(status),
    headers: headerMap,
    body: null,
    ok: status >= 200 && status < 300,
    url: '',
    text: async () => body,
  } as unknown as Response;
};

describe('fetchUrl redirect handling', () => {
  it('rejects a redirect to a private host', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const fetchFn = jest.fn(async (url: string) => {
      callCount += 1;
      if (callCount === 1) {
        return makeResponse(301, { location: 'http://169.254.169.254/latest/meta-data/' });
      }
      return makeResponse(200, {}, 'body');
    });

    await expect(
      fetchUrl('https://example.com/feed', {
        abortSignal: controller.signal,
        fetchFn: fetchFn as unknown as typeof fetch,
        timeoutMs: 1000,
      })
    ).rejects.toThrow(/restricted/i);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to a safe host and returns the body', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const fetchFn = jest.fn(async (url: string) => {
      callCount += 1;
      if (callCount === 1) {
        return makeResponse(301, { location: 'https://cdn.example.com/feed.xml' });
      }
      return makeResponse(200, {}, '<feed/>');
    });

    const result = await fetchUrl('https://example.com/feed', {
      abortSignal: controller.signal,
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 1000,
    });

    expect(result.body).toBe('<feed/>');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
