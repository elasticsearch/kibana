/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { actionsClientMock, actionsMock } from '@kbn/actions-plugin/server/mocks';
import { httpServerMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { InferenceConnectorType } from '@kbn/inference-common';
import { getConnectorList } from './get_connector_list';
import { getInferenceEndpoints } from './get_inference_endpoints';

jest.mock('./get_inference_endpoints');

const getInferenceEndpointsMock = getInferenceEndpoints as jest.MockedFn<
  typeof getInferenceEndpoints
>;

describe('getConnectorList', () => {
  let actions: ReturnType<typeof actionsMock.createStart>;
  let actionsClient: ReturnType<typeof actionsClientMock.create>;
  let request: ReturnType<typeof httpServerMock.createKibanaRequest>;
  const esClient = {} as any;
  const logger = loggerMock.create();

  beforeEach(() => {
    actions = actionsMock.createStart();
    actionsClient = actionsClientMock.create();
    request = httpServerMock.createKibanaRequest();
    actions.getActionsClientWithRequest.mockResolvedValue(actionsClient);
    actionsClient.getAll.mockResolvedValue([]);
    getInferenceEndpointsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns stack connectors from the actions plugin', async () => {
    actionsClient.getAll.mockResolvedValue([
      {
        id: 'connector-1',
        actionTypeId: InferenceConnectorType.OpenAI,
        name: 'My OpenAI Connector',
        config: { apiProvider: 'OpenAI' },
        isPreconfigured: false,
        isSystemAction: false,
        isDeprecated: false,
        referencedByCount: 0,
        isMissingSecrets: false,
      },
    ] as any);

    const result = await getConnectorList({ actions, request, esClient, logger });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      connectorId: 'connector-1',
      name: 'My OpenAI Connector',
      type: InferenceConnectorType.OpenAI,
      isInferenceEndpoint: false,
    });
  });

  it('returns native inference endpoints with display.name when available', async () => {
    getInferenceEndpointsMock.mockResolvedValue([
      {
        inferenceId: 'my-endpoint',
        taskType: 'chat_completion',
        service: 'openai',
        serviceSettings: { model_id: 'gpt-4' },
        metadata: { display: { name: 'My Preconfigured Endpoint' } },
      },
    ]);

    const result = await getConnectorList({ actions, request, esClient, logger });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      connectorId: 'my-endpoint',
      name: 'My Preconfigured Endpoint',
      type: InferenceConnectorType.Inference,
      isInferenceEndpoint: true,
      isPreconfigured: true,
      isEis: false,
    });
  });

  it('uses the matching stack connector name when the endpoint has no display.name', async () => {
    actionsClient.getAll.mockResolvedValue([
      {
        id: 'stack-connector-id',
        actionTypeId: InferenceConnectorType.Inference,
        name: 'My Named Connector',
        config: { inferenceId: 'my-endpoint', taskType: 'chat_completion' },
        isPreconfigured: false,
        isSystemAction: false,
        isDeprecated: false,
        referencedByCount: 0,
        isMissingSecrets: false,
      },
    ] as any);

    getInferenceEndpointsMock.mockResolvedValue([
      {
        inferenceId: 'my-endpoint',
        taskType: 'chat_completion',
        service: 'openai',
        serviceSettings: {},
        metadata: {},
      },
    ]);

    const result = await getConnectorList({ actions, request, esClient, logger });

    const endpoint = result.find((c) => c.isInferenceEndpoint);
    expect(endpoint).toMatchObject({
      connectorId: 'my-endpoint',
      name: 'My Named Connector',
      isInferenceEndpoint: true,
      isPreconfigured: false,
      isEis: false,
    });
  });

  it('falls back to inferenceId as name when no display.name and no matching stack connector', async () => {
    getInferenceEndpointsMock.mockResolvedValue([
      {
        inferenceId: 'my-endpoint',
        taskType: 'chat_completion',
        service: 'openai',
        serviceSettings: {},
        metadata: {},
      },
    ]);

    const result = await getConnectorList({ actions, request, esClient, logger });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      connectorId: 'my-endpoint',
      name: 'my-endpoint',
      isInferenceEndpoint: true,
    });
  });

  it('deduplicates: excludes the .inference stack connector when a matching ES endpoint exists', async () => {
    actionsClient.getAll.mockResolvedValue([
      {
        id: 'stack-connector-id',
        actionTypeId: InferenceConnectorType.Inference,
        name: 'My Custom Connector',
        config: { inferenceId: 'my-endpoint', taskType: 'chat_completion' },
        isPreconfigured: false,
        isSystemAction: false,
        isDeprecated: false,
        referencedByCount: 0,
        isMissingSecrets: false,
      },
    ] as any);

    getInferenceEndpointsMock.mockResolvedValue([
      {
        inferenceId: 'my-endpoint',
        taskType: 'chat_completion',
        service: 'openai',
        serviceSettings: {},
        metadata: {},
      },
    ]);

    const result = await getConnectorList({ actions, request, esClient, logger });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      connectorId: 'my-endpoint',
      isInferenceEndpoint: true,
    });
    expect(result.find((c) => !c.isInferenceEndpoint)).toBeUndefined();
  });

  it('prefers display.name over stack connector name', async () => {
    actionsClient.getAll.mockResolvedValue([
      {
        id: 'stack-connector-id',
        actionTypeId: InferenceConnectorType.Inference,
        name: 'Stack Connector Name',
        config: { inferenceId: 'my-endpoint', taskType: 'chat_completion' },
        isPreconfigured: false,
        isSystemAction: false,
        isDeprecated: false,
        referencedByCount: 0,
        isMissingSecrets: false,
      },
    ] as any);

    getInferenceEndpointsMock.mockResolvedValue([
      {
        inferenceId: 'my-endpoint',
        taskType: 'chat_completion',
        service: 'openai',
        serviceSettings: {},
        metadata: { display: { name: 'Display Name Takes Priority' } },
      },
    ]);

    const result = await getConnectorList({ actions, request, esClient, logger });

    const endpoint = result.find((c) => c.isInferenceEndpoint);
    expect(endpoint?.name).toBe('Display Name Takes Priority');
  });

  describe('preconfigured connector config enrichment', () => {
    // The actions plugin strips `config` from preconfigured connector responses
    // unless the user opts into `exposeConfig: true`. The inference plugin
    // needs that config server-side for capability detection (e.g. detecting
    // Azure-hosted gpt-5 deployments). We re-attach it from the in-memory
    // connector registry without requiring an opt-in.

    const azureGpt5RawConnector = {
      id: 'gpt5Azure',
      actionTypeId: InferenceConnectorType.OpenAI,
      name: 'GPT-5',
      isPreconfigured: true,
      isSystemAction: false,
      isDeprecated: false,
      referencedByCount: 0,
      isMissingSecrets: false,
      // `config` intentionally omitted — that's what the actions API returns
      // for preconfigured connectors without `exposeConfig: true`.
    };

    const azureGpt5InMemory = {
      id: 'gpt5Azure',
      actionTypeId: InferenceConnectorType.OpenAI,
      name: 'GPT-5',
      isPreconfigured: true,
      isSystemAction: false,
      isDeprecated: false,
      config: {
        apiProvider: 'Azure OpenAI',
        apiUrl:
          'https://example.cognitiveservices.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-04-01-preview',
      },
      secrets: { apiKey: '[redacted]' },
    };

    it('enriches preconfigured connectors with config from inMemoryConnectors', async () => {
      actionsClient.getAll.mockResolvedValue([azureGpt5RawConnector] as any);
      actions.inMemoryConnectors = [azureGpt5InMemory] as any;

      const result = await getConnectorList({ actions, request, esClient, logger });

      expect(result).toHaveLength(1);
      expect(result[0].config).toEqual({
        apiProvider: 'Azure OpenAI',
        apiUrl:
          'https://example.cognitiveservices.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-04-01-preview',
      });
    });

    it('does not overwrite a preconfigured connector that already has config (exposeConfig: true)', async () => {
      const exposed = {
        ...azureGpt5RawConnector,
        // Simulate `exposeConfig: true` — the API surfaced the real config.
        config: { apiProvider: 'Azure OpenAI', apiUrl: 'https://surfaced.example.com/v1' },
      };
      actionsClient.getAll.mockResolvedValue([exposed] as any);
      // Even with a different in-memory entry, the API-provided config wins.
      actions.inMemoryConnectors = [
        {
          ...azureGpt5InMemory,
          config: { apiProvider: 'Azure OpenAI', apiUrl: 'https://different.example.com/v1' },
        },
      ] as any;

      const result = await getConnectorList({ actions, request, esClient, logger });

      expect(result[0].config).toMatchObject({ apiUrl: 'https://surfaced.example.com/v1' });
    });

    it('leaves non-preconfigured connectors untouched', async () => {
      const userConnector = {
        ...azureGpt5RawConnector,
        isPreconfigured: false,
        config: { apiProvider: 'OpenAI' },
      };
      actionsClient.getAll.mockResolvedValue([userConnector] as any);
      actions.inMemoryConnectors = [azureGpt5InMemory] as any;

      const result = await getConnectorList({ actions, request, esClient, logger });

      // User-created connector's config is what the API returned — no merge.
      expect(result[0].config).toEqual({ apiProvider: 'OpenAI' });
    });

    it('falls back gracefully when actions provider lacks inMemoryConnectors', async () => {
      actionsClient.getAll.mockResolvedValue([azureGpt5RawConnector] as any);
      // Simulate older mocks/code paths without the new field.
      actions.inMemoryConnectors = undefined as any;

      const result = await getConnectorList({ actions, request, esClient, logger });

      // Connector is still returned, just with empty config (the previous behavior).
      expect(result).toHaveLength(1);
      expect(result[0].connectorId).toBe('gpt5Azure');
      expect(result[0].config).toEqual({});
    });

    it('only enriches connectors whose IDs match', async () => {
      const otherInMemory = {
        ...azureGpt5InMemory,
        id: 'someOtherConnector',
      };
      actionsClient.getAll.mockResolvedValue([azureGpt5RawConnector] as any);
      actions.inMemoryConnectors = [otherInMemory] as any;

      const result = await getConnectorList({ actions, request, esClient, logger });

      // No matching in-memory entry for `gpt5Azure` → config stays empty.
      expect(result[0].config).toEqual({});
    });
  });
});
