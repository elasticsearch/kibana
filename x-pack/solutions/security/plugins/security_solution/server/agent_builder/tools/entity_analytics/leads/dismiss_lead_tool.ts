/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../../plugin_contract';
import { getLeadToolAvailability } from './lead_availability';
import { createLeadDataClient } from '../../../../lib/entity_analytics/lead_generation/lead_data_client';
import { getUserLeadPrivileges } from '../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges';
import { securityTool } from '../../constants';

export const SECURITY_DISMISS_LEAD_TOOL_ID = securityTool('dismiss_lead');

const schema = z.object({
  id: z.string().min(1).describe('The ID of the lead to dismiss.'),
  title: z
    .string()
    .optional()
    .describe(
      'The lead title, shown to the user in the confirmation prompt. Pass this when available from list_leads.'
    ),
});

export const dismissLeadTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_DISMISS_LEAD_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Dismiss an AI-generated investigation lead by ID, marking it as triaged. ' +
      'Use when the user decides a lead is not worth investigating.',
    schema,
    tags: ['security', 'entity-analytics', 'leads'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getLeadToolAvailability({ core, request, logger, experimentalFeatures }),
    },
    handler: async (params, { request, spaceId, esClient, prompts, callContext }) => {
      logger.debug(`${SECURITY_DISMISS_LEAD_TOOL_ID} tool called for lead ${params.id}`);

      try {
        const [, { security }] = await core.getStartServices();
        const privileges = await getUserLeadPrivileges(request, security, spaceId);
        if (
          !privileges.adhoc.has_write_permissions ||
          !privileges.scheduled.has_write_permissions
        ) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: {
                  message: 'You do not have permission to dismiss leads in this space.',
                },
              },
            ],
          };
        }

        const promptId = `dismiss_lead.confirm.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          return prompts.askForConfirmation({
            id: promptId,
            title: 'Dismiss lead',
            message: `Dismiss **${
              params.title ?? params.id
            }**? It will be marked as triaged and hidden from the active leads list.`,
            confirm_text: 'Dismiss',
            cancel_text: 'Cancel',
          });
        }

        if (status === ConfirmationStatus.rejected) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: 'Dismiss was cancelled.' },
              },
            ],
          };
        }

        const dataClient = createLeadDataClient({
          esClient: esClient.asCurrentUser,
          logger,
          spaceId,
        });

        const dismissed = await dataClient.dismissLead(params.id);

        if (!dismissed) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: `Lead not found: ${params.id}` },
              },
            ],
          };
        }

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: { success: true, id: params.id },
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[DismissLead] Error dismissing lead ${params.id}: ${errorMessage}`);
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: { message: `Error dismissing lead: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
