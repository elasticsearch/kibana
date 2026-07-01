/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Condition } from '@kbn/streamlang';
import {
  ENTITY_SOURCE_FIELD_EVALUATION,
  fieldNotOneOfCondition,
  getCommonFieldDescriptions,
  getEntityFieldsDescriptions,
  isNotEmptyCondition,
} from './common_fields';
import type { EntityDefinitionWithoutId } from './entity_schema';
import {
  ENTITY_CONFIDENCE,
  LOCAL_NAMESPACE_EXCLUDED_USER_NAMES,
  USER_ENTITY_NAMESPACE,
} from './user_entity_constants';
import { collectValues as collect, newestValue, oldestValue } from './field_retention_operations';

/** Shared post-LOOKUP keep: entity already in store. */
const entityIdExistsAfterLookup = { field: 'entity.id', exists: true } as const;

const idpGate: Condition = {
  or: [
    { field: 'event.kind', includes: 'asset' },

    {
      and: [
        {
          or: [
            // event.kind is not enrichment
            { field: 'event.kind', neq: 'enrichment' },
            // or event.kind doesn't exist
            { field: 'event.kind', exists: false },
          ],
        },

        // and event.category is iam
        { field: 'event.category', includes: 'iam' },

        // and event.type is user, creation, deletion or group
        {
          or: [
            { field: 'event.type', includes: 'user' },
            { field: 'event.type', includes: 'creation' },
            { field: 'event.type', includes: 'deletion' },
            { field: 'event.type', includes: 'group' },
          ],
        },
      ],
    },
  ],
};

const localNamespaceGate: Condition = {
  and: [
    isNotEmptyCondition('user.name'),
    isNotEmptyCondition('host.id'),
    fieldNotOneOfCondition('user.name', [...LOCAL_NAMESPACE_EXCLUDED_USER_NAMES]),
  ],
};

