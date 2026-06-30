/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Condition } from '@kbn/streamlang';
import type { EntityType, EntityField, FieldEvaluation } from './entity_schema';
import {
  collectValues,
  newestValue,
  oldestValue,
  managedValue,
} from './field_retention_operations';

/**
 * Dotted ECS paths collected into `entity.relationships.*.raw_identifiers.<path>`.
 * Keep `EntityRelationship.raw_identifiers` in `entity.schema.yaml` in sync (same paths plus
 * `entity.id` on the schema for target hints; ingest maps canonical EUIDs via `.entity.id` → `ids`).
 */
export const ENTITY_RELATIONSHIP_IDENTIFIER_FIELDS = [
  'host.id',
  'user.id',
  'user.email',
  'host.name',
  'user.name',
  'service.name',
] as const;

/**
 * Closed enum of every relationship-type identifier the entity store stores under
 * `entity.relationships.<key>`. Also consumed by maintainers (e.g. the relationship
 * engine in security_solution) so they can declare which keys their pipeline writes
 * to without re-stating the schema.
 */
export const ENTITY_RELATIONSHIP_COLLECT_LEAVES = [
  'administers',
  'communicates_with',
  'depends_on',
  'owns_inferred',
  'accesses_infrequently',
  'accesses_frequently',
  'owns',
  'supervises',
] as const;

export type EntityRelationshipKey = (typeof ENTITY_RELATIONSHIP_COLLECT_LEAVES)[number];

export const ENTITY_ID_FIELD = 'entity.id';
export const ENTITY_SOURCE_FIELD = 'entity.source';
// Copied from x-pack/solutions/security/plugins/security_solution/server/lib/entity_analytics/entity_store/entity_definitions/entity_descriptions/common.ts

export const getCommonFieldDescriptions = (
  ecsField: Omit<EntityType, 'generic'> | 'entity'
): EntityField[] => [
  newestValue({ source: 'asset.id' }),
  newestValue({ source: 'asset.name' }),
  newestValue({ source: 'asset.owner' }),
  newestValue({ source: 'asset.serial_number' }),
  newestValue({ source: 'asset.model' }),
  newestValue({ source: 'asset.vendor' }),
  newestValue({ source: 'asset.environment' }),
  newestValue({ source: 'asset.criticality' }),
  newestValue({ source: 'asset.business_unit' }),
  managedValue({
    destination: 'entity.risk.calculated_level',
  }),
  managedValue({
    destination: 'entity.risk.calculated_score',
    mapping: { type: 'float' },
  }),
  managedValue({
    destination: 'entity.risk.calculated_score_norm',
    mapping: { type: 'float' },
  }),
];

