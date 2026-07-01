/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse as parseYaml } from 'yaml';
import type { DefaultEvaluators, Evaluator, Example } from '@kbn/evals';
import { getToolCallSteps, createTrajectoryEvaluator } from '@kbn/evals';
import { stableStringify } from '@kbn/std';
import { collectAllSteps } from '@kbn/workflows';
import type { Step, WorkflowYaml } from '@kbn/workflows';
import type {
  WorkflowEditExample,
  WorkflowCreateExample,
  NegativeWorkflowExample,
  MultiTurnWorkflowEditExample,
  SelfCorrectionExample,
  WorkflowTaskOutput,
  StructuralExpectations,
  EfficiencyExpectations,
} from './types';

type WorkflowExample =
  | WorkflowEditExample
  | WorkflowCreateExample
  | NegativeWorkflowExample
  | MultiTurnWorkflowEditExample
  | SelfCorrectionExample;

const INFRA_ERROR_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation: 'Not applicable: infrastructure error — not a model quality issue',
};

const NEGATIVE_CASE_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation: 'Not applicable: negative case — model should reject this request',
};

const INFRA_ERROR_PATTERN =
  /timeout|ECONNREFUSED|503|502|500|401|ENOTFOUND|socket hang up|ERR_BAD_RESPONSE|fetch failed|ran out of retries|request failed/i;

/**
 * Wraps an evaluator so it returns N/A when the conversation encountered an
 * infrastructure error (timeouts, connection refused, auth failures, etc.).
 * These are environment issues, not model quality problems.
 */
