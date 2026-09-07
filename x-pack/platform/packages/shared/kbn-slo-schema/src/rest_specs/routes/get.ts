/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { z } from '@kbn/zod';
import { allOrAnyString } from '../../schema/zod/common';
import { sloIdSchema } from '../../schema/zod/slo';
import { sloWithDataResponseSchemaZod } from '../slo';

const getSLOQuerySchema = z.object({
  instanceId: allOrAnyString.optional(),
  remoteName: z.string().optional(),
});

const getSLOParamsSchema = z.object({
  path: z.object({
    id: sloIdSchema,
  }),
  query: getSLOQuerySchema.optional(),
});

const getSLOResponseSchema = sloWithDataResponseSchemaZod;

type GetSLOParams = z.output<typeof getSLOQuerySchema>;
type GetSLOResponse = z.input<typeof getSLOResponseSchema>;

export { getSLOParamsSchema, getSLOResponseSchema };
export type { GetSLOParams, GetSLOResponse };