export const userEntityDefinition: EntityDefinitionWithoutId = {
  type: 'user',
  name: `Security 'user' Entity Store Definition`,
  fieldEvaluations: [ENTITY_SOURCE_FIELD_EVALUATION],
  identityField: {
    /**
     * UEBA user documents filter (pre-aggregation: which documents enter the pipeline).
     * event.outcome not failure AND contains id candiate fields.
     */
    documentsFilter: {
      and: [
        // Can't have a failure outcome
        {
          or: [
            { field: 'event.outcome', exists: false },
            { field: 'event.outcome', neq: 'failure' },
          ],
        },

        // user.email, user.id or user.name is present
        {
          or: [
            isNotEmptyCondition('user.email'),
            isNotEmptyCondition('user.id'),
            isNotEmptyCondition('user.name'),
          ],
        },
      ],
    },

    fieldEvaluations: [
      {
        // Generates the namespace used to classify the entity
        destination: 'entity.namespace',

        // First non empty value is used as source for `sourceMatchesAny`
        sources: [
          { field: 'event.module' },
          { firstChunkOfField: 'data_stream.dataset', splitBy: '.' },
        ],
        fallbackValue: 'unknown',
        whenClauses: [
          // early match local namespace so we don't override IDP ones
          {
            condition: {
              and: [
                // contains valid local user.name and host.id
                localNamespaceGate,
                {
                  or: [
                    // Rule of Host-Authoritative Source Exclusion
                    // If it's asset, with host.id + user.name, it's asset.
                    { field: 'event.kind', includes: 'asset' },

                    // Or it's not an IDP event
                    { not: idpGate },
                  ],
                },
              ],
            },
            then: USER_ENTITY_NAMESPACE.Local,
          },
          {
            condition: { field: 'event.kind', includes: 'asset' },
            then: {
              field: 'cloud.provider',
              mapping: { aws: 'aws', gcp: 'gcp', azure: 'entra_id' },
            },
          },
          { sourceMatchesAny: ['okta', 'entityanalytics_okta'], then: 'okta' },
          { sourceMatchesAny: ['azure', 'entityanalytics_entra_id'], then: 'entra_id' },
          { sourceMatchesAny: ['o365', 'o365_metrics'], then: 'microsoft_365' },
          { sourceMatchesAny: ['entityanalytics_ad'], then: 'active_directory' },
        ],
      },
    ],
    euidRanking: {
      branches: [
        {
          when: { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
          ranking: [
            [
              { field: 'user.name' },
              { sep: '@' },
              { field: 'host.id' },
              { sep: '@' },
              { field: 'entity.namespace' },
            ],
          ],
        },
        {
          ranking: [
            [{ field: 'user.email' }, { sep: '@' }, { field: 'entity.namespace' }],
            [{ field: 'user.id' }, { sep: '@' }, { field: 'entity.namespace' }],
            [
              { field: 'user.name' },
              { sep: '@' },
              { field: 'user.domain' },
              { sep: '@' },
              { field: 'entity.namespace' },
            ],
            [{ field: 'user.name' }, { sep: '@' }, { field: 'entity.namespace' }],
          ],
        },
      ],
    },
  },
  entityTypeFallback: 'Identity',
  indexPatterns: [],
  /** Post-aggregation filter (after LOOKUP JOIN)*/
  postAggFilter: {
    or: [
      // If the entity already exists in the store, it doesn't matter any of the gates
      entityIdExistsAfterLookup,

      // If it's local namespace, no need to check idps
      { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },

      // It's IDP
      idpGate,
    ],
  },

  /**
   * Post-STATS: entity.name for local vs non-local; entity.confidence from namespace (local → medium,
   * else → high). Logs ESQL maps to `recent.*` after STATS.
   */
  whenConditionTrueSetFieldsAfterStats: [
    {
      condition: {
        and: [
          { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
          isNotEmptyCondition('host.name'),
        ],
      },
      fields: {
        'entity.name': { composition: { fields: ['user.name', 'host.name'], sep: '@' } },
      },
    },
    {
      condition: {
        and: [
          { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
          { not: isNotEmptyCondition('host.name') },
        ],
      },
      fields: {
        'entity.name': { source: 'user.name' },
      },
    },
    {
      condition: { field: 'entity.namespace', neq: USER_ENTITY_NAMESPACE.Local },
      fields: {
        'entity.name': { source: 'user.name' },
        'entity.confidence': ENTITY_CONFIDENCE.High,
      },
    },
    {
      condition: { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
      fields: {
        'entity.confidence': ENTITY_CONFIDENCE.Medium,
      },
    },
  ],
  fields: [
    newestValue({ source: 'entity.name' }),
    collect({ source: 'event.kind' }),
    collect({ source: 'event.category' }),
    collect({ source: 'event.type' }),
    collect({ source: 'event.outcome' }),

    newestValue({ source: 'cloud.provider' }),

    newestValue({ source: 'entity.namespace' }),
    oldestValue({ source: 'entity.confidence' }),

    collect({ source: 'user.domain' }),
    collect({ source: 'user.email' }),
    newestValue({ source: 'user.name' }),
    collect({
      source: 'user.full_name',
      mapping: {
        type: 'keyword',
        fields: {
          text: {
            type: 'match_only_text',
          },
        },
      },
    }),
    collect({ source: 'user.hash' }),
    collect({ source: 'user.id' }),
    collect({ source: 'user.roles' }),
    collect({ source: 'user.group.domain' }),
    collect({ source: 'user.group.id' }),
    collect({ source: 'user.group.name' }),
    ...getCommonFieldDescriptions('user'),
    ...getEntityFieldsDescriptions('user'),

    /* Used to populate the identity field */
    collect({ source: 'host.entity.id' }),
    collect({ source: 'host.id' }),
    newestValue({ source: 'host.name' }),
  ],
} as const satisfies EntityDefinitionWithoutId;