export function skipInfraErrors<TExample extends Example>(
  evaluator: Evaluator<TExample, WorkflowTaskOutput>
): Evaluator<TExample, WorkflowTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      const errors = (args.output as WorkflowTaskOutput)?.errors ?? [];
      const isInfra = errors.some((e) =>
        INFRA_ERROR_PATTERN.test(typeof e === 'string' ? e : JSON.stringify(e))
      );
      if (isInfra) {
        return INFRA_ERROR_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

/**
 * Wraps an evaluator so it returns N/A for negative-case examples (category === 'negative').
 * These are prompts where the model should refuse to generate a workflow, so
 * production-quality metrics are meaningless and should not skew averages.
 */
export function skipNegativeCases<TExample extends Example>(
  evaluator: Evaluator<TExample, WorkflowTaskOutput>
): Evaluator<TExample, WorkflowTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      const metadata = args.metadata as WorkflowExample['metadata'] | undefined;
      if (metadata?.category === 'negative') {
        return NEGATIVE_CASE_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

const COMPOSITE_MODE_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation:
    'Not applicable: trajectory-style evaluator skipped in composite authoring mode (KBN_EVAL_AUTHORING_MODE=composite)',
};

/**
 * True when the suite is being run against the new composite `generate_workflow`
 * agent (vs. the current root-level toolset). Read at evaluate-time so a single
 * factory call can serve both modes across a process lifetime.
 */
export const isCompositeAuthoringMode = (): boolean =>
  process.env.KBN_EVAL_AUTHORING_MODE === 'composite';

/**
 * Wraps a trajectory-style evaluator (one that measures the multi-tool path
 * the agent took) so it returns N/A when the run targets the composite agent.
 *
 * The composite `generate_workflow` tool produces the workflow in a single
 * call, so per-step trajectory / tool-budget metrics are meaningless and
 * should not skew averages in the comparison report. Artifact-scoring
 * evaluators (`Criteria`, `ValidationPass`, `StructuralCorrectness`,
 * `LiquidCorrectness`, `Rejection`, `SelfCorrection`, ...) keep running.
 *
 * See security-team#17399 for the broader comparison + gating plan.
 */
export function skipCompositeMode<TExample extends Example>(
  evaluator: Evaluator<TExample, WorkflowTaskOutput>
): Evaluator<TExample, WorkflowTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      if (isCompositeAuthoringMode()) {
        return COMPOSITE_MODE_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

/**
 * Tool results from the converse API are ToolResult objects:
 * `{ tool_result_id, type: "other", data: { success, validation, ... } }`
 *
 * This helper unwraps the `data` field to get the actual tool handler payload.
 */
const unwrapToolResultData = (result: unknown): Record<string, unknown> | undefined => {
  if (typeof result !== 'object' || result === null) return undefined;
  const r = result as Record<string, unknown>;
  if (typeof r.data === 'object' && r.data !== null) {
    return r.data as Record<string, unknown>;
  }
  return r;
};

const getWorkflowEditResultData = (output: WorkflowTaskOutput): Array<Record<string, unknown>> => {
  const toolCalls = getToolCallSteps(output);
  return toolCalls
    .filter((t) => t.tool_id?.includes('generate_workflow'))
    .flatMap((t) => t.results ?? [])
    .map(unwrapToolResultData)
    .filter((d): d is Record<string, unknown> => d !== undefined);
};

const WORKFLOW_YAML_ATTACHMENT_TYPE = 'workflow.yaml';

/**
 * Extract the resulting workflow YAML from tool call steps.
 *
 * With `generate_workflow`, the YAML lives in the attachment system rather than tool
 * params, so this always returns `undefined` and callers fall back to
 * {@link extractYamlFromAttachments}. Kept for parity with older eval call sites.
 */
export const extractResultYaml = (_output: WorkflowTaskOutput): string | undefined => undefined;

/**
 * Extract the workflow YAML from versioned conversation attachments.
 * Finds the `workflow.yaml` attachment and reads its current version's data.
 */
export const extractYamlFromAttachments = (
  attachments: Array<{
    type: string;
    current_version: number;
    versions: Array<{ version: number; data: Record<string, unknown> }>;
  }>
): string | undefined => {
  const workflowAttachment = attachments.find((a) => a.type === WORKFLOW_YAML_ATTACHMENT_TYPE);
  if (!workflowAttachment) return undefined;

  const currentVersion = workflowAttachment.versions.find(
    (v) => v.version === workflowAttachment.current_version
  );
  if (!currentVersion) return undefined;

  const { yaml } = currentVersion.data as { yaml?: string };
  return typeof yaml === 'string' ? yaml : undefined;
};

export function createToolUsageEvaluator() {
  return {
    name: 'UsedExpectedTools',
    kind: 'CODE' as const,
    evaluate: async ({
      output,
      expected,
    }: {
      output: WorkflowTaskOutput;
      expected: WorkflowEditExample['output'] | WorkflowCreateExample['output'];
    }) => {
      const expectedToolIds = 'expectedToolIds' in expected ? expected.expectedToolIds : undefined;
      if (!expectedToolIds || expectedToolIds.length === 0) {
        return { score: 1 };
      }

      const toolCalls = getToolCallSteps(output);
      const usedToolIds = toolCalls.map((t) => t.tool_id).filter(Boolean) as string[];

      const allUsed = expectedToolIds.every((id) => usedToolIds.includes(id));
      return {
        score: allUsed ? 1 : 0,
        metadata: { expectedToolIds, usedToolIds },
      };
    },
  };
}

const SCORE_ON_FINAL_RESULT = true;

export function createEditSuccessEvaluator() {
  return {
    name: 'EditToolSuccess',
    kind: 'CODE' as const,
    evaluate: async ({ output }: { output: WorkflowTaskOutput }) => {
      const editResults = getWorkflowEditResultData(output);

      if (editResults.length === 0) {
        return { score: 0, metadata: { reason: 'No workflow edit tool calls found' } };
      }

      if (SCORE_ON_FINAL_RESULT) {
        const lastResult = editResults[editResults.length - 1];
        const finalSuccess = lastResult.success === true;
        const hadIntermediateFailures = editResults.slice(0, -1).some((r) => r.success === false);

        return {
          score: finalSuccess ? 1 : 0,
          metadata: {
            editResultCount: editResults.length,
            hadIntermediateFailures,
            results: editResults.map((r) => ({
              success: r.success,
              error: r.error,
              toolId: r.toolId,
            })),
          },
        };
      }

      const allSuccessful = editResults.every((r) => r.success === true);

      return {
        score: allSuccessful ? 1 : 0,
        metadata: {
          editResultCount: editResults.length,
          results: editResults.map((r) => ({
            success: r.success,
            error: r.error,
            toolId: r.toolId,
          })),
        },
      };
    },
  };
}

export function createValidationPassEvaluator() {
  return {
    name: 'ValidationPass',
    kind: 'CODE' as const,
    evaluate: async ({ output }: { output: WorkflowTaskOutput }) => {
      const editResults = getWorkflowEditResultData(output);
      const lastEditResult = editResults[editResults.length - 1];

      if (!lastEditResult) {
        return { score: 0, metadata: { reason: 'No workflow edit results' } };
      }

      const validation = lastEditResult.validation as
        | { valid: boolean; errors?: string[] }
        | undefined;

      if (validation) {
        return {
          score: validation.valid ? 1 : 0,
          metadata: { validation },
        };
      }

      // Newer tool shape (platform.core.generate_workflow) doesn't return a
      // `validation` field — it returns `success: true` only when the produced
      // YAML parses & validates server-side. Treat that as the pass signal.
      const success = (lastEditResult as { success?: boolean }).success;
      if (typeof success === 'boolean') {
        return {
          score: success ? 1 : 0,
          metadata: { reason: 'derived from tool success flag', success },
        };
      }

      return { score: 0, metadata: { reason: 'No validation result returned' } };
    },
  };
}

export function createNoErrorsEvaluator() {
  return {
    name: 'NoErrors',
    kind: 'CODE' as const,
    evaluate: async ({ output }: { output: WorkflowTaskOutput }) => {
      const hasErrors = output.errors && output.errors.length > 0;
      return {
        score: hasErrors ? 0 : 1,
        metadata: { errorCount: output.errors?.length ?? 0 },
      };
    },
  };
}

/**
 * Scores whether the model correctly refused to generate a workflow for a negative case.
 * Returns N/A for positive cases since workflow generation is expected there.
 */
export function createRejectionEvaluator() {
  return {
    name: 'Rejection',
    kind: 'CODE' as const,
    evaluate: async ({
      input,
      output,
      expected,
      metadata,
    }: {
      input: WorkflowExample['input'];
      output: WorkflowTaskOutput;
      expected: WorkflowExample['output'];
      metadata: WorkflowExample['metadata'];
    }) => {
      if (metadata?.category !== 'negative') {
        return { score: null, label: 'N/A' as const, explanation: 'Not a negative case' };
      }
      const expectedRefusalReason =
        (expected as NegativeWorkflowExample['output']).expectedRefusalReason ?? null;

      // For edit-context negatives the seeded `initialYaml` echoes back through
      // the conversation attachment store unchanged when the agent refuses, so
      // `output.resultYaml` would otherwise look like the agent produced a
      // workflow. Treat a byte-identical (up to surrounding whitespace) echo as
      // "no new content".
      const initialYaml = (input as NegativeWorkflowExample['input']).initialYaml;
      const echoedSeed =
        !!initialYaml && !!output.resultYaml && output.resultYaml.trim() === initialYaml.trim();
      const refused = !output.resultYaml || echoedSeed;

      const reasonSuffix = expectedRefusalReason
        ? ` (expected reason: ${expectedRefusalReason})`
        : '';
      const echoSuffix = echoedSeed ? ' — agent returned the seeded YAML unchanged' : '';
      return {
        score: refused ? 1 : 0,
        label: refused ? ('PASS' as const) : ('FAIL' as const),
        explanation: refused
          ? `Model correctly refused to generate a workflow${reasonSuffix}${echoSuffix}`
          : `Model incorrectly generated a workflow for a request it should have rejected${reasonSuffix}`,
        metadata: { expectedRefusalReason, echoedSeed },
      };
    },
  };
}

const parseWorkflowYaml = (yaml: string): { steps: Step[] } | undefined => {
  try {
    const parsed = parseYaml(yaml);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const workflow = parsed as Partial<WorkflowYaml>;
    const rawSteps = Array.isArray(workflow.steps) ? (workflow.steps as WorkflowYaml['steps']) : [];
    return { steps: collectAllSteps(rawSteps) };
  } catch {
    return undefined;
  }
};

export function createStructuralCorrectnessEvaluator() {
  return {
    name: 'StructuralCorrectness',
    kind: 'CODE' as const,
    evaluate: async ({
      output,
      expected,
    }: {
      output: WorkflowTaskOutput;
      expected: StructuralExpectations;
    }) => {
      const { expectedStepCount, expectedStepTypes, expectedStepNames } = expected;

      const hasAnyExpectation =
        expectedStepCount !== undefined ||
        (expectedStepTypes && expectedStepTypes.length > 0) ||
        (expectedStepNames && expectedStepNames.length > 0);

      if (!hasAnyExpectation) {
        return { score: 1, metadata: { reason: 'No structural expectations defined' } };
      }

      if (!output.resultYaml) {
        return { score: 0, metadata: { reason: 'No result YAML available for structural check' } };
      }

      const workflow = parseWorkflowYaml(output.resultYaml);
      if (!workflow) {
        return { score: 0, metadata: { reason: 'Failed to parse result YAML' } };
      }

      const checks: Array<{ name: string; pass: boolean; score?: number; detail: string }> = [];

      if (expectedStepCount !== undefined) {
        const count = workflow.steps.length;
        if (typeof expectedStepCount === 'number') {
          const diff = Math.abs(count - expectedStepCount);
          const stepScore = diff === 0 ? 1 : Math.max(0, 1 - diff / expectedStepCount);
          checks.push({
            name: 'stepCount',
            pass: stepScore >= 0.5,
            score: stepScore,
            detail: `expected ${expectedStepCount}, got ${count}`,
          });
        } else {
          let stepScore: number;
          if (count < expectedStepCount.min) {
            stepScore = expectedStepCount.min > 0 ? Math.max(0, count / expectedStepCount.min) : 0;
          } else if (count > expectedStepCount.max) {
            stepScore =
              expectedStepCount.max > 0
                ? Math.max(0, 1 - (count - expectedStepCount.max) / expectedStepCount.max)
                : 0;
          } else {
            stepScore = 1;
          }
          checks.push({
            name: 'stepCount',
            pass: stepScore >= 0.5,
            score: stepScore,
            detail: `expected ${expectedStepCount.min}-${expectedStepCount.max}, got ${count}`,
          });
        }
      }

      if (expectedStepTypes && expectedStepTypes.length > 0) {
        const actualTypes = new Set(workflow.steps.map((s) => s.type).filter(Boolean));
        for (const requiredType of expectedStepTypes) {
          // Strict equality — `|`-alternatives are deprecated. Pinning one
          // exact step type per assertion forces case authors to commit to
          // the correct connector / step shape, otherwise the suite can
          // hide ambiguity behind a forgiving regex-of-alternatives.
          // Lingering "a|b" strings still resolve as one literal type — they
          // will fail-loud and need to be split into one assertion per case.
          const pass = actualTypes.has(requiredType);
          checks.push({
            name: `stepType:${requiredType}`,
            pass,
            detail: pass ? 'present' : `missing (found: ${[...actualTypes].join(', ')})`,
          });
        }
      }

      if (expectedStepNames && expectedStepNames.length > 0) {
        const actualNames = new Set(workflow.steps.map((s) => s.name).filter(Boolean));
        for (const requiredName of expectedStepNames) {
          const pass = actualNames.has(requiredName);
          checks.push({
            name: `stepName:${requiredName}`,
            pass,
            detail: pass ? 'present' : `missing (found: ${[...actualNames].join(', ')})`,
          });
        }
      }

      const totalScore = checks.reduce((sum, c) => sum + (c.score ?? (c.pass ? 1 : 0)), 0);
      return {
        score: checks.length > 0 ? totalScore / checks.length : 1,
        metadata: { checks },
      };
    },
  };
}

/**
 * Asserts the produced YAML's bulk-indexing step has a valid `operations` shape.
 *
 * Real-world failure mode this catches: agents producing
 * `elasticsearch.bulk` with `operations:` set to a flat array of documents
 * (causing `operations.every is not a function` at runtime) or
 * `elasticsearch.request` to `_bulk` with a stringified JSON body instead of
 * the NDJSON action+document pair format the API actually requires.
 *
 * Opt-in per case via `expectsBulkOperationShape: true`.
 */
export function createBulkOperationsShapeEvaluator() {
  return {
    name: 'BulkOperationsShape',
    kind: 'CODE' as const,
    evaluate: async ({
      output,
      expected,
    }: {
      output: WorkflowTaskOutput;
      expected: StructuralExpectations;
    }) => {
      if (!expected.expectsBulkOperationShape) {
        return {
          score: null,
          label: 'N/A' as const,
          explanation: 'Case did not opt in to BulkOperationsShape',
        };
      }
      if (!output.resultYaml) {
        return { score: 0, metadata: { reason: 'No result YAML to check bulk shape on' } };
      }
      const workflow = parseWorkflowYaml(output.resultYaml);
      if (!workflow) {
        return { score: 0, metadata: { reason: 'Failed to parse result YAML' } };
      }

      const bulkSteps = workflow.steps.filter((s) => s.type === 'elasticsearch.bulk');
      const bulkRequestSteps = workflow.steps.filter((s) => {
        if (s.type !== 'elasticsearch.request') return false;
        const params =
          (s as { with?: Record<string, unknown>; params?: Record<string, unknown> }).with ??
          (s as { params?: Record<string, unknown> }).params;
        const path = params?.path;
        return typeof path === 'string' && /\/_bulk\b/.test(path);
      });

      if (bulkSteps.length === 0 && bulkRequestSteps.length === 0) {
        return {
          score: 0,
          label: 'FAIL' as const,
          explanation:
            'Case expected a bulk-indexing step (elasticsearch.bulk or elasticsearch.request → _bulk) but none was found.',
          metadata: { foundBulk: 0 },
        };
      }

      const issues: string[] = [];

      for (const step of bulkSteps) {
        const params =
          (step as { with?: Record<string, unknown>; params?: Record<string, unknown> }).with ??
          (step as { params?: Record<string, unknown> }).params;
        const ops = params?.operations;
        if (ops === undefined) {
          issues.push(`elasticsearch.bulk step "${step.name ?? '?'}" missing operations field`);
          continue;
        }
        // Liquid reference resolving at runtime is fine — `{{ steps.x.output.y }}`
        if (typeof ops === 'string') {
          if (!/{{.+}}/.test(ops)) {
            issues.push(
              `elasticsearch.bulk step "${
                step.name ?? '?'
              }" has operations as a plain string (must be an array or Liquid reference)`
            );
          }
          continue;
        }
        if (!Array.isArray(ops)) {
          issues.push(
            `elasticsearch.bulk step "${
              step.name ?? '?'
            }" has operations of type ${typeof ops} (expected array)`
          );
        }
        // Array is acceptable — the step handles NDJSON serialization. We do NOT
        // require the agent to manually interleave action+doc pairs here.
      }

      for (const step of bulkRequestSteps) {
        const params =
          (step as { with?: Record<string, unknown>; params?: Record<string, unknown> }).with ??
          (step as { params?: Record<string, unknown> }).params;
        const body = params?.body;
        if (body === undefined) {
          issues.push(`elasticsearch.request → _bulk step "${step.name ?? '?'}" missing body`);
          continue;
        }
        // Either NDJSON string with action+doc lines, or Liquid template that resolves to one.
        if (typeof body === 'string') {
          const lines = body.split('\n').filter((l) => l.trim().length > 0);
          if (lines.length < 2 && !/{{.+}}/.test(body)) {
            issues.push(
              `elasticsearch.request → _bulk step "${
                step.name ?? '?'
              }" body is not NDJSON-shaped (need ≥2 lines of action+document pairs)`
            );
          }
        } else if (Array.isArray(body)) {
          issues.push(
            `elasticsearch.request → _bulk step "${
              step.name ?? '?'
            }" body is an array — must be an NDJSON string`
          );
        } else {
          issues.push(
            `elasticsearch.request → _bulk step "${
              step.name ?? '?'
            }" body is of type ${typeof body} (expected NDJSON string or Liquid reference)`
          );
        }
      }

      const totalSteps = bulkSteps.length + bulkRequestSteps.length;
      const failingSteps = issues.length;
      const passingSteps = totalSteps - failingSteps;
      const score = totalSteps === 0 ? 0 : passingSteps / totalSteps;

      return {
        score,
        label: score === 1 ? ('PASS' as const) : ('FAIL' as const),
        explanation:
          issues.length === 0
            ? `All ${totalSteps} bulk step(s) have a valid operations/body shape.`
            : issues.join(' | '),
        metadata: { totalBulkSteps: totalSteps, issues },
      };
    },
  };
}

export function createEditPreservationEvaluator() {
  return {
    name: 'EditPreservation',
    kind: 'CODE' as const,
    evaluate: async ({
      input,
      output,
      expected,
    }: {
      input: WorkflowEditExample['input'] | MultiTurnWorkflowEditExample['input'];
      output: WorkflowTaskOutput;
      expected: WorkflowEditExample['output'] | MultiTurnWorkflowEditExample['output'];
    }) => {
      const preservedStepNames = expected.preservedStepNames;
      if (!preservedStepNames || preservedStepNames.length === 0) {
        return { score: 1, metadata: { reason: 'No preserved steps specified' } };
      }

      if (!output.resultYaml) {
        return {
          score: 0,
          metadata: { reason: 'No result YAML available for preservation check' },
        };
      }

      const before = parseWorkflowYaml(input.initialYaml);
      const after = parseWorkflowYaml(output.resultYaml);

      if (!before || !after) {
        return { score: 0, metadata: { reason: 'Failed to parse YAML for comparison' } };
      }

      const beforeStepsByName = new Map(before.steps.filter((s) => s.name).map((s) => [s.name, s]));
      const afterStepsByName = new Map(after.steps.filter((s) => s.name).map((s) => [s.name, s]));

      const results: Array<{ name: string; preserved: boolean; detail: string }> = [];
      for (const name of preservedStepNames) {
        const originalStep = beforeStepsByName.get(name);
        const resultStep = afterStepsByName.get(name);

        if (!originalStep) {
          results.push({ name, preserved: true, detail: 'not in original (skip)' });
          continue;
        }
        if (!resultStep) {
          results.push({ name, preserved: false, detail: 'missing from result' });
          continue;
        }

        const originalJson = stableStringify(originalStep);
        const resultJson = stableStringify(resultStep);
        const match = originalJson === resultJson;
        results.push({
          name,
          preserved: match,
          detail: match ? 'unchanged' : 'modified',
        });
      }

      const preserved = results.filter((r) => r.preserved).length;
      return {
        score: results.length > 0 ? preserved / results.length : 1,
        metadata: { results },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Liquid templating correctness
// ---------------------------------------------------------------------------

/**
 * Matches both standard Liquid `{{ ... }}` and the workflow-specific control-flow
 * `${{ ... }}` form. The inner capture is the raw expression body.
 */
const LIQUID_EXPRESSION_RE = /\$?\{\{\s*([\s\S]+?)\s*\}\}/g;

/** Drops Liquid filters (` | json`, ` | date: "..."`) and operator tails. */
const extractReferenceHead = (rawExpr: string): string | undefined => {
  const beforeFilter = rawExpr.split('|')[0].trim();
  // Take the first whitespace- or operator-delimited token: `steps.x.output != empty` → `steps.x.output`.
  const head = beforeFilter.split(/[\s=!<>+]/)[0];
  if (!head) return undefined;
  // Skip pure literals (strings / numbers) — they are not references to validate.
  if (/^["'`]/.test(head) || /^\d/.test(head)) return undefined;
  return head;
};

interface LiquidValidationContext {
  stepNames: Set<string>;
  triggerTypes: Set<string>;
  consts: Set<string>;
  /** Stack of enclosing foreach step names. Non-empty ⇒ `foreach.*` references are legal. */
  foreachStack: string[];
}

interface LiquidValidationFailure {
  ref: string;
  reason: string;
  /** Step name where the bad reference appears, if known. */
  inStep?: string;
}

const TRIGGER_EVENT_TYPES = new Set(['alert', 'detection-rule', 'webhook']);

const validateLiquidReference = (
  ref: string,
  ctx: LiquidValidationContext
): { valid: true } | { valid: false; reason: string } => {
  const [root, second] = ref.split('.');
  switch (root) {
    case 'steps': {
      if (!second) return { valid: false, reason: 'steps reference missing step name' };
      // Step name may be followed by `[0]` etc — strip subscript before matching.
      const stepName = second.replace(/\[.*$/, '');
      if (!ctx.stepNames.has(stepName)) {
        return { valid: false, reason: `references unknown step "${stepName}"` };
      }
      return { valid: true };
    }
    case 'foreach': {
      if (ctx.foreachStack.length === 0) {
        return { valid: false, reason: 'foreach.* used outside any foreach' };
      }
      return { valid: true };
    }
    case 'event': {
      const hasEventTrigger = [...ctx.triggerTypes].some((t) => TRIGGER_EVENT_TYPES.has(t));
      if (!hasEventTrigger) {
        return {
          valid: false,
          reason: `event.* requires alert / detection-rule / webhook trigger; declared triggers: ${
            [...ctx.triggerTypes].join(', ') || '(none)'
          }`,
        };
      }
      return { valid: true };
    }
    case 'consts': {
      if (!second) return { valid: false, reason: 'consts reference missing key' };
      if (!ctx.consts.has(second)) {
        return { valid: false, reason: `references undeclared consts key "${second}"` };
      }
      return { valid: true };
    }
    default:
      // Anything else (helpers, literals, filter-only forms like `"now" | date`) is not validated here.
      return { valid: true };
  }
};

const collectStringsFromValue = (value: unknown, acc: string[]): void => {
  if (typeof value === 'string') {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringsFromValue(item, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStringsFromValue(v, acc);
    }
  }
};

interface RawStep {
  name?: string;
  type?: string;
  foreach?: unknown;
  condition?: unknown;
  steps?: RawStep[];
  with?: unknown;
  [key: string]: unknown;
}

const walkStepsForLiquid = (
  steps: RawStep[],
  ctx: LiquidValidationContext,
  visit: (refs: Array<{ ref: string; inStep?: string }>, ctx: LiquidValidationContext) => void
): void => {
  for (const step of steps) {
    const strings: string[] = [];
    // Pull strings from everything except the nested `steps` array.
    for (const [key, value] of Object.entries(step)) {
      if (key === 'steps') continue;
      collectStringsFromValue(value, strings);
    }

    const refs: Array<{ ref: string; inStep?: string }> = [];
    for (const str of strings) {
      LIQUID_EXPRESSION_RE.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = LIQUID_EXPRESSION_RE.exec(str)) !== null) {
        const head = extractReferenceHead(match[1]);
        if (head) refs.push({ ref: head, inStep: step.name });
      }
    }
    if (refs.length > 0) visit(refs, ctx);

    if (Array.isArray(step.steps) && step.steps.length > 0) {
      const isForeach = step.type === 'foreach';
      const nextCtx: LiquidValidationContext = isForeach
        ? { ...ctx, foreachStack: [...ctx.foreachStack, step.name ?? 'foreach'] }
        : ctx;
      walkStepsForLiquid(step.steps, nextCtx, visit);
    }
  }
};

interface LiquidCorrectnessResult {
  score: number | null;
  label?: 'PASS' | 'FAIL' | 'N/A';
  explanation?: string;
  metadata?: {
    total: number;
    correct: number;
    failures: LiquidValidationFailure[];
  };
}

/**
 * Score Liquid expressions in the produced YAML for *correctness* (the reference
 * resolves to a real step / foreach context / trigger field / consts key), not
 * merely *presence*.
 *
 * Returns score = correct / total. Returns N/A when no expressions are found
 * (skip — nothing to evaluate) or when the YAML fails to parse.
 */
export function createLiquidCorrectnessEvaluator() {
  return {
    name: 'LiquidCorrectness',
    kind: 'CODE' as const,
    evaluate: async ({
      output,
    }: {
      output: WorkflowTaskOutput;
    }): Promise<LiquidCorrectnessResult> => {
      if (!output.resultYaml) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No result YAML to evaluate Liquid expressions on',
        };
      }

      let parsed: unknown;
      try {
        parsed = parseYaml(output.resultYaml);
      } catch {
        return { score: null, label: 'N/A', explanation: 'YAML parse failed' };
      }
      if (!parsed || typeof parsed !== 'object') {
        return { score: null, label: 'N/A', explanation: 'YAML root is not an object' };
      }

      const workflow = parsed as {
        steps?: RawStep[];
        triggers?: Array<{ type?: string }>;
        consts?: Record<string, unknown>;
      };
      const rawSteps = Array.isArray(workflow.steps) ? workflow.steps : [];
      const flatSteps = collectAllSteps(rawSteps as unknown as WorkflowYaml['steps']);

      const ctx: LiquidValidationContext = {
        stepNames: new Set(flatSteps.map((s) => s.name).filter((n): n is string => !!n)),
        triggerTypes: new Set(
          (workflow.triggers ?? []).map((t) => t?.type).filter((t): t is string => !!t)
        ),
        consts: new Set(workflow.consts ? Object.keys(workflow.consts) : []),
        foreachStack: [],
      };

      const failures: LiquidValidationFailure[] = [];
      let total = 0;
      let correct = 0;

      walkStepsForLiquid(rawSteps, ctx, (refs, currentCtx) => {
        for (const { ref, inStep } of refs) {
          total += 1;
          const result = validateLiquidReference(ref, currentCtx);
          if (result.valid) {
            correct += 1;
          } else {
            failures.push({ ref, reason: result.reason, inStep });
          }
        }
      });

      if (total === 0) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No Liquid expressions found in the workflow',
        };
      }

      const score = correct / total;
      return {
        score,
        label: score === 1 ? 'PASS' : 'FAIL',
        explanation:
          failures.length === 0
            ? `All ${total} Liquid references resolved correctly.`
            : `${correct}/${total} references valid. First failure: ${failures[0].ref} — ${failures[0].reason}`,
        metadata: { total, correct, failures },
      };
    },
  };
}

/**
 * Asserts that each `expectedLiquidChains[].ref` declared in the example
 * appears verbatim somewhere in the produced YAML. Complements
 * {@link createLiquidCorrectnessEvaluator} (which scores whatever refs the
 * agent did produce) by catching the failure mode where the agent skips a
 * required reference entirely.
 *
 * Returns N/A when the example does not declare expected chains or when no
 * YAML was produced.
 */
export function createLiquidPresenceEvaluator() {
  return {
    name: 'LiquidPresence',
    kind: 'CODE' as const,
    evaluate: async ({
      output,
      expected,
    }: {
      output: WorkflowTaskOutput;
      expected: WorkflowExample['output'];
    }) => {
      const expectedChains = (expected as Partial<StructuralExpectations>).expectedLiquidChains;
      if (!expectedChains || expectedChains.length === 0) {
        return {
          score: null,
          label: 'N/A' as const,
          explanation: 'No expected Liquid chains declared',
        };
      }
      if (!output.resultYaml) {
        return {
          score: null,
          label: 'N/A' as const,
          explanation: 'No result YAML to check Liquid presence on',
        };
      }
      const missing: string[] = [];
      for (const chain of expectedChains) {
        if (!output.resultYaml.includes(chain.ref)) missing.push(chain.ref);
      }
      const total = expectedChains.length;
      const present = total - missing.length;
      const score = present / total;
      return {
        score,
        label: score === 1 ? ('PASS' as const) : ('FAIL' as const),
        explanation:
          missing.length === 0
            ? `All ${total} expected Liquid references appear in the produced YAML.`
            : `${present}/${total} expected references present. Missing: ${missing.join(', ')}`,
        metadata: { total, present, missing },
      };
    },
  };
}

const LOOKUP_TOOL_PATTERNS = [
  'get_step_definitions',
  'get_connectors',
  'get_examples',
  'get_trigger_definitions',
];

const isLookupCall = (toolId: string | undefined): boolean =>
  LOOKUP_TOOL_PATTERNS.some((p) => toolId?.includes(p));

/**
 * Linear budget penalty: full marks at or under budget, then decays as
 * `budget / actualCalls` so a 2× overshoot already drops to 0.5 and a 5×
 * overshoot to 0.2. No plateau — earlier tier-based scoring let chatty
 * agents (e.g. the 47-call indexing-loop seen in real conversations) stay
 * around 0.7 instead of clearly tanking.
 */
const calculateBudgetScore = (totalCalls: number, budget: number): number => {
  if (totalCalls <= budget) {
    return 1.0;
  }
  return Math.max(0, budget / totalCalls);
};

/**
 * Penalizes redundant lookups: calling the same lookup tool with the same
 * params more than once is wasteful. Calls with different params (e.g.
 * a broad search followed by a detailed schema fetch) are not redundant.
 */
const calculateRedundantLookupScore = (
  toolCalls: Array<{ tool_id?: string; params?: Record<string, unknown> }>
): { score: number; redundantCount: number; uniqueLookups: number } => {
  const lookups = toolCalls.filter((t) => isLookupCall(t.tool_id));
  if (lookups.length === 0) {
    return { score: 1, redundantCount: 0, uniqueLookups: 0 };
  }

  const seen = new Set<string>();
  for (const t of lookups) {
    const key = (t.tool_id ?? 'unknown') + '::' + JSON.stringify(t.params ?? {});
    seen.add(key);
  }

  const uniqueLookups = seen.size;
  const redundantCount = lookups.length - uniqueLookups;
  const score = redundantCount === 0 ? 1.0 : Math.max(0, 1 - redundantCount / lookups.length);

  return { score, redundantCount, uniqueLookups };
};

const FAILED_CALL_WEIGHT = 0.3;
const BUDGET_WEIGHT = 0.5;
const REDUNDANT_LOOKUP_WEIGHT = 0.2;

// Tightened from 6 → 4. A well-trajectoried single-workflow generation needs
// at most: get_step_definitions → get_connectors → generate_workflow → (optional
// re-attempt). Cases that legitimately need more must declare expectedMaxToolCalls.
const DEFAULT_TOOL_CALL_BUDGET = 4;

export function createEfficiencyEvaluator() {
  return {
    name: 'Efficiency',
    kind: 'CODE' as const,
    evaluate: async ({
      output,
      expected,
    }: {
      output: WorkflowTaskOutput;
      expected: EfficiencyExpectations;
    }) => {
      const toolCalls = getToolCallSteps(output);
      const workflowCalls = toolCalls.filter((t) => t.tool_id?.includes('generate_workflow'));
      const failedCalls = workflowCalls.filter((t) =>
        t.results?.some((r) => {
          const data = unwrapToolResultData(r);
          return data && data.success === false;
        })
      );

      const totalToolCalls = toolCalls.length;
      const wastedCalls = failedCalls.length;

      const failedCallScore =
        totalToolCalls > 0 ? Math.max(0, 1 - wastedCalls / totalToolCalls) : 1;

      const budget = expected?.expectedMaxToolCalls ?? DEFAULT_TOOL_CALL_BUDGET;
      const budgetScore = calculateBudgetScore(totalToolCalls, budget);

      const {
        score: redundantScore,
        redundantCount,
        uniqueLookups,
      } = calculateRedundantLookupScore(toolCalls);

      const efficiency =
        FAILED_CALL_WEIGHT * failedCallScore +
        BUDGET_WEIGHT * budgetScore +
        REDUNDANT_LOOKUP_WEIGHT * redundantScore;

      return {
        score: Math.round(efficiency * 1000) / 1000,
        metadata: {
          totalToolCalls,
          workflowEditCalls: workflowCalls.length,
          failedCalls: wastedCalls,
          failedCallScore,
          budget,
          budgetScore,
          lookupCalls: toolCalls.filter((t) => isLookupCall(t.tool_id)).length,
          uniqueLookups,
          redundantLookups: redundantCount,
          redundantLookupScore: redundantScore,
        },
      };
    },
  };
}

// Infrastructural tool calls the agent makes regardless of task — filter so
// trajectory scoring reflects task-relevant tool selection, not boilerplate.
const INFRASTRUCTURAL_TOOLS = new Set(['load_skill']);

export function createToolTrajectoryEvaluator() {
  const inner = createTrajectoryEvaluator({
    extractToolCalls: (output) => {
      const steps = (output as WorkflowTaskOutput).steps ?? [];
      return steps
        .filter((s) => s.type === 'tool_call' && s.tool_id)
        .map((s) => s.tool_id!)
        .filter((id) => !INFRASTRUCTURAL_TOOLS.has(id));
    },
    goldenPathExtractor: (expected) => {
      const exp = expected as EfficiencyExpectations;
      return exp.expectedToolSequence ?? [];
    },
    orderWeight: 0.6,
    coverageWeight: 0.4,
  });

  return {
    ...inner,
    evaluate: async (args: Parameters<typeof inner.evaluate>[0]) => {
      const exp = args.expected as EfficiencyExpectations;
      if (!exp.expectedToolSequence) {
        return {
          score: null as null,
          label: 'N/A' as const,
          explanation: 'No expected tool sequence defined — skipping trajectory evaluation.',
        };
      }
      return inner.evaluate(args);
    },
  };
}

/**
 * Wall-clock latency evaluator. Measures how long the task took and scores
 * proportionally: full marks at or under `maxSeconds`, degrading linearly above.
 */
export function createLatencyEvaluator({ maxSeconds = 60 }: { maxSeconds?: number } = {}) {
  return {
    name: 'Latency',
    kind: 'CODE' as const,
    evaluate: async ({ output }: { output: WorkflowTaskOutput }) => {
      const { latencyMs } = output;
      if (latencyMs == null) {
        return { score: null, label: 'N/A' as const, metadata: { reason: 'No latency data' } };
      }
      const seconds = latencyMs / 1000;
      const score =
        seconds <= maxSeconds ? 1 : Math.max(0, 1 - (seconds - maxSeconds) / maxSeconds);
      return {
        score: Math.round(score * 1000) / 1000,
        metadata: { latencyMs, seconds, maxSeconds },
      };
    },
  };
}

/**
 * Build a clean representation for the LLM judge instead of sending the
 * full conversation blob. Separates instruction, initial YAML (for edits),
 * and the resulting YAML so the judge can evaluate the actual workflow state.
 */
export function createCriteriaEvaluator({ evaluators }: { evaluators: DefaultEvaluators }) {
  return {
    name: 'Criteria',
    kind: 'LLM' as const,
    evaluate: async ({
      input,
      output,
      expected,
      metadata,
    }: {
      input: WorkflowExample['input'];
      output: WorkflowTaskOutput;
      expected: WorkflowExample['output'];
      metadata: WorkflowExample['metadata'];
    }) => {
      const { criteria } = expected;
      if (!criteria || criteria.length === 0) {
        return { score: 1, label: 'PASS', explanation: 'No criteria specified.' };
      }

      const cleanInput: Record<string, string> = {
        instruction:
          'instruction' in input
            ? input.instruction
            : input.turns.map((t, i) => `Turn ${i + 1}: ${t.instruction}`).join('\n'),
      };
      if ('initialYaml' in input && input.initialYaml != null) {
        cleanInput.initialYaml = input.initialYaml;
      }

      const isNegativeCase = metadata?.category === 'negative';
      const responseText = output.messages?.map((m) => m.message).join('\n') ?? '';

      // Normalize WeightedCriterion entries into the shared evaluator's
      // EvaluationCriterion shape. Strings are weight-1; structured entries
      // get an auto id (the shared evaluator requires `id` on structured
      // criteria but case authors shouldn't have to invent one).
      const normalizedCriteria = criteria.map((c, i) =>
        typeof c === 'string' ? c : { id: `c${i}`, text: c.text, score: c.score }
      );

      // Judge LLM calls can fail with transient infra errors (malformed
      // streaming chunks, fetch failed, 5xx). Convert those to N/A so a
      // single judge blip doesn't fail the whole Playwright shard.
      const judge = evaluators.criteria(normalizedCriteria);
      const evaluateWithCriteria = async (judgeInput: Parameters<typeof judge.evaluate>[0]) => {
        try {
          return await judge.evaluate(judgeInput);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (INFRA_ERROR_PATTERN.test(message)) {
            return {
              ...INFRA_ERROR_NA,
              explanation: `${INFRA_ERROR_NA.explanation} (judge call: ${message.slice(0, 200)})`,
            };
          }
          throw error;
        }
      };

      if (isNegativeCase) {
        return evaluateWithCriteria({
          input: cleanInput,
          expected,
          output: { response: responseText },
          metadata: undefined,
        });
      }

      if (!output.resultYaml) {
        return {
          score: 0,
          label: 'FAIL' as const,
          explanation: 'No result YAML produced — cannot evaluate criteria.',
        };
      }

      // Forward both the final YAML and the assistant transcript so chat-dependent
      // criteria (e.g. "the agent diagnosed the indent issue before fixing it",
      // "acknowledged the conflict between turn 2 and turn 3") can actually be
      // scored — without this, the judge sees only the YAML and has to guess.
      const judgeResult = await evaluateWithCriteria({
        input: cleanInput,
        expected,
        output: { resultYaml: output.resultYaml, response: responseText },
        metadata: undefined,
      });
      return applyNearPerfectPenalty(judgeResult);
    },
  };
}

/**
 * Discourage "almost-right" outputs from coasting at 0.85–0.95 by clipping any
 * non-perfect Criteria score by a flat 0.15. Tracks the observation that
 * top-tier models cluster at 0.90 on the current rubric: most of those 0.90s
 * are a single failing criterion out of many, which is still a real defect on
 * a workflow that has to run for real.
 *
 * Net effect on the matrix (Sonnet/Opus/Gemini Pro currently ~0.90) lands them
 * around 0.75 — the band requested for the GA hardening pass. Perfect runs
 * (`score === 1`) stay at 1.0; infra-error N/A pass-through stays untouched.
 */
function applyNearPerfectPenalty<R extends { score?: number | null }>(result: R): R {
  if (result.score == null) return result;
  if (result.score >= 1) return result;
  return { ...result, score: Math.max(0, result.score - 0.15) };
}

/**
 * Scores the agent's ability to recover from broken-input YAML across multiple
 * conversational turns. The spec's task loop sets `output.turnsToRecovery` to
 * the 1-based turn index at which valid YAML was produced, or `null` if the
 * loop exhausted maxTurns without recovery.
 *
 * Score: 1.0 if recovered on turn 1, linearly decaying to 0.5 if recovered on
 * the last allowed turn, 0.0 if never recovered.
 */
export function createSelfCorrectionEvaluator() {
  return {
    name: 'SelfCorrection',
    kind: 'CODE' as const,
    evaluate: async ({
      input,
      output,
      expected,
    }: {
      input?: SelfCorrectionExample['input'];
      output: WorkflowTaskOutput;
      expected: SelfCorrectionExample['output'];
    }) => {
      const { turnsToRecovery } = output;
      const maxTurns = Math.max(1, expected.maxTurns);
      const brokenKind = input?.brokenKind ?? null;

      if (turnsToRecovery == null) {
        return {
          score: 0,
          label: 'FAIL' as const,
          explanation: `Agent did not produce valid YAML within ${maxTurns} turns`,
          metadata: { turnsToRecovery: null, maxTurns, brokenKind },
        };
      }

      const clamped = Math.min(turnsToRecovery, maxTurns);
      // Linearly decay from 1.0 (turn 1) to 0.5 (turn maxTurns).
      const score = maxTurns === 1 ? 1 : 1 - 0.5 * ((clamped - 1) / (maxTurns - 1));
      const rounded = Math.round(score * 1000) / 1000;

      return {
        score: rounded,
        label: rounded >= 0.75 ? ('PASS' as const) : ('FAIL' as const),
        explanation: `Recovered on turn ${clamped} of ${maxTurns}`,
        metadata: { turnsToRecovery: clamped, maxTurns, brokenKind },
      };
    },
  };
}
