/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getLatestEntityIndexPattern } from '@kbn/entity-store/common/domain/entity_index';
import type { RelationshipIntegrationConfig } from '../engine/types';
import {
  buildRawIdentifiersEsqlQuery,
  buildRawIdentifiersExistenceGate,
  type DirectEuidRule,
} from '../engine/build_raw_identifiers_query';

const RELATIONSHIP_KEY = 'administers';
const AD_ENTITY_SOURCE = 'entityanalytics_ad';

// host.id carries an LDAP DN, not a valid EUID basis — only host.name (FQDN) is directly resolvable.
const AD_ADMINISTERS_RULES: DirectEuidRule[] = [{ field: 'host.name', euidType: 'host' }];

export function buildAdministersConfigs(
  lastProcessedTimestamp?: string
): RelationshipIntegrationConfig[] {
  return [
    {
      kind: 'override',
      id: 'entityanalytics_ad',
      name: 'Active Directory Entity Analytics',
      // Step 1 actor discovery reads the entity index (actors are entity docs,
      // users or hosts), not raw logs.
      indexPattern: getLatestEntityIndexPattern,
      targetEntityType: 'host',
      relationshipKey: RELATIONSHIP_KEY,
      // Discover actors by entity.id (present on every entity). Without this the
      // engine defaults to USER_IDENTITY_FIELDS, which host entities lack → 0 buckets.
      customActor: {
        fields: ['entity.id'],
      },
      // Entity-index source: disable the engine's @timestamp now-30d lookback (a
      // log-index assumption that would drop entities) and gate on last_seen instead.
      disableLookbackWindow: true,
      // Targets are derived from raw_identifiers.host.name — a free-text field that
      // does not guarantee the named host is indexed as an entity. Validate before
      // writing to prevent dangling IDs in entity.relationships.administers.ids.
      validateTargetIds: true,
      compositeAggAdditionalFilters: [
        // Scope to AD-sourced entities. entity.source is a single value per entity, so
        // each integration's maintainer processes a disjoint actor set — no cross-maintainer
        // overwrite risk even though the ids write is a replace, not a union.
        { term: { 'entity.source': AD_ENTITY_SOURCE } },
        buildRawIdentifiersExistenceGate({
          relationshipKey: RELATIONSHIP_KEY,
          fields: ['host.name'],
        }),
        ...(lastProcessedTimestamp
          ? [{ range: { 'entity.lifecycle.last_seen': { gt: lastProcessedTimestamp } } }]
          : []),
      ],
      esqlQueryOverride: (ns) =>
        buildRawIdentifiersEsqlQuery({
          relationshipKey: RELATIONSHIP_KEY,
          rules: AD_ADMINISTERS_RULES,
          namespace: ns,
          lastProcessedTimestamp,
          entitySource: AD_ENTITY_SOURCE,
        }),
    },
  ];
}

// Static export for tests that don't need a watermark.
export const ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS = buildAdministersConfigs();
