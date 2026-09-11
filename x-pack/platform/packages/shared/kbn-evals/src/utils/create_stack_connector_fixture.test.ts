/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v5 } from 'uuid';
import type { ToolingLog } from '@kbn/tooling-log';
import type { StackConnectorDefinition } from './eval_connector';
import { KbnClientRequesterError } from '@kbn/kbn-client';
import {
  createStackConnectorFixture,
  getConnectorIdAsUuid,
  resolveConnectorId,
} from './create_stack_connector_fixture';

describe('getConnectorIdAsUuid', () => {
  it('returns a valid UUID v5 for a given connector id', () => {
    const result = getConnectorIdAsUuid('my-connector');
    // UUID v5 format: 8-4-4-4-12 hex chars
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns the same UUID for the same input (deterministic)', () => {
    const first = getConnectorIdAsUuid('my-connector');
    const second = getConnectorIdAsUuid('my-connector');
    expect(first).toBe(second);
  });

  it('returns different UUIDs for different inputs', () => {
    const a = getConnectorIdAsUuid('connector-a');
    const b = getConnectorIdAsUuid('connector-b');
    expect(a).not.toBe(b);
  });
});

describe('resolveConnectorId', () => {
  afterEach(() => {
    delete process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP;
  });

  it('returns a UUID when KBN_EVALS_SKIP_CONNECTOR_SETUP is not set', () => {
    delete process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP;

    const result = resolveConnectorId('my-connector');
    expect(result).toBe(getConnectorIdAsUuid('my-connector'));
  });

  it('returns the original id when KBN_EVALS_SKIP_CONNECTOR_SETUP is set', () => {
    process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP = 'true';

    const result = resolveConnectorId('my-connector');
    expect(result).toBe('my-connector');
  });
});

