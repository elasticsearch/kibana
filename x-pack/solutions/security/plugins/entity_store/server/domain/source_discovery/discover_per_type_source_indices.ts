/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { castArray } from 'lodash';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { EntityType } from '../../../common/domain/definitions/entity_schema';
import { getLatestEntitiesIndexName } from '../../../common/domain/entity_index';
import { getAlertsIndexName } from '../asset_manager/external_indices_contants';
import { getUpdatesEntitiesDataStreamName } from '../asset_manager/updates_data_stream';
import {
  ALL_IDENTITY_FIELDS,
  ENTITY_TYPES,
  ENTITY_TYPE_IDENTITY_FIELDS,
  SAFE_IDENTITY_FIELD_TYPES,
  emptySources,
  type DiscoveredPerTypeSources,
  type PerTypeSourceProvenance,
} from './identity_fields';
import { buildConcreteIndexToSourceNameMap } from './resolve_source_index_map';

/**
 * POC discovery scope. Intentionally narrow: `logs-*` plus the hand-picked
 * Security alerts index. The Security Solution data view usually spans more
 * (e.g. `filebeat-*`, `endgame-*`, custom patterns); widening is a deliberate
 * follow-up, not an implicit fallback.
 */
const LOGS_SOURCE_PATTERN = 'logs-*';

interface DiscoverParams {
  esClient: ElasticsearchClient;
  namespace: string;
  logger: Logger;
}

/**
 * Deterministically discovers, per entity type, the set of clean "source" names
 * (data stream / alias / standalone index) that carry that engine's identity
 * fields at a safe (`keyword`) type.
 *
 * Two Elasticsearch calls, no LLM and no Streams plugin:
 *  1. `resolveIndex` over the scope → reverse map from the concrete indices
 *     `field_caps` reports back to clean source names.
 *  2. `field_caps` (type-gated to `keyword`, `include_unmapped: true`) over the
 *     same scope → which concrete indices carry each identity field. The
 *     `include_unmapped` flag is what makes presence per-index: it forces ES to
 *     report the exact indices where a field is keyword instead of collapsing to
 *     "present everywhere" (which would qualify every source for every type).
 *
 * A source qualifies for an entity type when it carries at least one of that
 * type's identity fields. Rollover drift is tolerated: a source qualifies if
 * *any* of its backing indices has the field at `keyword`.
 *
 * Resilient by design: any Elasticsearch failure resolves to empty sources so a
 * background extraction tick degrades to `updates ∪ additional` rather than
 * throwing.
 */
export const discoverPerTypeSourceIndices = async ({
  esClient,
  namespace,
  logger,
}: DiscoverParams): Promise<DiscoveredPerTypeSources> => {
  const scope = [LOGS_SOURCE_PATTERN, getAlertsIndexName(namespace)];

  // Sources the entity store manages itself. The updates stream is unioned into
  // every engine's FROM elsewhere; re-discovering it (or the latest index) as an
  // input risks a read-your-own-writes feedback loop. Naturally out of `logs-*`
  // today, but excluded defensively for when the scope widens.
  const excludedSourceNames = new Set<string>([
    getUpdatesEntitiesDataStreamName(namespace),
    getLatestEntitiesIndexName(namespace),
  ]);

  try {
    const [resolve, fieldCaps] = await Promise.all([
      esClient.indices.resolveIndex({
        name: scope.join(','),
        expand_wildcards: 'open',
        ignore_unavailable: true,
        allow_no_indices: true,
      }),
      esClient.fieldCaps({
        index: scope,
        fields: [...ALL_IDENTITY_FIELDS],
        types: [...SAFE_IDENTITY_FIELD_TYPES],
        // Must stay `true`. `field_caps` only fills a type's `indices` array when
        // the field spans more than one type-family across the scope. With this
        // `false`, "absent from an index" is not a family, so a field that is
        // `keyword` wherever it exists looks single-family and ES OMITS `indices`
        // — indistinguishable from "present everywhere". Discovery then over-
        // qualifies every source for every type (see the `indices`-omitted
        // fallback below). `true` adds an `unmapped` family for indices lacking
        // the field, forcing ES to report exactly the indices where it is keyword.
        include_unmapped: true,
        ignore_unavailable: true,
        allow_no_indices: true,
        expand_wildcards: 'open',
        // Drop multi-field parents so e.g. `user.name` (text) does not mask its
        // `user.name.keyword` leaf when only the parent is queried; harmless here.
        filters: '-parent',
      }),
    ]);

    const concreteToSource = buildConcreteIndexToSourceNameMap(resolve);
    const topLevelConcrete = castArray(fieldCaps.indices ?? []);

    // sourceName -> identity fields present (at keyword) somewhere under it.
    const presenceBySource = new Map<string, Set<string>>();

    const recordPresence = (concreteIndex: string, field: string) => {
      const sourceName = concreteToSource.get(concreteIndex) ?? concreteIndex;
      if (excludedSourceNames.has(sourceName)) {
        return;
      }
      const present = presenceBySource.get(sourceName) ?? new Set<string>();
      present.add(field);
      presenceBySource.set(sourceName, present);
    };

    for (const field of ALL_IDENTITY_FIELDS) {
      const keywordCap = fieldCaps.fields?.[field]?.keyword;
      if (!keywordCap) {
        continue;
      }
      // With `include_unmapped: true`, `keyword.indices` is populated whenever the
      // field is keyword in only a subset of the scope (the rest form the `unmapped`
      // family). An omitted `indices` therefore genuinely means "keyword in every
      // in-scope index" — only then is the fall back to all matched indices correct.
      const concreteIndices =
        keywordCap.indices !== undefined ? castArray(keywordCap.indices) : topLevelConcrete;
      for (const concreteIndex of concreteIndices) {
        recordPresence(concreteIndex, field);
      }
    }

    const sourceSets: Record<EntityType, Set<string>> = {
      user: new Set(),
      host: new Set(),
      service: new Set(),
      generic: new Set(),
    };
    const provenance: PerTypeSourceProvenance[] = [];

    for (const [sourceName, presentFields] of presenceBySource) {
      for (const entityType of ENTITY_TYPES) {
        const matchedFields = ENTITY_TYPE_IDENTITY_FIELDS[entityType].filter((field) =>
          presentFields.has(field)
        );
        if (matchedFields.length === 0) {
          continue;
        }
        sourceSets[entityType].add(sourceName);
        provenance.push({ entityType, sourceName, matchedFields });
      }
    }

    const sources = {
      user: Array.from(sourceSets.user),
      host: Array.from(sourceSets.host),
      service: Array.from(sourceSets.service),
      generic: Array.from(sourceSets.generic),
    };

    logger.debug(
      () =>
        `[source_discovery] namespace=${namespace} discovered sources: ${ENTITY_TYPES.map(
          (type) => `${type}=${sources[type].length}`
        ).join(' ')}`
    );

    return { sources, provenance };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(
      `[source_discovery] deterministic discovery failed for namespace=${namespace}; falling back to updates-only sources: ${reason}`
    );
    return { sources: emptySources(), provenance: [] };
  }
};
