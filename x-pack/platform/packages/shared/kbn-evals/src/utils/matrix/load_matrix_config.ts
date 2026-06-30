/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import { schema, type TypeOf } from '@kbn/config-schema';

/**
 * Upper bounds for schema fields. The config is a static repo-controlled JSON
 * file (not request input), so these exist to satisfy bounded-input validation
 * rather than to mitigate a real DoS vector; the limits are generous enough that
 * any realistic matrix config stays well within them.
 */
const MAX_STRING_LENGTH = 1024;
const MAX_ARRAY_SIZE = 1000;

/**
 * Schema for the LLM performance matrix configuration file.
 *
 * The matrix engine is domain-agnostic: a config file maps human-facing matrix
 * columns onto the eval `suite.id` / `example.dataset.id` / `evaluator.name`
 * values stored in the `kibana-evaluations` data stream, declares the model
 * allowlist (with display names + open-source classification), and describes how
 * raw evaluator scores are normalized onto the published 0-10 scale.
 */
const columnSchema = schema.object({
  /** Stable identifier for the column (used as the CSV/JSON key). */
  id: schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
  /** Human-facing column header (e.g. "Alert Triage"). */
  label: schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
  /** `suite.id` values whose scores contribute to this column. */
  suites: schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
    minSize: 1,
    maxSize: MAX_ARRAY_SIZE,
  }),
  /** Optional restriction to specific `example.dataset.id` values. */
  datasetIds: schema.maybe(
    schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
      maxSize: MAX_ARRAY_SIZE,
    })
  ),
  /** Optional restriction to specific `evaluator.name` values. */
  evaluators: schema.maybe(
    schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
      maxSize: MAX_ARRAY_SIZE,
    })
  ),
  /**
   * Multiplier applied to the (weighted) mean evaluator score before rounding.
   * Defaults to `defaultScale` (10) so 0-1 evaluator scores map onto the 0-10
   * scale. Set to 1 for evaluators that already emit a 0-10 score.
   */
  scale: schema.maybe(schema.number({ min: 0 })),
  /** Relative weight of this column in the Overall score. Defaults to 1. */
  weight: schema.number({ defaultValue: 1, min: 0 }),
});

const modelSchema = schema.object({
  /** Primary `task.model.id` value to match against. */
  id: schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
  /** Display name shown in the published matrix (e.g. "Claude Sonnet 4"). */
  label: schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
  /** Additional `task.model.id` values that should map to the same row. */
  matchIds: schema.maybe(
    schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
      maxSize: MAX_ARRAY_SIZE,
    })
  ),
  /** Renders the model under the "Open-source models" table when true. */
  openSource: schema.boolean({ defaultValue: false }),
});

/**
 * Default `evaluator.name` values excluded from column aggregation.
 *
 * Security eval suites register an "observability" tier of trace-based
 * evaluators (latency, token counts, tool-call counts, skill invocation)
 * alongside the 0-1 quality evaluators. Those emit raw magnitudes (thousands of
 * tokens, milliseconds) rather than a 0-1 score, so averaging them into a column
 * and multiplying by the 0-10 scale produces wildly inflated cells. We exclude
 * them by default; a config may override `excludeEvaluators` to opt back in.
 *
 * Matching is name-prefix based so dynamically-named evaluators such as
 * `Skill Invoked (alert-analysis)` are caught by the `Skill Invoked` entry.
 */
export const DEFAULT_EXCLUDED_EVALUATORS: readonly string[] = [
  'Latency',
  'Tool Calls',
  'Input Tokens',
  'Output Tokens',
  'Cached Tokens',
  'Skill Invoked',
];

export const matrixConfigSchema = schema.object({
  /** Page/table title (informational; used in the markdown artifact). */
  title: schema.string({ defaultValue: 'LLM performance matrix', maxLength: MAX_STRING_LENGTH }),
  /** Default git branch to pull experiments from (CLI `--branch` overrides). */
  branch: schema.string({ defaultValue: 'main', maxLength: MAX_STRING_LENGTH }),
  /** Only consider experiments newer than `now-<lookbackDays>d`. */
  lookbackDays: schema.number({ defaultValue: 45, min: 1 }),
  /** Default multiplier applied to evaluator means when a column omits `scale`. */
  defaultScale: schema.number({ defaultValue: 10, min: 0 }),
  /** Decimal places used when rounding cell values. */
  decimals: schema.number({ defaultValue: 2, min: 0, max: 6 }),
  /** Cells at/under this value (after scaling) render as `notRecommendedLabel`. */
  notRecommendedBelow: schema.number({ defaultValue: 0, min: 0 }),
  /** Text rendered when a model fails / lacks data for a column. */
  notRecommendedLabel: schema.string({
    defaultValue: 'Not recommended',
    maxLength: MAX_STRING_LENGTH,
  }),
  /**
   * When true, "Not recommended" cells count as 0 in the Overall score (matches
   * the published matrix behavior where failures drag the average down).
   */
  notRecommendedCountsAsZeroInOverall: schema.boolean({ defaultValue: true }),
  /**
   * `evaluator.name` values (matched by prefix) excluded from every column's
   * aggregation. Defaults to the observability-tier evaluators, which emit raw
   * magnitudes rather than 0-1 quality scores. Set to `[]` to include everything.
   */
  excludeEvaluators: schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
    defaultValue: [...DEFAULT_EXCLUDED_EVALUATORS],
    maxSize: MAX_ARRAY_SIZE,
  }),
  overall: schema.object({
    label: schema.string({ defaultValue: 'Overall', maxLength: MAX_STRING_LENGTH }),
    mode: schema.oneOf([schema.literal('weighted'), schema.literal('mean')], {
      defaultValue: 'weighted',
    }),
  }),
  columns: schema.arrayOf(columnSchema, { minSize: 1, maxSize: MAX_ARRAY_SIZE }),
  models: schema.arrayOf(modelSchema, { minSize: 1, maxSize: MAX_ARRAY_SIZE }),
});

export type MatrixConfig = TypeOf<typeof matrixConfigSchema>;
export type MatrixColumnConfig = TypeOf<typeof columnSchema>;
export type MatrixModelConfig = TypeOf<typeof modelSchema>;

export const parseMatrixConfig = (raw: unknown): MatrixConfig => matrixConfigSchema.validate(raw);

export const loadMatrixConfig = (configPath: string): MatrixConfig => {
  if (!Fs.existsSync(configPath)) {
    throw new Error(`Matrix config not found at: ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    throw new Error(
      `Failed to parse matrix config at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return parseMatrixConfig(parsed);
};
