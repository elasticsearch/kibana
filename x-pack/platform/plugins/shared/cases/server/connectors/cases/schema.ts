/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { z } from '@kbn/zod/v4';
import dateMath from '@kbn/datemath';
import {
  CASES_CONNECTOR_TIME_WINDOW_REGEX,
  MAX_ALERTS_PER_CASE,
  MAX_DOCS_PER_PAGE,
  MAX_TITLE_LENGTH,
  DEFAULT_MAX_OPEN_CASES,
  ABSOLUTE_MAX_CASES_PER_RUN,
  MAX_TEMPLATE_KEY_LENGTH,
  MAX_TEMPLATE_VERSION_STRING_LENGTH,
} from '../../../common/constants';

const AlertSchema = schema.recordOf(schema.string(), schema.any(), {
  validate: (value) => {
    if (!Object.hasOwn(value, '_id') || !Object.hasOwn(value, '_index')) {
      return 'Alert ID and index must be defined';
    }
  },
});

/**
 * At the moment only one field is supported for grouping
 */
const GroupingSchema = schema.arrayOf(schema.string(), { minSize: 0, maxSize: 1 });

const RuleSchema = schema.object({
  id: schema.string(),
  name: schema.string(),
  tags: schema.arrayOf(schema.string(), { defaultValue: [] }),
  ruleUrl: schema.nullable(schema.string()),
});

const ReopenClosedCasesSchema = schema.boolean({ defaultValue: false });
const TimeWindowSchema = schema.string({
  defaultValue: '7d',
  validate: (value) => {
    /**
     * Validates the time window.
     * Acceptable format:
     * - First character should be a digit from 1 to 9
     * - All next characters should be a digit from 0 to 9
     * - The last character should be d (day), w (week), h (hour), m (minute)
     *
     * Example: 20d, 2w, etc
     */
    const timeWindowRegex = new RegExp(CASES_CONNECTOR_TIME_WINDOW_REGEX, 'g');

    if (!timeWindowRegex.test(value)) {
      return 'Not a valid time window';
    }

    const date = dateMath.parse(`now-${value}`);

    if (!date || !date.isValid()) {
      return 'Not a valid time window';
    }

    const timeSize = value.slice(0, -1);
    const timeUnit = value.slice(-1);
    const timeSizeAsNumber = Number(timeSize);

    if (timeUnit === 'm' && timeSizeAsNumber < 5) {
      return 'Time window should be at least 5 minutes';
    }
  },
});

export const CasesGroupedAlertsSchema = schema.object({
  alerts: schema.arrayOf(AlertSchema, { maxSize: MAX_ALERTS_PER_CASE }),
  comments: schema.maybe(schema.arrayOf(schema.string(), { maxSize: MAX_DOCS_PER_PAGE / 2 })),
  grouping: schema.recordOf(schema.string(), schema.any()),
  title: schema.maybe(schema.string({ maxLength: MAX_TITLE_LENGTH })),
});

/**
 * The case connector does not have any configuration
 * or secrets.
 */
export const CasesConnectorConfigSchema = z.object({}).strict();
export const CasesConnectorSecretsSchema = z.object({}).strict();

export const CasesConnectorRunParamsSchema = schema.object({
  alerts: schema.arrayOf(AlertSchema),
  autoPushCase: schema.nullable(schema.boolean({ defaultValue: false })),
  groupedAlerts: schema.nullable(
    schema.arrayOf(CasesGroupedAlertsSchema, {
      defaultValue: [],
      minSize: 0,
    })
  ),
  groupingBy: GroupingSchema,
  owner: schema.string(),
  rule: RuleSchema,
  timeWindow: TimeWindowSchema,
  reopenClosedCases: ReopenClosedCasesSchema,
  maximumCasesToOpen: schema.number({
    defaultValue: DEFAULT_MAX_OPEN_CASES,
    min: 1,
    max: ABSOLUTE_MAX_CASES_PER_RUN,
  }),
  templateId: schema.nullable(schema.string({ maxLength: MAX_TEMPLATE_KEY_LENGTH })),
  templateVersion: schema.nullable(
    schema.string({ maxLength: MAX_TEMPLATE_VERSION_STRING_LENGTH })
  ),
  internallyManagedAlerts: schema.nullable(schema.boolean({ defaultValue: false })),
});

