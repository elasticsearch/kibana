/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type {
  QueriesGetResponse,
  QueriesOccurrencesGetResponse,
  SignificantEventsQueriesGenerationResult,
} from '@kbn/significant-events-schema';
import { generatedSignificantEventQuerySchema } from '@kbn/significant-events-schema';
import { sortQueryLinksForTable } from '../../../../lib/significant_events/utils';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { generateKIQueries } from '../../../../lib/significant_events/ki_queries_generation_service';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { getRequestAbortSignal } from '../../../utils/get_request_abort_signal';
import { queryStatusSchema, toRuleUnbackedFilter } from '../../../utils/query_status';
import { BUCKET_SIZE_PATTERN } from '../../../../lib/significant_events/helpers/fill_bucket_gaps';
import {
  computeOccurrences,
  fetchQueryLinks,
  getQueryOccurrences,
  toSignificantEventResponse,
  type QueryOccurrences,
} from '../../../../lib/significant_events/fetch_query_occurrences_from_alerts';
import { searchModeSchema } from '../../../utils/search_mode';
import type { PersistQueriesResult } from '../../../../lib/significant_events/persist_queries';
import { persistQueries } from '../../../../lib/significant_events/persist_queries';

const dateFromString = z.string().transform((input) => new Date(input));

const baseRequestParamsSchema = z.object({
  from: dateFromString.describe('Start of the time range'),
  to: dateFromString.describe('End of the time range'),
  bucketSize: z
    .string()
    .regex(BUCKET_SIZE_PATTERN)
    .describe('Size of time buckets for aggregation'),
  query: z.string().optional().describe('Query string to filter significant events queries'),
  streamNames: z
    .preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.string()))
    .optional()
    .describe('Stream names to filter significant events'),
});

const requestParamsSchema = baseRequestParamsSchema.extend({
  searchMode: searchModeSchema,
});

/**
 * Promotes unbacked queries to rule-backed status. Returns
 * `{ promoted, skipped_stats }`. STATS queries are never promoted until
 * rule-on-rule provisioning (#265778); `skipped_stats` counts those.
 */
export const promoteUnbackedQueriesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/queries/_promote',
  options: {
    access: 'internal',
    summary: 'Promote unbacked queries',
    description:
      'Creates Kibana rules for stored queries across streams that do not yet have a backing rule, then marks them as backed.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z
      .object({
        queryIds: z.array(z.string()).optional(),
        minSeverityScore: z.number().int().min(0).max(100).optional(),
      })
      .nullish(),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<{ promoted: number; skipped_stats: number }> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();
    const streamDefinitions = new Map(
      (await streamsClient.listStreams()).map((definition) => [definition.name, definition])
    );

    return kiClient.promoteUnbackedQueries({
      queryIds: params?.body?.queryIds,
      minSeverityScore: params?.body?.minSeverityScore,
      streamDefinitions,
    });
  },
});

export const demoteBackedQueriesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/queries/_demote',
  options: {
    access: 'internal',
    summary: 'Demote backed queries',
    description:
      'Removes Kibana rules for the provided stored significant-events queries and marks them as unbacked.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.object({
      queryIds: z.array(z.string()).min(1),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    logger,
  }): Promise<{ demoted: number }> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();
    // Only rule-backed queries can be demoted; unbacked queries have no rule to remove.
    const toDemote = await kiClient.getQueryLinks([], {
      ruleUnbacked: 'exclude',
      queryIds: params.body.queryIds,
    });

    const byStream = toDemote.reduce<Record<string, string[]>>((acc, link) => {
      const stream = link.stream_name;

      if (!acc[stream]) {
        acc[stream] = [];
      }

      acc[stream].push(link.query.id);
      return acc;
    }, {});

    const streamDefinitions = await streamsClient.listStreams();
    const streamDefinitionsByName = new Map(
      streamDefinitions.map((streamDefinition) => [streamDefinition.name, streamDefinition])
    );

    let demoted = 0;

    for (const [streamName, queryIds] of Object.entries(byStream)) {
      const definition = streamDefinitionsByName.get(streamName);
      if (!definition) {
        logger.warn(`Skipping demotion for missing stream ${streamName}`);
        continue;
      }
      const result = await kiClient.demoteQueries(definition, queryIds);
      demoted += result.demoted;
    }

    return { demoted };
  },
});

