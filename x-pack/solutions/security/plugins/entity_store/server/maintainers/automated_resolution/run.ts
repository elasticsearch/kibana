/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type {
  AggregationsCompositeAggregate,
  AggregationsCompositeAggregateKey,
  AggregationsCompositeBucket,
  AggregationsFilterAggregate,
  AggregationsMaxAggregate,
  AggregationsStringTermsAggregate,
  AggregationsStringTermsBucket,
  AggregationsTopHitsAggregate,
} from '@elastic/elasticsearch/lib/api/types';
import { getLatestEntitiesIndexName } from '../../../common';
import type { ResolutionClient } from '../../domain/resolution';
import { getFieldValue } from '../../../common/domain/euid/commons';
import { ENTITY_ID_FIELD } from '../../../common/domain/definitions/common_fields';
import type { PerRuleState, MatchBucket, EntityHit } from './types';

const MATCH_FIELD = 'user.email';
const ENTITY_TYPE = 'user';
const NAMESPACE_PRIORITY = ['active_directory', 'okta', 'entra_id'];
const PAGE_SIZE = 10_000;
const ENGINE_METADATA_TYPE_FIELD = 'entity.EngineMetadata.Type';
const RESOLVED_TO_FIELD = 'entity.relationships.resolution.resolved_to';
const ENTITY_NAMESPACE_FIELD = 'entity.namespace';
const TOP_HITS_SIZE = 100;

export interface RunDeps {
  state: PerRuleState;
  namespace: string;
  esClient: ElasticsearchClient;
  logger: Logger;
  resolutionClient: ResolutionClient;
  abortController: AbortController;
}

export async function runEmailRuleResolution(deps: RunDeps): Promise<PerRuleState> {
  const { state, namespace, esClient, logger, resolutionClient, abortController } = deps;
  const index = getLatestEntitiesIndexName(namespace);

  // Step 1: Collect new email values
  const { values, maxTimestamp } = await collectNewEmailValues(esClient, index, state);

  if (values.length === 0) {
    logger.debug('No new email values found, skipping resolution');
    return {
      ...state,
      lastRun: { resolutionsCreated: 0, skippedAmbiguousBuckets: 0 },
    };
  }

  logger.debug(`Step 1: Collected ${values.length} email values, maxTimestamp: ${maxTimestamp}`);

  if (abortController.signal.aborted) {
    logger.debug('Aborted after Step 1');
    return state;
  }

  // Step 2: Find matching groups (batched)
  const matchBuckets = await findMatchingGroups(esClient, index, values, logger);
  logger.debug(`Step 2: Found ${matchBuckets.length} match groups`);

  if (abortController.signal.aborted) {
    logger.debug('Aborted after Step 2');
    return state;
  }

  // Step 3: Resolve
  const { resolutionsCreated, skippedAmbiguousBuckets, failedBuckets } = await resolveMatchBuckets(
    resolutionClient,
    matchBuckets,
    logger
  );
  logger.info(
    `Completed: ${resolutionsCreated} resolutions created, ${skippedAmbiguousBuckets} ambiguous buckets skipped, ${failedBuckets} buckets failed`
  );

  // Step 4: Update state — don't advance watermark if any buckets failed,
  // so the next run re-collects the same email values and retries.
  return {
    lastProcessedTimestamp: failedBuckets > 0 ? state.lastProcessedTimestamp : maxTimestamp,
    lastRun: { resolutionsCreated, skippedAmbiguousBuckets },
  };
}

/**
 * Step 1: Paginated composite aggregation to collect all unique email values
 * from new unresolved user entities (since the watermark).
 */
