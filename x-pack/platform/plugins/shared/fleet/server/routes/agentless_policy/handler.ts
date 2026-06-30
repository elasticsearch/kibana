/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import pMap from 'p-map';

import type { CreateAgentlessPolicyRequestSchema } from '../../../common/types';
import type { FleetRequestHandler } from '../../types';
import { appContextService, packagePolicyService } from '../../services';
import { AgentlessPoliciesServiceImpl } from '../../services/agentless/agentless_policies';
import type {
  DeleteAgentlessPolicyRequestSchema,
  GetBulkAgentlessPolicyThroughputRequestSchema,
} from '../../../common/types/rest_spec/agentless_policy';
import { syncAgentlessDeployments } from '../../services/agentless/deployment_sync';
import { agentlessAgentService } from '../../services/agents/agentless_agent';
import { getPolicyThroughput } from '../../services/agentless/throughput';

// Each per-policy search runs a nested date_histogram aggregation; cap it
// to avoid overwhelming the cluster when a page has many agentless policies.
const BULK_THROUGHPUT_CONCURRENCY = 10;

export const syncAgentlessPoliciesHandler: FleetRequestHandler<
  undefined,
  undefined,
  { dryRun?: boolean }
> = async (context, request, response) => {
  const logger = appContextService.getLogger().get('agentless');

  await syncAgentlessDeployments(
    {
      logger,
      agentlessAgentService,
    },
    {
      dryRun: request.body?.dryRun,
    }
  );

  return response.ok({
    body: {
      success: true,
    },
  });
};

export const createAgentlessPolicyHandler: FleetRequestHandler<
  undefined,
  undefined,
  TypeOf<typeof CreateAgentlessPolicyRequestSchema.body>
> = async (context, request, response) => {
  const [coreContext, fleetContext] = await Promise.all([context.core, context.fleet]);

  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;

  const logger = appContextService.getLogger().get('agentless');

  const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
    fleetContext.packagePolicyService.asCurrentUser,
    soClient,
    esClient,
    logger
  );

  const agentlessPolicy = await agentlessPoliciesService.createAgentlessPolicy(
    request.body,
    context,
    request
  );

  return response.ok({
    body: {
      item: agentlessPolicy,
    },
  });
};

export const deleteAgentlessPolicyHandler: FleetRequestHandler<
  TypeOf<typeof DeleteAgentlessPolicyRequestSchema.params>,
  TypeOf<typeof DeleteAgentlessPolicyRequestSchema.query>
> = async (context, request, response) => {
  const [coreContext, fleetContext] = await Promise.all([context.core, context.fleet]);

  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;

  const logger = appContextService.getLogger().get('agentless');

  const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
    fleetContext.packagePolicyService.asCurrentUser,
    soClient,
    esClient,
    logger
  );

  await agentlessPoliciesService.deleteAgentlessPolicy(
    request.params.policyId,
    { force: request.query.force },
    context,
    request
  );

  return response.ok({
    body: {
      id: request.params.policyId,
    },
  });
};

export const getBulkAgentlessPolicyThroughputHandler: FleetRequestHandler<
  undefined,
  undefined,
  TypeOf<typeof GetBulkAgentlessPolicyThroughputRequestSchema.body>
> = async (context, request, response) => {
  const { policyIds } = request.body;
  const coreContext = await context.core;
  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asCurrentUser;

  const packagePolicies = await packagePolicyService.getByIDs(soClient, policyIds, {
    ignoreMissing: true,
  });

  const items = await pMap(
    packagePolicies,
    async (packagePolicy) => {
      try {
        const throughput = await getPolicyThroughput(esClient, packagePolicy);
        return { policyId: packagePolicy.id, ...throughput };
      } catch {
        return { policyId: packagePolicy.id, averagePerSecond: 0, series: [] };
      }
    },
    { concurrency: BULK_THROUGHPUT_CONCURRENCY }
  );

  return response.ok({ body: { items } });
};