export const bulkDeleteQueriesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/queries/_bulk_delete',
  options: {
    access: 'internal',
    summary: 'Bulk delete queries across streams',
    description:
      'Hard-deletes stored significant-events queries across multiple streams in a single request. Removes backing Kibana rules for any backed queries.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.object({
      queryIds: z.array(z.string()).min(1),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    logger,
  }): Promise<{ succeeded: number; failed: number; skipped: number }> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();

    // Bulk delete must cover both backed and unbacked queries; the default
    // 'exclude' filter would skip unbacked (draft) ones.
    const queryLinks = await kiClient.getQueryLinks([], {
      queryIds: params.body.queryIds,
      ruleUnbacked: 'include',
    });

    // Count requested IDs that getQueryLinks did not find — these are idempotent
    // no-ops (already gone / never existed) and reported as `skipped`, not failed.
    const foundIds = new Set(queryLinks.map((link) => link.query.id));
    const skipped = params.body.queryIds.filter((id) => !foundIds.has(id)).length;

    // Capture backed rule IDs per stream to log on mid-flight failure.
    const byStream = new Map<string, { queryIds: string[]; backedRuleIds: string[] }>();
    for (const link of queryLinks) {
      const bucket = byStream.get(link.stream_name) ?? { queryIds: [], backedRuleIds: [] };
      bucket.queryIds.push(link.query.id);
      if (link.rule_backed && link.rule_id) {
        bucket.backedRuleIds.push(link.rule_id);
      }
      byStream.set(link.stream_name, bucket);
    }

    // Fetch only the stream definitions we actually need. Rejections (e.g. the
    // stream definition no longer exists) are treated the same way as the old
    // `listStreams() + Map.get === undefined` check: that stream's batch is
    // counted as failed below.
    const streamNames = Array.from(byStream.keys());
    const streamDefinitionResults = await Promise.allSettled(
      streamNames.map((name) => streamsClient.getStream(name))
    );
    const streamDefinitionsByName = new Map<
      string,
      Awaited<ReturnType<typeof streamsClient.getStream>>
    >();
    streamDefinitionResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        streamDefinitionsByName.set(streamNames[i], result.value);
      }
    });

    // syncQueries uninstalls rules before writing storage, so a mid-flight
    // throw can leave rules gone while stored links still reference them. Log
    // the backed rule IDs on failure so ops can reconcile manually.
    const sigEventsLogger = logger.get('significant_events');

    let succeeded = 0;
    let failed = 0;

    for (const [streamName, { queryIds, backedRuleIds }] of byStream) {
      const definition = streamDefinitionsByName.get(streamName);
      if (!definition) {
        logger.warn(`Skipping bulk delete for missing stream ${streamName}`);
        failed += queryIds.length;
        continue;
      }
      try {
        const deleteIds = new Set(queryIds);
        await kiClient.replaceStreamQueries(definition, (currentLinks) =>
          currentLinks.filter((l) => !deleteIds.has(l.query.id)).map((l) => l.query)
        );
        succeeded += queryIds.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const orphanContext =
          backedRuleIds.length > 0 ? ` candidateOrphanedRuleIds=[${backedRuleIds.join(',')}]` : '';
        sigEventsLogger.error(
          `Bulk delete failed for stream ${streamName}: ${errorMessage}. ` +
            `queryIds=[${queryIds.join(',')}]${orphanContext}`
        );
        failed += queryIds.length;
      }
    }

    return { succeeded, failed, skipped };
  },
});

const getDiscoveryQueriesRoute = createServerRoute({
  endpoint: 'GET /internal/streams/_queries',
  params: z.object({
    query: requestParamsSchema.extend({
      page: z.coerce.number().int().min(1).optional().describe('Page number (1-based)'),
      perPage: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Number of items per page'),
      status: queryStatusSchema,
    }),
  }),
  options: {
    access: 'internal',
    summary: 'Read paginated significant-event queries for the discovery table',
    description: 'Returns significant-event queries as table rows, with server-side pagination.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  handler: async ({ params, request, getScopedClients, server }): Promise<QueriesGetResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      from,
      to,
      bucketSize,
      query,
      streamNames,
      page = 1,
      perPage = 10,
      status,
      searchMode,
    } = params.query;

    const [kiClient, { alertsReader }] = await Promise.all([
      scopedClients.getKnowledgeIndicatorClient(),
      scopedClients.getSignificantEventsAlertingContext(),
    ]);
    const queryLinks = await fetchQueryLinks(
      {
        streamNames,
        query,
        filters: { ruleUnbacked: toRuleUnbackedFilter(status) },
        searchMode,
      },
      kiClient
    );

    // Paginate links first, then fetch occurrences for the page's rules only —
    // not the full (up to 10k) set.
    const total = queryLinks.length;
    const start = (page - 1) * perPage;
    const pageLinks =
      start >= total ? [] : sortQueryLinksForTable(queryLinks).slice(start, start + perPage);
    const pageRuleIds = [...new Set(pageLinks.map((link) => link.rule_id))];

    const occurrences = await computeOccurrences(
      { ruleIds: pageRuleIds, from, to, bucketSize, alertsReader },
      { scopedClusterClient }
    );
    const queryOccurrences: QueryOccurrences = { queryLinks: pageLinks, ...occurrences };
    const queriesPage = pageLinks.map((queryLink) =>
      toSignificantEventResponse({ queryLink, queryOccurrences })
    );

    return { queries: queriesPage, page, perPage, total };
  },
});

