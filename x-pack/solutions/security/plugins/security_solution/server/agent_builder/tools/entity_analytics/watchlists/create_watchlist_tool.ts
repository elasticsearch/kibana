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

const DEFAULT_RISK_MODIFIER = 1.5;

const schema = z.object({
  name: z
    .string()
    .min(1)
    .max(MAX_WATCHLIST_NAME_LENGTH)
    .describe(
      `The watchlist name. Use the user's exact wording when they named the watchlist, e.g. "Privileged Users" or "Compromised Accounts". Up to ${MAX_WATCHLIST_NAME_LENGTH} characters.`
    ),
  description: z
    .string()
    .max(MAX_WATCHLIST_DESCRIPTION_LENGTH)
    .optional()
    .describe(
      `Optional short description of the watchlist's purpose. Include this when the user supplied context, e.g. "Sensitive accounts under continuous review". Up to ${MAX_WATCHLIST_DESCRIPTION_LENGTH} characters.`
    ),
  riskModifier: riskModifierSchema
    .optional()
    .describe(
      `Optional risk score multiplier. 0 = scores zeroed out, 1 = no change, 2 = doubled. Defaults to ${DEFAULT_RISK_MODIFIER}; only pass a value when the user explicitly asks for a different multiplier.`
    ),
});

export const SECURITY_CREATE_WATCHLIST_TOOL_ID = securityTool('create_watchlist');

export const createWatchlistTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_CREATE_WATCHLIST_TOOL_ID,
    type: ToolType.builtin,
    description: `Create a new Entity Analytics watchlist in the current space. Requires user confirmation before the watchlist is created. Returns the created watchlist's id, name, description, and risk modifier.

Use this tool when the user explicitly asks to create a new watchlist (e.g. "create a watchlist called X", "make a new watchlist for Y", "add a watchlist named Z").

Do NOT use this tool to add entities to an existing watchlist — that is a separate action.`,
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
        `${SECURITY_CREATE_WATCHLIST_TOOL_ID} tool called with parameters ${JSON.stringify(params)}`
      );

      try {
        const [, startPlugins] = await core.getStartServices();
        const { security } = startPlugins;

        const accessResult = await checkWatchlistAccess({
          request,
          security,
          spaceId,
          type: 'write',
          action: 'create watchlists',
        });
        if (!accessResult.allowed) {
          return { results: [accessResult.result] };
        }

        const riskModifier = params.riskModifier ?? DEFAULT_RISK_MODIFIER;

        const promptId = `watchlists.create_watchlist.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          const detailLines = [
            `**Name:** ${params.name}`,
            ...(params.description ? [`**Description:** ${params.description}`] : []),
            `**Risk modifier:** ${formatRiskModifier(riskModifier)}`,
          ];
          return prompts.askForConfirmation({
            id: promptId,
            title: 'Create watchlist',
            message: `Create a new watchlist with these settings?\n\n${detailLines.join('\n')}`,
            confirm_text: 'Create',
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
                data: { message: 'User declined to create the watchlist.' },
              },
            ],
          };
        }

        const client = new WatchlistConfigClient({
          soClient: savedObjectsClient,
          esClient: esClient.asCurrentUser,
          internalEsClient: esClient.asInternalUser,
          namespace: spaceId,
          logger,
        });

        const watchlist = await client.create({
          name: params.name,
          description: params.description,
          riskModifier,
          managed: false,
        });

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: { watchlist },
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
              data: { message: `Error creating watchlist: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