const ZAlertSchema = z.record(z.string(), z.any()).superRefine((value, ctx) => {
  if (!Object.hasOwn(value, '_id') || !Object.hasOwn(value, '_index')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Alert ID and index must be defined',
    });
  }
});

export const ZCasesGroupedAlertsSchema = z
  .object({
    alerts: z.array(ZAlertSchema).max(MAX_ALERTS_PER_CASE),
    comments: z
      .array(z.string())
      .max(MAX_DOCS_PER_PAGE / 2)
      .optional(),
    grouping: z.record(z.string(), z.any()),
    title: z.string().max(MAX_TITLE_LENGTH).optional(),
  })
  .strict();

const ZGroupingSchema = z.array(z.string()).min(0).max(1);
const ZRuleSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tags: z.array(z.string()).default([]),
    ruleUrl: z.string().nullable().default(null),
  })
  .strict();

const ZTimeWindowSchema = z
  .string()
  .default('7d')
  .superRefine((value, ctx) => {
    /**
     * Validates the time window.
     * Acceptable format:
     * - First character should be a digit from 1 to 9
     * - All next characters should be a digit from 0 to 9
     * - The last character should be d (day), w (week), h (hour), m (minute)
     *
     * Example: 20d, 2w, etc
     */
    const timeWindowRegex = new RegExp(CASES_CONNECTOR_TIME_WINDOW_REGEX, 'g');

    if (!timeWindowRegex.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Not a valid time window',
      });
    }

    const date = dateMath.parse(`now-${value}`);

    if (!date || !date.isValid()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Not a valid time window',
      });
    }

    const timeSize = value.slice(0, -1);
    const timeUnit = value.slice(-1);
    const timeSizeAsNumber = Number(timeSize);

    if (timeUnit === 'm' && timeSizeAsNumber < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Time window should be at least 5 minutes',
      });
    }
  });
const ZReopenClosedCasesSchema = z.boolean().default(false);

export const ZCasesConnectorRunParamsSchema = z
  .object({
    alerts: z.array(ZAlertSchema),
    autoPushCase: z.boolean().nullable().default(false),
    groupedAlerts: z.array(ZCasesGroupedAlertsSchema).min(0).default([]).nullable(),
    groupingBy: ZGroupingSchema,
    owner: z.string(),
    rule: ZRuleSchema,
    timeWindow: ZTimeWindowSchema,
    reopenClosedCases: ZReopenClosedCasesSchema,
    maximumCasesToOpen: z.coerce
      .number()
      .min(1)
      .max(ABSOLUTE_MAX_CASES_PER_RUN)
      .default(DEFAULT_MAX_OPEN_CASES),
    templateId: z.string().max(MAX_TEMPLATE_KEY_LENGTH).nullable().default(null),
    templateVersion: z.string().max(MAX_TEMPLATE_VERSION_STRING_LENGTH).nullable().default(null),
    internallyManagedAlerts: z.boolean().default(false).nullable(),
  })
  .strict();

export const CasesConnectorRuleActionParamsSchema = schema.object({
  subAction: schema.literal('run'),
  subActionParams: schema.object({
    autoPushCase: schema.nullable(schema.boolean({ defaultValue: false })),
    groupingBy: GroupingSchema,
    reopenClosedCases: ReopenClosedCasesSchema,
    timeWindow: TimeWindowSchema,
    templateId: schema.nullable(schema.string({ maxLength: MAX_TEMPLATE_KEY_LENGTH })),
    templateVersion: schema.nullable(
      schema.string({ maxLength: MAX_TEMPLATE_VERSION_STRING_LENGTH })
    ),
    maximumCasesToOpen: schema.nullable(
      schema.number({
        min: 1,
        max: ABSOLUTE_MAX_CASES_PER_RUN,
        defaultValue: DEFAULT_MAX_OPEN_CASES,
      })
    ),
  }),
});

export const CasesConnectorParamsSchema = schema.object({
  subAction: schema.literal('run'),
  subActionParams: CasesConnectorRunParamsSchema,
});
