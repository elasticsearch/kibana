/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import { scheduleRequestSchemaV1 } from '../../../../../schedule';

export const createMaintenanceWindowRequestBodySchema = schema.object(
  {
    title: schema.string({
      meta: {
        description:
          'The name of the maintenance window. While this name does not have to be unique, a distinctive name can help you identify a specific maintenance window.',
      },
    }),
    enabled: schema.maybe(
      schema.boolean({
        meta: {
          description:
            'Whether the current maintenance window is enabled. Disabled maintenance windows do not suppress notifications.',
        },
        defaultValue: true,
      })
    ),
    schedule: schema.object({
      custom: scheduleRequestSchemaV1,
    }),
    scope: schema.maybe(
      schema.object(
        {
          alerting: schema.object({
            query: schema.object({
              kql: schema.string({
                meta: {
                  description:
                    'A filter written in Kibana Query Language (KQL). Only alerts matching this query will be suppressed by the maintenance window.',
                },
              }),
            }),
          }),
        },
        { meta: { id: 'maintenance_window_scope' } }
      )
    ),
  },
  { meta: { id: 'new_maintenance_window' } }
);
