/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import { isValidTraceId } from '@opentelemetry/api';
import {
  createQuantitativeCorrectnessEvaluators,
  createQuantitativeGroundednessEvaluator,
  createTrajectoryEvaluator,
  getToolCallSteps,
  withEvaluatorSpan,
  type DefaultEvaluators,
  type EvalsExecutorClient,
  type EvaluationDataset,
  type Evaluator,
  type TaskOutput,
  TRACE_INDEX_PATTERN,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type {
  PersonaMatrixExample,
  PersonaMatrixExampleInput,
} from './datasets/persona_matrix_prompts';
import { selectShard } from './datasets/select_shard';
import { createConnectorInvokedEvaluator } from './evaluators/connector_invoked_evaluator';
import type { PersonaMatrixChatClient } from './chat_client';

/**
 * Dataset-level expected output the framework evaluators read via `expected`.
 * `reference` is the ground-truth answer for qualitative scoring; `expected`
 * is the field `correctness/index.ts` reads (`expected?.expected`) — we
 * persist both so a single dataset row drives correctness/groundedness
 * scoring. `tool_sequence` is copied from `metadata.expectedTools` so the
 * trajectory evaluator's `goldenPathExtractor` — which only receives
 * `expected`, not `metadata` — can see the golden path. Mirrors
 * `AlertsRagDatasetExpected` in `kbn-evals-suite-alerts-rag/src/evaluate_dataset.ts`.
 */
export interface PersonaMatrixDatasetExpected {
  reference: string;
  expected: string;
  tool_sequence?: string[];
}

export type PersonaMatrixDatasetExample = PersonaMatrixExample & {
  output: PersonaMatrixDatasetExpected;
};

/**
 * Maps a raw persona-matrix example into the shape the framework evaluators
 * expect: mirrors `output.reference` into `output.expected`, and copies
 * `metadata.expectedTools` into `output.tool_sequence` so
 * `goldenPathExtractor` can resolve the golden path from `expected` without
 * `@kbn/evals`'s `createTrajectoryEvaluator` needing access to `metadata`.
 * One mapping function instead of per-example duplication — cannot drift.
 */
export const toDatasetExample = (ex: PersonaMatrixExample): PersonaMatrixDatasetExample => {
  const expectedTools = ex.metadata?.expectedTools;
  return {
    ...ex,
    output: {
      reference: ex.output.reference,
      expected: ex.output.reference,
      ...(expectedTools?.length ? { tool_sequence: expectedTools } : {}),
    },
  };
};

/**
 * ExpectedToolCalled — verifies every declared expected tool was invoked.
 * Reads `expectedTools` from example metadata, or `tool_sequence` from the
 * expected output.
 *
 * Scores the whole declared set, not just `expectedTools[0]`. 16 of the 21
 * examples declare more than one expected tool, so reading only the first
 * entry left the rest unenforced: an example annotated
 * `['platform.core.generate_esql', 'platform.core.execute_esql']` scored 1 for
 * a run that generated a query and never executed it.
 *
 * All-or-nothing rather than a partial ratio: `Trajectory` already reports
 * graded per-tool overlap. `missingToolIds` names what was skipped so a 0 is
 * diagnosable without re-reading the trace.
 */
export const createPersonaMatrixExpectedToolCalledEvaluator = (): Evaluator => ({
  name: 'ExpectedToolCalled',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected, metadata }) => {
    // Try tool_sequence from expected output first, then expectedTools from metadata
    const toolSequence = (expected as PersonaMatrixDatasetExpected | undefined)?.tool_sequence;
    const meta = metadata as { expectedTools?: string[] } | undefined;
    const expectedTools = meta?.expectedTools ?? toolSequence;

    if (!expectedTools?.length) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No expectedTools annotation — skipping ExpectedToolCalled.',
      };
    }

    const usedToolIds = getToolCallSteps(output as TaskOutput)
      .map((step) => step.tool_id)
      .filter((id): id is string => Boolean(id));

    const usedToolIdSet = new Set(usedToolIds);
    const missingToolIds = expectedTools.filter((toolId) => !usedToolIdSet.has(toolId));

    return {
      score: missingToolIds.length === 0 ? 1 : 0,
      explanation: missingToolIds.length
        ? `Expected tools not called: ${missingToolIds.join(', ')}.`
        : `All expected tools called: ${expectedTools.join(', ')}.`,
      metadata: { expectedToolIds: expectedTools, missingToolIds, usedToolIds },
    };
  },
});

