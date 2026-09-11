/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import { EffortLevels } from '@kbn/agent-builder-common/model_provider';
import type {
  ModelProvider,
  ScopedModel,
  ModelProviderStats,
  ModelCallInfo,
  ModelSelectionPreferences,
} from '@kbn/agent-builder-server/runner';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import { getConnectorProvider, getConnectorModel } from '@kbn/inference-common';
import type {
  BoundInferenceClient,
  ChatCompletionReasoningEffort,
  ConnectorTelemetryMetadata,
} from '@kbn/inference-common';
import type { InferenceCompleteCallbackHandler } from '@kbn/inference-common/src/chat_complete';
import { AGENT_BUILDER_FAST_INFERENCE_FEATURE_ID } from '@kbn/agent-builder-common/constants';
import type { TrackingService } from '../../../telemetry';
import { MODEL_TELEMETRY_METADATA } from '../../../telemetry';
import { resolveSelectedConnectorId } from '../../../utils/resolve_selected_connector_id';

export interface CreateModelProviderOpts {
  inference: InferenceServerStart;
  request: KibanaRequest;
  defaultConnectorId?: string;
  trackingService?: TrackingService;
  uiSettings: UiSettingsServiceStart;
  savedObjects: SavedObjectsServiceStart;
  logger: Logger;
  searchInferenceEndpoints: SearchInferenceEndpointsPluginStart;
  telemetryMetadata?: ConnectorTelemetryMetadata;
  agentId?: string;
  maxContentLength?: number;
  reasoningLevel?: ChatCompletionReasoningEffort;
}

export type CreateModelProviderFactoryFn = (
  opts: Omit<
    CreateModelProviderOpts,
    'request' | 'defaultConnectorId' | 'telemetryMetadata' | 'maxContentLength' | 'reasoningLevel'
  >
) => ModelProviderFactoryFn;

export type ModelProviderFactoryFn = (
  opts: Pick<
    CreateModelProviderOpts,
    | 'request'
    | 'defaultConnectorId'
    | 'telemetryMetadata'
    | 'agentId'
    | 'maxContentLength'
    | 'reasoningLevel'
  >
) => ModelProvider;

const memoizeAsync = <T>(fn: () => Promise<T>): (() => Promise<T>) => {
  let cached: Promise<T> | undefined;
  return () => (cached ??= fn());
};

const memoizeAsyncByKey = <K, T>(fn: (key: K) => Promise<T>): ((key: K) => Promise<T>) => {
  const cache = new Map<K, Promise<T>>();
  return (key: K) => {
    if (!cache.has(key)) {
      const pending = fn(key).catch((err) => {
        cache.delete(key);
        throw err;
      });
      cache.set(key, pending);
    }
    return cache.get(key)!;
  };
};

/**
 * Utility function to creates a {@link ModelProviderFactoryFn}
 */
export const createModelProviderFactory: CreateModelProviderFactoryFn = (factoryOpts) => (opts) => {
  return createModelProvider({
    ...factoryOpts,
    ...opts,
  });
};

/**
 * Utility function to create a {@link ModelProvider}
 */
