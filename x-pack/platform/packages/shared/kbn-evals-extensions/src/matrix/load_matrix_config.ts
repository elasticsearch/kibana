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
  /**
   * Optional grouped-header label (e.g. "Agent Builder"). Columns sharing a
   * `group` render under one spanning header in the published docs page. Carried
   * through to the JSON artifact; the flat CSV/markdown keep one header row.
   */
  group: schema.maybe(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH })),
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
  /**
   * Optional restriction to `example.id` prefixes. Splits a single dataset
   * (all examples share one `example.dataset.id`) into per-category columns:
   * e.g. ['alert-analysis'] matches examples `alert-analysis-a/b/c`. When set,
   * the matrix query fetches per-example scores (stripped experiment-scores
   * route) and buckets them by prefix instead of the dataset-level stats.
   */
  examplePrefixes: schema.maybe(
    schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
      minSize: 1,
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
  /**
   * Git branch this column's experiments are read from, overriding the
   * top-level `branch`. Suites do not all publish on the same branch, and a
   * single global branch renders every column that is absent from it blank.
   */
  branch: schema.maybe(
    schema.oneOf([
      schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
      // A suite whose models are split across branches needs every branch
      // queried and unioned; a single string silently drops the others' rows.
      schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
        minSize: 1,
      }),
    ])
  ),
  /**
   * Opt this column's suites out of the global `scoring.excludeSelfJudged`.
   *
   * Set only where self-preference has been measured and found absent: a judge
   * that also appears as a ranked model normally has its own row dropped, which
   * blanks a real cell. Leave unset to keep the strict global policy.
   */
  allowSelfJudged: schema.maybe(schema.boolean()),
  /** Relative weight of this column in the legacy Overall score. Defaults to 1. */
  weight: schema.number({ defaultValue: 1, min: 0 }),
});

/**
 * A derived ("composite") column whose cell is the equal-weighted mean of other
 * columns' cells. `from` may reference base columns or earlier-defined
 * composites, so composites can be layered (e.g. "Overall Score" averages the
 * "Agent Builder Score" composite alongside two standalone feature columns).
 *
 * Aggregation mirrors the legacy Overall: "Not recommended" sources count as 0
 * (when `notRecommendedCountsAsZeroInOverall` is set) and missing sources are
 * skipped, so a composite reflects the data that actually exists.
 */
