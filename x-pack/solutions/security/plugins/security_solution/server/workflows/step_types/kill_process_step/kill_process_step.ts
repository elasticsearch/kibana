/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { createPollServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ExecutionError } from '@kbn/workflows/server';
import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import { getActionDetailsById } from '../../../endpoint/services/actions';
import { killProcessStepCommonDefinition } from '../../../../common/workflows/step_types/kill_process_step/kill_process_step_common';

const pollStateSchema = z.object({
  action_id: z.string(),
});

export const createKillProcessStepDefinition = (
  endpointAppContextService: EndpointAppContextService
) =>
  createPollServerStepDefinition({
    ...killProcessStepCommonDefinition,
    stateSchema: pollStateSchema,
    policy: { strategy: 'fixed', intervalMs: 10_000 },
    ceilings: { maxAttempts: 60, maxWaitMs: 600_000 },
    start: async (context) => {
      const { endpoint_ids: endpointIds, parameters, comment } = context.input;
      const spaceId = context.contextManager.getContext().workflow.spaceId;
      const request = context.contextManager.getFakeRequest();

      // The internal response-actions client runs as an automated, unsecured
      // client and skips the per-user privilege checks the HTTP route enforces
      // via `withEndpointAuthz({ all: ['canKillProcess'] })`. Assert the
      // caller's privilege here so reaching the API via workflow step cannot bypass
      // endpoint RBAC.
      const authz = await endpointAppContextService.getEndpointAuthz(request);
      if (!authz.canKillProcess) {
        throw new ExecutionError({
          type: 'PermissionError',
          message: 'The workflow user does not have the canKillProcess endpoint privilege.',
        });
      }

      // Attribute the action to the initiating analyst (falls back to the
      // default system user when the current user cannot be resolved) so the
      // Response Actions audit trail records who requested it, not `elastic`.
      const username = endpointAppContextService.getCurrentUsername(request);

      const client = endpointAppContextService.getInternalResponseActionsClient({
        spaceId,
        username,
        agentType: 'endpoint',
        isAutomated: false,
      });

      const dispatched = await client.killProcess({
        endpoint_ids: endpointIds,
        parameters,
        comment: comment ?? '',
      });

      return { state: { action_id: dispatched.id } };
    },
    poll: async (context) => {
      const spaceId = context.contextManager.getContext().workflow.spaceId;
      const actionId = context.state?.action_id;

      if (!actionId) {
        throw new ExecutionError({
          type: 'ValidationError',
          message: 'Missing action_id in poll state.',
        });
      }

      const details = await getActionDetailsById(endpointAppContextService, spaceId, actionId);

      if (!details.isCompleted) {
        return undefined;
      }

      return {
        output: {
          action_id: details.id,
          status: details.status,
          was_successful: details.wasSuccessful,
          message: details.wasSuccessful
            ? `Kill-process action completed successfully. Action ID: ${details.id}`
            : `Kill-process action failed. Action ID: ${details.id}`,
        },
      };
    },
  });
