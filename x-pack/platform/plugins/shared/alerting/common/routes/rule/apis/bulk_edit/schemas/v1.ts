/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { validateDurationV1 } from '../../../validation';
import { rRuleRequestSchemaV1 } from '../../../../r_rule';
import { notifyWhenSchemaV1 } from '../../../response';
import { ruleSnoozeScheduleSchemaV1 } from '../../../request';
import {
  MAX_RULE_IDS_BULK,
  MAX_BULK_EDIT_OPERATIONS,
  MAX_BULK_EDIT_ACTIONS,
  MAX_BULK_EDIT_TAGS,
  MAX_TAG_LENGTH,
  MAX_ID_LENGTH,
  MAX_KQL_FILTER_LENGTH,
  MAX_SNOOZE_SCHEDULE_IDS,
} from '../../../../../constants';

export const scheduleIdsSchema = schema.maybe(schema.arrayOf(schema.string()));

export const ruleSnoozeScheduleSchema = schema.object({
  id: schema.maybe(schema.string()),
  duration: schema.number(),
  rRule: rRuleRequestSchemaV1,
});

const ruleActionSchema = schema.object({
  group: schema.maybe(schema.string({ maxLength: MAX_ID_LENGTH })),
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
  params: schema.recordOf(schema.string(), schema.any(), { defaultValue: {} }),
  uuid: schema.maybe(schema.string({ maxLength: MAX_ID_LENGTH })),
  frequency: schema.maybe(
    schema.object({
      summary: schema.boolean(),
      throttle: schema.nullable(schema.string()),
      notifyWhen: notifyWhenSchemaV1,
    })
  ),
});

export const bulkEditOperationsSchema = schema.arrayOf(
  schema.oneOf([
    schema.object({
      operation: schema.oneOf([
        schema.literal('add'),
        schema.literal('delete'),
        schema.literal('set'),
      ]),
      field: schema.literal('tags'),
      value: schema.arrayOf(schema.string({ maxLength: MAX_TAG_LENGTH }), {
        maxSize: MAX_BULK_EDIT_TAGS,
      }),
    }),
    schema.object({
      operation: schema.oneOf([schema.literal('add'), schema.literal('set')]),
      field: schema.literal('actions'),
      value: schema.arrayOf(ruleActionSchema, { maxSize: MAX_BULK_EDIT_ACTIONS }),
    }),
    schema.object({
      operation: schema.literal('set'),
      field: schema.literal('schedule'),
      value: schema.object({ interval: schema.string({ validate: validateDurationV1 }) }),
    }),
    schema.object({
      operation: schema.literal('set'),
      field: schema.literal('throttle'),
      value: schema.nullable(schema.string()),
    }),
    schema.object({
      operation: schema.literal('set'),
      field: schema.literal('notifyWhen'),
      value: notifyWhenSchemaV1,
    }),
    schema.object({
      operation: schema.oneOf([schema.literal('set')]),
      field: schema.literal('snoozeSchedule'),
      value: ruleSnoozeScheduleSchemaV1,
    }),
    schema.object({
      operation: schema.oneOf([schema.literal('delete')]),
      field: schema.literal('snoozeSchedule'),
      value: schema.maybe(
        schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
          maxSize: MAX_SNOOZE_SCHEDULE_IDS,
        })
      ),
    }),
    schema.object({
      operation: schema.literal('set'),
      field: schema.literal('apiKey'),
    }),
  ]),
  { minSize: 1, maxSize: MAX_BULK_EDIT_OPERATIONS }
);

export const bulkEditRulesRequestBodySchema = schema.object(
  {
    filter: schema.maybe(schema.string({ maxLength: MAX_KQL_FILTER_LENGTH })),
    ids: schema.maybe(
      schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
        minSize: 1,
        maxSize: MAX_RULE_IDS_BULK,
      })
    ),
    operations: bulkEditOperationsSchema,
  },
  { meta: { id: 'bulk_edit_rules_request' } }
);