async function collectNewEmailValues(
  esClient: ElasticsearchClient,
  index: string,
  state: PerRuleState
): Promise<{ values: string[]; maxTimestamp: string }> {
  const allValues: string[] = [];
  let afterKey: AggregationsCompositeAggregateKey | undefined;
  let maxTimestamp = '';

  const filters: object[] = [
    { term: { [ENGINE_METADATA_TYPE_FIELD]: ENTITY_TYPE } },
    { exists: { field: MATCH_FIELD } },
    {
      script: {
        script: {
          source: `doc['${MATCH_FIELD}'].size() == 1`,
          lang: 'painless',
        },
      },
    },
    { bool: { must_not: { exists: { field: RESOLVED_TO_FIELD } } } },
  ];

  if (state.lastProcessedTimestamp) {
    filters.push({
      range: { 'entity.lifecycle.first_seen': { gt: state.lastProcessedTimestamp } },
    });
  }

  do {
    const response = await esClient.search<
      unknown,
      { emails: AggregationsCompositeAggregate; max_timestamp: AggregationsMaxAggregate }
    >({
      index,
      size: 0,
      query: { bool: { filter: filters } },
      aggs: {
        emails: {
          composite: {
            sources: [{ email: { terms: { field: MATCH_FIELD } } }],
            size: PAGE_SIZE,
            ...(afterKey ? { after: afterKey } : {}),
          },
        },
        max_timestamp: { max: { field: 'entity.lifecycle.first_seen' } },
      },
    });

    const { aggregations } = response;
    const emailBuckets = (aggregations?.emails.buckets ?? []) as AggregationsCompositeBucket[];
    const maxTsAgg = aggregations?.max_timestamp;

    for (const bucket of emailBuckets) {
      allValues.push(bucket.key.email as string);
    }

    if (maxTsAgg?.value_as_string && maxTsAgg.value_as_string > maxTimestamp) {
      maxTimestamp = maxTsAgg.value_as_string;
    }

    afterKey = aggregations?.emails.after_key;
  } while (afterKey);

  return { values: allValues, maxTimestamp };
}

/**
 * Step 2: For collected email values, find all entities sharing the same email.
 * Batched in PAGE_SIZE chunks to keep query size bounded.
 */
async function findMatchingGroups(
  esClient: ElasticsearchClient,
  index: string,
  values: string[],
  logger: Logger
): Promise<MatchBucket[]> {
  const allBuckets: MatchBucket[] = [];

  for (let i = 0; i < values.length; i += PAGE_SIZE) {
    const batch = values.slice(i, i + PAGE_SIZE);
    const response = await esClient.search<
      unknown,
      { email_groups: AggregationsStringTermsAggregate }
    >({
      index,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { [ENGINE_METADATA_TYPE_FIELD]: ENTITY_TYPE } },
            { terms: { [MATCH_FIELD]: batch } },
            {
              script: {
                script: {
                  source: `doc['${MATCH_FIELD}'].size() == 1`,
                  lang: 'painless',
                },
              },
            },
          ],
        },
      },
      aggs: {
        email_groups: {
          terms: { field: MATCH_FIELD, min_doc_count: 2, size: PAGE_SIZE },
          aggs: {
            unresolved: {
              filter: { bool: { must_not: { exists: { field: RESOLVED_TO_FIELD } } } },
              aggs: {
                hits: {
                  top_hits: {
                    size: TOP_HITS_SIZE,
                    _source: [ENTITY_ID_FIELD, ENTITY_NAMESPACE_FIELD],
                  },
                },
              },
            },
            existing_targets: {
              filter: { exists: { field: RESOLVED_TO_FIELD } },
              aggs: {
                target_ids: { terms: { field: RESOLVED_TO_FIELD, size: PAGE_SIZE } },
              },
            },
          },
        },
      },
    });

    const emailGroupBuckets = (response.aggregations?.email_groups.buckets ??
      []) as AggregationsStringTermsBucket[];

    for (const bucket of emailGroupBuckets) {
      const unresolvedFilter = bucket.unresolved as AggregationsFilterAggregate;
      const unresolvedTopHits = unresolvedFilter.hits as AggregationsTopHitsAggregate;

      // top_hits is capped at TOP_HITS_SIZE. If there are more unresolved entities
      // than the cap, the extras will be permanently skipped (watermark advances past them).
      // This is acceptable because 100+ unresolved entities per email is not realistic
      // with real identity providers (typically 2-5 per email).
      const totalUnresolved =
        typeof unresolvedTopHits.hits.total === 'number'
          ? unresolvedTopHits.hits.total
          : unresolvedTopHits.hits.total?.value ?? 0;
      if (totalUnresolved > TOP_HITS_SIZE) {
        logger.warn(
          `Email bucket '${
            bucket.key
          }' has ${totalUnresolved} unresolved entities but top_hits is capped at ${TOP_HITS_SIZE}; ${
            totalUnresolved - TOP_HITS_SIZE
          } entities will be skipped`
        );
      }

      const unresolvedEntities: EntityHit[] = unresolvedTopHits.hits.hits.map((hit) => ({
        entityId: getFieldValue(hit._source, ENTITY_ID_FIELD) ?? '',
        namespace: getFieldValue(hit._source, ENTITY_NAMESPACE_FIELD) ?? '',
      }));

      const existingTargetsFilter = bucket.existing_targets as AggregationsFilterAggregate;
      const targetIdsTerms = existingTargetsFilter.target_ids as AggregationsStringTermsAggregate;
      const targetBuckets = (targetIdsTerms.buckets ?? []) as AggregationsStringTermsBucket[];
      const existingTargetIds: string[] = targetBuckets.map((tb) => `${tb.key}`);

      allBuckets.push({
        emailValue: `${bucket.key}`,
        unresolvedEntities,
        existingTargetIds,
      });
    }
  }

  return allBuckets;
}

