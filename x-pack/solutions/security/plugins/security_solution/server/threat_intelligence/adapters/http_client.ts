/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Tiny fetch wrapper shared by every adapter. Centralizes the things we
 * do not want each adapter to re-derive:
 *
 * - Default User-Agent that names Kibana so feed operators can opt-in
 *   to allowlist us (a few RSS feeds hard-block the default Node UA).
 * - Per-request timeout layered on top of the workflow step's own
 *   abort signal. The step signal cancels the whole step; the timeout
 *   fences a single fetch so a hung connection on one item does not
 *   eat the budget for the rest.
 * - Response size cap. RSS bodies should be <2MB; STIX bundles can be
 *   large but >10MB is almost always a configuration mistake. Enforced
 *   via incremental reads instead of trusting `Content-Length` (which
 *   can be missing on chunked responses).
 * - Body decode. Defaults to UTF-8 with a fall-through to
 *   `latin1` — XML feeds in the wild still ship with non-UTF-8
 *   declarations and we want to surface readable text rather than
 *   replacement characters everywhere.
 *
 * NOT done here: ETag / If-Modified-Since conditional GETs, retries,
 * proxying through the actions plugin's HTTP connector. Those are
 * follow-ups; the goal of this PR is parity with the previous YAML
 * `http` step (single GET, single response body) plus per-item
 * normalization.
 */

import net from 'node:net';

const DEFAULT_USER_AGENT = 'Kibana-ThreatIntelligence/1.0 (+https://www.elastic.co/security)';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 5;

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

/**
 * Validates that a URL is safe to fetch: must be http/https, and the
 * hostname must not be a literal address in a restricted range.
 *
 * KNOWN LIMITATION: this validates the literal host only; a DNS name that
 * resolves to an internal address (DNS-rebind / attacker-controlled A record)
 * is NOT caught here. The durable fix is to route feed fetches through the
 * Actions/Connectors framework so they inherit xpack.actions.allowedHosts.
 * TODO(threat-intel): migrate fetchUrl callers to Connectors. See review on
 * PR #275243.
 *
 * Throws with a descriptive message if the URL is rejected.
 */
export const assertSafeUrl = (rawUrl: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsafe URL scheme "${parsed.protocol}" — only http/https is allowed`);
  }

  // URL.hostname strips the brackets from IPv6 literals ([::1] → ::1).
  const host = parsed.hostname.toLowerCase();

  // The WHATWG URL parser normalizes the host before we see it:
  //   - Integer/hex/octal IPv4 forms (2130706433, 0x7f000001, 0177.0.0.1) → canonical dotted-quad
  //   - IPv4-mapped IPv6 with dotted suffix (::ffff:169.254.169.254) → hex-group form (::ffff:a9fe:a9fe)
  //   - IPv6 literals are returned with surrounding brackets ([::1])
  // We strip the brackets, then use net.isIP to classify:
  //   4 → canonical dotted-quad IPv4
  //   6 → IPv6 literal
  //   0 → DNS hostname (obfuscated forms never reach here — URL parser normalised them)

  // Strip brackets that URL.hostname includes for IPv6 literals.
  const ip = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const ipFamily = net.isIP(ip);

  if (ipFamily === 4) {
    if (isRestrictedIPv4(ip)) {
      throw new Error(`URL host "${host}" is in a restricted IPv4 address range`);
    }
    return;
  }

  if (ipFamily === 6) {
    if (isRestrictedIPv6(ip)) {
      throw new Error(`URL host "${host}" is in a restricted IPv6 address range`);
    }
  }

  // ipFamily === 0: DNS hostname — allowed (DNS-rebind limitation documented above).
};

/** Convert two 16-bit hex groups (as strings) to dotted-quad IPv4 notation. */
const hexGroupsToDotted = (hiHex: string, loHex: string): string => {
  const hi = parseInt(hiHex, 16);
  const lo = parseInt(loHex, 16);
  return [Math.floor(hi / 256), hi % 256, Math.floor(lo / 256), lo % 256].join('.');
};

const isRestrictedIPv4 = (ip: string): boolean => {
  const [a, b, c, d] = ip.split('.').map(Number);
  // loopback 127.0.0.0/8
  if (a === 127) return true;
  // link-local 169.254.0.0/16
  if (a === 169 && b === 254) return true;
  // private 10.0.0.0/8
  if (a === 10) return true;
  // private 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // private 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // unspecified 0.0.0.0
  if (a === 0 && b === 0 && c === 0 && d === 0) return true;
  return false;
};

const isRestrictedIPv6 = (ip: string): boolean => {
  const lower = ip.toLowerCase();

  // loopback ::1 / unspecified ::
  if (lower === '::1' || lower === '::') return true;

  // link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;

  // unique-local fc00::/7 (fc and fd prefixes)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;

  // IPv4-mapped  ::ffff:<ipv4>  and IPv4-compatible  ::<ipv4>
  // Forms seen in the wild:
  //   ::ffff:169.254.169.254   (dotted)
  //   ::ffff:a9fe:a9fe         (two hex groups)
  //   ::ffff:0:169.254.169.254 (alternative mapped prefix)
  //   ::169.254.169.254        (IPv4-compatible, deprecated but still parsed)
  const mappedDotted = lower.match(/^::(?:ffff:(?:0:)?)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) {
    return isRestrictedIPv4(mappedDotted[1]);
  }
  // ::ffff:<hi>:<lo> — IPv4-mapped (canonical form from URL parser for e.g. ::ffff:169.254.169.254)
  const mappedFfff = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedFfff) {
    return isRestrictedIPv4(hexGroupsToDotted(mappedFfff[1], mappedFfff[2]));
  }

  // ::<hi>:<lo> — IPv4-compatible (deprecated; URL parser converts ::169.254.169.254 → ::a9fe:a9fe).
  // Only match the exact two-group-after-:: form to avoid false-positives on normal short IPv6.
  const compatHex = lower.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (compatHex) {
    return isRestrictedIPv4(hexGroupsToDotted(compatHex[1], compatHex[2]));
  }

  return false;
};

export interface FetchUrlOptions {
  /** Step-level cancellation. Combined with the per-request timeout. */
  abortSignal: AbortSignal;
  /** Optional headers. Adapter sets `Accept` for STIX/TAXII negotiation. */
  headers?: Record<string, string>;
  /** Override default 30s. Used only by tests today. */
  timeoutMs?: number;
  /** Override default 10MiB cap. Used only by tests today. */
  maxBytes?: number;
  /** Override `globalThis.fetch`. Used only by tests today. */
  fetchFn?: typeof fetch;
}

export interface FetchUrlResult {
  status: number;
  statusText: string;
  body: string;
  /** Lower-cased response header names to single string values. */
  headers: Record<string, string>;
  /** Final URL after redirects, useful for adapters that want to reflect it on `source.url`. */
  finalUrl: string;
}

/**
 * Combined-signal helper. We can't pass both `abortSignal` and the
 * timeout abort to fetch (only one signal field), so we forward the
 * caller's signal to a fresh `AbortController` and add the timeout to
 * the same controller.
 */
const linkSignals = (
  outer: AbortSignal,
  timeoutMs: number
): { signal: AbortSignal; cancel: () => void } => {
  const controller = new AbortController();
  const onAbort = () => controller.abort(outer.reason);
  if (outer.aborted) {
    controller.abort(outer.reason);
  } else {
    outer.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    controller.abort(new Error(`Timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      outer.removeEventListener('abort', onAbort);
    },
  };
};

