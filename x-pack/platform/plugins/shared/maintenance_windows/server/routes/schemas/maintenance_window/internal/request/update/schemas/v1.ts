/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { maintenanceWindowCategoryIdsSchemaV1 } from '../../../../shared';
import { ID_MAX_LENGTH, TITLE_MAX_LENGTH } from '../../../../shared/constants/latest';
import { rRuleRequestSchemaV1 } from '../../../../../r_rule';
import { alertsFilterQuerySchemaV1 } from '../../../../../alerts_filter_query';

export const updateParamsSchema = schema.object({
  id: schema.string({ maxLength: ID_MAX_LENGTH }),
});

export const updateBodySchema = schema.object({
  title: schema.maybe(schema.string({ maxLength: TITLE_MAX_LENGTH })),
  enabled: schema.maybe(schema.boolean()),
  duration: schema.maybe(schema.number()),
  r_rule: schema.maybe(rRuleRequestSchemaV1),
  category_ids: maintenanceWindowCategoryIdsSchemaV1,
  scoped_query: schema.maybe(schema.nullable(alertsFilterQuerySchemaV1)),
});
