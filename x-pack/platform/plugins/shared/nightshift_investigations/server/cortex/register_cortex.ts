/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { ContextEnginePluginSetup } from '@kbn/context-engine-plugin/server';
import { SIGNIFICANT_EVENTS_INVESTIGATION_INFERENCE_FEATURE_ID } from '@kbn/significant-events-schema';
import { i18n } from '@kbn/i18n';
import { CORTEX_AI_INDEX_DEST, CORTEX_AI_INDEX_ID } from '../../common/cortex';
import { NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID } from '../agents/deductive_investigation';
import type { SandboxApiClient } from '../tools/sandbox_bash/grpc_client';
import { materializeCortex } from './materialize';
import { createLlmProposeCortexEdits, optimizeCortex } from './optimize';
import { createCortexPageStore, type CortexPageStore } from './page_store';

export const createCortexStore = ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): CortexPageStore => createCortexPageStore({ esClient, logger });

export const registerCortexAiIndex = (
  contextEngine: ContextEnginePluginSetup | undefined,
  logger: Logger
): void => {
  if (!contextEngine) {
    logger.debug('contextEngine is not available — Cortex AI index will not be registered');
    return;
  }

  contextEngine.registerAiIndex(CORTEX_AI_INDEX_ID, {
    description: i18n.translate('xpack.nightshiftInvestigations.cortex.aiIndexDescription', {
      defaultMessage:
        'Nightshift Cortex wiki pages — durable, cross-linked knowledge the investigator reads before each run.',
    }),
    dest: { type: 'index', value: CORTEX_AI_INDEX_DEST },
    automations: [],
    sources: [],
  });
};

export const hydrateCortexWorkspace = async ({
  apiClient,
  conversationId,
  esClient,
  logger,
}: {
  apiClient: SandboxApiClient;
  conversationId: string;
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<void> => {
  const store = createCortexStore({ esClient, logger });
  await materializeCortex({ apiClient, conversationId, store, logger });
};

export const runCortexOptimize = async ({
  request,
  agentId,
  userMessage,
  assistantMessage,
  esClient,
  getInference,
  getSearchInferenceEndpoints,
  logger,
}: {
  request: KibanaRequest;
  agentId?: string;
  userMessage: string;
  assistantMessage: string;
  esClient: ElasticsearchClient;
  getInference: () => InferenceServerStart | undefined;
  getSearchInferenceEndpoints: () => SearchInferenceEndpointsPluginStart | undefined;
  logger: Logger;
}): Promise<void> => {
  // Only the deductive investigator writes to Cortex: it is the one agent whose post-execution
  // hook runs this workflow, and other agents' rounds must not edit the wiki.
  const resolvedAgentId = agentId !== undefined && agentId.length > 0 ? agentId : undefined;
  if (
    resolvedAgentId !== undefined &&
    resolvedAgentId !== NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID
  ) {
    return;
  }

  const inference = getInference();
  const searchInferenceEndpoints = getSearchInferenceEndpoints();
  if (!inference || !searchInferenceEndpoints) {
    logger.debug('Cortex optimizer skipped — inference or connectors unavailable');
    return;
  }

  const { endpoints } = await searchInferenceEndpoints.endpoints.getForFeature(
    SIGNIFICANT_EVENTS_INVESTIGATION_INFERENCE_FEATURE_ID,
    request
  );
  const connectorId = endpoints[0]?.connectorId;
  if (!connectorId) {
    logger.debug('Cortex optimizer skipped — no investigation inference connector');
    return;
  }

  const store = createCortexStore({ esClient, logger });
  const inferenceClient = inference.getClient({ request });
  await optimizeCortex({
    store,
    proposeEdits: createLlmProposeCortexEdits({ inferenceClient, connectorId }),
    userMessage,
    assistantMessage,
    logger,
  });
};
