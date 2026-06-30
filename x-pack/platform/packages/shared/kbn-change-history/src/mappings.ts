/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mappings, type MappingsDefinition } from '@kbn/es-mappings';

/**
 * Elasticsearch mappings for change history documents.
 * Uses unmapped fields for variable structures (`object.snapshot`: full object after each change)
 * and flattened type for `metadata`.
 * Do not map `kibana.space_ids` here — `@kbn/data-streams` injects reserved `kibana` mappings for all data streams.
 * For field reference @see [README.md]
 */
export const changeHistoryMappings = {
  v1: {
    dynamic: false,
    properties: {
      '@timestamp': mappings.date(),

      ecs: mappings.object({
        properties: {
          version: mappings.keyword(),
        },
      }),

      user: mappings.object({
        properties: {
          id: mappings.keyword(),
          name: mappings.keyword(),
        },
      }),

      event: mappings.object({
        properties: {
          id: mappings.keyword(),
          module: mappings.keyword(),
          dataset: mappings.keyword(),
          action: mappings.keyword(),
          type: mappings.keyword(),
          reason: mappings.text(),
          created: mappings.date(),
        },
      }),

      span: mappings.object({
        properties: {
          id: mappings.keyword(),
        },
      }),

      object: mappings.object({
        properties: {
          id: mappings.keyword(),
          type: mappings.keyword(),
          hash: mappings.keyword(),
          sequence: mappings.long(),
          fields: mappings.object({
            properties: {
              hashed: mappings.keyword(),
              redacted: mappings.keyword(),
            },
          }),
          // snapshot: mappings.object(), // <- unmapped field, please keep me commented out.
        },
      }),

      tags: mappings.keyword(),

      metadata: mappings.flattened(),

      // <- managed upstream by `@kbn/data-streams`, please keep me commented out.
      // kibana: mappings.object({
      //   properties: {
      //     space_ids: mappings.keyword(),
      //   },
      // }),

      service: mappings.object({
        properties: {
          type: mappings.keyword(),
          version: mappings.keyword(),
        },
      }),
    },
  },
} satisfies Record<string, MappingsDefinition>;
