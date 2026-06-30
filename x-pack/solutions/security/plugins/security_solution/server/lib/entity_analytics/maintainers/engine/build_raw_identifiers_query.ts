/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getLatestEntityIndexPattern } from '@kbn/entity-store/common/domain/entity_index';
import type { EntityRelationshipKey } from '@kbn/entity-store/common/domain/definitions/common_fields';

import { COMPOSITE_PAGE_SIZE } from './constants';
import { ENGINE_COLUMNS } from './columns';
import type { TargetEntityType } from './types';

/**
 * One directly-constructible raw_identifier → EUID rule.
 *
 * `field` is the leaf under `raw_identifiers` (e.g. "host.name") and `euidType`
 * is the entity type its values resolve to, so the target EUID is built inline
 * as `CONCAT("<euidType>:", value)`. This only covers fields whose value IS a
 * valid EUID identity (e.g. an FQDN in host.name, an email in user.email).
 *
 * It deliberately does NOT cover indirect fields — e.g. AD's
 * raw_identifiers.host.id is an LDAP DN, not a host EUID basis, so prefixing it
 * would produce a dangling EUID. Such fields need a LOOKUP JOIN (future work),
 * not a direct rule, and are simply omitted from an integration's rule set.
 */
export interface DirectEuidRule {
  /** Leaf field under raw_identifiers, e.g. 'host.name', 'user.email', 'service.name'. */
  field: string;
  /** Entity type the field's values resolve to. */
  euidType: TargetEntityType;
}

/**
 * Default rules for integrations whose raw_identifiers are all directly
 * constructible — i.e. the raw value already IS the EUID identity.
 *
 * `host.id`, `user.id`, and `service.*` ids are intentionally excluded: these
 * are the fields most likely to carry an indirect value (LDAP DN, SID, GUID)
 * that needs a lookup, not a direct prefix. An integration that knows its ids
 * are direct can declare a custom rule set that adds them.
 */
export const DEFAULT_DIRECT_EUID_RULES: DirectEuidRule[] = [
  { field: 'host.name', euidType: 'host' },
  { field: 'user.email', euidType: 'user' },
  { field: 'user.name', euidType: 'user' },
  { field: 'service.name', euidType: 'service' },
];

/**
 * Builds the Step 2 ES|QL override for a raw_identifiers-based relationship
 * maintainer, generic over the relationship key and the set of `rules` an
 * integration declares.
 *
 * Each rule maps a raw_identifiers leaf to an EUID type; the query prefixes that
 * field's values as `CONCAT("<type>:", value)`. Multiple rules are unioned
 * (MV_APPEND), expanded, and de-duplicated via `STATS VALUES(...)`, so one query
 * handles any integration's mix of directly-constructible identifier fields.
 *
 * Source is the entity index. actorUserId = entity.id (already type-prefixed),
 * so user, host, and service actors are handled in one pass without filtering by
 * entity.type. The watermark is on entity.lifecycle.last_seen (advances only on
 * real activity), not @timestamp (the transform's write time, which churns
 * unrelatedly).
 *
 * Required output columns (see parseTargetsPerActorRows): actorUserId, <relationshipKey>.
 */
export function buildRawIdentifiersEsqlQuery({
  relationshipKey,
  rules,
  namespace,
  lastProcessedTimestamp,
  entitySource,
}: {
  relationshipKey: EntityRelationshipKey;
  rules: DirectEuidRule[];
  namespace: string;
  lastProcessedTimestamp?: string;
  /** When set, restricts the query to entities produced by this integration source (entity.source term). */
  entitySource?: string;
}): string {
  const entityIndex = getLatestEntityIndexPattern(namespace);
  const rawIdentifiersPrefix = `entity.relationships.${relationshipKey}.raw_identifiers`;

  const entitySourceClause = entitySource ? `\n    AND entity.source == "${entitySource}"` : '';
  const watermarkClause = lastProcessedTimestamp
    ? `\n    AND entity.lifecycle.last_seen > "${lastProcessedTimestamp}"`
    : '';

  // Surface rows where ANY declared raw field exists.
  const existenceClause = rules
    .map((r) => `${rawIdentifiersPrefix}.${r.field} IS NOT NULL`)
    .join(' OR ');

  // MV_EXPAND each raw field BEFORE CONCAT so that multi-valued fields are
  // expanded to single values first. ES|QL CONCAT returns NULL when any argument
  // is multi-valued, so CONCAT-before-expand silently drops all targets for actors
  // that administer more than one entity. Each rule gets its own rawKey + expand
  // step so values keep their correct type prefix through the CONCAT.
  const perFieldSteps = rules
    .map(
      (r, i) =>
        `EVAL rawKey${i} = ${rawIdentifiersPrefix}.${r.field}\n| MV_EXPAND rawKey${i}\n| EVAL t${i} = CONCAT("${r.euidType}:", rawKey${i})`
    )
    .join('\n| ');
  const unionExpr =
    rules.length === 1 ? `t0` : `MV_APPEND(${rules.map((_, i) => `t${i}`).join(', ')})`;

  return `FROM ${entityIndex}
| WHERE (${existenceClause})${entitySourceClause}${watermarkClause}
| EVAL ${ENGINE_COLUMNS.actor} = entity.id
| ${perFieldSteps}
| EVAL targetEntityId = ${unionExpr}
| WHERE COALESCE(targetEntityId, "") != "" AND targetEntityId RLIKE ".+:.+"
| STATS ${relationshipKey} = VALUES(targetEntityId) BY ${ENGINE_COLUMNS.actor}
| WHERE COALESCE(${ENGINE_COLUMNS.actor}, "") != ""
| LIMIT ${COMPOSITE_PAGE_SIZE}`;
}

/**
 * Builds the `compositeAggAdditionalFilters` existence gate for a
 * raw_identifiers-based maintainer: surface entities that carry a raw identifier
 * under any of the given leaves. Optionally also gate on additional leaves that
 * are NOT resolved in Step 2 (e.g. AD's host.id) so the actor set stays complete
 * and consistent with what the pipeline can emit.
 */
export function buildRawIdentifiersExistenceGate({
  relationshipKey,
  fields,
}: {
  relationshipKey: EntityRelationshipKey;
  fields: string[];
}) {
  const rawIdentifiersPrefix = `entity.relationships.${relationshipKey}.raw_identifiers`;
  return {
    bool: {
      should: fields.map((field) => ({
        exists: { field: `${rawIdentifiersPrefix}.${field}` },
      })),
      minimum_should_match: 1,
    },
  };
}
