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
  sloDefinitionSchema,
  sloIdSchema,
  tagsSchema,
} from '../../schema/zod/slo';
import { timeWindowSchema } from '../../schema/zod/time_window';

const updateSLOParamsSchema = z.object({
  path: z.object({
    id: sloIdSchema,
  }),
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    indicator: indicatorSchema.optional(),
    timeWindow: timeWindowSchema.optional(),
    budgetingMethod: budgetingMethodSchema.optional(),
    objective: objectiveSchema.optional(),
    settings: optionalSettingsSchema.optional(),
    tags: tagsSchema.optional(),
    groupBy: allOrAnyStringOrArray.optional(),
    artifacts: dashboardsWithIdSchema.optional(),
  }),
});

const updateSLOResponseSchema = sloDefinitionSchema;

type UpdateSLOInput = z.input<typeof updateSLOParamsSchema.shape.body>;
type UpdateSLOParams = z.output<typeof updateSLOParamsSchema.shape.body>;
type UpdateSLOResponse = z.input<typeof updateSLOResponseSchema>;

export { updateSLOParamsSchema, updateSLOResponseSchema };
export type { UpdateSLOInput, UpdateSLOParams, UpdateSLOResponse };
