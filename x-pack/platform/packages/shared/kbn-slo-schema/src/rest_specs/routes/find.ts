/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { BooleanFromString } from '@kbn/zod-helpers';
import { z } from '@kbn/zod';
import { MAX_QUERY_LENGTH } from '../../schema/zod/limits';
import { sloWithDataResponseSchemaZod } from '../slo';

const sortDirectionSchema = z.union([z.literal('asc'), z.literal('desc')]);
const sortBySchema = z.union([
  z.literal('error_budget_consumed'),
  z.literal('error_budget_remaining'),
  z.literal('sli_value'),
  z.literal('status'),
  z.literal('burn_rate_5m'),
  z.literal('burn_rate_1h'),
  z.literal('burn_rate_1d'),
]);

const searchAfterArraySchema = z.array(z.union([z.string(), z.number()]));

// Codec: wire form is a JSON-encoded string; decoded form is the parsed array.
const searchAfterSchema = z.codec(
  z
    .string()
    .describe('A JSON-encoded array of strings or numbers used for cursor-based pagination'),
  searchAfterArraySchema,
  {
    decode: (value, payload) => {
      const fail = () => {
        payload.issues.push({
          code: 'custom',
          message: 'Invalid searchAfter value, must be a JSON array of strings or numbers',
          input: value,
        });
        return z.NEVER;
      };
      try {
        const result = searchAfterArraySchema.safeParse(JSON.parse(value));
        return result.success ? result.data : fail();
      } catch {
        return fail();
      }
    },
    encode: (value) => JSON.stringify(value),
  }
);

const findSLOQuerySchema = z.object({
  filters: z.string().max(MAX_QUERY_LENGTH).optional(),
  kqlQuery: z.string().max(MAX_QUERY_LENGTH).optional(),
  // Used for page-based pagination; kept as strings to preserve backward compatibility
  page: z.string().optional(),
  perPage: z.string().optional(),
  sortBy: sortBySchema.optional(),
  sortDirection: sortDirectionSchema.optional(),
  hideStale: BooleanFromString.optional(),
  // Used for cursor-based pagination; searchAfter is a JSON-encoded array
  searchAfter: searchAfterSchema.optional(),
  size: z.string().optional(),
});

const findSLOParamsSchema = z.object({
  query: findSLOQuerySchema.optional(),
});

const findSLOResponseSchema = z.object({
  page: z.number(),
  perPage: z.number(),
  total: z.number(),
  results: z.array(sloWithDataResponseSchemaZod),
  searchAfter: searchAfterArraySchema.optional(),
  size: z.number().optional(),
});

type FindSLOParams = z.output<typeof findSLOQuerySchema>;
type FindSLOResponse = z.input<typeof findSLOResponseSchema>;

export { findSLOParamsSchema, findSLOResponseSchema };
export type { FindSLOParams, FindSLOResponse };
