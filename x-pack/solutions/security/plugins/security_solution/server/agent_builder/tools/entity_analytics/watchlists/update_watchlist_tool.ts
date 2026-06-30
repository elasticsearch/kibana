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
import {
  MAX_WATCHLIST_DESCRIPTION_LENGTH,
  MAX_WATCHLIST_NAME_LENGTH,
} from '../../../../../common/entity_analytics/watchlists/constants';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../../plugin_contract';
import { WatchlistConfigClient } from '../../../../lib/entity_analytics/watchlists/management/watchlist_config';
import { securityTool } from '../../constants';
import { checkWatchlistAccess } from './check_watchlist_access';
import { formatRiskModifier, riskModifierSchema } from './risk_modifier';
import { getWatchlistToolAvailability } from './watchlist_availability';

const schema = z.object({
  watchlistId: z
    .string()
    .min(1)
    .describe(
      'The id of the watchlist to update. Use `security.list_watchlists` to resolve a watchlist name to its id first, passing `nameContains` when the user referred to the watchlist by name.'
    ),
  name: z
    .string()
    .min(1)
    .max(MAX_WATCHLIST_NAME_LENGTH)
    .optional()
    .describe(
      `Optional new name for the watchlist. Pass only when the user asked to rename it. Up to ${MAX_WATCHLIST_NAME_LENGTH} characters.`
    ),
  description: z
    .string()
    .max(MAX_WATCHLIST_DESCRIPTION_LENGTH)
    .optional()
    .describe(
      `Optional new description. Pass only when the user asked to change the description. Pass an empty string to clear an existing description. Up to ${MAX_WATCHLIST_DESCRIPTION_LENGTH} characters.`
    ),
  riskModifier: riskModifierSchema
    .optional()
    .describe('Optional new risk modifier. Pass only when the user asked to change it.'),
});

export const SECURITY_UPDATE_WATCHLIST_TOOL_ID = securityTool('update_watchlist');

export const updateWatchlistTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_UPDATE_WATCHLIST_TOOL_ID,
    type: ToolType.builtin,
    description: `Update an existing Entity Analytics watchlist (rename, change description, or change risk modifier). Requires user confirmation before the change is applied. Returns the updated watchlist.

Use when the user asks to modify a watchlist's settings (e.g. "rename X", "set the risk modifier of Y to 2", "change Z's description"). Resolve the watchlist id via \`security.list_watchlists\` first when the user named the watchlist.

Do NOT use this tool to add or remove entities — that is a separate action.`,
    schema,
    tags: ['security', 'entity-analytics', 'watchlists'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getWatchlistToolAvailability({ core, request, logger, experimentalFeatures }),
    },
    handler: async (
      params,
      { spaceId, esClient, savedObjectsClient, request, prompts, callContext }
    ) => {
      logger.debug(
        `${SECURITY_UPDATE_WATCHLIST_TOOL_ID} tool called with parameters ${JSON.stringify(params)}`
      );

      try {
        const updates: { name?: string; description?: string; riskModifier?: number } = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.description !== undefined) updates.description = params.description;
        if (params.riskModifier !== undefined) updates.riskModifier = params.riskModifier;

        if (Object.keys(updates).length === 0) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: {
                  message:
                    'No update fields supplied. Pass at least one of name, description, or riskModifier.',
                },
              },
            ],
          };
        }

        const [, startPlugins] = await core.getStartServices();
        const { security } = startPlugins;

        const accessResult = await checkWatchlistAccess({
          request,
          security,
          spaceId,
          type: 'write',
          action: 'update watchlists',
        });
        if (!accessResult.allowed) {
          return { results: [accessResult.result] };
        }

        const client = new WatchlistConfigClient({
          soClient: savedObjectsClient,
          esClient: esClient.asCurrentUser,
          internalEsClient: esClient.asInternalUser,
          namespace: spaceId,
          logger,
        });

        const promptId = `watchlists.update_watchlist.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          const existing = await client.get(params.watchlistId);
          const changes: string[] = [];
          if (updates.name !== undefined && updates.name !== existing.name) {
            changes.push(`**Name:** "${existing.name}" → "${updates.name}"`);
          }
          if (updates.description !== undefined && updates.description !== existing.description) {
            const current = existing.description ? `"${existing.description}"` : '_(none)_';
            const next = updates.description ? `"${updates.description}"` : '_(cleared)_';
            changes.push(`**Description:** ${current} → ${next}`);
          }
          if (
            updates.riskModifier !== undefined &&
            updates.riskModifier !== existing.riskModifier
          ) {
            changes.push(
              `**Risk modifier:** ${formatRiskModifier(
                existing.riskModifier
              )} → ${formatRiskModifier(updates.riskModifier)}`
            );
          }

          if (changes.length === 0) {
            return {
              results: [
                {
                  tool_result_id: getToolResultId(),
                  type: ToolResultType.other,
                  data: {
                    message: `No changes — the values supplied already match the current state of watchlist "${existing.name}".`,
                    watchlist: existing,
                  },
                },
              ],
            };
          }

          return prompts.askForConfirmation({
            id: promptId,
            title: 'Update watchlist',
            message: `Apply the following changes to watchlist "${
              existing.name
            }"?\n\n${changes.join('\n')}`,
            confirm_text: 'Update',
            cancel_text: 'Cancel',
            color: 'primary',
          });
        }

        if (status === ConfirmationStatus.rejected) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: 'User declined to update the watchlist.' },
              },
            ],
          };
        }

        const updated = await client.update(params.watchlistId, updates);
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: { watchlist: updated },
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
              data: { message: `Error updating watchlist: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
