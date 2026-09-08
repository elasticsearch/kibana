/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_SPACE_ID, brandSpaceId, type SpaceId } from '@kbn/core-spaces-common';
import { chunk, sortBy } from 'lodash';

import { agentPolicyService, appContextService } from '..';
import { DEPLOY_AGENT_POLICIES_BATCH_SIZE } from '../../constants';
import { runWithCache } from '../epm/packages/cache';

const TASK_TYPE = 'fleet:deploy_agent_policies';

interface DeployAgentPoliciesTaskParams {
  agentPolicyIdsWithSpace: Array<{ id: string; spaceId: SpaceId }>;
}

export function registerDeployAgentPoliciesTask(taskManagerSetup: TaskManagerSetupContract) {
  taskManagerSetup.registerTaskDefinitions({
    [TASK_TYPE]: {
      title: 'Fleet Deploy policies',
      timeout: '5m',
      maxAttempts: 3,
      paramsSchema: schema.object({
        agentPolicyIdsWithSpace: schema.arrayOf(
          schema.object({
            id: schema.string({ maxLength: 255 }),
            spaceId: schema.maybe(schema.string({ maxLength: 255 })),
          }),
          { maxSize: DEPLOY_AGENT_POLICIES_BATCH_SIZE }
        ),
      }),
      createTaskRunner: ({ taskInstance, signal }) => {
        return {
          async run() {
            const rawParams = taskInstance.params as {
              agentPolicyIdsWithSpace: Array<{ id: string; spaceId?: string }>;
            };
            const params: DeployAgentPoliciesTaskParams = {
              agentPolicyIdsWithSpace: rawParams.agentPolicyIdsWithSpace.map(({ id, spaceId }) => ({
                id,
                spaceId: brandSpaceId(spaceId ?? DEFAULT_SPACE_ID),
              })),
            };
            const { agentPolicyIdsWithSpace } = params;

            if (!agentPolicyIdsWithSpace.length) {
              return;
            }
            appContextService
              .getLogger()
              .debug(`Deploying ${agentPolicyIdsWithSpace.length} policies`);
            const agentPoliciesIdsIndexedBySpace = agentPolicyIdsWithSpace.reduce(
              (acc, { id, spaceId }) => {
                if (!acc[spaceId]) {
                  acc[spaceId] = [];
                }

                acc[spaceId].push(id);

                return acc;
              },
              {} as { [k: string]: string[] }
            );

            await runWithCache(async () => {
              for (const [spaceId, agentPolicyIds] of Object.entries(
                agentPoliciesIdsIndexedBySpace
              )) {
                if (signal.aborted) {
                  appContextService
                    .getLogger()
                    .warn('Deploy agent policies task was cancelled before completing all spaces');
                  return;
                }
                await agentPolicyService.deployPolicies(
                  appContextService.getInternalUserSOClientForSpaceId(spaceId),
                  agentPolicyIds
                );
              }
            });
          },
        };
      },
    },
  });
}

export async function scheduleDeployAgentPoliciesTask(
  taskManagerStart: TaskManagerStartContract,
  agentPolicyIdsWithSpace: Array<{ id: string; spaceId?: string }>,
  options: { coalesce?: boolean } = {}
) {
  if (!agentPolicyIdsWithSpace.length) {
    return;
  }

  const coalesce = options.coalesce !== false;

  // Single-policy deploys share a stable task id so repeated bumps while a deploy
  // is already queued collapse into one run. Adhoc ensureScheduled is a no-op when
  // that task is currently running; deployPolicies schedules a unique follow-up
  // if the SO revision moved during the in-flight run.
  if (coalesce && agentPolicyIdsWithSpace.length === 1) {
    const { id, spaceId } = agentPolicyIdsWithSpace[0];
    const space = spaceId ?? DEFAULT_SPACE_ID;
    await taskManagerStart.ensureScheduled({
      id: `${TASK_TYPE}:${space}:${id}`,
      scope: ['fleet'],
      params: { agentPolicyIdsWithSpace: [{ id, spaceId: space }] },
      taskType: TASK_TYPE,
      runAt: new Date(Date.now() + 3 * 1000),
      state: {},
    });
    return;
  }

  const sorted = sortBy(agentPolicyIdsWithSpace, (p) => p.spaceId ?? '');
  const batches = chunk(sorted, DEPLOY_AGENT_POLICIES_BATCH_SIZE);
  await Promise.all(
    batches.map((batch, index) =>
      taskManagerStart.schedule({
        id: `${TASK_TYPE}:${uuidv4()}`,
        scope: ['fleet'],
        params: { agentPolicyIdsWithSpace: batch },
        taskType: TASK_TYPE,
        // Stagger batches 10s apart so concurrent deploys don't spike memory
        runAt: new Date(Date.now() + 3 * 1000 + index * 10 * 1000),
        state: {},
      })
    )
  );
}
