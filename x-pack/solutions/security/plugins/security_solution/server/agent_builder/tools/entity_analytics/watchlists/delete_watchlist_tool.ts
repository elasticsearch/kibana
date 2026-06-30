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
import { WatchlistConfigClient } from '../../../../lib/entity_analytics/watchlists/management/watchlist_config';
import { createEntitySourcesService } from '../../../../lib/entity_analytics/watchlists/entity_sources/entity_sources_service';
import { watchlistEntitySourceTypeName } from '../../../../lib/entity_analytics/watchlists/entity_sources/infra';
import { securityTool } from '../../constants';
import { checkWatchlistAccess } from './check_watchlist_access';
import { getWatchlistToolAvailability } from './watchlist_availability';

const schema = z.object({
  watchlistId: z
    .string()
    .min(1)
    .describe(
      'The id of the watchlist to delete. Use `security.list_watchlists` to resolve a watchlist name to its id first, passing `nameContains` when the user referred to the watchlist by name.'
    ),
});

export const SECURITY_DELETE_WATCHLIST_TOOL_ID = securityTool('delete_watchlist');

export const deleteWatchlistTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures,
  hasEncryptionKey: boolean
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_DELETE_WATCHLIST_TOOL_ID,
    type: ToolType.builtin,
    description: `Permanently delete an Entity Analytics watchlist. Requires user confirmation before deletion; cannot be undone.

Use when the user asks to delete or remove a watchlist (e.g. "delete the X watchlist", "remove the watchlist called Y"). Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist.

Managed (system-controlled) watchlists cannot be deleted via this tool. Deleting a watchlist also cascade-deletes any entity sources linked to it.`,
    schema,
    tags: ['security', 'entity-analytics', 'watchlists'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getWatchlistToolAvailability({ core, request, logger, experimentalFeatures }),
    },
    handler: async (params, { spaceId, esClient, request, prompts, callContext }) => {
      logger.debug(
        `${SECURITY_DELETE_WATCHLIST_TOOL_ID} tool called with parameters ${JSON.stringify(params)}`
      );

      try {
        const [coreStart, startPlugins] = await core.getStartServices();
        const { security } = startPlugins;

        const accessResult = await checkWatchlistAccess({
          request,
          security,
          spaceId,
          type: 'write',
          action: 'delete watchlists',
        });
        if (!accessResult.allowed) {
          return { results: [accessResult.result] };
        }

        // The watchlist-entity-source saved-object type is registered as hidden=true.
        // A plain getScopedClient(request) cannot see it; we must opt in explicitly.
        const soClient = coreStart.savedObjects.getScopedClient(request, {
          includedHiddenTypes: [watchlistEntitySourceTypeName],
        });

        const client = new WatchlistConfigClient({
          soClient,
          esClient: esClient.asCurrentUser,
          internalEsClient: esClient.asInternalUser,
          securityServiceStart: coreStart.security,
          namespace: spaceId,
          logger,
        });

        const promptId = `watchlists.delete_watchlist.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          const existing = await client.get(params.watchlistId);

          if (existing.managed) {
            return {
              results: [
                {
                  tool_result_id: getToolResultId(),
                  type: ToolResultType.error,
                  data: {
                    message: `Cannot delete watchlist "${existing.name}" — it is system-managed and protected from deletion.`,
                  },
                },
              ],
            };
          }

          const entitySourceCount = existing.entitySourceIds?.length ?? 0;
          return prompts.askForConfirmation({
            id: promptId,
            title: 'Delete watchlist',
            message: [
              `Permanently delete the watchlist "${existing.name}"?`,
              ...(existing.description ? ['', `**Description:** ${existing.description}`] : []),
              '',
              'This will:',
              '- Remove the watchlist',
              '- Disassociate the entities from it',
              ...(entitySourceCount > 0
                ? [
                    `- Cascade-delete ${entitySourceCount} linked ${
                      entitySourceCount === 1 ? 'entity source' : 'entity sources'
                    }`,
                  ]
                : []),
              '',
              '**This action cannot be undone.**',
            ].join('\n'),
            confirm_text: 'Delete',
            cancel_text: 'Cancel',
            color: 'danger',
          });
        }

        if (status === ConfirmationStatus.rejected) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: 'User declined to delete the watchlist.' },
              },
            ],
          };
        }

        const entitySourcesService = createEntitySourcesService({
          esClient: esClient.asCurrentUser,
          soClient,
          logger,
          namespace: spaceId,
          getStartServices: core.getStartServices,
          hasEncryptionKey,
        });

        let warning: string | null = null;
        try {
          await entitySourcesService.deleteWatchlistEntities(params.watchlistId);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          warning = `The watchlist was deleted but entity source cleanup failed: ${errorMessage}. Some entities may still reference this watchlist.`;
        }

        await client.delete(params.watchlistId);

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                deleted: true,
                watchlistId: params.watchlistId,
                ...(warning ? { warning } : {}),
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
              data: { message: `Error deleting watchlist: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
