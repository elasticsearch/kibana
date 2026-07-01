/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { inferenceMock } from '@kbn/inference-plugin/server/mocks';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { InferenceCompleteCallbackHandler } from '@kbn/inference-common/src/chat_complete';
import { AGENT_BUILDER_FAST_INFERENCE_FEATURE_ID } from '@kbn/agent-builder-common/constants';
import { resolveSelectedConnectorId } from '../../../utils/resolve_selected_connector_id';
import type { TrackingService } from '../../../telemetry';
import { MODEL_TELEMETRY_METADATA } from '../../../telemetry';
import { createModelProvider, createModelProviderFactory } from './model_provider';

jest.mock('../../../utils/resolve_selected_connector_id');

const resolveSelectedConnectorIdMock = resolveSelectedConnectorId as jest.MockedFn<
  typeof resolveSelectedConnectorId
>;

interface FastEndpointMock {
  connectorId: string;
  isRecommended?: boolean;
}

const createSearchInferenceEndpointsMock = (
  endpoints: FastEndpointMock[] = []
): jest.Mocked<SearchInferenceEndpointsPluginStart> => {
  return {
    features: {} as any,
    endpoints: {
      getForFeature: jest.fn().mockResolvedValue({
        endpoints,
        warnings: [],
        soEntryFound: false,
      }),
    },
  } as unknown as jest.Mocked<SearchInferenceEndpointsPluginStart>;
};

const createTrackingServiceMock = (): jest.Mocked<Pick<TrackingService, 'trackLLMUsage'>> => ({
  trackLLMUsage: jest.fn(),
});

const setupDeps = ({
  fastEndpoints = [] as FastEndpointMock[],
  defaultConnectorId,
}: {
  fastEndpoints?: FastEndpointMock[];
  defaultConnectorId?: string;
} = {}) => {
  const savedObjects = savedObjectsServiceMock.createStartContract();
  const uiSettings = uiSettingsServiceMock.createStartContract();
  const request = httpServerMock.createKibanaRequest();
  const logger = loggingSystemMock.createLogger();
  const inference = inferenceMock.createStartContract();
  const searchInferenceEndpoints = createSearchInferenceEndpointsMock(fastEndpoints);
  const trackingService = createTrackingServiceMock() as unknown as TrackingService;

  savedObjects.getScopedClient.mockReturnValue({} as any);
  const get = jest.fn(async () => undefined);
  uiSettings.asScopedToClient.mockReturnValue({ get } as any);

  return {
    inference,
    request,
    defaultConnectorId,
    trackingService,
    uiSettings,
    savedObjects,
    logger,
    searchInferenceEndpoints,
  };
};

const createConnectorMock = (overrides: Record<string, any> = {}) => ({
  connectorId: 'default-connector',
  type: '.gen-ai',
  config: { providerConfig: { provider: 'openai' } },
  ...overrides,
});

const getCompletionCallback = (
  inference: ReturnType<typeof inferenceMock.createStartContract>,
  callIndex = 0
): InferenceCompleteCallbackHandler => {
  const completeCallbacks = inference.getChatModel.mock.calls[callIndex][0].callbacks!.complete!;
  const callback = Array.isArray(completeCallbacks) ? completeCallbacks[0] : completeCallbacks;
  return callback;
};

const setupChatAndClient = (inference: ReturnType<typeof inferenceMock.createStartContract>) => {
  const chatModel = { kind: 'chat-model' };
  const getConnectorById = jest.fn().mockResolvedValue(createConnectorMock());
  const inferenceClient = { getConnectorById };

  inference.getChatModel.mockResolvedValue(chatModel as any);
  inference.getClient.mockReturnValue(inferenceClient as any);

  return { chatModel, inferenceClient, getConnectorById };
};

