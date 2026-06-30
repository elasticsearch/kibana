/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ISO_DATE_REGEX } from '../../../../schedule/constants';
import {
  MAX_ID_LENGTH,
  MAX_SNOOZED_INSTANCE_CONDITIONS,
  MAX_SNOOZED_INSTANCE_ID_LENGTH,
  MAX_SNOOZED_CONDITION_FIELD_LENGTH,
  MAX_SNOOZE_EXPIRES_AT_LENGTH,
} from '../../../../../max_alert_limit';

const validateIsoDate = (value: string) => {
  if (!ISO_DATE_REGEX.test(value) || isNaN(Date.parse(value))) {
    return `string is not a valid ISO date: ${value}. Use ISO 8601 YYYY-MM-DDTHH:mm:ss.sssZ`;
  }
};

const snoozeConditionSchema = schema.oneOf([
  schema.object(
    {
      type: schema.literal('field_change'),
      field: schema.string({
        maxLength: MAX_SNOOZED_CONDITION_FIELD_LENGTH,
        meta: {
          description:
            'The alert field to watch, written as a dot-notation path. When the value of the specified alert field changes, the snooze expires',
        },
      }),
    },
    {
      meta: {
        description: 'Expires the snooze when the value of the specified alert field changes.',
      },
    }
  ),
  schema.object(
    {
      type: schema.literal('severity_change'),
    },
    {
      meta: { description: 'Expires the snooze when the severity of the specified alert changes.' },
    }
  ),
  schema.object(
    {
      type: schema.literal('severity_equals'),
      value: schema.oneOf(
        [
          schema.literal('critical'),
          schema.literal('high'),
          schema.literal('medium'),
          schema.literal('low'),
          schema.literal('info'),
        ],
        {
          meta: {
            description: 'The target severity level: critical, high, medium, low, or info.',
          },
        }
      ),
    },
    {
      meta: {
        description:
          'Expires the snooze when the severity of the specified alert equals a target level.',
      },
    }
  ),
]);

export const snoozeAlertParamsSchema = schema.object({
  rule_id: schema.string({
    maxLength: MAX_ID_LENGTH,
    meta: {
      description: 'The identifier for the rule.',
    },
  }),
  alert_id: schema.string({
    maxLength: MAX_SNOOZED_INSTANCE_ID_LENGTH,
    meta: {
      description: 'The identifier for the alert.',
    },
  }),
});

export const snoozeAlertQuerySchema = schema.maybe(
  schema.object({
    validate_alerts_existence: schema.maybe(
      schema.boolean({
        defaultValue: true,
        meta: {
          description:
            'Set to `true` to validate that the specified alert exists. If a `400` error is returned, the specified alert does not exist. Defaults to `true`.',
        },
      })
    ),
  })
);

export const snoozeAlertBodySchema = schema.object(
  {
    expires_at: schema.maybe(
      schema.string({
        maxLength: MAX_SNOOZE_EXPIRES_AT_LENGTH,
        validate: (value) => validateIsoDate(value),
        meta: {
          description:
            'The datetime at which the snooze expires, in ISO 8601 format (`YYYY-MM-DDTHH:mm:ss.sssZ`). When omitted, the snooze persists indefinitely unless manually removed or a defined condition is met.',
        },
      })
    ),
    conditions: schema.maybe(
      schema.arrayOf(snoozeConditionSchema, {
        maxSize: MAX_SNOOZED_INSTANCE_CONDITIONS,
        meta: {
          description:
            'One or more conditions that, when met, automatically expire the snooze. Supported types: `field_change`, `severity_change`, `severity_equals`.',
        },
      })
    ),
    condition_operator: schema.maybe(
      schema.oneOf([schema.literal('any'), schema.literal('all')], {
        meta: {
          description:
            'Logical operator applied to the conditions array. ' +
            '"any" expires the snooze when at least one condition is met; ' +
            '"all" requires every condition to be met. ' +
            'When conditions are provided but this field is omitted, defaults to "any".',
        },
      })
    ),
  },
  {
    validate: (value) => {
      if (value.expires_at === undefined && value.conditions === undefined) {
        return 'either [expires_at] or [conditions] must be provided';
      }

      if (value.conditions !== undefined && value.conditions.length === 0) {
        return '[conditions] must contain at least one condition';
      }

      if (value.expires_at !== undefined && new Date(value.expires_at) <= new Date()) {
        return '[expires_at] must be in the future';
      }
    },
  }
);
