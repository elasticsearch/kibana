/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { z } from '@kbn/zod';
import { allOrAnyStringOrArray } from '../../schema/zod/common';
import { indicatorSchema } from '../../schema/zod/indicators';
import {
  budgetingMethodSchema,
  dashboardsWithIdSchema,
  objectiveSchema,
  optionalSettingsSchema,
  sloIdSchema,
  tagsSchema,
} from '../../schema/zod/slo';
import { timeWindowSchema } from '../../schema/zod/time_window';

const createSLOParamsSchema = z.object({
  body: z.object({
    name: z.string(),
    description: z.string(),
    indicator: indicatorSchema,
    timeWindow: timeWindowSchema,
    budgetingMethod: budgetingMethodSchema,
    objective: objectiveSchema,
    id: sloIdSchema.optional(),
    settings: optionalSettingsSchema.optional(),
    tags: tagsSchema.optional(),
    groupBy: allOrAnyStringOrArray.optional(),
    revision: z.number().optional(),
    artifacts: dashboardsWithIdSchema.optional(),
  }),
});

const createSLOResponseSchema = z.object({
  id: sloIdSchema,
});

type CreateSLOInput = z.input<typeof createSLOParamsSchema.shape.body>;
type CreateSLOParams = z.output<typeof createSLOParamsSchema.shape.body>;
type CreateSLOResponse = z.output<typeof createSLOResponseSchema>;

export { createSLOParamsSchema, createSLOResponseSchema };
export type { CreateSLOInput, CreateSLOParams, CreateSLOResponse };
