/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import { ruleResponseInternalSchema } from '../../../../response/schemas/v1';
import {
  MAX_PER_PAGE,
  MAX_KQL_FILTER_LENGTH,
  MAX_ID_LENGTH,
  MAX_FIELD_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SAVED_OBJECT_TYPE_LENGTH,
  MAX_ARRAY_FIELDS,
} from '../../../../../../constants';

export const findRulesInternalRequestBodySchema = schema.object({
  per_page: schema.number({
    defaultValue: 10,
    min: 0,
    max: MAX_PER_PAGE,
  }),
  page: schema.number({
    defaultValue: 1,
    min: 1,
  }),
  search: schema.maybe(schema.string({ maxLength: MAX_KQL_FILTER_LENGTH })),
  default_search_operator: schema.oneOf([schema.literal('OR'), schema.literal('AND')], {
    defaultValue: 'OR',
  }),
  search_fields: schema.maybe(
    schema.oneOf([
      schema.arrayOf(schema.string({ maxLength: MAX_FIELD_NAME_LENGTH }), {
        maxSize: MAX_ARRAY_FIELDS,
      }),
      schema.string({ maxLength: MAX_FIELD_NAME_LENGTH }),
    ])
  ),
  sort_field: schema.maybe(schema.string({ maxLength: MAX_FIELD_NAME_LENGTH })),
  sort_order: schema.maybe(schema.oneOf([schema.literal('asc'), schema.literal('desc')])),
  has_reference: schema.maybe(
    // use nullable as maybe is currently broken
    // in config-schema
    schema.nullable(
      schema.object({
        type: schema.string({ maxLength: MAX_SAVED_OBJECT_TYPE_LENGTH }),
        id: schema.string({ maxLength: MAX_ID_LENGTH }),
      })
    )
  ),
  fields: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: MAX_FIELD_NAME_LENGTH }), {
      maxSize: MAX_ARRAY_FIELDS,
    })
  ),
  filter: schema.maybe(schema.string({ maxLength: MAX_KQL_FILTER_LENGTH })),
  rule_type_ids: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), { maxSize: MAX_ARRAY_FIELDS })
  ),
  consumers: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: MAX_NAME_LENGTH }), {
      maxSize: MAX_ARRAY_FIELDS,
    })
  ),
});

const findRulesInternalResponseDataSchema = schema.arrayOf(ruleResponseInternalSchema);

export const findRulesInternalResponseSchema = schema.object({
  page: schema.number(),
  per_page: schema.number(),
  total: schema.number(),
  data: findRulesInternalResponseDataSchema,
});