export const createModelProvider = ({
  inference,
  request,
  defaultConnectorId,
  trackingService,
  uiSettings,
  savedObjects,
  searchInferenceEndpoints,
  logger,
  telemetryMetadata,
  agentId,
  maxContentLength,
  reasoningLevel,
}: CreateModelProviderOpts): ModelProvider => {
  const resolvedTelemetryMetadata = telemetryMetadata ?? MODEL_TELEMETRY_METADATA;
  const getDefaultConnectorId = memoizeAsync(async () => {
    const resolvedConnectorId = await resolveSelectedConnectorId({
      uiSettings,
      savedObjects,
      request,
      connectorId: defaultConnectorId,
      inference,
      searchInferenceEndpoints,
    });
    if (!resolvedConnectorId) {
      throw new Error('No connector available');
    }

    logger.debug(`[getDefaultConnectorId] Using connectorId: ${resolvedConnectorId}`);
    return resolvedConnectorId;
  });

  const getFastModelConnectorId = memoizeAsync(async () => {
    const { endpoints } = await searchInferenceEndpoints.endpoints.getForFeature(
      AGENT_BUILDER_FAST_INFERENCE_FEATURE_ID,
      request,
      { onlyReturnConfigured: true }
    );

    if (endpoints.length > 0) {
      return endpoints[0].connectorId;
    }

    const fallbackId = await getDefaultConnectorId();
    logger.debug(
      `[model_provider] No dedicated fast inference endpoint found for feature "${AGENT_BUILDER_FAST_INFERENCE_FEATURE_ID}" — falling back to default connector: ${fallbackId}. Fast model and default model are the SAME.`
    );
    return fallbackId;
  });

  const selectModelId = async (
    opts: ModelSelectionPreferences
  ): Promise<{ connectorId: string; viaFastPath: boolean }> => {
    const { effortLevel = EffortLevels.medium } = opts;
    if (effortLevel === EffortLevels.low) {
      return { connectorId: await getFastModelConnectorId(), viaFastPath: true };
    }
    return { connectorId: await getDefaultConnectorId(), viaFastPath: false };
  };

  const completedCalls: ModelCallInfo[] = [];

  const getUsageStats = (): ModelProviderStats => {
    return {
      calls: completedCalls,
    };
  };

  // Cache key encodes (connectorId, applyReasoning) so the same connector can serve both a
  // reasoning-enabled and reasoning-free variant when it is reached through both the default path and the fast path
  const buildScopedModel = memoizeAsyncByKey(async (key: string): Promise<ScopedModel> => {
    const [connectorId, applyReasoningFlag] = key.split('|');
    const applyReasoning = applyReasoningFlag === 'true';
    const reasoning = applyReasoning && reasoningLevel ? { effort: reasoningLevel } : undefined;

    const completionCallback: InferenceCompleteCallbackHandler = (event) => {
      // Prefer model from provider response, fallback to connector-based model
      let modelName: string | undefined = event.model;
      if (!modelName && connector) {
        try {
          modelName = getConnectorModel(connector);
        } catch (e) {
          // ignore errors
        }
      }

      completedCalls.push({
        connectorId,
        tokens: event.tokens,
        model: modelName,
      });

      if (trackingService && connector) {
        try {
          const provider = getConnectorProvider(connector);
          trackingService.trackLLMUsage(provider, modelName);
        } catch (e) {
          // ignore errors
        }
      }
    };

    const chatModel = await inference.getChatModel({
      request,
      connectorId,
      callbacks: {
        complete: [completionCallback],
      },
      chatModelOptions: {
        telemetryMetadata: resolvedTelemetryMetadata,
        ...(agentId !== undefined ? { agentId } : {}),
        ...(maxContentLength !== undefined ? { maxContentLength } : {}),
        ...(reasoning ? { reasoning } : {}),
      },
    });

    const rawInferenceClient = inference.getClient({
      request,
      bindTo: {
        connectorId,
        metadata: { connectorTelemetry: resolvedTelemetryMetadata },
      },
      callbacks: {
        complete: [completionCallback],
      },
    });
    const inferenceClient = reasoning
      ? wrapBoundInferenceClientWithReasoning(rawInferenceClient, reasoning)
      : rawInferenceClient;
    const connector = await inferenceClient.getConnectorById(connectorId);

    return {
      connector,
      chatModel,
      inferenceClient,
    };
  });

  const getModelById = (
    connectorId: string,
    applyReasoning: boolean = true
  ): Promise<ScopedModel> => {
    return buildScopedModel(`${connectorId}|${applyReasoning && reasoningLevel !== undefined}`);
  };

  const hasFastModel = memoizeAsync(async () => {
    const [fastConnectorId, resolvedDefaultConnectorId] = await Promise.all([
      getFastModelConnectorId(),
      getDefaultConnectorId(),
    ]);
    // getFastModelConnectorId falls back to the default connector when no fast endpoint is
    // configured (no SO override, no EIS recommended endpoint), so a distinct id means a
    // genuinely dedicated (cheaper/faster) fast model exists.
    return fastConnectorId !== resolvedDefaultConnectorId;
  });

  return {
    selectModel: async (opts) => {
      const { connectorId, viaFastPath } = await selectModelId(opts);
      // Fast path never carries reasoning — cheap models are cheap on purpose. When the fast
      // connector falls back to the default, we still return a reasoning-free variant here.
      return getModelById(connectorId, !viaFastPath);
    },
    getDefaultModel: async () => getModelById(await getDefaultConnectorId()),
    getModelById: ({ connectorId }) => getModelById(connectorId),
    hasFastModel,
    getUsageStats,
  };
};

/**
 * Wraps a {@link BoundInferenceClient} so that `chatComplete` calls (direct and via `bindTo`)
 * default to the provider-scoped reasoning config. Caller-supplied `reasoning` on a call always
 * wins — the wrapper only injects when the caller did not provide one.
 */
const wrapBoundInferenceClientWithReasoning = (
  client: BoundInferenceClient,
  reasoning: { effort: ChatCompletionReasoningEffort }
): BoundInferenceClient => {
  const originalChatComplete = client.chatComplete;
  const wrappedChatComplete = ((options: Parameters<BoundInferenceClient['chatComplete']>[0]) => {
    const withReasoning = options.reasoning === undefined ? { ...options, reasoning } : options;
    return originalChatComplete(withReasoning);
  }) as BoundInferenceClient['chatComplete'];

  return {
    ...client,
    chatComplete: wrappedChatComplete,
    // Preserve reasoning through further binds so downstream callers keep the injected default.
    bindTo: (boundOptions) => {
      const bound = client.bindTo(boundOptions);
      return wrapBoundInferenceClientWithReasoning(bound, reasoning);
    },
  };
};
