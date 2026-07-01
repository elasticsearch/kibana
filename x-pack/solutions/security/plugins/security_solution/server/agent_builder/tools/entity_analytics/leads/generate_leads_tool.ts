/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { v4 as uuidv4 } from 'uuid';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import type { Logger } from '@kbn/logging';
import type { StartServicesAccessor } from '@kbn/core/server';
import { isSupportedConnectorType } from '@kbn/inference-common';
import { RiskScoreDataClient } from '../../../../lib/entity_analytics/risk_score/risk_score_data_client';
import type { ExperimentalFeatures } from '../../../../../common';
import type {
  SecuritySolutionPluginCoreSetupDependencies,
  StartPlugins,
} from '../../../../plugin_contract';
import { getLeadToolAvailability } from './lead_availability';
import {
  getLeadGenerationConfig,
  upsertLeadGenerationConfig,
} from '../../../../lib/entity_analytics/lead_generation/saved_object';
import { fetchCandidateEntities } from '../../../../lib/entity_analytics/lead_generation/entity_conversion';
import { resolveChatModel } from '../../../../lib/entity_analytics/lead_generation/utils';
import { runLeadGenerationInBackground } from '../../../../lib/entity_analytics/lead_generation/run_background_pipeline';
import { getUserLeadPrivileges } from '../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges';
import { securityTool } from '../../constants';

// kibanaVersion is only used in RiskScoreDataClient write methods (index template creation).
// The lead generation pipeline exclusively calls getDailyAverageRiskScoreNormSeries (read-only),
// so an empty string is safe here and avoids threading the version through plugin setup.
const RISK_SCORE_CLIENT_KIBANA_VERSION = '';

export const SECURITY_GENERATE_LEADS_TOOL_ID = securityTool('generate_leads');

const schema = z.object({
  connectorName: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Name or partial name of the AI connector to use for lead generation (e.g. "OpenAI", "Claude"). ' +
        'Case-insensitive. If omitted, the previously configured connector is used.'
    ),
});

interface ConnectorCandidate {
  id: string;
  name: string;
  actionTypeId: string;
}

const resolveConnectorIdByName = (
  connectors: ConnectorCandidate[],
  name: string
): { id: string } | { error: string } => {
  const aiConnectors = connectors.filter((c) => isSupportedConnectorType(c.actionTypeId));
  const nameLower = name.toLowerCase();

  const exact = aiConnectors.find((c) => c.name.toLowerCase() === nameLower);
  if (exact) return { id: exact.id };

  const partial = aiConnectors.filter((c) => c.name.toLowerCase().includes(nameLower));
  if (partial.length === 1) return { id: partial[0].id };

  const availableNames = aiConnectors.map((c) => `"${c.name}"`).join(', ');

  if (partial.length > 1) {
    const matchingNames = partial.map((c) => `"${c.name}"`).join(', ');
    return {
      error: `Multiple AI connectors match "${name}": ${matchingNames}. Please use a more specific name.`,
    };
  }

  return {
    error: `No AI connector found matching "${name}". ${
      availableNames
        ? `Available AI connectors: ${availableNames}.`
        : 'No AI connectors are configured.'
    }`,
  };
};

export const generateLeadsTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures,
  getStartServices: StartServicesAccessor<StartPlugins>
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_GENERATE_LEADS_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Trigger AI-powered investigation lead generation. Use when the user asks to generate, create, or refresh investigation leads. ' +
      'Lead generation is asynchronous — this tool starts the job and returns immediately; use list_leads to check for new results after it completes.',
    schema,
    tags: ['security', 'entity-analytics', 'leads'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getLeadToolAvailability({ core, request, logger, experimentalFeatures }),
    },
    handler: async (
      params,
      { request, spaceId, esClient, savedObjectsClient, prompts, callContext }
    ) => {
      logger.debug(`${SECURITY_GENERATE_LEADS_TOOL_ID} tool called`);

      try {
        const [, { security }] = await core.getStartServices();
        const privileges = await getUserLeadPrivileges(request, security, spaceId);
        if (!privileges.adhoc.has_write_permissions) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: {
                  message: 'You do not have permission to generate leads in this space.',
                },
              },
            ],
          };
        }

        const promptId = `generate_leads.confirm.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          return prompts.askForConfirmation({
            id: promptId,
            title: 'Generate investigation leads',
            message:
              'This will start an AI lead generation run. It may take a few minutes and uses AI inference. Proceed?',
            confirm_text: 'Generate leads',
            cancel_text: 'Cancel',
          });
        }

        if (status === ConfirmationStatus.rejected) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: 'Lead generation was cancelled.' },
              },
            ],
          };
        }

        const [coreStart, startPlugins] = await getStartServices();

        let resolvedConnectorId: string | undefined;

        if (params.connectorName) {
          const actionsClient = await startPlugins.actions.getActionsClientWithRequest(request);
          const allConnectors = await actionsClient.getAll();
          const resolution = resolveConnectorIdByName(allConnectors, params.connectorName);
          if ('error' in resolution) {
            return {
              results: [
                {
                  tool_result_id: getToolResultId(),
                  type: ToolResultType.error,
                  data: { message: resolution.error },
                },
              ],
            };
          }
          resolvedConnectorId = resolution.id;
        } else {
          resolvedConnectorId = (await getLeadGenerationConfig(savedObjectsClient, spaceId))
            ?.connectorId;
        }

        if (!resolvedConnectorId) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: {
                  message:
                    'No AI connector is configured for lead generation. Provide a connectorName argument, or configure one via the Lead Generation settings.',
                },
              },
            ],
          };
        }

        const currentEsClient = esClient.asCurrentUser;
        const crudClient = startPlugins.entityStore.createCRUDClient(currentEsClient, spaceId);
        const riskScoreDataClient = new RiskScoreDataClient({
          logger,
          kibanaVersion: RISK_SCORE_CLIENT_KIBANA_VERSION,
          esClient: currentEsClient,
          namespace: spaceId,
          soClient: savedObjectsClient,
        });
        const chatModel = await resolveChatModel(
          startPlugins.inference,
          request,
          resolvedConnectorId
        );
        const executionUuid = uuidv4();

        await upsertLeadGenerationConfig(savedObjectsClient, spaceId, {
          connectorId: resolvedConnectorId,
        });

        runLeadGenerationInBackground({
          savedObjectsClient,
          connectorId: resolvedConnectorId,
          executionUuid,
          pipelineArgs: {
            listEntities: () => fetchCandidateEntities(crudClient, logger),
            esClient: currentEsClient,
            logger,
            spaceId,
            riskScoreDataClient,
            executionId: executionUuid,
            sourceType: 'adhoc',
            analytics: coreStart.analytics,
            chatModel,
          },
        });

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                executionUuid,
                status: 'running',
                message:
                  'Lead generation has started. It runs in the background — use list_leads to check for new results when it completes.',
              },
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[LeadGeneration] Error starting lead generation: ${errorMessage}`);
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: { message: `Error starting lead generation: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
