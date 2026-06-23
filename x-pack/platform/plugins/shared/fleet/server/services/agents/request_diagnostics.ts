/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import type { RequestDiagnosticsAdditionalMetrics } from '../../../common/types';

import { SO_SEARCH_LIMIT, REQUEST_DIAGNOSTICS_TIMEOUT_MS } from '../../constants';

import { getCurrentNamespace } from '../spaces/get_current_namespace';

import type { GetAgentsOptions } from '.';
import { getAgents, getAgentsByKuery } from './crud';
import { createAgentAction } from './actions';
import { openPointInTime } from './crud';
import {
  RequestDiagnosticsActionRunner,
  requestDiagnosticsBatch,
} from './request_diagnostics_action_runner';

export async function requestDiagnostics(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  agentId: string,
  additionalMetrics?: RequestDiagnosticsAdditionalMetrics[]
): Promise<{ actionId: string }> {
  const currentSpaceId = getCurrentNamespace(soClient);

  const response = await createAgentAction(esClient, soClient, {
    agents: [agentId],
    created_at: new Date().toISOString(),
    type: 'REQUEST_DIAGNOSTICS',
    expiration: new Date(Date.now() + REQUEST_DIAGNOSTICS_TIMEOUT_MS).toISOString(),
    data: {
      additional_metrics: additionalMetrics,
    },
    namespaces: [currentSpaceId],
  });
  return { actionId: response.id };
}

export async function bulkRequestDiagnostics(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  options: GetAgentsOptions & {
    batchSize?: number;
    additionalMetrics?: RequestDiagnosticsAdditionalMetrics[];
  }
): Promise<{ actionId: string }> {
  const currentSpaceId = getCurrentNamespace(soClient);

  if ('agentIds' in options) {
    const givenAgents = await getAgents(esClient, soClient, options);
    return await requestDiagnosticsBatch(esClient, givenAgents, {
      additionalMetrics: options.additionalMetrics,
      spaceId: currentSpaceId,
    });
  }

  const batchSize = options.batchSize ?? SO_SEARCH_LIMIT;

  // cheap count — avoids hydrating up to batchSize agent documents just to read the total
  const { total } = await getAgentsByKuery(esClient, soClient, {
    kuery: options.kuery,
    spaceId: currentSpaceId,
    showInactive: false,
    page: 1,
    perPage: 0,
  });
  if (total <= batchSize) {
    const res = await getAgentsByKuery(esClient, soClient, {
      kuery: options.kuery,
      spaceId: currentSpaceId,
      showInactive: false,
      page: 1,
      perPage: batchSize,
    });
    return await requestDiagnosticsBatch(esClient, res.agents, {
      additionalMetrics: options.additionalMetrics,
      spaceId: currentSpaceId,
    });
  } else {
    return await new RequestDiagnosticsActionRunner(
      esClient,
      soClient,
      {
        ...options,
        batchSize,
        total,
        spaceId: currentSpaceId,
      },
      { pitId: await openPointInTime(esClient) }
    ).runActionAsyncTask();
  }
}