/**
 * Tools whose successful result is itself the user-facing deliverable: they
 * render an artifact (a rule) inline in the conversation. A run that ends on
 * one of these has answered the user even with no closing prose.
 */
const ARTIFACT_PRODUCING_TOOL_IDS = new Set([
  'security.create_detection_rule',
  'security.update_detection_rule',
]);

/**
 * True when the run produced a rendered artifact: an artifact-producing tool
 * returned `success: true` with a `rule` payload. Mirrors the shape asserted
 * by the dataset references ("renders the created rule attachment inline").
 */
const hasRenderedArtifact = (output: TaskOutput): boolean =>
  getToolCallSteps(output).some((step) => {
    if (!step.tool_id || !ARTIFACT_PRODUCING_TOOL_IDS.has(step.tool_id)) {
      return false;
    }
    return (step.results ?? []).some((result) => {
      const data = (result as { data?: { success?: unknown; rule?: unknown } } | undefined)?.data;
      return Boolean(data?.success === true && data?.rule);
    });
  });

/**
 * Regression gate for the empty-final-message failure mode: 62% of
 * detection-rule-edit runs in the 2026-08-21 sweep ended on a tool call with
 * no user-facing closing text, leaving judges (and users) with nothing to
 * read.
 *
 * Scores 1 when the run leaves the user something to read: either non-empty
 * closing prose, or a rendered artifact (a successfully created/updated rule).
 * The artifact clause exists because `detection-rule-edit` references
 * explicitly ask the agent to render the rule attachment inline "rather than
 * describing the rule in prose only" — scoring those runs 0 measured the
 * harness, not the model. Runs that end silently *without* producing an
 * artifact still score 0: that is the real premature-termination failure.
 *
 * N/A only when the task produced no output at all (harness failure — already
 * surfaced by every other evaluator).
 */
export const createPersonaMatrixFinalAnswerPresentEvaluator = (): Evaluator => ({
  name: 'FinalAnswerPresent',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const taskOutput = output as { messages?: Array<{ message?: unknown }> } | undefined;
    if (!taskOutput) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No task output — skipping FinalAnswerPresent.',
      };
    }
    const hasMessage = (taskOutput.messages ?? []).some(
      (msg) => typeof msg?.message === 'string' && msg.message.trim().length > 0
    );
    if (hasMessage) {
      return { score: 1, explanation: 'Final user-facing message present.' };
    }
    if (hasRenderedArtifact(output as TaskOutput)) {
      return {
        score: 1,
        explanation: 'No closing prose, but the run rendered a rule artifact inline.',
      };
    }
    return {
      score: 0,
      explanation: 'Run ended without a user-facing final message or rendered artifact.',
    };
  },
});

/**
 * MinExpectedSteps — flags "gave up without trying": the agent produced a
 * (possibly non-empty) answer but performed fewer tool calls than the example
 * declares in `expectedTools`. Distinct from FinalAnswerPresent (which only
 * checks that *some* text exists) — a model can write a confident answer having
 * called nothing, which is exactly the premature-termination failure mode seen
 * in the original sweep (~90 runs finished in <3 steps).
 *
 * Scores 1 when the run made at least `expectedTools.length` tool calls,
 * otherwise 0. N/A when the example declares no expectedTools (nothing to
 * compare against) or the task produced no output.
 */
export const createPersonaMatrixMinExpectedStepsEvaluator = (): Evaluator => ({
  name: 'MinExpectedSteps',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected, metadata }) => {
    const toolSequence = (expected as PersonaMatrixDatasetExpected | undefined)?.tool_sequence;
    const meta = metadata as { expectedTools?: string[] } | undefined;
    const expectedTools = meta?.expectedTools ?? toolSequence ?? [];
    const minToolCalls = expectedTools.length;
    if (minToolCalls === 0) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No expectedTools annotation — skipping MinExpectedSteps.',
      };
    }
    const taskOutput = output as TaskOutput | undefined;
    if (!taskOutput) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No task output — skipping MinExpectedSteps.',
      };
    }
    const actualToolCalls = getToolCallSteps(taskOutput).length;
    const met = actualToolCalls >= minToolCalls;
    return {
      score: met ? 1 : 0,
      explanation: met
        ? `Made ${actualToolCalls} tool call(s), meeting the expected minimum of ${minToolCalls}.`
        : `Made ${actualToolCalls} tool call(s) but expected at least ${minToolCalls} (${expectedTools.join(
            ', '
          )}) — agent may have given up without trying.`,
    };
  },
});