// baseRequestParamsSchema (no searchMode): the histogram is an aggregate,
// always default-ranked, not a list of individual queries.
const getDiscoveryQueriesOccurrencesRoute = createServerRoute({
  endpoint: 'GET /internal/streams/_queries/_occurrences',
  params: z.object({
    query: baseRequestParamsSchema,
  }),
  options: {
    access: 'internal',
    summary: 'Read aggregated occurrences for the discovery histogram',
    description:
      'Returns the aggregated occurrences histogram series for the chart above the queries table.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<QueriesOccurrencesGetResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { from, to, bucketSize, query, streamNames } = params.query;

    const [kiClient, { alertsReader }] = await Promise.all([
      scopedClients.getKnowledgeIndicatorClient(),
      scopedClients.getSignificantEventsAlertingContext(),
    ]);
    const { aggregatedOccurrences: aggregatedOccurrenceBuckets } = await getQueryOccurrences(
      {
        from,
        to,
        bucketSize,
        query,
        streamNames,
        alertsReader,
      },
      { kiClient, scopedClusterClient }
    );

    const occurrencesHistogram = aggregatedOccurrenceBuckets.map((bucket) => ({
      x: bucket.date,
      y: bucket.count,
    }));

    const totalOccurrences = aggregatedOccurrenceBuckets.reduce(
      (sum, bucket) => sum + bucket.count,
      0
    );

    return { occurrences_histogram: occurrencesHistogram, total_occurrences: totalOccurrences };
  },
});

const generateQueriesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{streamName}/queries/_generate',
  params: z.object({
    path: z.object({
      streamName: z.string().describe('The name of the stream'),
    }),
    body: z
      .object({
        connectorId: z
          .string()
          .optional()
          .describe(
            'Optional connector ID override. When omitted the connector is resolved via the Inference Feature Registry.'
          ),
        maxExistingQueriesForContext: z
          .number()
          .optional()
          .describe('Max number of existing queries to include as context for the LLM.'),
      })
      .nullish(),
  }),
  options: {
    access: 'internal',
    summary: 'Generate significant events queries',
    description: 'Runs a single iteration of KI queries generation for the given stream.',
    timeout: { idleSocket: 600_000 },
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    logger,
    telemetry,
  }): Promise<SignificantEventsQueriesGenerationResult & { connectorId: string }> => {
    const scopedClients = await getScopedClients({ request });
    const {
      streamsClient,
      inferenceClient,
      soClient,
      scopedClusterClient,
      licensing,
      uiSettingsClient,
    } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { streamName } = params.path;
    const { connectorId, maxExistingQueriesForContext } = params.body ?? {};

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();

    const result = await generateKIQueries(
      { streamName, connectorId, maxExistingQueriesForContext },
      {
        streamsClient,
        inferenceClient,
        soClient,
        kiClient,
        esClient: scopedClusterClient.asCurrentUser,
        featureFlags: server.core.featureFlags,
        searchInferenceEndpoints: server.searchInferenceEndpoints,
        request,
        logger: logger.get('significant_events_queries_generation'),
        signal: getRequestAbortSignal(request),
        telemetry,
        agentBuilderTools: server.agentBuilder?.tools,
      }
    );

    return {
      queries: result.queries,
      tokensUsed: result.tokensUsed,
      connectorId: result.connectorId,
    };
  },
});

const persistQueriesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{streamName}/queries/_persist',
  params: z.object({
    path: z.object({
      streamName: z.string().describe('The name of the stream'),
    }),
    body: z.object({
      queries: z.array(generatedSignificantEventQuerySchema),
    }),
  }),
  options: {
    access: 'internal',
    summary: 'Persist generated queries with deduplication',
    description:
      'Persists generated significant event queries for a stream, deduplicating by ES|QL and handling rule-backed replacements.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  handler: async ({ params, request, getScopedClients, server }): Promise<PersistQueriesResult> => {
    const authUser = server.core.security.authc.getCurrentUser(request);
    const cloneApiKeysOnCreate = authUser?.authentication_type === 'api_key';
    const scopedClients = await getScopedClients({
      request,
      rulesClientOptions: { cloneApiKeysOnCreate },
    });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { streamName } = params.path;
    const { queries } = params.body;
    const kiClient = await scopedClients.getKnowledgeIndicatorClient();

    return persistQueries(streamName, queries, {
      kiClient,
      streamsClient,
    });
  },
});

export const internalQueriesRoutes = {
  ...promoteUnbackedQueriesRoute,
  ...demoteBackedQueriesRoute,
  ...bulkDeleteQueriesRoute,
  ...getDiscoveryQueriesRoute,
  ...getDiscoveryQueriesOccurrencesRoute,
  ...generateQueriesRoute,
  ...persistQueriesRoute,
};
