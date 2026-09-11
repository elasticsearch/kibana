/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type {
  BoundOptions,
  BoundInferenceClient,
  InferenceClient,
  AnonymizationRule,
  InferenceCallbacks,
} from '@kbn/inference-common';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { ActionsClientProvider } from '../types';
import { createInferenceClient } from './inference_client';
import { bindClient } from '../../common/inference_client/bind_client';
import type { RegexWorkerService } from '../chat_complete/anonymization/regex_worker_service';
import type { InferenceAnonymizationOptions } from './anonymization_options';
import type { InferenceEndpointIdCache } from '../util/inference_endpoint_id_cache';
import type { TokenUsageLogger } from '../token_usage';
import type { WorkflowAnonymizationOptions } from './workflow_anonymization_options';

interface CreateClientOptions {
  request: KibanaRequest;
  namespace?: string;
  actions: ActionsClientProvider;
  logger: Logger;
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

interface BoundCreateClientOptions extends CreateClientOptions {
  bindTo: BoundOptions;
}

export function createClient(options: CreateClientOptions): InferenceClient;
export function createClient(options: BoundCreateClientOptions): BoundInferenceClient;
export function createClient(
  options: CreateClientOptions | BoundCreateClientOptions
): BoundInferenceClient | InferenceClient {
  const {
    actions,
    request,
    namespace,
    logger,
    anonymizationRulesPromise,
    esClient,
    regexWorker,
    replacementsEsClient,
    endpointIdCache,
    callbacks,
    anonymization,
    workflowAnonymization,
    tokenUsageLogger,
    isTokenUsageTrackingEnabled,
    isDefaultConnectorOnly,
    getDefaultConnectorId,
  } = options;
  const client = createInferenceClient({
    request,
    namespace: namespace ?? 'default',
    actions,
    logger: logger.get('client'),
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
  });
  if ('bindTo' in options) {
    return bindClient(client, options.bindTo);
  } else {
    return client;
  }
}

interface CreateClientWithoutRequestOptions {
  actionsClient: PublicMethodsOf<ActionsClient>;
  logger: Logger;
  regexWorker: RegexWorkerService;
  esClient: ElasticsearchClient;
  endpointIdCache: InferenceEndpointIdCache;
}

/**
 * Creates an inference client using pre-scoped services instead of a KibanaRequest.
 * Useful for background tasks (e.g. alerting rule executors) that have scoped clients
 * but no HTTP request context.
 *
 * Internally wraps the actionsClient in an actions-like object so that the underlying
 * createInferenceClient can resolve connectors. Anonymization is not available.
 */
export const createClientWithoutRequest = ({
  actionsClient,
  logger,
  regexWorker,
  esClient,
  endpointIdCache,
}: CreateClientWithoutRequestOptions): InferenceClient => {
  // Wrap the pre-scoped actionsClient so that any internal code calling
  // actions.getActionsClientWithRequest() receives this client directly.
  const actions: ActionsClientProvider = {
    getActionsClientWithRequest: () => Promise.resolve(actionsClient),
  };

  return createInferenceClient({
    request: {} as KibanaRequest,
    namespace: 'default',
    actions,
    logger: logger.get('client'),
    anonymizationRulesPromise: Promise.resolve([]),
    regexWorker,
    esClient,
    endpointIdCache,
  });
};