export const getEntityFieldsDescriptions = (rootField?: EntityType) => {
  const prefix = rootField ? `${rootField}.entity` : 'entity';

  return [
    collectValues({ source: 'event.module' }),
    collectValues({ source: 'event.dataset' }),
    collectValues({ source: 'data_stream.dataset' }),
    collectValues({ source: ENTITY_SOURCE_FIELD }),
    newestValue({ source: `${prefix}.type`, destination: 'entity.type' }),
    newestValue({ source: `${prefix}.sub_type`, destination: 'entity.sub_type' }),
    newestValue({ source: `${prefix}.url`, destination: 'entity.url' }),

    // ATTRIBUTES ------------------------------------------------------------
    managedValue({
      destination: 'entity.attributes.watchlists',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    newestValue({
      source: `${prefix}.attributes.asset`,
      destination: 'entity.attributes.asset',
      mapping: { type: 'boolean' },
      allowAPIUpdate: true,
    }),
    newestValue({
      source: `${prefix}.attributes.managed`,
      destination: 'entity.attributes.managed',
      mapping: { type: 'boolean' },
      allowAPIUpdate: true,
    }),
    newestValue({
      source: `${prefix}.attributes.mfa_enabled`,
      destination: 'entity.attributes.mfa_enabled',
      mapping: { type: 'boolean' },
      allowAPIUpdate: true,
    }),
    newestValue({
      source: `${prefix}.attributes.storage_class`,
      destination: 'entity.attributes.storage_class',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    collectValues({
      source: `${prefix}.attributes.permissions`,
      destination: 'entity.attributes.permissions',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    collectValues({
      source: `${prefix}.attributes.known_redirects`,
      destination: 'entity.attributes.known_redirects',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    newestValue({
      source: `${prefix}.attributes.oauth_consent_restriction`,
      destination: 'entity.attributes.oauth_consent_restriction',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),

    // LIFECYCLE ------------------------------------------------------------
    oldestValue({
      source: '@timestamp',
      destination: 'entity.lifecycle.first_seen',
      mapping: { type: 'date' },
    }),
    newestValue({
      source: '@timestamp',
      destination: 'entity.lifecycle.last_seen',
      mapping: { type: 'date' },
    }),
    // Raw indices have no entity.lifecycle.*; derive from @timestamp like last_seen.
    newestValue({
      source: `${prefix}.lifecycle.last_activity`,
      destination: 'entity.lifecycle.last_activity',
      mapping: { type: 'date' },
    }),

    // BEHAVIORS ------------------------------------------------------------
    // Behaviors are reset periodically by the history snapshot feature
    // The current reset implementation only resets lists and strings
    // if we ever add a boolean, reset via snapshot needs to be updated
    managedValue({
      destination: 'entity.behaviors.rule_names',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    managedValue({
      destination: 'entity.behaviors.anomaly_job_ids',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),

    // RELATIONSHIPS ------------------------------------------------------------
    // Source logs use flat `host.entity.relationships.<relationship>.<identifier>`; the entity index
    // stores raw bags under `raw_identifiers` and canonical EUIDs under `ids`.
    ...ENTITY_RELATIONSHIP_COLLECT_LEAVES.flatMap((relationship) => [
      ...ENTITY_RELATIONSHIP_IDENTIFIER_FIELDS.map((idField) =>
        collectValues({
          source: `${prefix}.relationships.${relationship}.${idField}`,
          destination: `entity.relationships.${relationship}.raw_identifiers.${idField}`,
          mapping: { type: 'keyword' },
          allowAPIUpdate: true,
        })
      ),
      collectValues({
        source: `${prefix}.relationships.${relationship}.entity.id`,
        destination: `entity.relationships.${relationship}.ids`,
        mapping: { type: 'keyword' },
        allowAPIUpdate: true,
      }),
    ]),
    managedValue({
      destination: 'entity.relationships.resolution.resolved_to',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    managedValue({
      destination: 'entity.relationships.resolution.risk.calculated_level',
      mapping: { type: 'keyword' },
      allowAPIUpdate: true,
    }),
    managedValue({
      destination: 'entity.relationships.resolution.risk.calculated_score',
      mapping: { type: 'float' },
      allowAPIUpdate: true,
    }),
    managedValue({
      destination: 'entity.relationships.resolution.risk.calculated_score_norm',
      mapping: { type: 'float' },
      allowAPIUpdate: true,
    }),
  ];
};

export const ENTITY_SOURCE_FIELD_EVALUATION: FieldEvaluation = {
  destination: ENTITY_SOURCE_FIELD,
  sources: [
    { field: 'event.module' },
    { field: 'event.dataset' },
    { field: 'data_stream.dataset' },
  ],
  fallbackValue: null,
  whenClauses: [],
};

export function isNotEmptyCondition(field: string): Condition {
  return {
    and: [
      { field, exists: true },
      { field, neq: '' },
    ],
  };
}

/** Returns a condition that is true when the field value is not one of the given values. */
export function fieldNotOneOfCondition(field: string, values: string[]): Condition {
  if (values.length === 0) {
    return { always: {} };
  }
  return {
    not: {
      or: values.map((v) => ({ field, eq: v })),
    },
  };
}
