/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger, ScoutParallelWorkerFixtures } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';

// `.logs-endpoint.actions` is a Fleet-managed data stream. Its index template maps `type` and
// `data.alert_id` as aliases to `EndpointActions.type` / `EndpointActions.data.alert_id`, which is
// what the flyout's response-actions search strategy filters on.
const ENDPOINT_ACTIONS_INDEX = '.logs-endpoint.actions-default';
// Writing to the internal data stream requires the Fleet product-origin header.
const FLEET_HEADERS = { headers: { 'x-elastic-product-origin': 'fleet' } } as const;

export interface ResponseActionsApiService {
  /**
   * Indexes an automated endpoint response action request linked to the given alert id, so the
   * alert's response section renders a result instead of the empty state. Returns the generated
   * `actionId`.
   */
  seedAutomatedEndpointAction: (options: {
    alertId: string;
    ruleName: string;
  }) => Promise<{ actionId: string }>;
  /**
   * Deletes the response action requests seeded for this worker's space.
   * Safe to call even if nothing was seeded. Call unconditionally in `afterEach`.
   */
  cleanupResponseActions: () => Promise<void>;
}

export const getResponseActionsApiService = ({
  esClient,
  log,
  scoutSpace,
}: {
  esClient: EsClient;
  log: ScoutLogger;
  scoutSpace?: ScoutParallelWorkerFixtures['scoutSpace'];
}): ResponseActionsApiService => {
  const space = scoutSpace?.id ? scoutSpace.id : 'default';

  const service: ResponseActionsApiService = {
    seedAutomatedEndpointAction: async ({ alertId, ruleName }) => {
      return measurePerformanceAsync(
        log,
        'security.responseActions.seedAutomatedEndpointAction',
        async () => {
          const actionId = `scout-response-action-${space}-${Date.now()}`;
          const agentId = `scout-response-agent-${space}`;
          const hostName = `scout-response-host-${space}`;
          const now = new Date();
          // Expiration must be in the future so the action is treated as live/valid.
          const expiration = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

          // Mirrors the document shape the endpoint response actions client writes for an
          // automated action, which the response flyout knows how to render.
          const indexResponse = await esClient.index(
            {
              index: ENDPOINT_ACTIONS_INDEX,
              refresh: true,
              document: {
                '@timestamp': now.toISOString(),
                originSpaceId: space,
                tags: [],
                agent: { id: [agentId], policy: [] },
                EndpointActions: {
                  action_id: actionId,
                  expiration,
                  type: 'INPUT_ACTION',
                  input_type: 'endpoint',
                  data: {
                    command: 'isolate',
                    comment: 'Automated response action seeded by Scout',
                    // `alert_id` links the action to the alert the flyout renders.
                    alert_id: [alertId],
                    hosts: { [agentId]: { name: hostName } },
                    parameters: {},
                  },
                },
                user: { id: 'elastic' },
                rule: { id: `scout-response-rule-${space}`, name: ruleName },
              },
            },
            FLEET_HEADERS
          );

          // Guardrail: the flyout renders nothing if the action document never landed.
          if (indexResponse.result !== 'created') {
            throw new Error(
              `Failed to seed response action ${actionId}: unexpected index result "${indexResponse.result}"`
            );
          }

          return { actionId };
        }
      );
    },

    cleanupResponseActions: async () => {
      await measurePerformanceAsync(
        log,
        'security.responseActions.cleanupResponseActions',
        async () => {
          await esClient.deleteByQuery(
            {
              index: ENDPOINT_ACTIONS_INDEX,
              query: { term: { originSpaceId: space } },
              conflicts: 'proceed',
              refresh: true,
              ignore_unavailable: true,
            },
            FLEET_HEADERS
          );
        }
      );
    },
  };

  return service;
};
