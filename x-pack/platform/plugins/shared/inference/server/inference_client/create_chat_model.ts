/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import { InferenceChatModel, type InferenceChatModelParams } from '@kbn/inference-langchain';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { AnonymizationRule, InferenceCallbacks } from '@kbn/inference-common';
import type { ActionsClientProvider } from '../types';
import { getConnectorById } from '../util/get_connector_by_id';
import { createClient } from './create_client';
import type { RegexWorkerService } from '../chat_complete/anonymization/regex_worker_service';
import type { InferenceAnonymizationOptions } from './anonymization_options';
import type { InferenceEndpointIdCache } from '../util/inference_endpoint_id_cache';
import type { TokenUsageLogger } from '../token_usage';
import type { WorkflowAnonymizationOptions } from './workflow_anonymization_options';

export interface CreateChatModelOptions {
  request: KibanaRequest;
  namespace: string;
  connectorId: string;
  actions: ActionsClientProvider;
  logger: Logger;
  chatModelOptions: Omit<InferenceChatModelParams, 'connector' | 'chatComplete' | 'logger'>;
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
}

export const createChatModel = async ({
  request,
  namespace,
  connectorId,
  actions,
  logger,
  chatModelOptions,
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
}: CreateChatModelOptions): Promise<InferenceChatModel> => {
  const client = createClient({
    actions,
    request,
    namespace,
    anonymizationRulesPromise,
    regexWorker,
    esClient,
    ...(replacementsEsClient ? { replacementsEsClient } : {}),
    endpointIdCache,
    logger,
    callbacks,
    anonymization,
    workflowAnonymization,
    tokenUsageLogger,
    isTokenUsageTrackingEnabled,
    isDefaultConnectorOnly,
    getDefaultConnectorId,
  });
  const connector = await getConnectorById({ connectorId, actions, request, esClient, logger });
  return new InferenceChatModel({
    ...chatModelOptions,
    chatComplete: client.chatComplete,
    connector,
  });
};
