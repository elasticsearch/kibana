/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ActionsClient, InMemoryConnector } from '@kbn/actions-plugin/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { InferenceConnector, RawConnector } from '@kbn/inference-common';
import {
  isSupportedConnector,
  connectorToInference,
  InferenceConnectorType,
} from '@kbn/inference-common';
import type { ActionsClientProvider } from '../types';
import { getInferenceEndpoints } from './get_inference_endpoints';

interface GetConnectorListWithRequestOptions {
  actions: ActionsClientProvider;
  request: KibanaRequest;
  esClient: ElasticsearchClient;
  logger: Logger;
}

interface GetConnectorListWithActionsClientOptions {
  actionsClient: PublicMethodsOf<ActionsClient>;
  esClient: ElasticsearchClient;
  logger: Logger;
}

type GetConnectorListOptions =
  | GetConnectorListWithRequestOptions
  | GetConnectorListWithActionsClientOptions;

const getActionsClient = async (
  options: GetConnectorListOptions
): Promise<PublicMethodsOf<ActionsClient>> => {
  if ('actionsClient' in options) {
    return options.actionsClient;
  }
  return options.actions.getActionsClientWithRequest(options.request);
};

export const getConnectorList = async (
  options: GetConnectorListOptions
): Promise<InferenceConnector[]> => {
  const { esClient, logger } = options;

  const [connectorsResult, endpointsResult] = await Promise.allSettled([
    getStackConnectors(options),
    getInferenceEndpoints({ esClient, taskType: 'chat_completion' }),
  ]);

  if (connectorsResult.status === 'rejected' && endpointsResult.status === 'rejected') {
    throw new Error(
      `Failed to retrieve connectors and inference endpoints: ${connectorsResult.reason}, ${endpointsResult.reason}`
    );
  }

  if (connectorsResult.status === 'rejected') {
    // Log the error but continue, as we may still have inference endpoints to return
    logger.debug(`Failed to retrieve connectors: ${connectorsResult.reason}`);
  }

  if (endpointsResult.status === 'rejected') {
    // Log the error but continue, as we may still have connectors to return
    logger.debug(`Failed to retrieve inference endpoints: ${endpointsResult.reason}`);
  }

  const connectors = connectorsResult.status === 'fulfilled' ? connectorsResult.value : [];
  const endpoints = endpointsResult.status === 'fulfilled' ? endpointsResult.value : [];

  const stackConnectorByInferenceId = new Map(
    connectors
      .filter((c) => c.type === InferenceConnectorType.Inference)
      .map((c) => [c.config?.inferenceId as string, c])
  );

  const inferenceEndpointConnectors: (InferenceConnector & { creator?: string })[] = endpoints.map(
    (ep) => ({
      ...ep,
      type: InferenceConnectorType.Inference,
      name:
        ep.metadata?.display?.name ??
        stackConnectorByInferenceId.get(ep.inferenceId)?.name ??
        ep.inferenceId,
      creator: ep.metadata?.display?.model_creator,
      connectorId: ep.inferenceId,
      config: {
        inferenceId: ep.inferenceId,
        providerConfig: {
          model_id: ep.serviceSettings?.model_id, // for backwards compatibility, consider removing in future
        },
        taskType: ep.taskType,
        service: ep.service,
        serviceSettings: ep.serviceSettings,
        modelCreator: ep.metadata?.display?.model_creator,
      },
      capabilities: {},
      isInferenceEndpoint: true,
      isPreconfigured: !!ep.metadata?.display?.name,
      isEis: ep.service === 'elastic',
      metadata: ep.metadata,
    })
  );

  // Exclude .inference stack connectors that have a corresponding ES inference endpoint,
  // since the endpoint representation is preferred (includes native endpoints too).
  const endpointInferenceIds = new Set(endpoints.map((ep) => ep.inferenceId));
  const filteredConnectors = connectors.filter(
    (c) =>
      c.type !== InferenceConnectorType.Inference ||
      !endpointInferenceIds.has(c.config?.inferenceId as string)
  );

  return [...filteredConnectors, ...inferenceEndpointConnectors];
};

/**
 * Returns the list of in-memory (preconfigured + dynamic) connectors known to
 * the actions plugin, when accessible. The actions plugin only exposes
 * `inMemoryConnectors` on the full `PluginStartContract`, so request-bound
 * paths (`actionsClient`-only) won't have them — in that case we just return
 * an empty list and accept the API-level config stripping. The check is
 * defensive (`'inMemoryConnectors' in options`) so test mocks of
 * {@link ActionsClientProvider} that don't supply the field continue to work.
 */
const getInMemoryConnectorList = (options: GetConnectorListOptions): InMemoryConnector[] => {
  if ('actions' in options && options.actions.inMemoryConnectors) {
    return options.actions.inMemoryConnectors;
  }
  return [];
};

/**
 * Preconfigured connectors strip their `config` from `actionsClient.getAll()`
 * unless the user opts in via `exposeConfig: true` in `kibana.yml`. The
 * inference plugin needs that config server-side for capability detection
 * (e.g. spotting Azure-hosted gpt-5 / o1 / o3 deployments that must omit
 * `temperature`). We re-attach the missing config from the in-memory
 * connector registry, which is server-only state — this never crosses the
 * HTTP boundary unless a downstream caller chooses to surface it.
 *
 * Non-preconfigured connectors and connectors that already have a populated
 * `config` are left untouched.
 */
const enrichPreconfiguredConfig = (
  connector: RawConnector,
  inMemoryById: Map<string, InMemoryConnector>
): RawConnector => {
  if (!connector.isPreconfigured) return connector;
  if (connector.config && Object.keys(connector.config).length > 0) return connector;
  const inMemory = inMemoryById.get(connector.id);
  if (!inMemory?.config) return connector;
  return { ...connector, config: inMemory.config };
};

const getStackConnectors = async (
  options: GetConnectorListOptions
): Promise<InferenceConnector[]> => {
  const actionClient = await getActionsClient(options);

  const allConnectors = await actionClient.getAll({
    includeSystemActions: false,
  });

  const inMemoryConnectors = getInMemoryConnectorList(options);
  const inMemoryById = new Map(inMemoryConnectors.map((c) => [c.id, c]));

  return allConnectors
    .filter((connector) => isSupportedConnector(connector))
    .map((connector) => enrichPreconfiguredConfig(connector, inMemoryById))
    .map(connectorToInference);
};
