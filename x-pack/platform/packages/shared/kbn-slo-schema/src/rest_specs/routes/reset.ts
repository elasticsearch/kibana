/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { z } from '@kbn/zod';
import { sloDefinitionSchema, sloIdSchema } from '../../schema/zod/slo';

const resetSLOParamsSchema = z.object({
  path: z.object({ id: sloIdSchema }),
});

const resetSLOResponseSchema = sloDefinitionSchema;

type ResetSLOParams = z.output<typeof resetSLOParamsSchema.shape.path>;
type ResetSLOResponse = z.input<typeof resetSLOResponseSchema>;

export { resetSLOParamsSchema, resetSLOResponseSchema };
export type { ResetSLOParams, ResetSLOResponse };
