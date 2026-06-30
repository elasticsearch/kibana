/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  COUNTRY_CODES_MAX_SIZE,
  DETAIL_PAGE_SIZE_MAX,
  INDEX_PATTERN_REGEX,
  INDEX_PATTERNS_MAX_SIZE,
  IPS_MAX_SIZE,
} from '../graph/v1';

// ============================================
// ENTITIES ENDPOINT: /internal/cloud_security_posture/graph/entities
// ============================================

export const entityItemSchema = schema.object({
  id: schema.string(),
  timestamp: schema.maybe(schema.string()),
  name: schema.maybe(schema.string()),
  type: schema.maybe(schema.string()),
  subType: schema.maybe(schema.string()),
  ecsParentField: schema.maybe(schema.string()),
  // Risk score is not currently populated but will be in a future iteration
  risk: schema.maybe(schema.number()),
  icon: schema.maybe(schema.string()),
  availableInEntityStore: schema.maybe(schema.boolean()),
  host: schema.maybe(
    schema.object({
      ip: schema.maybe(schema.string()),
    })
  ),
  ips: schema.maybe(schema.arrayOf(schema.string(), { maxSize: IPS_MAX_SIZE })),
  countryCodes: schema.maybe(schema.arrayOf(schema.string(), { maxSize: COUNTRY_CODES_MAX_SIZE })),
});

export const entitiesRequestSchema = schema.object({
  page: schema.object({
    index: schema.number({ min: 0 }),
    size: schema.number({ min: 1, max: DETAIL_PAGE_SIZE_MAX }),
  }),
  query: schema.object({
    entityIds: schema.arrayOf(schema.string(), { minSize: 1, maxSize: 5000 }),
    start: schema.oneOf([schema.number(), schema.string()]),
    end: schema.oneOf([schema.number(), schema.string()]),
    indexPatterns: schema.maybe(
      schema.arrayOf(
        schema.string({
          minLength: 1,
          validate: (value) => {
            if (!INDEX_PATTERN_REGEX.test(value)) {
              return `Invalid index pattern: ${value}. Contains illegal characters.`;
            }
          },
        }),
        { minSize: 1, maxSize: INDEX_PATTERNS_MAX_SIZE }
      )
    ),
  }),
});

export const entitiesResponseSchema = () =>
  schema.object({
    entities: schema.arrayOf(entityItemSchema, { maxSize: DETAIL_PAGE_SIZE_MAX }),
    totalRecords: schema.number(),
  });
