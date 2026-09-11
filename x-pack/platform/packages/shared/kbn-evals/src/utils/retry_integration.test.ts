/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * End-to-end proof that the 500 retry actually fires.
 *
 * The unit tests around `retry_utils` assert the POLICY (is 500 retryable?).
 * They cannot show that a 500 travelling the real path -- undici -> KbnClient
 * -> KbnClientRequesterError -> our retry layer -- is recognised and retried,
 * because every layer in between is mocked away.
 *
 * The production sweep never proved it either: attempt 4 passed with zero 500s,
 * so `retried` stayed 0 and the branch never executed against a real socket.
 * A fix that has never run is not a fix.
 *
 * So: a real HTTP server returning the exact EIS 500 body observed in
 * production, a real KbnClient pointed at it, and assertions that the request
 * ultimately SUCCEEDS after N failures.
 *
 * Note KbnClientRequester has a retry loop of its OWN (delay(1000 * attempt)).
 * A single blip is absorbed there and never reaches us, so the test that
 * targets our layer must out-last the inner budget to prove anything.
 */

import http from 'http';
import type { AddressInfo } from 'net';
import { ToolingLog } from '@kbn/tooling-log';
import { KbnClient } from '@kbn/kbn-client';
import { httpHandlerFromKbnClient } from './http_handler_from_kbn_client';
import { wrapKbnClientWithRetries } from './kbn_client_with_retries';

// The verbatim shape EIS returns when an upstream provider blips. It is a
// Kibana 500, not a 502/503 -- the whole reason 500 had to become retryable.
const EIS_500_BODY = JSON.stringify({
  statusCode: 500,
  error: 'Internal Server Error',
  message:
    'Received a server error status code for request from inference entity id [eis-gemini-3-1-pro] status [500]',
});

interface Scenario {
  failures: number;
  status: number;
  body?: string;
}

/** Fails the first `failures` requests with `status`, then returns 200. */
function startFlakyServer(scenario: Scenario) {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    if (hits <= scenario.failures) {
      res.writeHead(scenario.status, { 'content-type': 'application/json' });
      res.end(scenario.body ?? EIS_500_BODY);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, servedOnAttempt: hits }));
  });

  return new Promise<{ url: string; getHits: () => number; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          url: `http://127.0.0.1:${port}`,
          getHits: () => hits,
          close: () =>
            new Promise<void>((done) => {
              server.close(() => done());
            }),
        });
      });
    }
  );
}

