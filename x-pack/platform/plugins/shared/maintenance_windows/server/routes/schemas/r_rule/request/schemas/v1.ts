/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { validateTimezone } from '../../../schedule/validation';
import {
  validateStartDateV1,
  validateEndDateV1,
  validateRecurrenceByWeekdayV1,
} from '../../validation';

export const rRuleRequestSchema = schema.object(
  {
    dtstart: schema.string({ validate: validateStartDateV1, maxLength: 100 }),
    tzid: schema.string({ validate: validateTimezone, maxLength: 64 }),
    freq: schema.maybe(
      schema.oneOf([
        schema.literal(0),
        schema.literal(1),
        schema.literal(2),
        schema.literal(3),
        schema.literal(4),
      ])
    ),
    interval: schema.maybe(
      schema.number({
        validate: (interval: number) => {
          if (!Number.isInteger(interval)) {
            return 'rRule interval must be an integer greater than 0';
          }
        },
        min: 1,
      })
    ),
    until: schema.maybe(schema.string({ validate: validateEndDateV1, maxLength: 100 })),
    count: schema.maybe(
      schema.number({
        validate: (count: number) => {
          if (!Number.isInteger(count)) {
            return 'rRule count must be an integer greater than 0';
          }
        },
        min: 1,
      })
    ),
    byweekday: schema.maybe(
      schema.arrayOf(schema.string({ maxLength: 10 }), {
        minSize: 1,
        maxSize: 50,
        validate: validateRecurrenceByWeekdayV1,
      })
    ),
    bymonthday: schema.maybe(
      schema.arrayOf(schema.number({ min: 1, max: 31 }), { minSize: 1, maxSize: 31 })
    ),
    bymonth: schema.maybe(
      schema.arrayOf(schema.number({ min: 1, max: 12 }), { minSize: 1, maxSize: 12 })
    ),
  },
  { meta: { id: 'maintenance_window_r_rule_request' } }
);
