/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';

export const RUNTIME_FIELD_COMPOSITE_TYPE = 'composite' as const;
export type RuntimeFieldCompositeType = typeof RUNTIME_FIELD_COMPOSITE_TYPE;

export const PRIMITIVE_RUNTIME_FIELD_TYPES = [
  'keyword',
  'long',
  'double',
  'date',
  'ip',
  'boolean',
  'geo_point',
] as const;
export type PrimitiveRuntimeFieldTypes = typeof PRIMITIVE_RUNTIME_FIELD_TYPES;

export const RUNTIME_FIELD_TYPES = [
  ...PRIMITIVE_RUNTIME_FIELD_TYPES,
  RUNTIME_FIELD_COMPOSITE_TYPE,
] as const;

export const MAX_NAME_LENGTH = 1000;

export const scriptSchema = z.string().min(1).optional().meta({
  id: 'kbn-runtime-field-script',
  title: 'Script',
  description:
    "The script that defines the runtime field. This should be a painless script that computes the field value at query time. Runtime fields without a script retrieve values from _source. If the field doesn't exist in _source, a search request returns no value.",
});

export const primitiveTypeSchema = z.enum(PRIMITIVE_RUNTIME_FIELD_TYPES).meta({
  id: 'kbn-runtime-field-type',
  title: 'Type',
  description: 'The type of the runtime field (e.g., "keyword", "long", "date").',
});
