/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { maintenanceWindowResponseSchemaV1 } from '../../../response';
import {
  maintenanceWindowStatusSchema,
  maintenanceWindowPageSchema,
  maintenanceWindowPerPageSchema,
} from '../../../../shared/schemas/v1';
import { SEARCH_MAX_LENGTH, STATUS_FILTER_MAX_SIZE } from '../../../../shared/constants/latest';
import { validatePagination } from '../../../../shared/validation/v1';

export const findMaintenanceWindowsRequestQuerySchema = schema.object(
  {
    page: maintenanceWindowPageSchema,
    per_page: maintenanceWindowPerPageSchema,
    search: schema.maybe(
      schema.string({
        meta: {
          description:
            'An Elasticsearch simple_query_string query that filters the objects in the response.',
        },
        maxLength: SEARCH_MAX_LENGTH,
      })
    ),
    status: schema.maybe(
      schema.oneOf([
        maintenanceWindowStatusSchema,
        schema.arrayOf(maintenanceWindowStatusSchema, { maxSize: STATUS_FILTER_MAX_SIZE }),
      ])
    ),
  },
  {
    validate: validatePagination,
  }
);

export const findMaintenanceWindowsResponseBodySchema = schema.object({
  page: schema.number(),
  per_page: schema.number(),
  total: schema.number(),
  data: schema.arrayOf(maintenanceWindowResponseSchemaV1),
});
