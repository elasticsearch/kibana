/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ML_ENTITY_FIELD_OPERATIONS, ML_ENTITY_FIELD_TYPE } from './anomaly_utils';

const mlEntityFieldTypeSchema = schema.oneOf([
  schema.literal(ML_ENTITY_FIELD_TYPE.BY),
  schema.literal(ML_ENTITY_FIELD_TYPE.OVER),
  schema.literal(ML_ENTITY_FIELD_TYPE.PARTITION),
]);

const mlEntityFieldOperationSchema = schema.oneOf([
  schema.literal(ML_ENTITY_FIELD_OPERATIONS.ADD),
  schema.literal(ML_ENTITY_FIELD_OPERATIONS.REMOVE),
]);

export const influencerSchema = schema.object({
  fieldName: schema.string({ maxLength: 10000 }),
  fieldValue: schema.any(),
});

export const criteriaFieldSchema = schema.object({
  fieldName: schema.string({ maxLength: 10000 }),
  fieldValue: schema.any(),
  fieldType: schema.maybe(mlEntityFieldTypeSchema),
});

export const mlEntityFieldValueSchema = schema.oneOf([
  schema.string({ maxLength: 10000 }),
  schema.number(),
]);

export const mlEntityFieldSchema = schema.object({
  fieldName: schema.string({ maxLength: 10000 }),
  fieldValue: schema.maybe(mlEntityFieldValueSchema),
  fieldType: schema.maybe(mlEntityFieldTypeSchema),
  operation: schema.maybe(mlEntityFieldOperationSchema),
  cardinality: schema.maybe(schema.number()),
});
