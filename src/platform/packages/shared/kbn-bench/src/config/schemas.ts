/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import type { InitialBenchConfig, ModuleBenchmark, Script, ScriptBenchmark } from './types';

const benchmarkSchemaBase = z.object({
  // Restrict benchmark name to filename-safe characters we allow for generated artifacts
  // (alphanumeric, underscore, dash, dot). Avoid spaces and path separators.
  name: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/u, 'name must contain only letters, numbers, ".", "_", or "-"'),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  runs: z.number().optional(),
  timeout: z.number().optional(),
});

const moduleBenchmarkSchema = benchmarkSchemaBase.extend({
  kind: z.literal('module'),
  module: z.string(),
}) satisfies z.Schema<ModuleBenchmark>;

const scriptSchema = z.union([
  z.string(),
  z.object({
    cmd: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
  }),
]) satisfies z.Schema<Script>;

const scriptBenchmarkSchema = benchmarkSchemaBase.extend({
  kind: z.literal('script'),
  ensure: z
    .object({
      bootstrap: z.boolean().optional(),
      build: z.boolean().optional(),
    })
    .optional(),
  beforeAll: scriptSchema.optional(),
  afterAll: scriptSchema.optional(),
  before: scriptSchema.optional(),
  after: scriptSchema.optional(),
  run: scriptSchema,
}) satisfies z.Schema<ScriptBenchmark>;

const benchmarkSchema = z.union([moduleBenchmarkSchema, scriptBenchmarkSchema]);

const configSchema = z.object({
  name: z.string(),
  runs: z.number().optional(),
  timeout: z.number().optional(),
  monitorInterval: z.number().positive().optional(),
  profile: z.boolean().optional(),
  openProfile: z.boolean().optional(),
  benchmarks: z.array(benchmarkSchema),
}) satisfies z.Schema<InitialBenchConfig>;

export { configSchema };
