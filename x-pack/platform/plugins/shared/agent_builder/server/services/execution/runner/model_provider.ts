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
import type { ConnectorTelemetryMetadata } from '@kbn/inference-common';
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
}

export type CreateModelProviderFactoryFn = (
  opts: Omit<CreateModelProviderOpts, 'request' | 'defaultConnectorId' | 'telemetryMetadata'>
) => ModelProviderFactoryFn;

export type ModelProviderFactoryFn = (
  opts: Pick<CreateModelProviderOpts, 'request' | 'defaultConnectorId' | 'telemetryMetadata'>
) => ModelProvider;

const memoizeAsync = <T>(fn: () => Promise<T>): (() => Promise<T>) => {
  let cached: Promise<T> | undefined;
  return () => (cached ??= fn());
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
    let connectorId: string | undefined;

    const { endpoints } = await searchInferenceEndpoints.endpoints.getForFeature(
      AGENT_BUILDER_FAST_INFERENCE_FEATURE_ID,
      request
    );

    const recommendedEndpoint = endpoints.filter((endpoint) => endpoint.isRecommended);
    if (recommendedEndpoint.length > 0) {
      connectorId = recommendedEndpoint[0].connectorId;
    }

    if (!connectorId) {
      connectorId = await getDefaultConnectorId();
    }

    logger.debug(`[getFastModelConnectorId] Using connectorId: ${connectorId}`);

    return connectorId;
  });

  getFastModelConnectorId().catch(() => undefined);

  const selectModelId = async (opts: ModelSelectionPreferences): Promise<string> => {
    const { effortLevel = EffortLevels.medium } = opts;
    if (effortLevel === EffortLevels.low) {
      return await getFastModelConnectorId();
    } else {
      return await getDefaultConnectorId();
    }
  };

  const completedCalls: ModelCallInfo[] = [];

  const getUsageStats = (): ModelProviderStats => {
    return {
      calls: completedCalls,
    };
  };

  const getModelById = async (connectorId: string): Promise<ScopedModel> => {
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
      },
    });

    const inferenceClient = inference.getClient({
      request,
      bindTo: {
        connectorId,
        ...(telemetryMetadata ? { metadata: { connectorTelemetry: telemetryMetadata } } : {}),
      },
      callbacks: {
        complete: [completionCallback],
      },
    });
    const connector = await inferenceClient.getConnectorById(connectorId);

    return {
      connector,
      chatModel,
      inferenceClient,
    };
  };

  return {
    selectModel: async (opts) => getModelById(await selectModelId(opts)),
    getDefaultModel: async () => getModelById(await getDefaultConnectorId()),
    getModelById: ({ connectorId }) => getModelById(connectorId),
    getUsageStats,
  };
};
