/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/kbn-client';
import {
  getEvaluationsKbnClient,
  withKbnClientDefaultHeaders,
  withKbnClientApiKeyAuth,
} from './evaluations_kbn_client';

jest.mock('./kbn_client_with_retries', () => ({
  wrapKbnClientWithRetries: jest.fn(({ kbnClient }) => kbnClient),
}));

const createMockKbnClient = (): jest.Mocked<KbnClient> =>
  ({
    request: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<KbnClient>);

const log = {
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
} as unknown as ToolingLog;

describe('withKbnClientDefaultHeaders', () => {
  it('merges default headers into every request', async () => {
    const inner = createMockKbnClient();
    const client = withKbnClientDefaultHeaders(inner, { 'x-custom': 'value' });

    await client.request({ path: '/api/test', method: 'GET' } as Parameters<
      KbnClient['request']
    >[0]);

    expect(inner.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-custom': 'value' }),
      })
    );
  });

  it('allows per-request headers to override defaults', async () => {
    const inner = createMockKbnClient();
    const client = withKbnClientDefaultHeaders(inner, { 'x-custom': 'default' });

    await client.request({
      path: '/api/test',
      method: 'GET',
      headers: { 'x-custom': 'override' },
    } as Parameters<KbnClient['request']>[0]);

    expect(inner.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-custom': 'override' }),
      })
    );
  });
});
describe('withKbnClientApiKeyAuth', () => {
  it('delegates to withKbnClientDefaultHeaders with Authorization', async () => {
    const inner = createMockKbnClient();
    const client = withKbnClientApiKeyAuth(inner, 'my-key');

    await client.request({ path: '/api/test', method: 'GET' } as Parameters<
      KbnClient['request']
    >[0]);

    expect(inner.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'ApiKey my-key' }),
      })
    );
  });
});
describe('getEvaluationsKbnClient', () => {
  let originalEvalKbnUrl: string | undefined;

  beforeEach(() => {
    originalEvalKbnUrl = process.env.EVAL_KBN_URL;
    delete process.env.EVAL_KBN_URL;
  });

  afterEach(() => {
    if (originalEvalKbnUrl === undefined) {
      delete process.env.EVAL_KBN_URL;
    } else {
      process.env.EVAL_KBN_URL = originalEvalKbnUrl;
    }
  });

  it('returns default kbnClient when EVAL_KBN_URL is not set', () => {
    const defaultKbnClient = createMockKbnClient();
    const createKbnClient = jest.fn();

    const client = getEvaluationsKbnClient({
      kbnClient: defaultKbnClient,
      log,
      evaluationsKbnUrl: undefined,
      createKbnClient,
    });

    expect(client).toBe(defaultKbnClient);
    expect(createKbnClient).not.toHaveBeenCalled();
  });

  it('builds a separate client when EVAL_KBN_URL is set', async () => {
    const defaultKbnClient = createMockKbnClient();
    const evaluationsKbnClient = createMockKbnClient();
    const createKbnClient = jest.fn().mockReturnValue(evaluationsKbnClient);

    const client = getEvaluationsKbnClient({
      kbnClient: defaultKbnClient,
      log,
      evaluationsKbnUrl: 'http://elastic:changeme@remote-kibana:5620',
      createKbnClient,
    });

    await client.request({
      path: '/internal/evals/datasets',
      method: 'GET',
    } as Parameters<KbnClient['request']>[0]);

    expect(createKbnClient).toHaveBeenCalledWith({
      log,
      url: 'http://elastic:changeme@remote-kibana:5620',
    });
    expect(defaultKbnClient.request).not.toHaveBeenCalled();
    expect(evaluationsKbnClient.request).toHaveBeenCalled();
  });

  it('automatically includes elastic-api-version header', async () => {
    const defaultKbnClient = createMockKbnClient();
    const customKbnClient = createMockKbnClient();
    const createKbnClient = jest.fn().mockReturnValue(customKbnClient);

    const client = getEvaluationsKbnClient({
      kbnClient: defaultKbnClient,
      log,
      evaluationsKbnUrl: 'http://remote-kibana:5620',
      createKbnClient,
    });

    await client.request({
      path: '/internal/evals/datasets',
      method: 'GET',
    } as Parameters<KbnClient['request']>[0]);

    expect(customKbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'elastic-api-version': '1',
        }),
      })
    );
  });

  it('includes both API key auth and elastic-api-version when both are set', async () => {
    const defaultKbnClient = createMockKbnClient();
    const customKbnClient = createMockKbnClient();
    const createKbnClient = jest.fn().mockReturnValue(customKbnClient);

    const client = getEvaluationsKbnClient({
      kbnClient: defaultKbnClient,
      log,
      evaluationsKbnUrl: 'http://remote-kibana:5620',
      evaluationsKbnApiKey: 'secret-api-key',
      createKbnClient,
    });

    await client.request({
      path: '/internal/evals/datasets/_upsert',
      method: 'POST',
      body: { name: 'dataset-a' },
    } as Parameters<KbnClient['request']>[0]);

    expect(customKbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'ApiKey secret-api-key',
          'elastic-api-version': '1',
        }),
      })
    );
    expect(defaultKbnClient.request).not.toHaveBeenCalled();
  });
});
