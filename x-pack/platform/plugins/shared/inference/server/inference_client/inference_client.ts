/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type {
  BoundOptions,
  InferenceClient,
  AnonymizationRule,
  InferenceCallbacks,
} from '@kbn/inference-common';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { ActionsClientProvider } from '../types';
import { createChatCompleteApi } from '../chat_complete';
import { createOutputApi } from '../../common/output/create_output_api';
import { bindClient } from '../../common/inference_client/bind_client';
import { getConnectorById } from '../util/get_connector_by_id';
import { getConnectorList } from '../util/get_connector_list';
import { createPromptApi } from '../prompt';
import { createChatCompleteCallbackApi } from '../chat_complete/callback_api';
import type { RegexWorkerService } from '../chat_complete/anonymization/regex_worker_service';
import { createCallbackManager } from './callback_manager';
import type { InferenceAnonymizationOptions } from './anonymization_options';
import type { InferenceEndpointIdCache } from '../util/inference_endpoint_id_cache';
import type { TokenUsageLogger } from '../token_usage';
import type { WorkflowAnonymizationOptions } from './workflow_anonymization_options';

export function createInferenceClient({
  request,
  namespace,
  actions,
  logger,
  anonymizationRulesPromise,
  regexWorker,
  esClient,
  replacementsEsClient,
  endpointIdCache,
  callbacks,
  anonymization,
  workflowAnonymization,
  tokenUsageLogger,
  isTokenUsageTrackingEnabled,
  isDefaultConnectorOnly,
  getDefaultConnectorId,
}: {
  request: KibanaRequest;
  namespace: string;
  logger: Logger;
  actions: ActionsClientProvider;
  anonymizationRulesPromise: Promise<AnonymizationRule[]>;
  regexWorker: RegexWorkerService;
  esClient: ElasticsearchClient;
  replacementsEsClient?: ElasticsearchClient;
  endpointIdCache: InferenceEndpointIdCache;
  callbacks?: InferenceCallbacks;
  anonymization?: InferenceAnonymizationOptions;
  workflowAnonymization?: WorkflowAnonymizationOptions;
  tokenUsageLogger?: TokenUsageLogger;
  isTokenUsageTrackingEnabled?: () => Promise<boolean>;
  isDefaultConnectorOnly?: () => Promise<boolean>;
  getDefaultConnectorId?: () => Promise<string | undefined>;
}): InferenceClient {
  const callbackManager = createCallbackManager(callbacks);

  const callbackApi = createChatCompleteCallbackApi({
    request,
    namespace,
    actions,
    logger,
    anonymizationRulesPromise,
    regexWorker,
    esClient,
    endpointIdCache,
    callbackManager,
    anonymization: {
      ...anonymization,
      replacements: {
        ...anonymization?.replacements,
        ...(replacementsEsClient ? { esClient: replacementsEsClient } : {}),
      },
    },
    workflowAnonymization,
    tokenUsageLogger,
    isTokenUsageTrackingEnabled,
    isDefaultConnectorOnly,
    getDefaultConnectorId,
  });

  const chatComplete = createChatCompleteApi({
    callbackApi,
  });
  const output = createOutputApi(chatComplete);
  const prompt = createPromptApi({
    callbackApi,
  });

  const eventEmitter = callbackManager.asEventEmitter();

  const client: InferenceClient = {
    on: eventEmitter.on.bind(eventEmitter),
    chatComplete,
    output,
    prompt,
    listConnectors: async () => {
      return await getConnectorList({ actions, request, esClient, logger });
    },
    getConnectorById: async (connectorId: string) => {
      return await getConnectorById({ connectorId, actions, request, esClient, logger });
    },
    bindTo: (options: BoundOptions) => {
      return bindClient(client, options);
    },
  };

  return client;
}
