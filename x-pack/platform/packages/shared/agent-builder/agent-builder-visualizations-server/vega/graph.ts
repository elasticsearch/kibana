/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { StateGraph, Annotation } from '@langchain/langgraph';
import type { EsqlEsqlColumnInfo } from '@elastic/elasticsearch/lib/api/types';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import { generateEsql, executeEsql } from '@kbn/agent-builder-genai-utils';
import { buildTimeRangeParams } from '@kbn/agent-builder-genai-utils/tools/utils/esql';
import { extractTextFromMessage } from '../utils/extract_text_from_message';
import { esqlAdditionalInstructions } from '../visualization/prompts';
import {
  normalizeVegaSpec,
  normalizeRawVegaSpec,
  RAW_VEGA_SOURCE_DATA_NAME,
} from './normalize_spec';
import { detectVegaDialect } from './dialect';
import { createAuthorVegaSpecPrompt } from './prompts';
import { validateVegaSpec } from './vega_validator';
import {
  GENERATE_ESQL_NODE,
  AUTHOR_SPEC_NODE,
  VALIDATE_SPEC_NODE,
  FINALIZE_NODE,
  MAX_RETRY_ATTEMPTS,
  isGenerateEsqlAction,
  isAuthorSpecAction,
  isValidateSpecAction,
  type VegaAction,
  type GenerateEsqlAction,
  type AuthorSpecAction,
  type ValidateSpecAction,
} from './actions';

// Regex to extract JSON from markdown code blocks.
const INLINE_JSON_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/gm;

/**
 * Default range used only to bind `?_tstart`/`?_tend` when executing a provided
 * query server-side for sample rows. The live dashboard range is applied by
 * Kibana at render time; this only affects the rows used for validation.
 */
const DEFAULT_VALIDATION_TIME_RANGE = { from: 'now-24h', to: 'now' } as const;

/** Top-level keys that declare a renderable Vega-Lite view. */
const RENDERABLE_VIEW_KEYS = [
  'mark',
  'layer',
  'facet',
  'repeat',
  'concat',
  'hconcat',
  'vconcat',
] as const;

/** Whether a Vega-Lite spec declares something renderable (a mark or composite view). */
const hasRenderableView = (spec: Record<string, unknown>): boolean =>
  RENDERABLE_VIEW_KEYS.some((key) => key in spec);

/**
 * Whether a raw Vega spec is renderable: it needs a non-empty `marks` array and
 * a base data set named `source` for the ES|QL query to bind onto. (Derived data
 * sets reference `source`, so without it the chart has no data.)
 */
const hasRenderableRawView = (spec: Record<string, unknown>): boolean => {
  const { marks, data } = spec as { marks?: unknown; data?: unknown };
  const hasMarks = Array.isArray(marks) && marks.length > 0;
  const hasSource =
    Array.isArray(data) &&
    data.some(
      (dataSet) =>
        !!dataSet &&
        typeof dataSet === 'object' &&
        (dataSet as { name?: unknown }).name === RAW_VEGA_SOURCE_DATA_NAME
    );
  return hasMarks && hasSource;
};

/**
 * Warning substrings that signal a real authoring mistake (not cosmetic noise)
 * and so are worth a bounded repair retry. A spec that renders but emits one of
 * these is sent back to the author with the warning as feedback; if it still
 * warns once the retry budget is spent, the rendered spec is kept (warnings
 * never block returning a usable chart).
 */
const RETRYABLE_WARNING_PATTERNS: readonly RegExp[] = [
  // Layered/faceted specs whose merged scale/legend/sort properties conflict,
  // e.g. `Conflicting legend property "disable" (false and true). Using false.`
  /conflicting/i,
  // Author-positioned text marks that collide (e.g. an indicator's big value
  // printed on top of its label); the author can re-space or shrink them.
  /overlapping text/i,
];

/** Whether any warning matches a {@link RETRYABLE_WARNING_PATTERNS} pattern. */
const hasRetryableWarning = (warnings: string[] | undefined): boolean =>
  !!warnings?.some((warning) =>
    RETRYABLE_WARNING_PATTERNS.some((pattern) => pattern.test(warning))
  );

