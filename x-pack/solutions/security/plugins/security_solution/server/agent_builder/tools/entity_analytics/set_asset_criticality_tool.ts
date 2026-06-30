/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition, ToolAvailabilityContext } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import type { Logger } from '@kbn/logging';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import type { ExperimentalFeatures } from '../../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { AssetCriticalityLevelsForBulkUpload } from '../../../../common/api/entity_analytics/asset_criticality/bulk_upload_asset_criticality.gen';
import { securityTool } from '../constants';
import { IdentifierType } from '../../../../common/api/entity_analytics/common/common.gen';

export const SECURITY_SET_ASSET_CRITICALITY_TOOL_ID = securityTool('set_asset_criticality');

const schema = z.object({
  entityId: z
    .string()
    .min(1)
    .describe(
      'The entity ID (EUID) of the entity whose criticality to set. ' +
        'Examples: "host:server1", "user:jsmith". ' +
        'If the security.entity attachment identifies the target, use its entity ID here.'
    ),
  entityType: IdentifierType.describe('The type of entity: host, user, service, or generic.'),
  criticality: AssetCriticalityLevelsForBulkUpload.describe(
    'The asset criticality level to assign. ' +
      'Valid levels: low_impact, medium_impact, high_impact, extreme_impact. ' +
      'Use "unassigned" to remove the existing criticality value.'
  ),
});

export const setAssetCriticalityTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_SET_ASSET_CRITICALITY_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Set or remove the asset criticality level for a security entity' +
      'Criticality influences risk scoring — entities with higher criticality carry more weight in risk calculations. ' +
      'Use "unassigned" to remove the current criticality. ' +
      'Single-record only — bulk or CSV changes belong in the Entity Analytics management UI. ',
    schema,
    tags: ['security', 'entity-analytics', 'asset-criticality'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }: ToolAvailabilityContext) => {
        try {
          const availability = await getAgentBuilderResourceAvailability({ core, request, logger });
          if (availability.status !== 'available') {
            return availability;
          }
          if (!experimentalFeatures.entityAnalyticsEntityStoreV2) {
            return { status: 'unavailable', reason: 'Entity Store V2 is not enabled.' };
          }
          return { status: 'available' };
        } catch (error) {
          return {
            status: 'unavailable',
            reason: `Failed to check ${SECURITY_SET_ASSET_CRITICALITY_TOOL_ID} availability: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          };
        }
      },
    },
    handler: async (params, { esClient, prompts, callContext, spaceId }) => {
      logger.debug(
        `${SECURITY_SET_ASSET_CRITICALITY_TOOL_ID} tool called for entity ${params.entityId}`
      );

      const { entityId, entityType, criticality } = params;

      const promptId = `set_asset_criticality.confirm.${callContext.toolCallId}`;
      const { status } = prompts.checkConfirmationStatus(promptId);

      if (status === ConfirmationStatus.unprompted) {
        const criticalityLabel =
          criticality === 'unassigned'
            ? 'remove the existing criticality'
            : `set criticality to **${criticality}**`;

        return prompts.askForConfirmation({
          id: promptId,
          title: 'Set asset criticality',
          message: `${criticalityLabel} for **${entityId}**?`,
          confirm_text: criticality === 'unassigned' ? 'Remove criticality' : 'Set criticality',
          cancel_text: 'Cancel',
        });
      }

      if (status === ConfirmationStatus.rejected) {
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: { message: 'Asset criticality update was cancelled.' },
            },
          ],
        };
      }

      try {
        const [, { entityStore }] = await core.getStartServices();
        const client = esClient.asCurrentUser;
        const entityStoreClient = entityStore.createCRUDClient(client, spaceId);

        const errors = await entityStoreClient.bulkUpdateEntity({
          objects: [
            {
              type: entityType,
              doc: {
                entity: { id: entityId },
                asset: { criticality: criticality === 'unassigned' ? null : criticality },
              },
            },
          ],
          force: true,
        });

        if (errors.length > 0) {
          const firstError = errors[0];
          throw new Error(firstError.reason ?? `Update failed with status ${firstError.status}`);
        }

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: { success: true, entityId, entityType, criticality },
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          `[SetAssetCriticality] Error setting criticality for ${entityId}: ${errorMessage}`
        );

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: { message: `Error setting asset criticality: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