describe('createStackConnectorFixture', () => {
  // Non-LLM connector (e.g. the mock email/Slack connectors used by evals_workflows).
  const predefinedConnector: StackConnectorDefinition = {
    type: 'stack_connector',
    id: 'my-test-connector',
    name: 'Test Connector',
    actionTypeId: '.email',
    config: { from: 'test@example.com' },
    secrets: { user: 'user', password: 'pass' },
  };

  const expectedUuid = v5(predefinedConnector.id, v5.DNS);

  let mockFetch: jest.Mock;
  let mockLog: jest.Mocked<ToolingLog>;
  let mockUse: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.KBN_EVALS_AWAIT_CCM_CONNECTORS;
    mockFetch = jest.fn().mockResolvedValue(undefined);
    mockLog = {
      info: jest.fn(),
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    } as any;
    mockUse = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.KBN_EVALS_AWAIT_CCM_CONNECTORS;
  });

  it('creates the connector without deleting first', async () => {
    await createStackConnectorFixture({
      predefinedConnector,
      fetch: mockFetch,
      log: mockLog,
      use: mockUse,
    });

    // First call: GET (check if connector is preconfigured)
    expect(mockFetch).toHaveBeenNthCalledWith(1, {
      path: `/api/actions/connector/${predefinedConnector.id}`,
      method: 'GET',
    });

    // Second call: POST (create)
    expect(mockFetch).toHaveBeenNthCalledWith(2, {
      path: `/api/actions/connector/${expectedUuid}`,
      method: 'POST',
      body: JSON.stringify({
        config: predefinedConnector.config,
        connector_type_id: predefinedConnector.actionTypeId,
        name: predefinedConnector.name,
        secrets: predefinedConnector.secrets,
      }),
    });
  });

  it('generates a deterministic UUID for the connector id', async () => {
    await createStackConnectorFixture({
      predefinedConnector,
      fetch: mockFetch,
      log: mockLog,
      use: mockUse,
    });

    const postCall = mockFetch.mock.calls.find(
      ([arg]: [{ method: string }]) => arg.method === 'POST'
    );
    expect(postCall).toBeDefined();
    expect(postCall![0].path).toBe(`/api/actions/connector/${expectedUuid}`);
  });

  it('calls use() with the UUID-ified connector', async () => {
    await createStackConnectorFixture({
      predefinedConnector,
      fetch: mockFetch,
      log: mockLog,
      use: mockUse,
    });

    expect(mockUse).toHaveBeenCalledWith({
      ...predefinedConnector,
      id: expectedUuid,
    });
  });

  it('does not delete the connector on teardown (shared across parallel workers)', async () => {
    const callOrder: string[] = [];

    mockFetch.mockImplementation(async ({ method }: { method: string }) => {
      callOrder.push(method);
    });

    mockUse.mockImplementation(async () => {
      callOrder.push('use');
    });

    await createStackConnectorFixture({
      predefinedConnector,
      fetch: mockFetch,
      log: mockLog,
      use: mockUse,
    });

    // Order: GET (preconfigured check), POST (create), use() — no teardown DELETE
    expect(callOrder).toEqual(['GET', 'POST', 'use']);
  });

  it('handles 409 conflict on create when another worker already created the connector', async () => {
    const conflictError = Object.assign(new Error('Conflict'), { status: 409 });

    mockFetch
      .mockResolvedValueOnce({ is_preconfigured: false })
      .mockRejectedValueOnce(conflictError);

    await expect(
      createStackConnectorFixture({
        predefinedConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      })
    ).resolves.toBeUndefined();

    expect(mockUse).toHaveBeenCalledWith({
      ...predefinedConnector,
      id: expectedUuid,
    });
  });

  it('throws any 400 error on create', async () => {
    const badRequest = Object.assign(new Error('Bad Request'), {
      status: 400,
      response: { data: { message: 'Invalid API key' } },
    });

    mockFetch.mockResolvedValueOnce({ is_preconfigured: false }).mockRejectedValueOnce(badRequest);

    await expect(
      createStackConnectorFixture({
        predefinedConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      })
    ).rejects.toThrow();

    expect(mockUse).not.toHaveBeenCalled();
  });

  it('throws non-conflict errors on create', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });

    mockFetch.mockResolvedValueOnce({ is_preconfigured: false }).mockRejectedValueOnce(serverError);

    await expect(
      createStackConnectorFixture({
        predefinedConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      })
    ).rejects.toThrow('Internal Server Error');

    expect(mockUse).not.toHaveBeenCalled();
  });

  it('reuses a preconfigured connector and skips create', async () => {
    mockFetch.mockResolvedValueOnce({ is_preconfigured: true });

    await createStackConnectorFixture({
      predefinedConnector,
      fetch: mockFetch,
      log: mockLog,
      use: mockUse,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith({
      path: `/api/actions/connector/${predefinedConnector.id}`,
      method: 'GET',
    });
    expect(mockUse).toHaveBeenCalledWith(predefinedConnector);
  });

  describe('with KbnClientRequesterError (production error shape)', () => {
    // KbnClient stringifies the response body into the error message after ` -- `, mirroring what
    // `KbnClientRequester` does in production. Tests must use this exact shape to cover the real
    // failure path that surfaces from `httpHandlerFromKbnClient`.
    const buildKbnClientError = (status: number, body: unknown) =>
      new KbnClientRequesterError(
        `[POST http://localhost:5620/api/actions/connector/${expectedUuid}] ${status} -- ${JSON.stringify(
          body
        )}`,
        { status }
      );

    it('handles 409 conflict on create (race between parallel workers)', async () => {
      const conflictError = buildKbnClientError(409, {
        statusCode: 409,
        error: 'Conflict',
        message: `A connector is already using this ID: ${expectedUuid}. Choose a different ID.`,
      });

      mockFetch
        .mockResolvedValueOnce({ is_preconfigured: false })
        .mockRejectedValueOnce(conflictError);

      await expect(
        createStackConnectorFixture({
          predefinedConnector,
          fetch: mockFetch,
          log: mockLog,
          use: mockUse,
        })
      ).resolves.toBeUndefined();

      expect(mockUse).toHaveBeenCalledWith({
        ...predefinedConnector,
        id: expectedUuid,
      });
    });

    it('throws any 400 on create', async () => {
      const badRequest = buildKbnClientError(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid API key',
      });

      mockFetch
        .mockResolvedValueOnce({ is_preconfigured: false })
        .mockRejectedValueOnce(badRequest);

      await expect(
        createStackConnectorFixture({
          predefinedConnector,
          fetch: mockFetch,
          log: mockLog,
          use: mockUse,
        })
      ).rejects.toBeInstanceOf(KbnClientRequesterError);

      expect(mockUse).not.toHaveBeenCalled();
    });

    it('throws non-conflict errors on create', async () => {
      const serverError = buildKbnClientError(500, {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something broke',
      });

      mockFetch
        .mockResolvedValueOnce({ is_preconfigured: false })
        .mockRejectedValueOnce(serverError);

      await expect(
        createStackConnectorFixture({
          predefinedConnector,
          fetch: mockFetch,
          log: mockLog,
          use: mockUse,
        })
      ).rejects.toBeInstanceOf(KbnClientRequesterError);

      expect(mockUse).not.toHaveBeenCalled();
    });

    it('treats 404 on the preconfigured check as "not preconfigured" and creates the connector', async () => {
      const notFound = new KbnClientRequesterError(
        `[GET http://localhost:5620/api/actions/connector/${predefinedConnector.id}] 404 Not Found -- {}`,
        { status: 404 }
      );

      mockFetch.mockRejectedValueOnce(notFound).mockResolvedValueOnce(undefined);

      await createStackConnectorFixture({
        predefinedConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        path: `/api/actions/connector/${expectedUuid}`,
        method: 'POST',
        body: JSON.stringify({
          config: predefinedConnector.config,
          connector_type_id: predefinedConnector.actionTypeId,
          name: predefinedConnector.name,
          secrets: predefinedConnector.secrets,
        }),
      });
      expect(mockUse).toHaveBeenCalledWith({
        ...predefinedConnector,
        id: expectedUuid,
      });
    });
  });

  describe('with a .gen-ai connector', () => {
    // `.gen-ai` defs are no longer recognized as LLM defs: like any other stack connector
    // (e.g. `.email`), they flow through the generic Actions path.
    const genAiConnector: StackConnectorDefinition = {
      type: 'stack_connector',
      id: 'openrouter-anthropic-claude-sonnet-4-6',
      name: 'OpenRouter anthropic/claude-sonnet-4.6',
      actionTypeId: '.gen-ai',
      config: {
        apiProvider: 'Other',
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        enableNativeFunctionCalling: true,
        defaultModel: 'anthropic/claude-sonnet-4.6',
      },
      secrets: { apiKey: 'openrouter-key' },
    };

    const genAiUuid = v5(genAiConnector.id, v5.DNS);

    it('creates a stack connector via the Actions API', async () => {
      mockFetch.mockResolvedValueOnce({ is_preconfigured: false }).mockResolvedValueOnce(undefined);

      await createStackConnectorFixture({
        predefinedConnector: genAiConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, {
        path: `/api/actions/connector/${genAiConnector.id}`,
        method: 'GET',
      });
      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        path: `/api/actions/connector/${genAiUuid}`,
        method: 'POST',
        body: JSON.stringify({
          config: genAiConnector.config,
          connector_type_id: genAiConnector.actionTypeId,
          name: genAiConnector.name,
          secrets: genAiConnector.secrets,
        }),
      });

      expect(mockUse).toHaveBeenCalledWith({
        ...genAiConnector,
        id: genAiUuid,
      });
    });
  });
});
