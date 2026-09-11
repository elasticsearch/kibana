/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/kbn-client';
import { KbnClient as TestKbnClient } from '@kbn/kbn-client';
import { wrapKbnClientWithRetries } from './kbn_client_with_retries';

import { EvalsClient } from './evals_client';

/**
 * Default target used when no evaluations Kibana URL is provided. Keeps
 * `@kbn/kbn-client` an implementation detail of `@kbn/evals` so callers (e.g.
 * `@kbn/evals-extensions`) can build a client without depending on it directly.
 */
export const DEFAULT_EVALUATIONS_KBN_URL = 'http://elastic:changeme@localhost:5601';

export interface CreateEvaluationsEvalsClientParams {
  log: ToolingLog;
  /** Evaluations Kibana URL (falls back to {@link DEFAULT_EVALUATIONS_KBN_URL}). */
  url?: string;
  /** API key used to authenticate against a non-local target. */
  apiKey?: string;
}

/**
 * Thin factory wiring the default {@link TestKbnClient} through
 * {@link getEvaluationsKbnClient} (URL/API-key/version/retry handling).
 */
export function createEvaluationsEvalsClient({
  log,
  url,
  apiKey,
}: CreateEvaluationsEvalsClientParams): EvalsClient {
  const defaultKbnClient = new TestKbnClient({ log, url: DEFAULT_EVALUATIONS_KBN_URL });
  const kbnClient = getEvaluationsKbnClient({
    kbnClient: defaultKbnClient,
    log,
    evaluationsKbnUrl: url,
    evaluationsKbnApiKey: apiKey,
  });
  return new EvalsClient(kbnClient, log);
}

export interface GetEvaluationsKbnClientParams {
  kbnClient: KbnClient;
  log: ToolingLog;
  evaluationsKbnUrl?: string;
  evaluationsKbnApiKey?: string;
  createKbnClient?: (args: { log: ToolingLog; url: string }) => KbnClient;
}

export function withKbnClientDefaultHeaders(
  kbnClient: KbnClient,
  defaultHeaders: Record<string, string>
): KbnClient {
  return new Proxy(kbnClient, {
    get(target, prop, receiver) {
      if (prop === 'request') {
        const request = target.request.bind(target);

        const requestWithHeaders: KbnClient['request'] = async (params) => {
          return request({
            ...params,
            headers: {
              ...defaultHeaders,
              ...params.headers,
            },
          });
        };

        return requestWithHeaders;
      }

      return Reflect.get(target, prop, receiver);
    },
  }) as KbnClient;
}

export function withKbnClientApiKeyAuth(kbnClient: KbnClient, apiKey: string): KbnClient {
  return withKbnClientDefaultHeaders(kbnClient, { Authorization: `ApiKey ${apiKey}` });
}

export function getEvaluationsKbnClient({
  kbnClient,
  log,
  evaluationsKbnUrl = process.env.EVAL_KBN_URL,
  evaluationsKbnApiKey = process.env.EVAL_KBN_API_KEY,
  createKbnClient = ({ log: logger, url }) => new TestKbnClient({ log: logger, url }),
}: GetEvaluationsKbnClientParams): KbnClient {
  if (!evaluationsKbnUrl) {
    return kbnClient;
  }

  const customKbnClient = createKbnClient({ log, url: evaluationsKbnUrl });
  const withAuth = evaluationsKbnApiKey
    ? withKbnClientApiKeyAuth(customKbnClient, evaluationsKbnApiKey)
    : customKbnClient;
  const withVersionHeader = withKbnClientDefaultHeaders(withAuth, {
    'elastic-api-version': '1',
  });

  return wrapKbnClientWithRetries({ kbnClient: withVersionHeader, log });
}
