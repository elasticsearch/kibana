/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getLatestEntityIndexPattern } from '@kbn/entity-store/common/domain/entity_index';
import type { RelationshipIntegrationConfig } from '../engine/types';
import { COMPOSITE_PAGE_SIZE } from '../engine/constants';
import { ENGINE_COLUMNS } from '../engine/columns';
import { buildRawIdentifiersExistenceGate } from '../engine/build_raw_identifiers_query';

const RELATIONSHIP_KEY = 'supervises';

/**
 * One source feeding `supervises` (user → user). Sources are structurally
 * identical — they flatten an expanded direct-reports array into the same three
 * raw_identifier fields — and differ only by `entitySource` and `namespace`.
 */
interface SupervisesSource {
  id: string;
  name: string;
  /**
   * `entity.source` values to match (any one). `entity.source` is derived from
   * `event.module ?? event.dataset ?? data_stream.dataset` (see
   * ENTITY_SOURCE_FIELD_EVALUATION), so depending on what the integration emits
   * it can be either the bare integration name or the full `<integration>.user`
   * dataset — both are listed so the match is robust to either.
   */
  entitySources: string[];
  /** Namespace suffix on the target user EUID (`user:<id>@<namespace>`). */
  namespace: string;
}

const SUPERVISES_EXISTENCE_FIELDS = ['user.email', 'user.id', 'user.name'];

const SUPERVISES_SOURCES: SupervisesSource[] = [
  {
    id: 'entityanalytics_okta',
    name: 'Okta Entity Analytics',
    entitySources: ['entityanalytics_okta', 'entityanalytics_okta.user'],
    namespace: 'okta',
  },
  {
    id: 'entityanalytics_entra_id',
    name: 'Entra ID Entity Analytics',
    entitySources: ['entityanalytics_entra_id', 'entityanalytics_entra_id.user'],
    namespace: 'entra_id',
  },
];

/**
 * Step 2 ES|QL. Differs from the generic `buildRawIdentifiersEsqlQuery` in two ways:
 *
 * 1. User EUIDs carry a namespace suffix (`user:<id>@<namespace>`), so each target
 *    is built as `CONCAT("user:", <value>, "@<namespace>")`.
 * 2. All three raw identifier fields (email, id, name) are unioned into one
 *    multi-valued column before a single MV_EXPAND. ES|QL `MV_APPEND(null, x)`
 *    returns null, so each field is appended only when non-null via a CASE guard.
 *    VALUES() in the STATS clause deduplicates identical EUIDs (e.g. when email
 *    and name hold the same value, as is common in Okta where login == email).
 */
function buildSupervisesEsqlQuery(
  source: SupervisesSource,
  namespace: string,
  lastProcessedTimestamp?: string
): string {
  const entityIndex = getLatestEntityIndexPattern(namespace);
  const rawIdentifiersPrefix = `entity.relationships.${RELATIONSHIP_KEY}.raw_identifiers`;
  const emailField = `${rawIdentifiersPrefix}.user.email`;
  const idField = `${rawIdentifiersPrefix}.user.id`;
  const nameField = `${rawIdentifiersPrefix}.user.name`;
  const ns = source.namespace;

  const watermarkClause = lastProcessedTimestamp
    ? `\n    AND entity.lifecycle.last_seen > "${lastProcessedTimestamp}"`
    : '';

  const entitySourceList = source.entitySources.map((s) => `"${s}"`).join(', ');

  // Union all three raw fields into one multi-valued column before expanding.
  // ES|QL MV_APPEND(null, x) returns null, so the accumulator is built
  // incrementally: start with email (may be null), then append each subsequent
  // field only when the accumulator is non-null (CASE(acc IS NULL, field, MV_APPEND(acc, field)))
  // OR when the field itself is non-null. The streamlang Append transpiler uses
  // CASE(target IS NULL, newValue, MV_APPEND(target, newValue)) for exactly this.
  return `FROM ${entityIndex}
| WHERE (${emailField} IS NOT NULL OR ${idField} IS NOT NULL OR ${nameField} IS NOT NULL)
    AND entity.source IN (${entitySourceList})${watermarkClause}
| EVAL ${ENGINE_COLUMNS.actor} = entity.id
| EVAL rawTargetKey = CASE(${emailField} IS NULL, ${idField}, ${idField} IS NULL, ${emailField}, MV_APPEND(${emailField}, ${idField}))
| EVAL rawTargetKey = CASE(${nameField} IS NULL, rawTargetKey, rawTargetKey IS NULL, ${nameField}, MV_APPEND(rawTargetKey, ${nameField}))
| MV_EXPAND rawTargetKey
| EVAL targetEntityId = CONCAT("user:", rawTargetKey, "@${ns}")
| WHERE COALESCE(targetEntityId, "") != ""
    AND targetEntityId != "user:@${ns}"
    AND targetEntityId RLIKE ".+:.+@.+"
| STATS ${RELATIONSHIP_KEY} = VALUES(targetEntityId) BY ${ENGINE_COLUMNS.actor}
| WHERE COALESCE(${ENGINE_COLUMNS.actor}, "") != ""
| LIMIT ${COMPOSITE_PAGE_SIZE}`;
}

function buildSupervisesConfig(
  source: SupervisesSource,
  lastProcessedTimestamp?: string
): RelationshipIntegrationConfig {
  return {
    kind: 'override',
    id: source.id,
    name: source.name,
    // Actors are entity docs, so Step 1 discovers by entity.id over the entity
    // index, and the entity-index @timestamp lookback is disabled in favour of a
    // last_seen watermark.
    indexPattern: getLatestEntityIndexPattern,
    targetEntityType: 'user',
    relationshipKey: RELATIONSHIP_KEY,
    customActor: {
      fields: ['entity.id'],
    },
    disableLookbackWindow: true,
    validateTargetIds: true,
    compositeAggAdditionalFilters: [
      { terms: { 'entity.source': source.entitySources } },
      buildRawIdentifiersExistenceGate({
        relationshipKey: RELATIONSHIP_KEY,
        fields: SUPERVISES_EXISTENCE_FIELDS,
      }),
      ...(lastProcessedTimestamp
        ? [{ range: { 'entity.lifecycle.last_seen': { gt: lastProcessedTimestamp } } }]
        : []),
    ],
    esqlQueryOverride: (ns) => buildSupervisesEsqlQuery(source, ns, lastProcessedTimestamp),
  };
}

export function buildSupervisesConfigs(
  lastProcessedTimestamp?: string
): RelationshipIntegrationConfig[] {
  return SUPERVISES_SOURCES.map((source) => buildSupervisesConfig(source, lastProcessedTimestamp));
}

// Static export for tests that don't need a watermark.
export const SUPERVISES_INTEGRATION_RELATIONSHIP_CONFIGS = buildSupervisesConfigs();
