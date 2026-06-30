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
import { WatchlistConfigClient } from '../../../../lib/entity_analytics/watchlists/management/watchlist_config';
import { securityTool } from '../../constants';
import { checkWatchlistAccess } from './check_watchlist_access';
import { getWatchlistToolAvailability } from './watchlist_availability';

const schema = z.object({
  nameContains: z
    .string()
    .min(1)
    .describe(
      'Optional case-insensitive substring filter on the watchlist name. ' +
        'Pass this when the user named a watchlist (or part of one) to narrow the result. ' +
        'e.g. user asks about "the Privileged Users watchlist": first try nameContains: "Privileged Users" (verbatim phrase), ' +
        'then retry with a shorter distinctive token (e.g. nameContains: "privileged") if no watchlists match.'
    )
    .optional(),
});

export const SECURITY_LIST_WATCHLISTS_TOOL_ID = securityTool('list_watchlists');

const MAX_WATCHLISTS_RETURNED = 100;

interface WatchlistSummary {
  id: string;
  name: string;
  description?: string;
  riskModifier: number;
  managed: boolean;
  entitySourceIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export const listWatchlistsTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_LIST_WATCHLISTS_TOOL_ID,
    type: ToolType.builtin,
    description: `List the security Entity Analytics watchlists configured in the current space. Returns up to ${MAX_WATCHLISTS_RETURNED} watchlists, each with its id, name, description, risk modifier, managed flag, source ids, and timestamps.

Use this tool when the user asks to discover or enumerate watchlists, for example: "what watchlists do we have", "list watchlists", "show me the watchlists", "is there a watchlist called X". It is also the first step when the user asks about members of a named watchlist: list watchlists to resolve the name to an id, then call \`security.search_entities\` with \`watchlists: [<id>]\` to get the members.

Do NOT use this tool to find out which watchlists a specific entity belongs to — that information is already available on a single entity's profile via \`security.get_entity\` (\`entity.attributes.watchlists\`).`,
    schema,
    tags: ['security', 'entity-analytics', 'watchlists'],
    availability: {
      cacheMode: 'space',
      handler: ({ request }) =>
        getWatchlistToolAvailability({ core, request, logger, experimentalFeatures }),
    },
    handler: async (params, { spaceId, esClient, savedObjectsClient, request }) => {
      logger.debug(
        `${SECURITY_LIST_WATCHLISTS_TOOL_ID} tool called with parameters ${JSON.stringify(params)}`
      );

      try {
        const [, startPlugins] = await core.getStartServices();
        const { security } = startPlugins;

        const accessResult = await checkWatchlistAccess({
          request,
          security,
          spaceId,
          type: 'read',
          action: 'read watchlists',
        });
        if (!accessResult.allowed) {
          return { results: [accessResult.result] };
        }

        const client = new WatchlistConfigClient({
          soClient: savedObjectsClient,
          esClient: esClient.asCurrentUser,
          namespace: spaceId,
          logger,
        });

        const allWatchlists = await client.list(MAX_WATCHLISTS_RETURNED);
        const nameFilter = params.nameContains?.toLowerCase();
        const filtered = nameFilter
          ? allWatchlists.filter((w) => w.name.toLowerCase().includes(nameFilter))
          : allWatchlists;

        const watchlists: WatchlistSummary[] = filtered.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          riskModifier: w.riskModifier,
          managed: w.managed,
          entitySourceIds: w.entitySourceIds ?? [],
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        }));

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                watchlists,
                ...(nameFilter ? { filter: { nameContains: params.nameContains } } : {}),
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
              data: { message: `Error listing watchlists: ${errorMessage}` },
            },
          ],
        };
      }
    },
  };
};
