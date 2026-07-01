/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../../plugin_contract';
import { getLeadToolAvailability } from './lead_availability';
import { createLeadDataClient } from '../../../../lib/entity_analytics/lead_generation/lead_data_client';
import { getUserLeadPrivileges } from '../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges';
import { LeadStatusEnum } from '../../../../../common/entity_analytics/lead_generation/types';
import { securityTool } from '../../constants';

export const SECURITY_LIST_LEADS_TOOL_ID = securityTool('list_leads');

const schema = z.object({
  status: LeadStatusEnum.optional().describe(
    'Filter by lead status: active, dismissed, or expired. Omit to return all statuses.'
  ),
  sortField: z
    .enum(['priority', 'timestamp'])
    .optional()
    .describe('Sort by priority (default, highest first) or timestamp (newest first).'),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of leads to return (default: 20, max: 100).'),
});

export const listLeadsTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_LIST_LEADS_TOOL_ID,
    type: ToolType.builtin,
    description:
      'List AI-generated investigation leads for security entities. ' +
      'Use when the user asks to review, triage, or list investigation leads. ' +
      'Leads are sorted by priority (highest first) by default.',
    schema,
    tags: ['security', 'entity-analytics', 'leads'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getLeadToolAvailability({ core, request, logger, experimentalFeatures }),
    },
    handler: async (params, { request, spaceId, esClient }) => {
      logger.debug(
        `${SECURITY_LIST_LEADS_TOOL_ID} tool called with parameters ${JSON.stringify(params)}`
      );

      try {
        const [, { security }] = await core.getStartServices();
        const privileges = await getUserLeadPrivileges(request, security, spaceId);
        if (!privileges.adhoc.has_read_permissions || !privileges.scheduled.has_read_permissions) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: {
                  message: 'You do not have permission to read leads in this space.',
                },
              },
            ],
          };
        }

        const dataClient = createLeadDataClient({
          esClient: esClient.asCurrentUser,
          logger,
          spaceId,
        });

        const [leadsResult, statusResult] = await Promise.all([
          dataClient.findLeads({
            perPage: params.perPage,
            status: params.status,
            sortField: params.sortField,
            sortOrder: 'desc',
          }),
          dataClient.getStatus({ isEnabled: experimentalFeatures.leadGenerationEnabled }),
        ]);

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                leads: leadsResult.leads.map(({ executionUuid: _, ...lead }) => lead),
                total: leadsResult.total,
                perPage: leadsResult.perPage,
                lastGeneratedAt: statusResult.lastRun,
              },
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: { message: `Error fetching leads: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
