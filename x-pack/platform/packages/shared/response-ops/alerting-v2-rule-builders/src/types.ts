/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import type { Query } from '@kbn/alerting-v2-schemas';

export type OpaqueBuilderFields = Record<string, unknown>;

export interface GeneratedQuery {
  query: Query;
  grouping?: { fields: string[] };
  time_field?: string;
}

export interface BuilderTypeDefinition<TFields extends object = OpaqueBuilderFields> {
  type: string;
  builderFieldsSchema: z.ZodType<TFields>;
  generateQuery: (fields: TFields) => GeneratedQuery;
}

export type RegisteredBuilderType = BuilderTypeDefinition<OpaqueBuilderFields>;

export const defineBuilderType = <TFields extends object>(
  definition: BuilderTypeDefinition<TFields>
): RegisteredBuilderType => definition as unknown as RegisteredBuilderType;