/**
 * Trajectory evaluator wrapper. Returns N/A when an example has no
 * `tool_sequence` annotation so partial-coverage datasets don't get
 * penalised. Mirrors `createAlertsRagTrajectoryEvaluator` in
 * `kbn-evals-suite-alerts-rag/src/evaluate_dataset.ts`. `filestore.read`
 * (SKILL.md activation) is stripped from the actual sequence since it's
 * already covered by the SkillInvoked evaluator and would otherwise show
 * up as a noisy "extra tool".
 */
const FILESTORE_READ_TOOL_ID = 'filestore.read';

export const isRankablePathContract = (
  metadata: { pathContract?: 'rankable' | 'candidate' | 'probe' } | undefined
): boolean => metadata?.pathContract !== 'probe';

export const createPersonaMatrixTrajectoryEvaluator = (): Evaluator => {
  const inner = createTrajectoryEvaluator({
    extractToolCalls: (output) =>
      getToolCallSteps(output as TaskOutput)
        .map((step) => step.tool_id)
        .filter((id): id is string => Boolean(id) && id !== FILESTORE_READ_TOOL_ID),
    goldenPathExtractor: (expected) => {
      const exp = expected as PersonaMatrixDatasetExpected | undefined;
      return exp?.tool_sequence ?? [];
    },
  });

  return {
    ...inner,
    name: 'Trajectory',
    evaluate: async (args) => {
      const exp = args.expected as PersonaMatrixDatasetExpected | undefined;
      const meta = args.metadata as
        | { pathContract?: 'rankable' | 'candidate' | 'probe' }
        | undefined;
      if (!isRankablePathContract(meta)) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'Open-ended capability probe — trajectory is diagnostic, not rankable.',
          metadata: { pathContract: 'probe' },
        };
      }
      if (!exp?.tool_sequence || exp.tool_sequence.length === 0) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No tool_sequence annotation — skipping trajectory evaluation.',
        };
      }
      return inner.evaluate(args);
    },
  };
};

/**
 * SkillInvoked — verifies the agent loaded an acceptable skill for THIS example.
 *
 * Scored per-example from the example's own metadata, not fanned out across the
 * whole dataset: an `alert-analysis` prompt must not be scored against the
 * `workflow-authoring` assertion. `expectedSkill` and `allowSkills` are a union
 * — loading any one of them passes. Examples with no `expectedSkill` are N/A
 * (score `null`), which is the correct shape for prompts whose documented
 * contract is a direct tool call with no skill load.
 */
const VALID_SKILL_NAME = /^[a-zA-Z0-9_-]+$/;

