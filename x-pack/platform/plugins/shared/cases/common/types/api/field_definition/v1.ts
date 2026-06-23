/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { Owner, Owners } from '../../../bundled-types.gen';
import { FieldDefinitionSchema } from '../../domain/field_definition/v1';

export const FieldDefinitionsFindRequestSchema = z.object({
  owner: z.union([Owner, Owners]).optional(),
  // This schema describes the TypeScript/client-side type (boolean).
  // HTTP query parameters arrive as strings at the route layer; the route handler
  // coerces "true"/"false" strings manually because the route uses escapeHatch
  // for query validation rather than applying this Zod schema at runtime.
  isGlobal: z.boolean().optional(),
});

export type FieldDefinitionsFindRequest = z.infer<typeof FieldDefinitionsFindRequestSchema>;

export const FieldDefinitionsFindResponseSchema = z.object({
  fieldDefinitions: z.array(FieldDefinitionSchema),
  total: z.number(),
});

export type FieldDefinitionsFindResponse = z.infer<typeof FieldDefinitionsFindResponseSchema>;
