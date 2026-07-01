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

const RELATIONSHIP_KEY = 'owns';
const OKTA_ENTITY_SOURCE = 'entityanalytics_okta';

// owns.host.id is an Okta device id. Device entities now key on host.id (set by
// device.yml `set_host_id` tag), so a device's entity.id is `host:<device.id>`.
// This makes host.id directly resolvable as a host EUID — unlike AD's host.id
// which carries an LDAP DN.
// owns.host.name (device display name) is NOT a resolvable identifier: device
// entities are keyed by id, not display name, so we resolve only host.id.
const OKTA_OWNS_RULES: DirectEuidRule[] = [{ field: 'host.id', euidType: 'host' }];

export function buildOwnsConfigs(lastProcessedTimestamp?: string): RelationshipIntegrationConfig[] {
  return [
    {
      kind: 'override',
      id: OKTA_ENTITY_SOURCE,
      name: 'Okta Entity Analytics',
      // Step 1 actor discovery reads the entity index (actors are user entity docs).
      indexPattern: getLatestEntityIndexPattern,
      targetEntityType: 'host',
      relationshipKey: RELATIONSHIP_KEY,
      // Discover actors by entity.id (present on every entity). Without this the
      // engine defaults to USER_IDENTITY_FIELDS, which may miss users that lack
      // a canonical email field.
      customActor: {
        fields: ['entity.id'],
      },
      // Entity-index source: disable the engine's @timestamp now-30d lookback (a
      // log-index assumption that would drop entity docs) and gate on last_seen instead.
      disableLookbackWindow: true,
      // Targets are derived from raw_identifiers.host.id — validate before writing
      // to prevent dangling IDs when a device has no entity document.
      validateTargetIds: true,
      compositeAggAdditionalFilters: [
        { term: { 'entity.source': OKTA_ENTITY_SOURCE } },
        buildRawIdentifiersExistenceGate({
          relationshipKey: RELATIONSHIP_KEY,
          fields: ['host.id'],
        }),
        ...(lastProcessedTimestamp
          ? [{ range: { 'entity.lifecycle.last_seen': { gt: lastProcessedTimestamp } } }]
          : []),
      ],
      esqlQueryOverride: (ns) =>
        buildRawIdentifiersEsqlQuery({
          relationshipKey: RELATIONSHIP_KEY,
          rules: OKTA_OWNS_RULES,
          namespace: ns,
          lastProcessedTimestamp,
          entitySource: OKTA_ENTITY_SOURCE,
        }),
    },
  ];
}

// Static export for tests that don't need a watermark.
export const OWNS_INTEGRATION_RELATIONSHIP_CONFIGS = buildOwnsConfigs();