export const createPersonaMatrixSkillInvokedEvaluator = ({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator => ({
  name: 'SkillInvoked',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, metadata }) => {
    const meta = metadata as { expectedSkill?: string; allowSkills?: string[] } | undefined;
    const acceptedSkills = [meta?.expectedSkill, ...(meta?.allowSkills ?? [])].filter(
      (s): s is string => typeof s === 'string' && s.length > 0
    );

    if (!acceptedSkills.length) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No expectedSkill/allowSkills annotation — skipping SkillInvoked.',
      };
    }

    const invalid = acceptedSkills.filter((s) => !VALID_SKILL_NAME.test(s));
    if (invalid.length) {
      return {
        score: null,
        label: 'error',
        explanation: `Invalid skill name(s): ${invalid.join(', ')}`,
      };
    }

    const traceId = (output as { traceId?: string } | undefined)?.traceId;
    if (!traceId || !isValidTraceId(traceId)) {
      return {
        score: null,
        label: 'unavailable',
        explanation: `No usable traceId for SkillInvoked (traceId: ${traceId ?? 'none'})`,
      };
    }

    const skillPredicate = acceptedSkills
      .flatMap((skillName) => [
        `attributes.gen_ai.tool.call.arguments LIKE "*\\\"skill\\\":\\\"${skillName}\\\"*"`,
        `attributes.gen_ai.tool.call.arguments LIKE "*/${skillName}/SKILL.md*"`,
      ])
      .join(' OR ');

    const query = `FROM ${TRACE_INDEX_PATTERN}
| WHERE trace.id == "${traceId}"
| STATS
  total_tool_spans = COUNT(
    CASE(attributes.elastic.inference.span.kind == "TOOL", 1, NULL)
  ),
  skill_invoked = COUNT(
    CASE(
      attributes.gen_ai.tool.name IN ("load_skill", "filestore.read") AND (${skillPredicate}),
      1,
      NULL
    )
  )`;

    try {
      const response = (await traceEsClient.esql.query({ query })) as unknown as {
        columns: Array<{ name: string }>;
        values: unknown[][];
      };
      const row = response.values?.[0];
      const idx = (name: string) => response.columns?.findIndex((c) => c.name === name) ?? -1;
      const toolSpansIdx = idx('total_tool_spans');
      const invokedIdx = idx('skill_invoked');

      if (!row || toolSpansIdx === -1 || invokedIdx === -1) {
        return {
          score: null,
          label: 'unavailable',
          explanation: 'Expected columns not found in trace query response',
        };
      }

      // No tool spans at all means the trace is not yet searchable, not that the
      // skill was skipped — scoring 0 here would be a false failure.
      if (!(row[toolSpansIdx] as number | undefined)) {
        return {
          score: null,
          label: 'unavailable',
          explanation: 'No tool spans found for trace — trace data likely incomplete',
        };
      }

      const invoked = ((row[invokedIdx] as number | undefined) ?? 0) > 0;
      return { score: invoked ? 1 : 0, metadata: { acceptedSkills, invoked } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warning(`SkillInvoked failed for trace ${traceId}: ${message}`);
      return { score: null, label: 'error', explanation: `SkillInvoked query failed: ${message}` };
    }
  },
});

