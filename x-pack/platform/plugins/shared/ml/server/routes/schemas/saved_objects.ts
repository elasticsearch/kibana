/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const jobTypeLiterals = schema.oneOf([
  schema.literal('anomaly-detector'),
  schema.literal('data-frame-analytics'),
]);

export const itemTypeLiterals = schema.oneOf([
  schema.literal('anomaly-detector'),
  schema.literal('data-frame-analytics'),
  schema.literal('trained-model'),
]);

export const itemTypeSchema = schema.object({ jobType: itemTypeLiterals });
export const jobTypeSchema = schema.object({ jobType: jobTypeLiterals });

export const updateJobsSpaces = schema.object({
  jobType: jobTypeLiterals,
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  spacesToAdd: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  spacesToRemove: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
});

export const updateTrainedModelsSpaces = schema.object({
  modelIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  spacesToAdd: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  spacesToRemove: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
});

export const itemsAndCurrentSpace = schema.object({
  mlSavedObjectType: itemTypeLiterals,
  ids: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
});

export const syncJobObjects = schema.object({
  simulate: schema.maybe(schema.boolean()),
  addToAllSpaces: schema.maybe(schema.boolean()),
});

export const syncCheckSchema = schema.object({
  mlSavedObjectType: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const canDeleteMLSpaceAwareItemsSchema = schema.object({
  ids: schema.arrayOf(schema.string({ maxLength: 10000 }), {
    maxSize: 10000,
    meta: { description: 'List of job or trained model IDs' },
  }),
});
