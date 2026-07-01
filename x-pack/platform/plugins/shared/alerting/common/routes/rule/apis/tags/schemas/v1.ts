/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import { DEFAULT_TAGS_PER_PAGEV1 } from '../constants/v1';
import {
  MAX_TAGS_PER_PAGE,
  MAX_SEARCH_LENGTH,
  MAX_ID_LENGTH,
  MAX_ARRAY_FIELDS,
} from '../../../../../constants';

export const ruleTagsRequestQuerySchema = schema.object({
  page: schema.number({ defaultValue: 1, min: 1 }),
  per_page: schema.maybe(
    schema.number({ defaultValue: DEFAULT_TAGS_PER_PAGEV1, min: 1, max: MAX_TAGS_PER_PAGE })
  ),
  search: schema.maybe(schema.string({ maxLength: MAX_SEARCH_LENGTH })),
  rule_type_ids: schema.maybe(
    schema.oneOf([
      schema.string({ maxLength: MAX_ID_LENGTH }),
      schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
        maxSize: MAX_ARRAY_FIELDS,
      }),
    ])
  ),
});

export const ruleTagsFormattedResponseSchema = schema.object(
  {
    total: schema.number(),
    page: schema.number(),
    perPage: schema.number(),
    data: schema.arrayOf(schema.string()),
  },
  { meta: { id: 'rule_tags_response' } }
);
