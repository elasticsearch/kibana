/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  LIST_SOURCES_API_PATH,
  SOURCE_BY_ID_API_PATH,
  THREAT_INTEL_SOURCES_INDEX,
  THREAT_REPORTS_INDEX_PATTERN,
  APPROVED_SOURCE_IDS,
  resolveCatalogSourceUrl,
} from '../../../common/threat_intel';
import {
  buildSpaceFilterTerms,
  canMutateSourceInSpace,
  resolveCurrentSpaceId,
} from '../lib/space_filter';
import { HIDDEN_INDEX_SEARCH_OPTIONS } from '../lib/es_options';
import { redactUrl } from '../adapters/http_client';
import { THREAT_INTEL_READ_AUTHZ, THREAT_INTEL_WRITE_AUTHZ } from './lib/authz';
import { rejectUntilBootstrapped } from './lib/bootstrap_ready';
import { ensureIndicatorAliasForSpace } from '../setup/indicator_alias';
import type { RouteRegistrationDeps } from '.';

const listBodySchema = schema.object({
  size: schema.maybe(schema.number({ min: 1, max: 500 })),
  time_range: schema.maybe(
    schema.object({
      from: schema.string({ maxLength: 64 }),
      to: schema.string({ maxLength: 64 }),
    })
  ),
});

interface ThreatIntelSourceDoc {
  name?: string;
  adapter_type?: string;
  enabled?: boolean;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  space_id?: string;
}

export interface ListSourcesItem {
  source_id: string;
  name?: string;
  adapter_type?: string;
  enabled?: boolean;
  url?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  space_id?: string;
  /** Count of threat reports attributed to this source name. */
  report_count: number;
  /** Latest `lineage.ingested_at` across reports for this source. */
  last_ingested_at?: string;
  /** Sum of `evidence.alert_hits_total` across reports for this source. */
  env_hits_total: number;
}

interface SourceReportStats {
  report_count: number;
  last_ingested_at?: string;
  env_hits_total: number;
}

export const mapSourceHit = (hit: {
  _id?: string;
  _source?: ThreatIntelSourceDoc;
}): Omit<ListSourcesItem, 'report_count' | 'last_ingested_at' | 'env_hits_total'> => {
  const source = hit._source ?? {};
  const sourceId = hit._id ?? '';
  // URLs come from the code catalog, not Elasticsearch. Redact userinfo before
  // returning a URL to Security Read callers listing global sources in every space.
  const catalogUrl = resolveCatalogSourceUrl(sourceId);
  const displayUrl = typeof catalogUrl === 'string' ? redactUrl(catalogUrl) : undefined;
  return {
    source_id: sourceId,
    name: source.name,
    adapter_type: source.adapter_type,
    enabled: source.enabled,
    ...(typeof displayUrl === 'string' ? { url: displayUrl } : {}),
    tags: source.tags,
    created_at: source.created_at,
    updated_at: source.updated_at,
    space_id: source.space_id,
  };
};

const emptyStats = (): SourceReportStats => ({
  report_count: 0,
  env_hits_total: 0,
});

export const loadSourceForMutation = async ({
  esClient,
  sourceId,
  spaceId,
}: {
  esClient: ElasticsearchClient;
  sourceId: string;
  spaceId: string;
}): Promise<
  { allowed: true; space_id?: string; existing?: ThreatIntelSourceDoc } | { allowed: false }
> => {
  if (!APPROVED_SOURCE_IDS.has(sourceId)) {
    return { allowed: false };
  }
  try {
    const hit = await esClient.get<ThreatIntelSourceDoc>({
      index: THREAT_INTEL_SOURCES_INDEX,
      id: sourceId,
    });
    const sourceSpaceId = hit._source?.space_id;
    if (!canMutateSourceInSpace(sourceSpaceId, spaceId)) {
      // Deliberately not distinguished from "absent". Sources live in one shared
      // index, so a 403 here told the caller that a source with this id exists in
      // some other space, which is an existence oracle across a boundary the rest
      // of the feature treats as a security boundary.
      return { allowed: false };
    }
    return { allowed: true, space_id: sourceSpaceId, existing: hit._source };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      return { allowed: false };
    }
    throw err;
  }
};

/**
 * The `source.adapter_id` an adapter stamps on the reports it produces.
 * Adapters build it as `<adapter type>:<source doc id>`, which is stable and
 * unique per catalog row — unlike the display name, which the approved catalog
 * may reuse.
 */
