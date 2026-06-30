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
import { CRUDClient } from '@kbn/entity-store/server/domain/crud';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../../plugin_contract';
import { getIndexForWatchlist } from '../../../../lib/entity_analytics/watchlists/entities/utils';
import { createManualEntityService } from '../../../../lib/entity_analytics/watchlists/entity_sources/manual/service';
import { WatchlistConfigClient } from '../../../../lib/entity_analytics/watchlists/management/watchlist_config';
import { securityTool } from '../../constants';
import { checkWatchlistAccess } from './check_watchlist_access';
import { formatEntityIdsForPrompt } from './entity_ids_preview';
import { getWatchlistToolAvailability } from './watchlist_availability';

const MAX_ENTITIES_PER_CALL = 100;

const schema = z.object({
  watchlistId: z
    .string()
    .min(1)
    .describe(
      'The id of the watchlist to remove entities from. Use `security.list_watchlists` to resolve a watchlist name to its id first, passing `nameContains` when the user referred to the watchlist by name.'
    ),
  entityIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ENTITIES_PER_CALL)
    .describe(
      `EUIDs (entity unique ids) to remove from the watchlist, e.g. ["user:jsmith123", "host:server01"]. Up to ${MAX_ENTITIES_PER_CALL} per call.`
    ),
});

export const SECURITY_REMOVE_ENTITIES_FROM_WATCHLIST_TOOL_ID = securityTool(
  'remove_entities_from_watchlist'
);

export const removeEntitiesFromWatchlistTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_REMOVE_ENTITIES_FROM_WATCHLIST_TOOL_ID,
    type: ToolType.builtin,
    description: `Remove one or more entities from an Entity Analytics watchlist by their EUIDs. Requires user confirmation before the change is applied. Returns a per-entity result (successful, failed, not_found) so partial outcomes can be reported.

Use when the user asks to remove entities from a named or known watchlist (e.g. "remove this user from the Privileged Users watchlist", "take host:server01 off watchlist X"). Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist.

This tool only removes entities that were **manually assigned** to the watchlist. Entities that came in via an entity source are reported as \`not_found\` in the result with the message "Entity not manually assigned to this watchlist" — to remove those, the user must reconfigure or remove the entity source in the UI.`,
    schema,
    tags: ['security', 'entity-analytics', 'watchlists'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getWatchlistToolAvailability({
          core,
          request,
          logger,
          experimentalFeatures,
          requireEntityStoreV2: true,
        }),
    },
    handler: async (
      params,
      { spaceId, esClient, savedObjectsClient, request, prompts, callContext }
    ) => {
      logger.debug(
        `${SECURITY_REMOVE_ENTITIES_FROM_WATCHLIST_TOOL_ID} tool called with parameters ${JSON.stringify(
          params
        )}`
      );

      try {
        const [, startPlugins] = await core.getStartServices();
        const { security } = startPlugins;

        const accessResult = await checkWatchlistAccess({
          request,
          security,
          spaceId,
          type: 'write',
          action: 'modify watchlist membership',
        });
        if (!accessResult.allowed) {
          return { results: [accessResult.result] };
        }

        const watchlistClient = new WatchlistConfigClient({
          soClient: savedObjectsClient,
          esClient: esClient.asCurrentUser,
          namespace: spaceId,
          logger,
        });
        const watchlist = await watchlistClient.get(params.watchlistId);

        const promptId = `watchlists.remove_entities_from_watchlist.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          return prompts.askForConfirmation({
            id: promptId,
            title: 'Remove entities from watchlist',
            message: [
              `Remove ${params.entityIds.length} ${
                params.entityIds.length === 1 ? 'entity' : 'entities'
              } from the watchlist "${watchlist.name}"?`,
              '',
              formatEntityIdsForPrompt(params.entityIds),
              '',
              'Only manually-assigned entities will be removed. Entities added via an entity source will be reported as not found — to remove those, reconfigure or remove the entity source in the UI.',
            ].join('\n'),
            confirm_text: 'Remove',
            cancel_text: 'Cancel',
            color: 'warning',
          });
        }

        if (status === ConfirmationStatus.rejected) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: 'User declined to remove entities from the watchlist.' },
              },
            ],
          };
        }

        const service = createManualEntityService({
          esClient: esClient.asCurrentUser,
          crudClient: new CRUDClient({
            logger,
            esClient: esClient.asCurrentUser,
            namespace: spaceId,
          }),
          logger,
          watchlist: {
            name: watchlist.name,
            id: watchlist.id ?? params.watchlistId,
            index: getIndexForWatchlist(spaceId),
          },
        });

        const result = await service.unassign(params.entityIds);

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                watchlistId: params.watchlistId,
                watchlistName: watchlist.name,
                ...result,
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
              data: { message: `Error removing entities from watchlist: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