describe('500 retry against a real HTTP server', () => {
  let log: ToolingLog;
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
    // Capture via a real writer: ToolingLog routes messages through its writers,
    // so stubbing the .warning() method would silently observe nothing.
    log = new ToolingLog();
    log.setWriters([
      {
        write: (msg: any) => {
          if (msg?.type === 'warning' || msg?.type === 'error') {
            warnings.push(msg.args.map(String).join(' '));
          }
          return true;
        },
      },
    ]);
  });

  describe('httpHandlerFromKbnClient', () => {
    const previous = process.env.KBN_EVALS_HTTP_RETRIES;
    afterEach(() => {
      if (previous === undefined) delete process.env.KBN_EVALS_HTTP_RETRIES;
      else process.env.KBN_EVALS_HTTP_RETRIES = previous;
    });

    it('recovers from two real EIS 500s and returns the success payload', async () => {
      process.env.KBN_EVALS_HTTP_RETRIES = '4';
      const server = await startFlakyServer({ failures: 2, status: 500 });

      try {
        const kbnClient = new KbnClient({ url: server.url, log });
        const fetch = httpHandlerFromKbnClient({ kbnClient, log });

        const result: any = await fetch('/internal/eis/converse', { method: 'POST' });

        // Proof the retry ran: the server was hit 3 times and the caller
        // still got a success rather than an exception.
        expect(server.getHits()).toBe(3);
        expect(result).toEqual({ ok: true, servedOnAttempt: 3 });
      } finally {
        await server.close();
      }
    }, 30000);

    it('still gives up on a 500 that never clears, instead of hanging', async () => {
      process.env.KBN_EVALS_HTTP_RETRIES = '2';
      const server = await startFlakyServer({ failures: Infinity, status: 500 });

      try {
        const kbnClient = new KbnClient({ url: server.url, log });
        const fetch = httpHandlerFromKbnClient({ kbnClient, log });

        await expect(fetch('/internal/eis/converse', { method: 'POST' })).rejects.toThrow();
        // initial attempt + 2 retries
        expect(server.getHits()).toBe(3);
      } finally {
        await server.close();
      }
    }, 30000);

    it('does NOT retry a 400, so real bugs still fail fast', async () => {
      process.env.KBN_EVALS_HTTP_RETRIES = '4';
      const server = await startFlakyServer({
        failures: 1,
        status: 400,
        body: JSON.stringify({ statusCode: 400, message: 'bad request' }),
      });

      try {
        const kbnClient = new KbnClient({ url: server.url, log });
        const fetch = httpHandlerFromKbnClient({ kbnClient, log });

        // Only the FIRST request 400s; a retry would be served a 200 and the
        // call would resolve. Requiring a rejection therefore proves we did
        // not retry -- if 400 ever becomes retryable this test goes green-to-red.
        await expect(fetch('/internal/eis/converse', { method: 'POST' })).rejects.toThrow();
        expect(server.getHits()).toBe(1);
      } finally {
        await server.close();
      }
    }, 30000);
  });

  describe('wrapKbnClientWithRetries', () => {
    it('recovers from a real EIS 500 on the kbnClient.request path', async () => {
      const server = await startFlakyServer({ failures: 1, status: 500 });

      try {
        const raw = new KbnClient({ url: server.url, log });
        const wrapped = wrapKbnClientWithRetries({ kbnClient: raw, log });

        const response = await wrapped.request({
          path: '/internal/eis/converse',
          method: 'POST',
        } as any);

        expect(server.getHits()).toBe(2);
        expect(response.data).toEqual({ ok: true, servedOnAttempt: 2 });
      } finally {
        await server.close();
      }
    }, 40000);

    it('retries a 500 in OUR layer once KbnClient has exhausted its own retries', async () => {
      // `retries: 1` disables KbnClientRequester's internal loop so the 500
      // propagates out to withRetry. Two failures then force OUR layer to
      // re-drive the request, which the inner loop can no longer explain.
      const server = await startFlakyServer({ failures: 2, status: 500 });

      try {
        const raw = new KbnClient({ url: server.url, log });
        const wrapped = wrapKbnClientWithRetries({ kbnClient: raw, log });

        const response = await wrapped.request({
          path: '/internal/eis/converse',
          method: 'POST',
          retries: 1,
        } as any);

        expect(server.getHits()).toBe(3);
        expect(response.data).toEqual({ ok: true, servedOnAttempt: 3 });
        expect(
          warnings.some(
            (w) =>
              /kbnClient\.request POST \/internal\/eis\/converse/.test(w) && /attempt 1\//.test(w)
          )
        ).toBe(true);
      } finally {
        await server.close();
      }
    }, 60000);

    it('gives up immediately on a 404, proving the policy actually refuses', async () => {
      // Guards the "retry everything" failure mode. With retries:1 the inner
      // KbnClient loop is disabled, so the only thing that could re-drive this
      // request is our layer. One 404 then a 200: if we wrongly treated 404 as
      // retryable the call would succeed on hit 2.
      const server = await startFlakyServer({
        failures: 1,
        status: 404,
        body: JSON.stringify({ statusCode: 404, message: 'not found' }),
      });

      try {
        const raw = new KbnClient({ url: server.url, log });
        const wrapped = wrapKbnClientWithRetries({ kbnClient: raw, log });

        await expect(
          wrapped.request({ path: '/internal/eis/converse', method: 'POST', retries: 1 } as any)
        ).rejects.toThrow();

        expect(server.getHits()).toBe(1);
      } finally {
        await server.close();
      }
    }, 30000);

    it('honours retries:0 and does not retry a 500', async () => {
      const server = await startFlakyServer({ failures: Infinity, status: 500 });

      try {
        const raw = new KbnClient({ url: server.url, log });
        const wrapped = wrapKbnClientWithRetries({ kbnClient: raw, log });

        await expect(
          wrapped.request({ path: '/internal/eis/converse', method: 'POST', retries: 0 } as any)
        ).rejects.toThrow();

        expect(server.getHits()).toBe(1);
      } finally {
        await server.close();
      }
    }, 30000);
  });
});
