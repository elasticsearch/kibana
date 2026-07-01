/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DefaultEvaluators,
  Evaluator,
  EvaluationDataset,
  Example,
  EvalsExecutorClient,
  TaskOutput,
} from '@kbn/evals';
import {
  createEsqlEquivalenceEvaluator,
  createTrajectoryEvaluator,
  getToolCallSteps,
} from '@kbn/evals';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ReferenceRule } from '../datasets/sample_rules';
import type { SecurityRuleGenerationClient } from './chat_client';
import {
  validateEsqlSyntax,
  validateFromClause,
  validateSeverity,
  validateRiskScore,
  validateInterval,
  parseDateMathSeconds,
  extractMitreTechniques,
  calculateSetMetrics,
  hasRequiredFields,
} from './helpers';

export interface RuleGenerationTaskOutput {
  generatedRule?: Partial<ReferenceRule>;
  error?: string;
  /**
   * Tool-call steps from the converse response, threaded through so the
   * trajectory evaluator can score the agent's tool path. Present on the
   * success path; absent on negative/refusal cases (which the trajectory
   * evaluator reports N/A for anyway).
   */
  steps?: Array<{ type: string; tool_id?: string }>;
}

// ---------------------------------------------------------------------------
// Skip stats registry — accumulated per dataset, consumed by the reporter
// ---------------------------------------------------------------------------

export interface DatasetSkipSummary {
  datasetName: string;
  totalExamples: number;
  succeeded: number;
  missingIndexSkips: number;
  otherFailures: number;
  otherFailureReasons: string[];
}

const datasetSkipSummaries = new Map<string, DatasetSkipSummary>();

export function getDatasetSkipSummaries(): DatasetSkipSummary[] {
  return Array.from(datasetSkipSummaries.values());
}

export function clearDatasetSkipSummaries(): void {
  datasetSkipSummaries.clear();
}

const MAX_REASON_LENGTH = 120;
function truncate(s: string): string {
  return s.length > MAX_REASON_LENGTH ? `${s.slice(0, MAX_REASON_LENGTH)}...` : s;
}

type RuleExample = Example<{ prompt: string }, ReferenceRule, Record<string, unknown> | null>;

const NEGATIVE_CASE_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation: 'Not applicable: negative case — model should reject this request',
};

const NON_ESQL_REFERENCE_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation: 'Not applicable: reference rule is not ES|QL',
};

const MISSING_INDEX_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation:
    'Not applicable: rule generation failed due to missing index — not a model quality issue',
};

const AGENT_ERROR_NA = {
  score: null as null,
  label: 'N/A' as const,
  explanation:
    'Not applicable: rule generation failed due to an agent/environment error — not a model quality issue',
};

/**
 * Wraps an evaluator so it returns N/A for negative-case examples (category === 'negative').
 * These are prompts where the model should refuse to generate a rule, so production-quality
 * metrics (field coverage, syntax validity, etc.) are meaningless and should not skew averages.
 */
function skipNegativeCases(
  evaluator: Evaluator<RuleExample, RuleGenerationTaskOutput>
): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      if (args.expected?.category === 'negative') {
        return NEGATIVE_CASE_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

/**
 * Wraps an evaluator so it returns N/A when the reference rule is not ES|QL.
 * The ES|QL Functional Equivalence evaluator prompt expects ES|QL on both sides;
 * comparing a generated ES|QL query against an EQL/kuery/empty ground truth is meaningless.
 */
function skipNonEsqlReferences(
  evaluator: Evaluator<RuleExample, RuleGenerationTaskOutput>
): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      if (args.expected?.language !== 'esql' && !args.expected?.esqlQuery) {
        return NON_ESQL_REFERENCE_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

/**
 * Wraps an evaluator so it returns N/A when rule generation failed because the
 * required index could not be discovered. This is an environment constraint
 * (no matching data), not a model quality issue, so it should not penalise scores.
 */
function skipMissingIndexFailures(
  evaluator: Evaluator<RuleExample, RuleGenerationTaskOutput>
): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      const error = (args.output as RuleGenerationTaskOutput)?.error;
      if (error && /could not discover a suitable index/i.test(error)) {
        return MISSING_INDEX_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

/**
 * Wraps an evaluator so it returns N/A when rule generation failed for any
 * reason other than a missing index. These are agent/environment errors
 * (e.g. "Last action is not a generate_query action") that should not
 * penalise model quality scores.
 */
function skipAgentErrors(
  evaluator: Evaluator<RuleExample, RuleGenerationTaskOutput>
): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    ...evaluator,
    evaluate: async (args) => {
      const output = args.output as RuleGenerationTaskOutput;
      if (output?.error && !/could not discover a suitable index/i.test(output.error)) {
        return AGENT_ERROR_NA;
      }
      return evaluator.evaluate(args);
    },
  };
}

// ---------------------------------------------------------------------------
// CODE evaluators — deterministic, no LLM required
// ---------------------------------------------------------------------------

function createQuerySyntaxValidityEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Query Syntax Validity',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      if (!output?.generatedRule?.query) {
        return { score: 0, metadata: { error: 'No query generated' } };
      }
      const { query } = output.generatedRule;
      const syntaxValidation = validateEsqlSyntax(query);
      if (!syntaxValidation.valid) {
        return { score: 0, metadata: { valid: false, error: syntaxValidation.error } };
      }
      const fromValidation = validateFromClause(query);
      return {
        score: fromValidation.valid ? 1 : 0,
        metadata: { valid: fromValidation.valid, error: fromValidation.error },
      };
    },
  };
}

function createFieldCoverageEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Field Coverage',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      if (!output?.generatedRule) {
        return {
          score: 0,
          metadata: {
            error: 'No rule generated',
            missing: ['name', 'description', 'query', 'severity', 'tags', 'riskScore'],
          },
        };
      }
      const { coverage, missing } = hasRequiredFields(output.generatedRule);
      return {
        score: coverage,
        metadata: { coverage: `${Math.round(coverage * 100)}%`, missing },
      };
    },
  };
}

function createRuleTypeLanguageEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Rule Type & Language',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      const { type, language } = output?.generatedRule ?? {};
      const typeOk = type === 'esql';
      const langOk = language === 'esql';
      return {
        score: typeOk && langOk ? 1 : 0,
        metadata: { type, language, typeOk, langOk },
      };
    },
  };
}

function createMitreAccuracyEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'MITRE Accuracy',
    kind: 'CODE',
    evaluate: async ({ output, expected }) => {
      if (!output?.generatedRule) {
        return { score: 0, metadata: { error: 'No rule generated' } };
      }
      const generatedTechniques = extractMitreTechniques(output.generatedRule);
      const expectedTechniques = extractMitreTechniques(expected ?? {});
      const metrics = calculateSetMetrics(generatedTechniques, expectedTechniques);
      const invalidFormat = [...generatedTechniques].filter((t) => !/^T\d{4}(\.\d{3})?$/.test(t));
      return {
        score: metrics.f1,
        metadata: {
          precision: metrics.precision,
          recall: metrics.recall,
          f1: metrics.f1,
          generated: Array.from(generatedTechniques),
          expected: Array.from(expectedTechniques),
          invalidFormat,
        },
      };
    },
  };
}

function createSeverityValidityEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Severity Validity',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      const severity = output?.generatedRule?.severity;
      const valid = validateSeverity(severity);
      return { score: valid ? 1 : 0, metadata: { severity, valid } };
    },
  };
}

function createRiskScoreValidityEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Risk Score Validity',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      const riskScore = output?.generatedRule?.riskScore;
      const valid = validateRiskScore(riskScore);
      return { score: valid ? 1 : 0, metadata: { riskScore, valid } };
    },
  };
}

function createIntervalFormatEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Interval Format',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      const interval = output?.generatedRule?.interval;
      if (!interval) return { score: 0, metadata: { error: 'No interval set' } };
      const valid = validateInterval(interval);
      return { score: valid ? 1 : 0, metadata: { interval, valid } };
    },
  };
}

function createLookbackGapEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Lookback Gap',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      const { from, interval } = output?.generatedRule ?? {};
      const fromSec = parseDateMathSeconds(from);
      const intervalSec = interval ? parseDateMathSeconds(`now-${interval}`) : null;
      if (fromSec === null || intervalSec === null) {
        return { score: 0, metadata: { error: 'Cannot parse from/interval', from, interval } };
      }
      const hasGap = fromSec < intervalSec;
      return { score: hasGap ? 0 : 1, metadata: { from, interval, fromSec, intervalSec, hasGap } };
    },
  };
}

function createSeverityMatchEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Severity Match',
    kind: 'CODE',
    evaluate: async ({ output, expected }) => {
      const generated = output?.generatedRule?.severity;
      const expectedSeverity = expected?.severity;
      const match = generated === expectedSeverity;
      return { score: match ? 1 : 0, metadata: { generated, expected: expectedSeverity } };
    },
  };
}

function createRiskScoreMatchEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Risk Score Match',
    kind: 'CODE',
    evaluate: async ({ output, expected }) => {
      const generated = output?.generatedRule?.riskScore;
      const expectedScore = expected?.riskScore;
      if (generated == null || expectedScore == null) {
        return {
          score: 0,
          metadata: { error: 'Missing riskScore', generated, expected: expectedScore },
        };
      }
      const diff = Math.abs(generated - expectedScore);
      // Partial credit: 1.0 for exact match, 0.5 for ≤10 off, 0 otherwise
      const score = diff === 0 ? 1 : diff <= 10 ? 0.5 : 0;
      return { score, metadata: { generated, expected: expectedScore, diff } };
    },
  };
}

// ---------------------------------------------------------------------------
// Rejection evaluator — negative cases only
// ---------------------------------------------------------------------------

/**
 * Scores whether the model correctly refused to generate a rule for a negative case.
 * Returns N/A for positive cases since rule generation is expected there.
 */
function createRejectionEvaluator(): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Rejection',
    kind: 'CODE',
    evaluate: async ({ output, expected }) => {
      if (expected?.category !== 'negative') {
        return { score: null, label: 'N/A', explanation: 'Not applicable: not a negative case' };
      }
      const refused = !output?.generatedRule;
      return {
        score: refused ? 1 : 0,
        label: refused ? 'PASS' : 'FAIL',
        explanation: refused
          ? 'Model correctly refused to generate a rule'
          : 'Model incorrectly generated a rule for an impossible request',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// LLM evaluators
// ---------------------------------------------------------------------------

/**
 * Checks that the generated rule name semantically matches the expected rule name —
 * they should convey the same threat detection intent even if worded differently.
 */
export function createRuleNameEvaluator(
  evaluators: DefaultEvaluators
): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Rule Name',
    kind: 'LLM',
    evaluate: async ({ input, output, expected, metadata }) => {
      const generatedName = output?.generatedRule?.name ?? '(no name generated)';
      const expectedName = expected?.name ?? '(no expected name)';

      const criteriaEval = evaluators.criteria([
        `The generated rule name should semantically match the expected rule name — ` +
          `both should describe the same threat or attack technique, ` +
          `even if the wording, capitalisation, or phrasing differs. ` +
          `Expected name: "${expectedName}" ` +
          `Generated name: "${generatedName}"`,
      ]);

      return criteriaEval.evaluate({ input, output: output?.generatedRule, expected, metadata });
    },
  };
}

/**
 * Checks that the generated rule description functionally describes the same threat scenario
 * as the expected description, even if worded differently.
 */
export function createRuleDescriptionEvaluator(
  evaluators: DefaultEvaluators
): Evaluator<RuleExample, RuleGenerationTaskOutput> {
  return {
    name: 'Rule Description',
    kind: 'LLM',
    evaluate: async ({ input, output, expected, metadata }) => {
      const generatedDesc = output?.generatedRule?.description ?? '(no description generated)';
      const expectedDesc = expected?.description ?? '(no expected description)';

      const criteriaEval = evaluators.criteria([
        `The generated rule description should functionally describe the same threat scenario ` +
          `as the expected description — covering the same adversary behaviour, ` +
          `attack technique, or detection goal, even if the exact wording differs. ` +
          `Expected description: "${expectedDesc}" ` +
          `Generated description: "${generatedDesc}"`,
      ]);

      return criteriaEval.evaluate({ input, output: output?.generatedRule, expected, metadata });
    },
  };
}

// ---------------------------------------------------------------------------
// Trajectory evaluator — scores the agent's tool-call path (LLM-free)
// ---------------------------------------------------------------------------

/**
 * Trajectory evaluator wrapper. Scores the agent's tool-call sequence against a
 * per-example `expectedToolSequence` annotation (carried on the reference rule)
 * using LCS (order) + set intersection (coverage). Returns N/A when an example
 * has no annotation so partial-coverage datasets aren't penalised. Mirrors the
 * pci-compliance suite's `createPciTrajectoryEvaluator`.
 */
export function createAiRulesTrajectoryEvaluator(): Evaluator<
  RuleExample,
  RuleGenerationTaskOutput