/**
 * Step 3: Process each match bucket — extend existing groups, create new ones,
 * or skip ambiguous cases.
 */
async function resolveMatchBuckets(
  resolutionClient: ResolutionClient,
  buckets: MatchBucket[],
  logger: Logger
): Promise<{ resolutionsCreated: number; skippedAmbiguousBuckets: number; failedBuckets: number }> {
  let resolutionsCreated = 0;
  let skippedAmbiguousBuckets = 0;
  let failedBuckets = 0;

  for (const bucket of buckets) {
    try {
      const { existingTargetIds, unresolvedEntities } = bucket;

      if (existingTargetIds.length > 1) {
        logger.warn(
          `Skipping ambiguous bucket: ${existingTargetIds.length} existing targets for the same email`
        );
        skippedAmbiguousBuckets++;
        continue;
      }

      if (existingTargetIds.length === 1) {
        // Extend existing group — filter out the target itself (it's unresolved too)
        const targetId = existingTargetIds[0];
        const aliasIds = unresolvedEntities
          .filter((e) => e.entityId !== targetId)
          .map((e) => e.entityId);
        if (aliasIds.length === 0) continue;

        const result = await resolutionClient.linkEntities(targetId, aliasIds);
        resolutionsCreated += result.linked.length;
      } else if (unresolvedEntities.length >= 2) {
        // New group: pick target via namespace priority, link the rest
        const targetEntity = selectTarget(unresolvedEntities);
        const aliasIds = unresolvedEntities
          .filter((e) => e.entityId !== targetEntity.entityId)
          .map((e) => e.entityId);

        const result = await resolutionClient.linkEntities(targetEntity.entityId, aliasIds);
        resolutionsCreated += result.linked.length;
      }
      // else: only 1 unresolved, no existing targets → no match, skip
    } catch (err) {
      failedBuckets++;
      logger.warn(`Failed to resolve bucket: ${err?.message ?? err}`);
    }
  }

  return { resolutionsCreated, skippedAmbiguousBuckets, failedBuckets };
}

/**
 * Target selection: prefer entities from identity provider namespaces
 * (in priority order), with alphabetical entity.id tiebreaker.
 * Uses exact match on entity.namespace — normalized, stable identifiers
 * that don't change across index naming conventions.
 */
export function selectTarget(entities: EntityHit[]): EntityHit {
  for (const ns of NAMESPACE_PRIORITY) {
    const candidates = entities.filter((e) => e.namespace === ns);
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.entityId.localeCompare(b.entityId));
      return candidates[0];
    }
  }

  // Fallback: alphabetically first entity.id
  const sorted = [...entities].sort((a, b) => a.entityId.localeCompare(b.entityId));
  return sorted[0];
}
