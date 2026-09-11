/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v5 } from 'uuid';
import type { ToolingLog } from '@kbn/tooling-log';
import { INFERENCE_ENDPOINT_INTERNAL_API_VERSION } from '@kbn/inference-common';
import type { InferenceEndpointDefinition } from './inference_endpoint_definition';
import type { StackConnectorDefinition } from './eval_connector';
import { createConnectorFixture } from './create_connector_fixture';

describe('createConnectorFixture', () => {
  let mockFetch: jest.Mock;
  let mockLog: jest.Mocked<ToolingLog>;
  let mockUse: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP;
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
    delete process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP;
  });

  describe('delegation to createStackConnectorFixture', () => {
    it('delegates non-.inference connectors to the stack connector path', async () => {
      const emailConnector: StackConnectorDefinition = {
        type: 'stack_connector',
        id: 'my-email',
        name: 'Email',
        actionTypeId: '.email',
        config: { from: 'test@example.com' },
        secrets: {},
      };
      const uuid = v5(emailConnector.id, v5.DNS);

      mockFetch.mockResolvedValueOnce({ is_preconfigured: false }).mockResolvedValueOnce(undefined);

      await createConnectorFixture({
        predefinedConnector: emailConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch.mock.calls.some(([a]: [any]) => a.path?.startsWith('/api/actions'))).toBe(
        true
      );
      expect(mockUse).toHaveBeenCalledWith({ ...emailConnector, id: uuid });
    });

    it('delegates AvailableConnectorWithId (.inference) without inferenceId to stack path', async () => {
      const stackInference: StackConnectorDefinition = {
        type: 'stack_connector',
        id: 'local-inference',
        name: 'Local Inference',
        actionTypeId: '.inference',
        config: { provider: 'openai', taskType: 'chat_completion' },
        secrets: {},
      };
      const uuid = v5(stackInference.id, v5.DNS);

      mockFetch.mockResolvedValueOnce({ is_preconfigured: false }).mockResolvedValueOnce(undefined);

      await createConnectorFixture({
        predefinedConnector: stackInference,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        path: `/api/actions/connector/${uuid}`,
        method: 'POST',
        body: JSON.stringify({
          config: stackInference.config,
          connector_type_id: stackInference.actionTypeId,
          name: stackInference.name,
          secrets: stackInference.secrets,
        }),
      });
      expect(mockUse).toHaveBeenCalledWith({ ...stackInference, id: uuid });
    });
  });

  describe('with an EIS InferenceEndpointDefinition', () => {
    const eisEndpoint: InferenceEndpointDefinition = {
      type: 'inference_endpoint',
      id: 'eis-gpt-4o',
      name: 'EIS GPT-4o',
      inferenceId: '.openai-gpt-4o-chat_completion',
      provider: 'elastic',
      taskType: 'chat_completion',
      providerConfig: { model_id: 'openai-gpt-4o' },
    };

    it('binds to the inference endpoint without creating a stack connector', async () => {
      mockFetch.mockResolvedValueOnce({ isEndpointExists: true });

      await createConnectorFixture({
        predefinedConnector: eisEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith({
        path: `/internal/_inference/_exists/${encodeURIComponent(
          '.openai-gpt-4o-chat_completion'
        )}`,
        method: 'GET',
        headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
      });

      // No Actions API calls at all
      const actionsCalls = mockFetch.mock.calls.filter(([arg]: [{ path: string }]) =>
        arg.path.startsWith('/api/actions')
      );
      expect(actionsCalls).toHaveLength(0);

      // Bound as the endpoint definition itself, with `id` resolved to the inference ID —
      // no synthetic stack connector is fabricated.
      expect(mockUse).toHaveBeenCalledWith({
        ...eisEndpoint,
        id: '.openai-gpt-4o-chat_completion',
      });
    });

    it('throws a clear error when the endpoint does not exist, without falling back to Actions', async () => {
      mockFetch.mockResolvedValueOnce({ isEndpointExists: false });

      await expect(
        createConnectorFixture({
          predefinedConnector: eisEndpoint,
          fetch: mockFetch,
          log: mockLog,
          use: mockUse,
        })
      ).rejects.toThrow(
        /Inference endpoint \[\.openai-gpt-4o-chat_completion\] for EIS connector \[eis-gpt-4o\] is not available/
      );

      const actionsCalls = mockFetch.mock.calls.filter(([arg]: [{ path: string }]) =>
        arg.path.startsWith('/api/actions')
      );
      expect(actionsCalls).toHaveLength(0);
      expect(mockUse).not.toHaveBeenCalled();
    });

    it('aborts immediately on 403 from the exists check (permanent auth error)', async () => {
      const authError = Object.assign(new Error('Forbidden'), { status: 403 });
      mockFetch.mockRejectedValueOnce(authError);

      await expect(
        createConnectorFixture({
          predefinedConnector: eisEndpoint,
          fetch: mockFetch,
          log: mockLog,
          use: mockUse,
        })
      ).rejects.toThrow(/is not available/);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockUse).not.toHaveBeenCalled();
    });

    it('is bypassed by KBN_EVALS_SKIP_CONNECTOR_SETUP (yields an AvailableConnectorWithId)', async () => {
      process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP = 'true';

      await createConnectorFixture({
        predefinedConnector: eisEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUse).toHaveBeenCalledWith({ ...eisEndpoint, id: eisEndpoint.inferenceId });
    });
  });

  describe('with an OpenRouter InferenceEndpointDefinition', () => {
    const openRouterEndpoint: InferenceEndpointDefinition = {
      type: 'inference_endpoint',
      id: 'openrouter-anthropic-claude-sonnet-4-6',
      name: 'OpenRouter anthropic/claude-sonnet-4.6',
      inferenceId: 'openrouter-anthropic-claude-sonnet-4-6',
      provider: 'openai',
      taskType: 'chat_completion',
      providerConfig: {
        model_id: 'anthropic/claude-sonnet-4.6',
        url: 'https://openrouter.ai/api/v1/chat/completions',
      },
      secrets: {
        providerSecrets: { api_key: 'openrouter-key' },
      },
    };

    const expectNoActionsCalls = () => {
      const actionsCalls = mockFetch.mock.calls.filter(([arg]: [{ path: string }]) =>
        arg.path.startsWith('/api/actions')
      );
      expect(actionsCalls).toHaveLength(0);
    };

    it('binds to the existing inference endpoint without creating anything', async () => {
      mockFetch.mockResolvedValueOnce({ isEndpointExists: true });

      await createConnectorFixture({
        predefinedConnector: openRouterEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith({
        path: `/internal/_inference/_exists/${encodeURIComponent(openRouterEndpoint.inferenceId)}`,
        method: 'GET',
        headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
      });

      expectNoActionsCalls();
      expect(mockUse).toHaveBeenCalledWith({
        ...openRouterEndpoint,
        id: openRouterEndpoint.inferenceId,
      });
    });

    it('creates the inference endpoint from the definition when missing, then binds to it', async () => {
      mockFetch.mockResolvedValueOnce({ isEndpointExists: false }).mockResolvedValueOnce(undefined);

      await createConnectorFixture({
        predefinedConnector: openRouterEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        path: '/internal/_inference/_add',
        method: 'POST',
        headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
        body: JSON.stringify({
          config: {
            inferenceId: openRouterEndpoint.inferenceId,
            provider: openRouterEndpoint.provider,
            taskType: openRouterEndpoint.taskType,
            providerConfig: openRouterEndpoint.providerConfig,
          },
          secrets: openRouterEndpoint.secrets,
        }),
      });

      expectNoActionsCalls();
      expect(mockUse).toHaveBeenCalledWith({
        ...openRouterEndpoint,
        id: openRouterEndpoint.inferenceId,
      });
    });

    it('forwards optional headers on _add', async () => {
      const endpointWithHeaders: InferenceEndpointDefinition = {
        ...openRouterEndpoint,
        headers: { 'HTTP-Referer': 'https://elastic.co' },
      };

      mockFetch.mockResolvedValueOnce({ isEndpointExists: false }).mockResolvedValueOnce(undefined);

      await createConnectorFixture({
        predefinedConnector: endpointWithHeaders,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        path: '/internal/_inference/_add',
        method: 'POST',
        headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
        body: JSON.stringify({
          config: {
            inferenceId: endpointWithHeaders.inferenceId,
            provider: endpointWithHeaders.provider,
            taskType: endpointWithHeaders.taskType,
            providerConfig: endpointWithHeaders.providerConfig,
            headers: endpointWithHeaders.headers,
          },
          secrets: endpointWithHeaders.secrets,
        }),
      });
    });

    it('sends the required _add fields even when the definition omits providerConfig and secrets', async () => {
      const minimalEndpoint: InferenceEndpointDefinition = {
        type: 'inference_endpoint',
        id: 'openrouter-minimal',
        name: 'OpenRouter minimal',
        inferenceId: 'openrouter-minimal',
        provider: 'openai',
        taskType: 'chat_completion',
      };

      mockFetch.mockResolvedValueOnce({ isEndpointExists: false }).mockResolvedValueOnce(undefined);

      await createConnectorFixture({
        predefinedConnector: minimalEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        path: '/internal/_inference/_add',
        method: 'POST',
        headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
        body: JSON.stringify({
          config: {
            inferenceId: minimalEndpoint.inferenceId,
            provider: minimalEndpoint.provider,
            taskType: minimalEndpoint.taskType,
            providerConfig: {},
          },
          secrets: { providerSecrets: {} },
        }),
      });
    });

    it('treats an already-exists error on create as success (parallel workers)', async () => {
      const existsError = Object.assign(new Error('Bad Request'), {
        status: 400,
        response: {
          data: {
            statusCode: 400,
            error: 'Bad Request',
            message: `Inference endpoint [${openRouterEndpoint.inferenceId}] already exists`,
          },
        },
      });

      mockFetch
        .mockResolvedValueOnce({ isEndpointExists: false })
        .mockRejectedValueOnce(existsError);

      await createConnectorFixture({
        predefinedConnector: openRouterEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expectNoActionsCalls();
      expect(mockUse).toHaveBeenCalledWith({
        ...openRouterEndpoint,
        id: openRouterEndpoint.inferenceId,
      });
    });

    it('throws other errors on create and does not bind', async () => {
      const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });

      mockFetch
        .mockResolvedValueOnce({ isEndpointExists: false })
        .mockRejectedValueOnce(serverError);

      await expect(
        createConnectorFixture({
          predefinedConnector: openRouterEndpoint,
          fetch: mockFetch,
          log: mockLog,
          use: mockUse,
        })
      ).rejects.toThrow('Internal Server Error');

      expectNoActionsCalls();
      expect(mockUse).not.toHaveBeenCalled();
    });

    it('is bypassed by KBN_EVALS_SKIP_CONNECTOR_SETUP (yields an AvailableConnectorWithId)', async () => {
      process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP = 'true';

      await createConnectorFixture({
        predefinedConnector: openRouterEndpoint,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUse).toHaveBeenCalledWith({
        ...openRouterEndpoint,
        id: openRouterEndpoint.inferenceId,
      });
    });
  });

  describe('when KBN_EVALS_SKIP_CONNECTOR_SETUP is set', () => {
    const predefinedConnector: StackConnectorDefinition = {
      type: 'stack_connector',
      id: 'my-test-connector',
      name: 'Test Connector',
      actionTypeId: '.email',
      config: { from: 'test@example.com' },
      secrets: { user: 'user', password: 'pass' },
    };

    beforeEach(() => {
      process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP = 'true';
    });

    it('skips setup/teardown and calls use() with the predefined connector as-is', async () => {
      await createConnectorFixture({
        predefinedConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUse).toHaveBeenCalledWith(predefinedConnector);
    });

    it('logs a message indicating connector setup is being skipped', async () => {
      await createConnectorFixture({
        predefinedConnector,
        fetch: mockFetch,
        log: mockLog,
        use: mockUse,
      });

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping connector setup/teardown')
      );
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining(predefinedConnector.id));
    });
  });
});