const compositeSchema = schema.object({
  /** Stable identifier for the composite (used as the CSV/JSON key). */
  id: schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
  /** Human-facing column header (e.g. "Agent Builder Score"). */
  label: schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }),
  /** Optional grouped-header label (see `columnSchema.group`). */
  group: schema.maybe(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH })),
  /** Column/composite ids whose cells are averaged into this composite. */
  from: schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
    minSize: 1,
    maxSize: MAX_ARRAY_SIZE,
  }),
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
  /**
   * Scoring policy for judged (LLM-graded) evaluators.
   *
   * Measured on the persona matrix (8,482 golden score documents): reading the
   * judge's categorical verdict instead of its continuous score, and dropping
   * grades from judges that were neither EIS-pinned nor independent of the
   * graded model, cuts the rerun flip rate from 83.3% to 33.3%.
   *
   * Defaults are off so existing matrices keep their published numbers; a
   * matrix opts in explicitly and its scores change.
   */
  scoring: schema.maybe(
    schema.object({
      /**
       * Score judged evaluators by their categorical verdict (SUPPORTED /
       * PARTIALLY_SUPPORTED / ...) rather than the geometric mean over a
       * per-run claim list. Contract evaluators are unaffected — they are
       * already deterministic and expose no verdict.
       */
      useVerdictLadder: schema.boolean({ defaultValue: false }),
      /**
       * Drop scores produced by judges that are not EIS-pinned (LiteLLM
       * aliases, HuggingFace repo paths, local quantisations). Those judges
       * cannot be re-run to reproduce a number.
       */
      requireEisJudge: schema.boolean({ defaultValue: false }),
      /** Drop scores where a model graded its own output. */
      excludeSelfJudged: schema.boolean({ defaultValue: false }),
    })
  ),
  /** Default multiplier applied to evaluator means when a column omits `scale`. */
  defaultScale: schema.number({ defaultValue: 10, min: 0 }),
  /** Decimal places used when rounding cell values. */
  decimals: schema.number({ defaultValue: 2, min: 0, max: 6 }),
  /** Cells at/under this value (after scaling) render as `notRecommendedLabel`. */
  notRecommendedBelow: schema.number({ defaultValue: 0, min: 0 }),
  /**
   * Tool-call count above which a cell is reported as a possible runaway loop.
   * Observability only: thrashing cells do not score worse, so this must not
   * become a score penalty. It exists because the cost is otherwise invisible
   * (one cell burned 115 calls / 3.78M input tokens). 0 disables the check.
   */
  toolCallWarnAbove: schema.number({ defaultValue: 0, min: 0 }),
  /**
   * Minimum scored columns a model needs before `Overall` is published as a
   * number. A model scored on 2 of 24 prompts can average 10.0 and outrank every
   * frontier model, so below this floor `Overall` becomes `insufficient-coverage`,
   * which ranks last. Default 0 preserves existing behaviour.
   */
  minCoverage: schema.number({ defaultValue: 0, min: 0 }),
  /** Text rendered when a model fails / lacks data for a column. */
  notRecommendedLabel: schema.string({
    defaultValue: 'Not recommended',
    maxLength: MAX_STRING_LENGTH,
  }),
  /**
   * When true, "Not recommended" cells count as 0 in the Overall score and in
   * composite columns (matches the published matrix behavior where failures drag
   * the average down).
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
    /**
     * Run-to-run standard deviation of the overall score, measured by
     * re-running one model on an unchanged commit. Set it and rows within
     * 2x the 95% interval are grouped into a tie tier instead of being
     * presented as ranked. Omit to keep the raw ordering.
     */
    runStdev: schema.maybe(schema.number({ min: 0, max: 10 })),
    /**
     * Drop evaluators that score every model almost identically from the
     * Overall aggregate. Such an evaluator carries no ranking information but
     * still takes an equal share of the mean, compressing the spread between
     * models and hiding the evaluators that do separate them. Detection is
     * mechanical (see `evaluator_saturation.ts`); saturated evaluators are
     * still rendered in their own columns, just not folded into Overall.
     */
    excludeSaturatedEvaluators: schema.boolean({ defaultValue: false }),
  }),
  /**
   * Renders the legacy single "Overall" column (weighted/mean over every base
   * column) at the far right. Set to `false` when the layout expresses its own
   * Overall via a composite, to avoid a duplicate trailing column.
   */
  showOverall: schema.boolean({ defaultValue: true }),
  columns: schema.arrayOf(columnSchema, { minSize: 1, maxSize: MAX_ARRAY_SIZE }),
  /** Derived columns averaged from base columns / earlier composites. */
  composites: schema.arrayOf(compositeSchema, { defaultValue: [], maxSize: MAX_ARRAY_SIZE }),
  /**
   * Explicit left-to-right display order of base + composite column ids. When
   * omitted, base columns render first (config order), then composites. The
   * legacy Overall column (when `showOverall`) is always appended last.
   */
  layout: schema.maybe(
    schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
      maxSize: MAX_ARRAY_SIZE,
    })
  ),
  models: schema.arrayOf(modelSchema, { minSize: 1, maxSize: MAX_ARRAY_SIZE }),
  /**
   * Opt-in token/cost axis. The quality matrix deliberately drops the
   * observability-tier evaluators (see {@link DEFAULT_EXCLUDED_EVALUATORS})
   * because their raw magnitudes would blow out the 0-10 scale. This block
   * re-admits them on a *separate* axis: instead of being folded into a column
   * mean, the named evaluators are aggregated per (model, column) into
   * `matrix.tokenCost`, preserving mean/min/max in native units.
   *
   * Omitted by default, so existing configs are unaffected.
   */
  tokenCost: schema.maybe(
    schema.object({
      /** Evaluator name (prefix-matched) contributing input-token magnitudes. */
      inputEvaluator: schema.string({
        defaultValue: 'Input Tokens',
        maxLength: MAX_STRING_LENGTH,
      }),
      /** Evaluator name (prefix-matched) contributing output-token magnitudes. */
      outputEvaluator: schema.string({
        defaultValue: 'Output Tokens',
        maxLength: MAX_STRING_LENGTH,
      }),
      /**
       * Column ids the token axis is aggregated over. Defaults to every base
       * column in the config when omitted.
       */
      columns: schema.maybe(
        schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_STRING_LENGTH }), {
          maxSize: MAX_ARRAY_SIZE,
        })
      ),
    })
  ),
  /**
   * Opt-in provenance extras rendered into the HTML footer. The fixture
   * fingerprint pins which dataset/tool seed revision the scores came from
   * (drift between benchmark fixture generations is a known divergence
   * source), and methodology notes document scoring-semantics changes a
   * reader must know before comparing against older matrices.
   */
  provenance: schema.maybe(
    schema.object({
      fixtureFingerprint: schema.maybe(schema.string({ maxLength: MAX_STRING_LENGTH })),
      methodologyNotes: schema.maybe(
        schema.arrayOf(schema.string({ minLength: 1, maxLength: 2000 }), { maxSize: 20 })
      ),
    })
  ),
});