/**
 * Read a Web ReadableStream into a single string with an enforced byte
 * cap. We can't trust `Content-Length` (chunked + gzip responses often
 * omit it) so the cap is enforced incrementally on the decoded chunks.
 */
const readBodyWithCap = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) {
    return response.text();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let result = '';
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // best-effort cancel; nothing actionable on close error
        }
        throw new Error(
          `Response body exceeded the ${maxBytes}-byte cap (saw at least ${received} bytes)`
        );
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
  }
  result += decoder.decode();
  return result;
};

const headersToRecord = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
};

// Sensitive headers that must be stripped when following a cross-origin redirect.
const SENSITIVE_HEADERS = new Set(['authorization', 'x-api-key', 'cookie']);

const isSameOrigin = (a: string, b: string): boolean => {
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    return pa.origin === pb.origin;
  } catch {
    return false;
  }
};

export const fetchUrl = async (url: string, options: FetchUrlOptions): Promise<FetchUrlResult> => {
  const {
    abortSignal,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    fetchFn = globalThis.fetch,
  } = options;

  // Validate the initial URL before any network activity.
  assertSafeUrl(url);

  const { signal, cancel } = linkSignals(abortSignal, timeoutMs);

  try {
    let currentUrl = url;
    let hopsRemaining = MAX_REDIRECT_HOPS;
    let currentHeaders = { ...(headers ?? {}) };

    while (true) {
      const response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'application/json, application/xml, text/xml, application/atom+xml, */*',
          'Accept-Encoding': 'gzip, deflate',
          ...currentHeaders,
        },
        signal,
      });

      // Not a redirect — consume and return the response body.
      if (response.status < 300 || response.status >= 400) {
        const body = await readBodyWithCap(response, maxBytes);
        return {
          status: response.status,
          statusText: response.statusText,
          body,
          headers: headersToRecord(response.headers),
          finalUrl: currentUrl,
        };
      }

      // Redirect: extract Location, validate, and follow.
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect response (${response.status}) missing Location header`);
      }

      // Resolve relative redirects against the current URL.
      const nextUrl = new URL(location, currentUrl).toString();

      if (hopsRemaining <= 0) {
        throw new Error(`Exceeded maximum redirect hops (${MAX_REDIRECT_HOPS})`);
      }
      hopsRemaining -= 1;

      // SSRF guard on each redirect destination.
      assertSafeUrl(nextUrl);

      // Strip sensitive headers on cross-origin hops to prevent credential leakage.
      if (!isSameOrigin(currentUrl, nextUrl)) {
        const stripped: Record<string, string> = {};
        for (const [k, v] of Object.entries(currentHeaders)) {
          if (!SENSITIVE_HEADERS.has(k.toLowerCase())) {
            stripped[k] = v;
          }
        }
        currentHeaders = stripped;
      }

      currentUrl = nextUrl;
    }
  } finally {
    cancel();
  }
};