const adapterIdForSource = (adapterType: string | undefined, sourceId: string): string =>
  `${adapterType ?? ''}:${sourceId}`;

/**
 * Bucket cap for the per-source activity aggregation. Sized well above the fixed
 * catalog so unexpected legacy documents cannot make this aggregation unbounded.
 */
const MAX_STATS_BUCKETS = 500;

/**
 * Aggregate report activity per `source.adapter_id` for list_sources enrichment.
 */
export const loadSourceReportStatsByAdapterId = async ({
  esClient,
  spaceId,
  logger,
  timeRange,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  logger: Logger;
  timeRange?: { from: string; to: string };
}): Promise<Map<string, SourceReportStats>> => {
  const statsByAdapterId = new Map<string, SourceReportStats>();

  try {
    const filters: Record<string, unknown>[] = [buildSpaceFilterTerms(spaceId)];
    if (timeRange?.from || timeRange?.to) {
      filters.push({
        range: {
          '@timestamp': {
            ...(timeRange.from ? { gte: timeRange.from } : {}),
            ...(timeRange.to ? { lte: timeRange.to } : {}),
          },
        },
      });
    }

    const response = await esClient.search({
      index: THREAT_REPORTS_INDEX_PATTERN,
      // Reports live in a hidden index, which a wildcard skips by default.
      ...HIDDEN_INDEX_SEARCH_OPTIONS,
      size: 0,
      track_total_hits: false,
      query: {
        bool: {
          filter: filters,
        },
      },
      aggs: {
        by_adapter_id: {
          terms: {
            field: 'source.adapter_id',
            size: MAX_STATS_BUCKETS,
          },
          aggs: {
            last_ingested: {
              max: { field: 'lineage.ingested_at' },
            },
            // Nested + filtered to the caller space (plain sum on nested is 0;
            // unfiltered nested sum would count every space).
            env_hits: {
              nested: { path: 'evidence' },
              aggs: {
                this_space: {
                  filter: { term: { 'evidence.space_id': spaceId } },
                  aggs: {
                    total: { sum: { field: 'evidence.alert_hits_total' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const buckets =
      (
        response.aggregations?.by_adapter_id as
          | {
              buckets?: Array<{
                key: string | number;
                doc_count: number;
                last_ingested?: { value?: number | null; value_as_string?: string };
                env_hits?: { this_space?: { total?: { value?: number | null } } };
              }>;
            }
          | undefined
      )?.buckets ?? [];

    // A silent truncation here reads as "these sources have no activity", which is
    // indistinguishable from a source that genuinely produced nothing.
    if (buckets.length >= MAX_STATS_BUCKETS) {
      logger.warn(
        `Source activity aggregation hit the ${MAX_STATS_BUCKETS}-bucket cap, so some ` +
          `sources will report zero reports and no last-ingest time even though they have ` +
          `activity. Raise MAX_STATS_BUCKETS or narrow the requested time range.`
      );
    }

    for (const bucket of buckets) {
      const adapterId = String(bucket.key);
      const lastIngested =
        bucket.last_ingested?.value_as_string ??
        (typeof bucket.last_ingested?.value === 'number'
          ? new Date(bucket.last_ingested.value).toISOString()
          : undefined);
      statsByAdapterId.set(adapterId, {
        report_count: bucket.doc_count,
        ...(lastIngested ? { last_ingested_at: lastIngested } : {}),
        env_hits_total: Math.round(bucket.env_hits?.this_space?.total?.value ?? 0),
      });
    }
  } catch (err) {
    logger.warn(
      `list_sources report enrichment failed: ${(err as Error).message}; returning catalog only`
    );
  }

  return statsByAdapterId;
};

/**
 * `ensureIndicatorAliasForSpace` is a bootstrap-time ES alias write. Every space
 * needs it run once (bootstrap covers spaces that already existed; spaces
 * created afterward need it on their first list_sources call), but re-running it
 * on every read request adds an ES write to a page-load-level GET. Cache the
 * space ids already ensured this process lifetime so only the first request per
 * space pays for it. Lost on restart, but restart re-runs bootstrap anyway.
 */
const spacesWithEnsuredAlias = new Set<string>();

/**
 * POST `/internal/threat_intel/sources/list` — source catalog enriched with
 * report counts / last ingest / env hits from `.kibana-threat-reports*`.
 */
export const registerListSourcesRoute = ({
  router,
  logger,
  getSpacesService,
  getBootstrapReady,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: LIST_SOURCES_API_PATH,
      access: 'internal',
      security: { authz: THREAT_INTEL_READ_AUTHZ },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { body: listBodySchema } },
      },
      async (context, request, response) => {
        const notReady = await rejectUntilBootstrapped(getBootstrapReady, response);
        if (notReady) return notReady;

        const core = await context.core;
        // Internal user: these are plugin-owned hidden indices, and Kibana
        // feature privileges (securitySolution / RULES_API_ALL) do not grant
        // Elasticsearch privileges on them, so asCurrentUser failed for every
        // non-superuser. Access is already gated by route authz above and
        // narrowed by the explicit space filter below.
        const esClient = core.elasticsearch.client.asInternalUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const size = request.body.size ?? 500;

        try {
          if (!spacesWithEnsuredAlias.has(spaceId)) {
            await ensureIndicatorAliasForSpace({ esClient, spaceId, logger });
            spacesWithEnsuredAlias.add(spaceId);
          }
          const [searchResponse, reportStatsByAdapterId] = await Promise.all([
            esClient.search<ThreatIntelSourceDoc>({
              index: THREAT_INTEL_SOURCES_INDEX,
              ignore_unavailable: true,
              size,
              sort: [{ name: { order: 'asc' } }],
              query: {
                bool: {
                  filter: [buildSpaceFilterTerms(spaceId)],
                },
              },
            }),
            loadSourceReportStatsByAdapterId({
              esClient,
              spaceId,
              logger,
              timeRange: request.body.time_range,
            }),
          ]);

          const sources = (searchResponse.hits.hits ?? [])
            .filter((hit) => hit._id && APPROVED_SOURCE_IDS.has(hit._id))
            .map((hit) => {
              const base = mapSourceHit(hit);
              const stats =
                reportStatsByAdapterId.get(adapterIdForSource(base.adapter_type, base.source_id)) ??
                emptyStats();
              return {
                ...base,
                report_count: stats.report_count,
                ...(stats.last_ingested_at ? { last_ingested_at: stats.last_ingested_at } : {}),
                env_hits_total: stats.env_hits_total,
              };
            });

          const total = sources.length;

          return response.ok({ body: { total, sources } });
        } catch (err) {
          logger.warn(`list_sources failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to list sources: ${(err as Error).message}` },
          });
        }
      }
    );
};

/**
 * The only field an operator can change on an approved source. The catalog is
 * fixed, so name, URL, adapter type, tags, and vendor are not mutable — a strict
 * `schema.object` rejects any other key with a 400.
 */
export const updateSourceBodySchema = schema.object({
  enabled: schema.boolean(),
});

const sourceIdParamsSchema = schema.object({
  sourceId: schema.string({ minLength: 1, maxLength: 256 }),
});

export const registerUpdateSourceRoute = ({
  router,
  logger,
  getSpacesService,
  getBootstrapReady,
}: RouteRegistrationDeps): void => {
  router.versioned
    .patch({
      path: SOURCE_BY_ID_API_PATH,
      access: 'internal',
      security: { authz: THREAT_INTEL_WRITE_AUTHZ },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: { params: sourceIdParamsSchema, body: updateSourceBodySchema },
        },
      },
      async (context, request, response) => {
        const notReady = await rejectUntilBootstrapped(getBootstrapReady, response);
        if (notReady) return notReady;

        const core = await context.core;
        // Internal user: these are plugin-owned hidden indices, and Kibana
        // feature privileges (securitySolution / RULES_API_ALL) do not grant
        // Elasticsearch privileges on them, so asCurrentUser failed for every
        // non-superuser. Access is already gated by route authz above and
        // narrowed by the explicit space filter below.
        const esClient = core.elasticsearch.client.asInternalUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const { sourceId } = request.params;
        const now = new Date().toISOString();

        try {
          const access = await loadSourceForMutation({ esClient, sourceId, spaceId });
          if (!access.allowed) {
            return response.notFound({
              body: { message: `Source ${sourceId} not found` },
            });
          }

          await esClient.update({
            index: THREAT_INTEL_SOURCES_INDEX,
            id: sourceId,
            doc: { enabled: request.body.enabled, updated_at: now },
            refresh: 'wait_for',
          });
          return response.ok({ body: { source_id: sourceId, updated: true } });
        } catch (err) {
          logger.warn(`update_source failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to update source: ${(err as Error).message}` },
          });
        }
      }
    );
};
