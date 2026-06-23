/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import { isAgentMigrationSupported, MINIMUM_MIGRATE_AGENT_VERSION } from '../../../common/services';
import { FleetError, FleetUnauthorizedError } from '../../errors';

import type { AgentPolicy, Agent } from '../../types';

import { getCurrentNamespace } from '../spaces/get_current_namespace';

import { SO_SEARCH_LIMIT } from '../../constants';

import { appContextService, licenseService } from '..';
import { LICENSE_FOR_AGENT_MIGRATION } from '../../../common/constants';

import type { AgentActionEvent } from '../action_sender';
import { sendActionTelemetryEvents } from '../action_sender';

import { createAgentAction } from './actions';
import type { GetAgentsOptions } from './crud';
import { getAgents, getAgentsByKuery, openPointInTime } from './crud';

import { MigrateActionRunner, bulkMigrateAgentsBatch } from './migrate_action_runner';
import { detectTargetClusterType } from './detect_target_cluster_type';

export async function migrateSingleAgent(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  agentId: string,
  agentPolicy: AgentPolicy | undefined,
  agent: Agent,
  options: {
    policyId?: string;
    enrollment_token: string;
    uri: string;
    settings?: Record<string, any>;
  }
) {
  // Check the user has the correct license
  if (!licenseService.hasAtLeast(LICENSE_FOR_AGENT_MIGRATION)) {
    throw new FleetUnauthorizedError(
      `Agent migration requires an ${LICENSE_FOR_AGENT_MIGRATION} license. Please upgrade your license.`
    );
  }

  //  If the agent belongs to a policy that is protected or has fleet-server as a component meaning its a fleet server agent, throw an error
  if (agentPolicy?.is_protected) {
    throw new FleetUnauthorizedError(`Agent is protected and cannot be migrated`);
  }
  if (agent.components?.some((c) => c.type === 'fleet-server')) {
    throw new FleetUnauthorizedError(`Fleet server agents cannot be migrated`);
  }
  if (!isAgentMigrationSupported(agent)) {
    // Check if it's specifically a containerized agent
    if (agent.local_metadata?.elastic?.agent?.upgradeable === false) {
      throw new FleetError(`Containerized agents cannot be migrated`);
    }
    // Otherwise it's a version issue
    throw new FleetError(
      `Agent cannot be migrated. Migrate action is supported from version ${MINIMUM_MIGRATE_AGENT_VERSION}.`
    );
  }

  const targetType = detectTargetClusterType(options.uri);
  appContextService
    .getLogger()
    .debug(`Detected target cluster type for migration telemetry: ${targetType}`);
  const response = await createAgentAction(esClient, soClient, {
    agents: [agentId],
    created_at: new Date().toISOString(),
    type: 'MIGRATE',
    policyId: options.policyId,
    data: {
      target_uri: options.uri,
      settings: options.settings,
    },
    ...(options.enrollment_token && {
      secrets: { enrollment_token: options.enrollment_token },
    }),
  });

  const cloud = appContextService.getCloud();
  sendTelemetryEvent(1, {
    sourceType: cloud?.isCloudEnabled
      ? cloud.isServerlessEnabled
        ? 'serverless'
        : 'ech'
      : undefined,
    targetType,
  });

  return { actionId: response.id };
}

function sendTelemetryEvent(
  agentCount: number,
  clusterInfo: {
    sourceType?: AgentActionEvent['sourceType'];
    targetType?: AgentActionEvent['targetType'];
  }
) {
  const { sourceType, targetType } = clusterInfo;
  const actionTelemetry: AgentActionEvent = {
    eventType: 'MIGRATE',
    agentCount,
    sourceType,
    targetType,
  };
  sendActionTelemetryEvents(
    appContextService.getLogger(),
    appContextService.getTelemetryEventsSender(),
    actionTelemetry
  );
}

export async function bulkMigrateAgents(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  options: GetAgentsOptions & {
    batchSize?: number;
    enrollment_token: string;
    uri: string;
    settings?: Record<string, any>;
  }
): Promise<{ actionId: string }> {
  // Check the user has the correct license
  if (!licenseService.hasAtLeast(LICENSE_FOR_AGENT_MIGRATION)) {
    throw new FleetUnauthorizedError(
      `Agent migration requires an ${LICENSE_FOR_AGENT_MIGRATION} license. Please upgrade your license.`
    );
  }

  const currentSpaceId = getCurrentNamespace(soClient);
  const targetType = detectTargetClusterType(options.uri);
  appContextService
    .getLogger()
    .debug(`Detected target cluster type for migration telemetry: ${targetType}`);
  const cloud = appContextService.getCloud();
  const clusterInfo = {
    sourceType: cloud?.isCloudEnabled
      ? cloud.isServerlessEnabled
        ? ('serverless' as const)
        : ('ech' as const)
      : undefined,
    targetType,
  };

  if ('agentIds' in options) {
    const givenAgents = await getAgents(esClient, soClient, options);
    const response = await bulkMigrateAgentsBatch(esClient, soClient, givenAgents, {
      enrollment_token: options.enrollment_token,
      uri: options.uri,
      settings: options.settings,
      spaceId: currentSpaceId,
    });
    sendTelemetryEvent(options.agentIds.length, clusterInfo);
    return response;
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
    const response = await bulkMigrateAgentsBatch(esClient, soClient, res.agents, {
      enrollment_token: options.enrollment_token,
      uri: options.uri,
      settings: options.settings,
      spaceId: currentSpaceId,
    });
    sendTelemetryEvent(total, clusterInfo);
    return response;
  } else {
    const response = await new MigrateActionRunner(
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
    sendTelemetryEvent(total, clusterInfo);
    return response;
  }
}
