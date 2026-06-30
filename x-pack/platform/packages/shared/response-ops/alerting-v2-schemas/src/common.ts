/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { validateDuration, validateMaxDuration } from './validation';
import { MAX_DURATION } from './constants';

const durationSchema = z.string().superRefine((value, ctx) => {
  const formatError = validateDuration(value);
  if (formatError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: formatError });
    return;
  }
  const maxError = validateMaxDuration(value, MAX_DURATION);
  if (maxError) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: maxError });
  }
});

/**
 * Shared schema for tag arrays used across alerting v2 (rule metadata, action policies,
 * alert tag actions, tag filters). Each tag is up to 128 characters. Up to 20 tags allowed.
 */
const tagsSchema = z.array(z.string().min(1).max(128)).max(20);

/** Make a schema optional while preserving its `.describe()` metadata. */
const optionalWithDescription = <T extends z.ZodType>(schema: T) => {
  const optional = schema.optional();
  return schema.description ? optional.describe(schema.description) : optional;
};

/**
 * Builds a schema that accepts either a single value or an array of values
 * and normalises both shapes to an array of length `1..max`.
 *
 * Intended for HTTP query parameters that can be delivered either as a single
 * value (`?key=a`) or as multiple occurrences (`?key=a&key=b`). The helper
 * absorbs the union/transform boilerplate at the parsing layer.
 *
 * The transform's explicit return type recovers `Array<z.output<T>>` for the
 * compiler. We intentionally skip the `.pipe(z.array(...))` re-validation
 * step: the single-value branch always produces a one-element array, which
 * trivially satisfies `min: 1`, and the array branch is already bounded by
 * `min`/`max` inside the union.
 *
 * @example
 *   const tagsQuerySchema = arrayOrSingleSchema(z.string().min(1).max(128), 20);
 */
const arrayOrSingleSchema = <T extends z.ZodType>(item: T, max: number) =>
  z
    .union([item, z.array(item).min(1).max(max)])
    .transform((value): Array<z.output<T>> => (Array.isArray(value) ? value : [value]));

export { durationSchema, tagsSchema, optionalWithDescription, arrayOrSingleSchema };