> {
  const inner = createTrajectoryEvaluator({
    extractToolCalls: (output) =>
      getToolCallSteps(output as TaskOutput)
        .map((step) => step.tool_id)
        .filter((id): id is string => Boolean(id)),
    goldenPathExtractor: (expected) =>
      (expected as Partial<ReferenceRule> | undefined)?.expectedToolSequence ?? [],
    orderWeight: 0.4,
    coverageWeight: 0.6,
  });

  return {
    ...inner,
    name: 'Trajectory',
    evaluate: async (args) => {
      const seq = (args.expected as Partial<ReferenceRule> | undefined)?.expectedToolSequence;
      if (!seq || seq.length === 0) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No expectedToolSequence annotation — skipping trajectory evaluation.',
        };
      }
      return inner.evaluate(args);
    },
  } as Evaluator<RuleExample, RuleGenerationTaskOutput>;
}

// ---------------------------------------------------------------------------
// Factory — mirrors the agent-builder createEvaluateDataset pattern
// ---------------------------------------------------------------------------

export function createEvaluateDataset({
  evaluators,
  executorClient,
  chatClient,
  inferenceClient,
  log,
}: {
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  chatClient: SecurityRuleGenerationClient;
  inferenceClient: BoundInferenceClient;
  log: ToolingLog;
}): ({ dataset }: { dataset: EvaluationDataset<RuleExample> }) => Promise<void> {
  const esqlEquivalenceEvaluator = createEsqlEquivalenceEvaluator({
    inferenceClient,
    log,
    predictionExtractor: (output: unknown) =>
      (output as RuleGenerationTaskOutput)?.generatedRule?.query ?? '',
    groundTruthExtractor: (expected: unknown) => {
      const rule = expected as Partial<ReferenceRule>;
      return rule?.esqlQuery ?? rule?.query ?? '';
    },
  });

  const skip = (e: Evaluator<RuleExample, RuleGenerationTaskOutput>) =>
    skipAgentErrors(skipMissingIndexFailures(e));

  // Observability (trace-based, zero per-example LLM cost): baseline latency /
  // token-usage / tool-call signals derived from OTel spans for each task's
  // trace.id. Sourced from the framework fixture so query shape stays
  // consistent across suites. These are unconditional (no skip wrapper) because
  // they measure cost/efficiency of the run regardless of functional outcome.
  const { inputTokens, outputTokens, cachedTokens, toolCalls, latency } =
    evaluators.traceBasedEvaluators;

  const allEvaluators: Array<Evaluator<RuleExample, RuleGenerationTaskOutput>> = [
    // CODE — deterministic
    skip(skipNegativeCases(createQuerySyntaxValidityEvaluator())),
    skip(skipNegativeCases(createFieldCoverageEvaluator())),
    skip(skipNegativeCases(createRuleTypeLanguageEvaluator())),
    skip(skipNegativeCases(createMitreAccuracyEvaluator())),
    skip(skipNegativeCases(createSeverityValidityEvaluator())),
    skip(skipNegativeCases(createRiskScoreValidityEvaluator())),
    skip(skipNegativeCases(createIntervalFormatEvaluator())),
    skip(skipNegativeCases(createLookbackGapEvaluator())),
    skip(skipNegativeCases(createSeverityMatchEvaluator())),
    skip(skipNegativeCases(createRiskScoreMatchEvaluator())),
    // LLM — ES|QL functional equivalence via @kbn/evals built-in evaluator
    skip(skipNonEsqlReferences(skipNegativeCases(esqlEquivalenceEvaluator))),
    // Intentionally disabled for speed: these LLM evaluators add significant latency per example.
    // Re-enable when running thorough multi-model comparisons.
    // skip(skipNegativeCases(createRuleNameEvaluator(evaluators))),
    // skip(skipNegativeCases(createRuleDescriptionEvaluator(evaluators))),
    // Rejection — scores 1 when model correctly refuses a negative case, N/A otherwise
    skip(createRejectionEvaluator()),
    // Observability (trace-based, zero per-example LLM cost)
    toolCalls as Evaluator<RuleExample, RuleGenerationTaskOutput>,
    latency as Evaluator<RuleExample, RuleGenerationTaskOutput>,
    inputTokens as Evaluator<RuleExample, RuleGenerationTaskOutput>,
    outputTokens as Evaluator<RuleExample, RuleGenerationTaskOutput>,
    cachedTokens as Evaluator<RuleExample, RuleGenerationTaskOutput>,
    // Trajectory (LLM-free): scores the agent's tool-call path against a
    // per-example golden sequence. Added raw (no skip wrapper) so it reports
    // N/A on its own for unannotated examples. Reports N/A until annotations land.
    createAiRulesTrajectoryEvaluator(),
  ];

  return async function evaluateDataset({
    dataset,
  }: {
    dataset: EvaluationDataset<RuleExample>;
  }): Promise<void> {
    let totalExamples = 0;
    let succeeded = 0;
    let missingIndexFailures = 0;
    let otherFailures = 0;
    const otherFailureReasons: string[] = [];

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        task: async ({ input, output: expected }) => {
          if (!input) throw new Error('Missing input for task');
          totalExamples++;
          const SEP = '═'.repeat(60);
          log.info(`[Task] Prompt: "${input.prompt}"`);
          try {
            const taskResult = await chatClient.generateRule(input.prompt);

            if (!taskResult.generatedRule) {
              if (expected?.category === 'negative') {
                // Negative-case prompts are expected to be rejected. Treat a refusal as success
                // so dataset summaries don't misclassify correct behavior as an "agent error".
                succeeded++;
                log.info('[Task] Negative case: model refused to generate a rule (expected)');
                return {};
              }

              const isMissingIndex =
                taskResult.error && /could not discover a suitable index/i.test(taskResult.error);
              if (isMissingIndex) {
                missingIndexFailures++;
                log.warning(
                  `[Task] Skipped — missing index (all evaluators will return N/A). Error: ${taskResult.error}`
                );
              } else {
                otherFailures++;
                otherFailureReasons.push(truncate(taskResult.error ?? 'No rule returned'));
                log.warning(`[Task] No rule generated. Error: ${taskResult.error}`);
              }
              return { error: taskResult.error || 'No rule returned from agent' };
            }

            if (expected?.category === 'negative') {
              // Negative-case prompts should not produce rules.
              otherFailures++;
              otherFailureReasons.push(truncate('Generated a rule for a negative-case prompt'));
              log.warning(
                '[Task] Negative case: model generated a rule (unexpected; rejection evaluator will fail)'
              );
            } else {
              succeeded++;
            }
            log.info(SEP);
            log.success(`Generated rule: "${taskResult.generatedRule.name}"`);
            log.info(JSON.stringify(taskResult.generatedRule, null, 2));
            log.info(SEP);

            const genTech = extractMitreTechniques(taskResult.generatedRule);
            const expTech = extractMitreTechniques(expected ?? {});
            log.info(
              `[Result] MITRE: generated=[${[...genTech].join(', ') || 'none'}] | expected=[${
                [...expTech].join(', ') || 'none'
              }]`
            );

            const { coverage, missing } = hasRequiredFields(taskResult.generatedRule);
            log.info(
              `[Result] Field coverage: ${Math.round(coverage * 100)}%${
                missing.length ? ` | missing: ${missing.join(', ')}` : ''
              }`
            );

            log.info(
              `[Result] Rule type & language: type=${taskResult.generatedRule.type} | language=${taskResult.generatedRule.language}`
            );

            const syntaxResult = validateEsqlSyntax(taskResult.generatedRule.query ?? '');
            log.info(
              `[Result] Query syntax: ${
                syntaxResult.valid ? 'valid' : `INVALID — ${syntaxResult.error}`
              }`
            );

            return taskResult;
          } catch (error) {
            otherFailures++;
            const msg = error instanceof Error ? error.message : String(error);
            otherFailureReasons.push(truncate(msg));
            log.error(`Error generating rule: ${msg}`);
            return { error: msg || 'Unknown error' };
          }
        },
      },
      allEvaluators
    );

    datasetSkipSummaries.set(dataset.name, {
      datasetName: dataset.name,
      totalExamples,
      succeeded,
      missingIndexSkips: missingIndexFailures,
      otherFailures,
      otherFailureReasons,
    });

    if (missingIndexFailures > 0 || otherFailures > 0) {
      const parts = [
        `${succeeded} succeeded`,
        missingIndexFailures > 0 ? `${missingIndexFailures} skipped (missing index)` : undefined,
        otherFailures > 0 ? `${otherFailures} failed (agent error)` : undefined,
      ].filter(Boolean);
      log.warning(`[Summary] ${dataset.name}: ${totalExamples} total — ${parts.join(', ')}`);
    } else {
      log.info(`[Summary] ${dataset.name}: ${totalExamples} total — ${succeeded} succeeded`);
    }
  };
}