export type MatrixConfig = TypeOf<typeof matrixConfigSchema>;
export type MatrixTokenCostConfig = NonNullable<MatrixConfig['tokenCost']>;
export type MatrixColumnConfig = TypeOf<typeof columnSchema>;
export type MatrixCompositeConfig = TypeOf<typeof compositeSchema>;
export type MatrixModelConfig = TypeOf<typeof modelSchema>;

export const parseMatrixConfig = (raw: unknown): MatrixConfig => matrixConfigSchema.validate(raw);

/**
 * Parses a `--model` CLI value into a model config entry.
 *
 * Format: `id[:label][:open-source]`, e.g.
 *   `gpt-5-preview`
 *   `gpt-5-preview:GPT-5 Preview`
 *   `qwen3-72b:Qwen3 72B:open-source`
 *
 * Labels may contain spaces but not colons; the third segment is an explicit
 * open-source marker rather than a substring guess at the model name.
 */
export const parseModelOverride = (raw: string): MatrixModelConfig => {
  const segments = raw.split(':').map((segment) => segment.trim());
  const [id, label, openSourceFlag] = segments;

  if (!id) {
    throw new Error(
      `Invalid --model value "${raw}": model id is required (format: id[:label][:open-source]).`
    );
  }
  if (segments.length > 3) {
    throw new Error(
      `Invalid --model value "${raw}": expected at most 3 colon-separated segments (id[:label][:open-source]).`
    );
  }
  if (openSourceFlag !== undefined && openSourceFlag !== 'open-source') {
    throw new Error(
      `Invalid --model value "${raw}": third segment must be the literal "open-source", got "${openSourceFlag}".`
    );
  }

  return { id, label: label || id, openSource: openSourceFlag === 'open-source' };
};

/**
 * Replaces the config's model set with an ad-hoc one for on-demand runs.
 *
 * The weekly matrix is a fixed, reviewed model set that must stay stable
 * across runs, so this deliberately does not mutate the config file — an
 * on-demand run with `--model` is a throwaway view over the same score data.
 */
export const applyModelOverrides = (
  config: MatrixConfig,
  rawModels: readonly string[]
): MatrixConfig => {
  if (rawModels.length === 0) {
    return config;
  }

  const models = rawModels.map(parseModelOverride);
  const seen = new Set<string>();
  for (const model of models) {
    if (seen.has(model.id)) {
      throw new Error(`Duplicate --model id "${model.id}".`);
    }
    seen.add(model.id);
  }

  return { ...config, models };
};

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