describe('createModelProvider', () => {
  beforeEach(() => {
    resolveSelectedConnectorIdMock.mockResolvedValue('default-connector');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDefaultModel', () => {
    it('resolves the default connector id and returns a scoped model', async () => {
      const deps = setupDeps();
      const { chatModel, inferenceClient } = setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      const model = await provider.getDefaultModel();

      expect(resolveSelectedConnectorIdMock).toHaveBeenCalledWith({
        uiSettings: deps.uiSettings,
        savedObjects: deps.savedObjects,
        request: deps.request,
        connectorId: undefined,
        inference: deps.inference,
        searchInferenceEndpoints: deps.searchInferenceEndpoints,
      });
      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({
          request: deps.request,
          connectorId: 'default-connector',
        })
      );
      expect(deps.inference.getClient).toHaveBeenCalledWith(
        expect.objectContaining({
          request: deps.request,
          bindTo: { connectorId: 'default-connector' },
        })
      );
      expect(model.chatModel).toBe(chatModel);
      expect(model.inferenceClient).toBe(inferenceClient);
      expect(model.connector).toEqual(createConnectorMock());
    });

    it('throws when no connector can be resolved', async () => {
      resolveSelectedConnectorIdMock.mockResolvedValue(undefined);
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);

      await expect(provider.getDefaultModel()).rejects.toThrow('No connector available');
    });

    it('memoizes the default connector resolution across calls', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.getDefaultModel();
      await provider.getDefaultModel();

      expect(resolveSelectedConnectorIdMock).toHaveBeenCalledTimes(1);
      expect(deps.inference.getChatModel).toHaveBeenCalledTimes(2);
    });

    it('forwards the explicit defaultConnectorId option', async () => {
      const deps = setupDeps({ defaultConnectorId: 'explicit-connector' });
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.getDefaultModel();

      expect(resolveSelectedConnectorIdMock).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'explicit-connector' })
      );
    });
  });

  describe('getModelById', () => {
    it('uses the provided connectorId verbatim', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.getModelById({ connectorId: 'specific-connector' });

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'specific-connector' })
      );
      expect(deps.inference.getClient).toHaveBeenCalledWith(
        expect.objectContaining({ bindTo: { connectorId: 'specific-connector' } })
      );
    });
  });

  describe('selectModel', () => {
    it('uses the default connector when effortLevel is medium', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({ effortLevel: 'medium' });

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'default-connector' })
      );
    });

    it('uses the default connector when effortLevel is omitted', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({});

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'default-connector' })
      );
    });

    it('uses the recommended fast model endpoint when effortLevel is low', async () => {
      const deps = setupDeps({
        fastEndpoints: [{ connectorId: 'fast-connector', isRecommended: true }],
      });
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({ effortLevel: 'low' });

      expect(deps.searchInferenceEndpoints.endpoints.getForFeature).toHaveBeenCalledWith(
        AGENT_BUILDER_FAST_INFERENCE_FEATURE_ID,
        deps.request
      );
      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'fast-connector' })
      );
    });

    it('picks the first recommended endpoint when several are returned', async () => {
      const deps = setupDeps({
        fastEndpoints: [
          { connectorId: 'non-recommended', isRecommended: false },
          { connectorId: 'first-recommended', isRecommended: true },
          { connectorId: 'second-recommended', isRecommended: true },
        ],
      });
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({ effortLevel: 'low' });

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'first-recommended' })
      );
    });

    it('falls back to the default connector when no fast endpoint is recommended', async () => {
      const deps = setupDeps({
        fastEndpoints: [
          { connectorId: 'fast-connector', isRecommended: false },
          { connectorId: 'other-connector' },
        ],
      });
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({ effortLevel: 'low' });

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'default-connector' })
      );
    });

    it('falls back to the default connector when no fast endpoint exists', async () => {
      const deps = setupDeps({ fastEndpoints: [] });
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({ effortLevel: 'low' });

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'default-connector' })
      );
    });

    it('memoizes the fast connector resolution across calls', async () => {
      const deps = setupDeps({
        fastEndpoints: [{ connectorId: 'fast-connector', isRecommended: true }],
      });
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.selectModel({ effortLevel: 'low' });
      await provider.selectModel({ effortLevel: 'low' });

      expect(deps.searchInferenceEndpoints.endpoints.getForFeature).toHaveBeenCalledTimes(1);
    });
  });

  describe('telemetryMetadata', () => {
    it('defaults to the Agent Builder telemetry and binds no metadata when none is provided', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.getDefaultModel();

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({
          chatModelOptions: { telemetryMetadata: MODEL_TELEMETRY_METADATA },
        })
      );
      expect(deps.inference.getClient).toHaveBeenCalledWith(
        expect.objectContaining({
          bindTo: { connectorId: 'default-connector' },
        })
      );
    });

    it('uses the provided telemetryMetadata for the chat model and binds it on the inference client', async () => {
      const telemetryMetadata = {
        pluginId: 'streams_significant_events_discovery',
        aggregateBy: 'streams_significant_events',
      };
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider({ ...deps, telemetryMetadata });
      await provider.getDefaultModel();

      expect(deps.inference.getChatModel).toHaveBeenCalledWith(
        expect.objectContaining({
          chatModelOptions: { telemetryMetadata },
        })
      );
      expect(deps.inference.getClient).toHaveBeenCalledWith(
        expect.objectContaining({
          bindTo: {
            connectorId: 'default-connector',
            metadata: { connectorTelemetry: telemetryMetadata },
          },
        })
      );
    });
  });

  describe('getUsageStats', () => {
    it('returns no calls before any completion event', () => {
      const deps = setupDeps();
      const provider = createModelProvider(deps);

      expect(provider.getUsageStats()).toEqual({ calls: [] });
    });

    it('records calls and forwards usage to the tracking service when completion fires', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);

      const provider = createModelProvider(deps);
      await provider.getDefaultModel();

      const completionCallback = getCompletionCallback(deps.inference);
      completionCallback({
        model: 'gpt-4o',
        tokens: { prompt: 10, completion: 20, total: 30 },
      } as any);

      expect(provider.getUsageStats()).toEqual({
        calls: [
          {
            connectorId: 'default-connector',
            tokens: { prompt: 10, completion: 20, total: 30 },
            model: 'gpt-4o',
          },
        ],
      });
      expect(deps.trackingService!.trackLLMUsage).toHaveBeenCalledWith(
        expect.any(String),
        'gpt-4o'
      );
    });

    it('does not throw when tracking service is not provided', async () => {
      const deps = setupDeps();
      setupChatAndClient(deps.inference);
      const provider = createModelProvider({ ...deps, trackingService: undefined });
      await provider.getDefaultModel();

      const completionCallback = getCompletionCallback(deps.inference);
      expect(() =>
        completionCallback({
          model: 'gpt-4o',
          tokens: { prompt: 1, completion: 2, total: 3 },
        } as any)
      ).not.toThrow();

      expect(provider.getUsageStats().calls).toHaveLength(1);
    });
  });
});

describe('createModelProviderFactory', () => {
  it('produces a factory that injects request-scoped options', async () => {
    const deps = setupDeps();
    setupChatAndClient(deps.inference);

    const factory = createModelProviderFactory({
      inference: deps.inference,
      trackingService: deps.trackingService,
      uiSettings: deps.uiSettings,
      savedObjects: deps.savedObjects,
      logger: deps.logger,
      searchInferenceEndpoints: deps.searchInferenceEndpoints,
    });

    const provider = factory({ request: deps.request, defaultConnectorId: 'override-connector' });
    await provider.getDefaultModel();

    expect(resolveSelectedConnectorIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        request: deps.request,
        connectorId: 'override-connector',
      })
    );
  });
});