const parseSpecFromResponse = (responseText: string): Record<string, unknown> => {
  const jsonMatches = Array.from(responseText.matchAll(INLINE_JSON_REGEX));
  const jsonText = jsonMatches.length > 0 ? jsonMatches[0][1].trim() : responseText.trim();
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Response is not a valid JSON object');
  }
  return parsed as Record<string, unknown>;
};

/** Convert ES|QL columnar results into Vega-style row objects keyed by column name. */
const toRowObjects = (
  columns: EsqlEsqlColumnInfo[] | undefined,
  values: unknown[][] | undefined
): Array<Record<string, unknown>> => {
  if (!Array.isArray(columns) || !Array.isArray(values)) {
    return [];
  }
  return values.map((row) => {
    const rowObject: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      if (column?.name) {
        rowObject[column.name] = row[index];
      }
    });
    return rowObject;
  });
};

const VegaStateAnnotation = Annotation.Root({
  // inputs
  nlQuery: Annotation<string>(),
  index: Annotation<string | undefined>(),
  existingSpec: Annotation<string | undefined>(),
  // internal
  esqlQuery: Annotation<string>(),
  columns: Annotation<EsqlEsqlColumnInfo[] | undefined>(),
  /** Result rows (objects keyed by column name) used to render-validate the spec. */
  rows: Annotation<Array<Record<string, unknown>> | undefined>(),
  currentAttempt: Annotation<number>({ reducer: (_, newValue) => newValue, default: () => 0 }),
  actions: Annotation<VegaAction[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  // outputs
  spec: Annotation<string | null>(),
  error: Annotation<string | null>(),
});

type VegaState = typeof VegaStateAnnotation.State;

/**
 * Build the LangGraph that authors a Vega-Lite spec: resolve an ES|QL query
 * (executing it for sample rows + columns), ask the model to author a spec,
 * normalize and render-validate it in a worker thread, and retry authoring with
 * error/warning feedback until it renders or the attempt budget is exhausted.
 */
export const createVegaGraph = async (
  modelProvider: ModelProvider,
  logger: Logger,
  events: ToolEventEmitter,
  esClient: IScopedClusterClient
) => {
  const defaultModel = await modelProvider.getDefaultModel();

  // Resolve the ES|QL query and its result columns + sample rows. A query may
  // reference time-picker params (?_tstart/?_tend); bind a default range so it
  // runs server-side. Kibana binds the live range at render time, so this only
  // affects the sampled rows used for validation.
  const generateESQLNode = async (state: VegaState) => {
    const timeRangeParams = buildTimeRangeParams(DEFAULT_VALIDATION_TIME_RANGE);

    let action: GenerateEsqlAction;
    let rows: Array<Record<string, unknown>> = [];

    try {
      let query = state.esqlQuery;
      let columns: EsqlEsqlColumnInfo[] | undefined;
      let values: unknown[][] | undefined;

      // A provided query is only trustworthy if it actually runs: the caller may
      // pass an LLM-invented query whose error (e.g. a type mismatch) AST
      // validation never catches. Execute it; if it throws, discard it and fall
      // through to self-correcting generation rather than author a spec around a
      // query that can never render.
      if (query) {
        try {
          logger.debug('Validating provided ES|QL query for Vega visualization');
          ({ columns, values } = await executeEsql({
            query,
            params: timeRangeParams,
            esClient: esClient.asCurrentUser,
          }));
        } catch (providedError) {
          logger.warn(
            `Provided ES|QL query failed to execute (${providedError.message}); regenerating a corrected query`
          );
          query = '';
        }
      }

      // Generate a query when none was provided, or the provided one failed.
      // generateEsql validates + executes candidates in a bounded retry loop, so
      // it returns only a query that actually runs (or an error once the retry
      // budget is spent) — this is the self-correction that keeps invalid ES|QL
      // out of a stored spec.
      if (!query) {
        logger.debug('Generating ES|QL query for Vega visualization');
        const response = await generateEsql({
          nlQuery: state.nlQuery,
          index: state.index,
          modelProvider,
          events,
          logger,
          esClient: esClient.asCurrentUser,
          additionalInstructions: esqlAdditionalInstructions,
        });
        if (!response.query || response.error) {
          return {
            esqlQuery: state.esqlQuery,
            actions: [
              {
                type: 'generate_esql',
                success: false,
                error: response.error ?? 'No queries generated',
              },
            ],
          };
        }
        query = response.query;
        // generateEsql already executed the query; reuse its rows instead of
        // running it a second time. Re-execute only if it ran without returning
        // results.
        if (response.results) {
          ({ columns, values } = response.results);
        } else {
          ({ columns, values } = await executeEsql({
            query,
            params: timeRangeParams,
            esClient: esClient.asCurrentUser,
          }));
        }
      }

      action = { type: 'generate_esql', success: true, query, columns };
      rows = toRowObjects(columns, values);
    } catch (error) {
      logger.error(`Failed to resolve ES|QL query for Vega: ${error.message}`);
      action = { type: 'generate_esql', success: false, error: error.message };
    }

    return {
      esqlQuery: action.query ?? state.esqlQuery,
      columns: action.columns,
      rows,
      actions: [action],
    };
  };

  const authorSpecNode = async (state: VegaState) => {
    const attempt = state.currentAttempt + 1;
    logger.debug(`Authoring Vega-Lite spec (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);

    // Feed back both authoring failures and validation failures/warnings so the
    // next attempt can fix render-time problems, not just malformed JSON.
    const previousContext = state.actions
      .filter((action) => isAuthorSpecAction(action) || isValidateSpecAction(action))
      .map((action) => {
        if (isAuthorSpecAction(action)) {
          return action.success
            ? undefined
            : `Authoring attempt ${action.attempt} failed: ${action.error}`;
        }
        if (!action.success) {
          return `Validation attempt ${action.attempt} failed: ${action.error}`;
        }
        return action.warnings?.length
          ? `Validation attempt ${
              action.attempt
            } succeeded with warnings to address: ${action.warnings.join('; ')}`
          : undefined;
      })
      .filter(Boolean)
      .join('\n');

    const prompt = createAuthorVegaSpecPrompt({
      nlQuery: state.nlQuery,
      esqlQuery: state.esqlQuery,
      columns: state.columns,
      existingSpec: state.existingSpec,
      additionalContext: previousContext
        ? `Previous attempts:\n${previousContext}\n\nReturn a single valid JSON object that fixes the issues above.`
        : undefined,
    });

    let action: AuthorSpecAction;
    try {
      const response = await defaultModel.chatModel.invoke(prompt);
      const spec = parseSpecFromResponse(extractTextFromMessage(response));
      action = { type: 'author_spec', success: true, spec, attempt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `Vega spec authoring failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}): ${message}`
      );
      action = { type: 'author_spec', success: false, attempt, error: message };
    }

    return { currentAttempt: attempt, actions: [action] };
  };

  // Normalize (harden) the authored spec, then compile + render it in a worker
  // to catch render-time errors before it is stored.
  const validateSpecNode = async (state: VegaState) => {
    const attempt = state.currentAttempt;
    const lastAuthor = [...state.actions].reverse().find(isAuthorSpecAction);

    let action: ValidateSpecAction;
    try {
      if (!lastAuthor?.success || !lastAuthor.spec) {
        throw new Error(lastAuthor?.error ?? 'No spec found to validate');
      }

      // The author picks the dialect by structure/$schema (raw Vega is the
      // escalation tier for flow/hierarchy charts); normalize + check accordingly.
      const dialect = detectVegaDialect(lastAuthor.spec);

      // Deterministic hardening: pin schema, bind the canonical ES|QL data
      // source, strip fixed sizing, escape dotted field references.
      let normalized: Record<string, unknown>;
      if (dialect === 'vega') {
        if (!hasRenderableRawView(lastAuthor.spec)) {
          throw new Error(
            'Raw Vega spec must declare a non-empty "marks" array and a base data set named "source".'
          );
        }
        normalized = normalizeRawVegaSpec({
          spec: lastAuthor.spec,
          esqlQuery: state.esqlQuery,
          columns: state.columns,
        });
      } else {
        if (!hasRenderableView(lastAuthor.spec)) {
          throw new Error(
            'Vega-Lite spec must declare a "mark" or a composite view ("layer"/"facet"/"repeat"/"concat"/"hconcat"/"vconcat").'
          );
        }
        normalized = normalizeVegaSpec({
          spec: lastAuthor.spec,
          esqlQuery: state.esqlQuery,
          columns: state.columns,
        });
      }

      const { error: renderError, warnings } = await validateVegaSpec({
        spec: normalized,
        rows: state.rows,
        logger,
      });
      if (renderError) {
        throw new Error(`Vega could not render the spec: ${renderError}`);
      }

      action = {
        type: 'validate_spec',
        success: true,
        // Pretty-print so the stored/displayed spec stays human-readable.
        spec: JSON.stringify(normalized, null, 2),
        attempt,
        warnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Vega spec validation failed (attempt ${attempt}): ${message}`);
      action = { type: 'validate_spec', success: false, attempt, error: message };
    }

    return { actions: [action] };
  };

  const finalizeNode = async (state: VegaState) => {
    // Prefer the most recent validation that actually rendered, even if it had
    // warnings: a retry triggered by warnings must never lose a usable spec
    // (e.g. when the repair attempt later failed to render).
    const lastRendered = [...state.actions]
      .reverse()
      .find((action) => isValidateSpecAction(action) && action.success && !!action.spec) as
      | ValidateSpecAction
      | undefined;

    if (lastRendered?.spec) {
      return { spec: lastRendered.spec, error: null };
    }

    // Surface an ES|QL resolution failure (an unexecutable query that was never
    // authored into a spec) so the caller gets the real root cause.
    const lastGenerate = [...state.actions].reverse().find(isGenerateEsqlAction);
    if (lastGenerate && !lastGenerate.success) {
      return {
        spec: null,
        error: `Could not resolve a valid ES|QL query for the visualization: ${
          lastGenerate.error ?? 'Unknown error'
        }`,
      };
    }

    const lastValidate = [...state.actions].reverse().find(isValidateSpecAction);
    return {
      spec: null,
      error: lastValidate?.error ?? 'Failed to author a valid Vega specification',
    };
  };

  // A query that could not be resolved/executed must not be authored into a
  // spec (the spec would only fail at render), so route straight to finalize.
  const afterGenerateEsqlRouter = (state: VegaState): string => {
    const lastGenerate = [...state.actions].reverse().find(isGenerateEsqlAction);
    if (!lastGenerate?.success) {
      logger.warn('ES|QL resolution failed; finalizing without authoring a Vega spec');
      return FINALIZE_NODE;
    }
    return AUTHOR_SPEC_NODE;
  };

  const shouldRetryRouter = (state: VegaState): string => {
    const lastValidate = [...state.actions].reverse().find(isValidateSpecAction);

    // Retry render failures, and also specs that render but emit an actionable
    // warning (so the author can fix it) — both are bounded by the attempt budget.
    const needsRepair = !lastValidate?.success || hasRetryableWarning(lastValidate.warnings);

    if (!needsRepair) {
      return FINALIZE_NODE;
    }

    if (state.currentAttempt >= MAX_RETRY_ATTEMPTS) {
      logger.warn(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached, finalizing`);
      return FINALIZE_NODE;
    }

    return AUTHOR_SPEC_NODE;
  };

  return new StateGraph(VegaStateAnnotation)
    .addNode(GENERATE_ESQL_NODE, generateESQLNode)
    .addNode(AUTHOR_SPEC_NODE, authorSpecNode)
    .addNode(VALIDATE_SPEC_NODE, validateSpecNode)
    .addNode(FINALIZE_NODE, finalizeNode)
    .addEdge('__start__', GENERATE_ESQL_NODE)
    .addConditionalEdges(GENERATE_ESQL_NODE, afterGenerateEsqlRouter, {
      [AUTHOR_SPEC_NODE]: AUTHOR_SPEC_NODE,
      [FINALIZE_NODE]: FINALIZE_NODE,
    })
    .addEdge(AUTHOR_SPEC_NODE, VALIDATE_SPEC_NODE)
    .addConditionalEdges(VALIDATE_SPEC_NODE, shouldRetryRouter, {
      [AUTHOR_SPEC_NODE]: AUTHOR_SPEC_NODE,
      [FINALIZE_NODE]: FINALIZE_NODE,
    })
    .addEdge(FINALIZE_NODE, '__end__')
    .compile();
};