export function createEvaluatePersonaMatrixDataset({
  chatClient,
  evaluators,
  executorClient,
  traceEsClient,
  log,
}: {
  chatClient: PersonaMatrixChatClient;
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  traceEsClient: EsClient;
  log: ToolingLog;
}) {
  return async function evaluateDataset({
    dataset,
  }: {
    dataset: EvaluationDataset<PersonaMatrixExample>;
  }): Promise<void> {
    // Shard before wrapping so a sharded run seeds and grades only its slice.
    // Slow models need hours for all 21 examples on one stack; the sweeper fans
    // shards out to one VM each.
    const shardedExamples = selectShard(dataset.examples, process.env.PERSONA_MATRIX_SHARD);
    const wrappedExamples = shardedExamples.map(toDatasetExample);

    if (process.env.PERSONA_MATRIX_SHARD) {
      log.info(
        `[persona-matrix] shard ${process.env.PERSONA_MATRIX_SHARD}: ` +
          `${shardedExamples.length}/${dataset.examples.length} examples`
      );
    }

    const skillInvokedEvaluator = createPersonaMatrixSkillInvokedEvaluator({
      traceEsClient,
      log,
    });

    const trajectoryEvaluator = createPersonaMatrixTrajectoryEvaluator();
    const expectedToolCalledEvaluator = createPersonaMatrixExpectedToolCalledEvaluator();
    const finalAnswerPresentEvaluator = createPersonaMatrixFinalAnswerPresentEvaluator();
    const minExpectedStepsEvaluator = createPersonaMatrixMinExpectedStepsEvaluator();
    // Deterministic proof that an authored workflow targets the connector the
    // prompt demanded. ExpectedToolCalled only proves generate_workflow was
    // called, never what it produced -- see connector_invoked_evaluator.ts.
    const connectorInvokedEvaluator = createConnectorInvokedEvaluator();

    const { inputTokens, outputTokens, toolCalls, latency } = evaluators.traceBasedEvaluators;

    // Quantitative correctness/groundedness evaluators are pure functions of
    // the precomputed analyses attached to task output below — no LLM calls
    // at evaluate time. Mirrors `buildAlertsRagEvaluators`.
    const allEvaluators: Evaluator[] = [
      skillInvokedEvaluator,
      trajectoryEvaluator,
      expectedToolCalledEvaluator,
      finalAnswerPresentEvaluator,
      minExpectedStepsEvaluator,
      connectorInvokedEvaluator,
      ...createQuantitativeCorrectnessEvaluators(),
      createQuantitativeGroundednessEvaluator(),
      evaluators.criteria([
        'Relevance: The response directly addresses the user security question.',
        'Clarity: The response is well-structured and easy to follow.',
        'Accuracy: Security concepts and recommendations are technically correct.',
        'Completeness: The response covers the key aspects of the question.',
      ]),
      inputTokens,
      outputTokens,
      toolCalls,
      latency,
    ];

    await executorClient.runExperiment(
      {
        // Reasoning models (GLM, Qwen-thinking) wedge a single-node Kibana
        // event loop at the default concurrency of 5: `converse` calls time out
        // or fail outright with `fetch failed`, losing whole examples. Allow the
        // runner to dial it back per model instead of hardcoding one value that
        // is either too slow for frontier models or too aggressive for these.
        concurrency: Number(process.env.PERSONA_MATRIX_CONCURRENCY) || undefined,
        datasets: [
          {
            name: dataset.name,
            description: dataset.description,
            examples: wrappedExamples,
          },
        ],
        metadata: { suite: 'security-persona-matrix', source: 'persona-matrix-eval' },
        task: async (example) => {
          const input = example.input as PersonaMatrixExampleInput;
          const question = input?.question;
          if (!question) throw new Error('Missing question in example input');
          const response = await chatClient.query(question, input?.attachment);

          const taskOutput: TaskOutput = {
            messages: response.messages,
            // Which turn the answer came from: 'response' is the model's real
            // closing message, 'last_assistant_step' is chat_client's fallback
            // to an interior reasoning/output step (models that end on a tool
            // call return an empty response.message). Without this tag, mid-run
            // narration is indistinguishable from a final answer once stored.
            messageSource: response.messageSource,
            steps: response.steps,
            errors: response.errors,
            traceId: response.traceId ?? null,
            sampling: response.sampling,
            trajectoryFingerprint: response.trajectoryFingerprint,
          };

          // Precompute the qualitative analyses inside the task once, so the
          // deterministic Factuality/Relevance/Sequence Accuracy/Groundedness
          // evaluators registered above are pure functions of the precomputed
          // result and correctnessAnalysis() is invoked exactly once per
          // example (was: once here + once again as a registered evaluator).
          const expected = example.output as PersonaMatrixDatasetExpected;

          // The judges already retry internally; if they still fail, degrade this
          // example's qualitative scores to "unavailable" (the quantitative
          // evaluators handle a missing analysis) rather than discarding the
          // agent's real trajectory, which the deterministic evaluators can score.
          const [correctnessSettled, groundednessSettled] = await Promise.allSettled([
            withEvaluatorSpan('CorrectnessAnalysis', {}, () =>
              evaluators.correctnessAnalysis().evaluate({
                input,
                expected,
                output: taskOutput,
                metadata: example.metadata,
              })
            ),
            withEvaluatorSpan('GroundednessAnalysis', {}, () =>
              evaluators.groundednessAnalysis().evaluate({
                input,
                expected,
                output: taskOutput,
                metadata: example.metadata,
              })
            ),
          ]);

          for (const [name, settled] of [
            ['CorrectnessAnalysis', correctnessSettled],
            ['GroundednessAnalysis', groundednessSettled],
          ] as const) {
            if (settled.status === 'rejected') {
              const reason = settled.reason;
              log.error(
                `[persona-matrix] ${name} failed for example "${example.id ?? question}": ${
                  reason instanceof Error ? reason.message : String(reason)
                }`
              );
            }
          }

          const correctnessResult =
            correctnessSettled.status === 'fulfilled' ? correctnessSettled.value : undefined;
          const groundednessResult =
            groundednessSettled.status === 'fulfilled' ? groundednessSettled.value : undefined;

          return {
            ...(taskOutput as object),
            correctnessAnalysis: correctnessResult?.metadata,
            groundednessAnalysis: groundednessResult?.metadata,
          } as TaskOutput;
        },
      },
      allEvaluators
    );

    log.info('[persona-matrix] dataset evaluation complete');
  };
}
