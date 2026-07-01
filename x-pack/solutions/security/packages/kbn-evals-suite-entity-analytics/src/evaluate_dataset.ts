/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createQuantitativeCorrectnessEvaluators,
  createQuantitativeGroundednessEvaluator,
  selectEvaluators,
  withEvaluatorSpan,
  type DefaultEvaluators,
  type EvalsExecutorClient,
  type EvaluationDataset,
  type EvaluationResult,
  type Evaluator,
  type Example,
} from '@kbn/evals';
import type {
  EvaluationChatClient,
  ErrorResponse,
  Step,
  Messages,
  AttachmentRecord,
} from './chat_client';

interface ToolCallAssertion {
  id: string;
  /** If the primary tool was not called, accept any of these tool IDs as satisfying the "tool was used" check (no criteria evaluated for alternatives). */
  acceptableAlternativeToolIds?: string[];
  criteria?: string[];
}

/**
 * Assertion against a conversation-level attachment persisted as a side effect
 * of tool execution. Used by the attachments evaluator to validate that (for
 * example) `security.get_entity` registered a `security.entity` attachment
 * with the expected payload shape.
 *
 * Semantics:
 * - `type` is required and matched exactly against `attachment.type`.
 * - `shape` narrows the payload on `attachment.versions[current_version].data`:
 *    - `single` expects `EntityAttachmentSingleData` (identifier + identifierType).
 *    - `table` expects `EntityAttachmentMultiData` (entities[]).
 * - `entityId` / `entityType` match the attachment identifier (single payload
 *   only). `entityId` matches either raw or stripped-prefix form.
 * - `minEntities` / `count` bound the number of matching attachments and/or
 *   entries in a table payload.
 * - `criteria` delegates free-form payload assertions to the LLM judge via the
 *   standard `evaluators.criteria(...)` pathway — the payload JSON is passed
 *   as the evaluator output.
 */
interface AttachmentAssertion {
  type: string;
  shape?: 'single' | 'table';
  entityId?: string;
  entityType?: 'host' | 'user' | 'service' | 'generic';
  minEntities?: number;
  count?: { min?: number; max?: number; exact?: number };
  criteria?: string[];
}

interface DatasetExample extends Example {
  input: { question: string };
  output: {
    criteria?: string[];
    toolCalls?: ToolCallAssertion[];
    attachments?: AttachmentAssertion[];
  };
  metadata?: { query_intent?: string };
}

interface ChatTaskOutput {
  errors: ErrorResponse[];
  messages: Messages;
  steps?: Step[];
  attachments?: AttachmentRecord[];
}

export type EvaluateDataset = ({
  dataset: { name, description, examples },
}: {
  dataset: {
    name: string;
    description: string;
    examples: DatasetExample[];
  };
  concurrency?: number;
}) => Promise<void>;

/**
 * Finds tool call steps for a specific tool ID.
 * @param toolId - The tool ID to search for
 * @param steps - The conversation steps to search
 * @returns Array of tool call steps matching the tool ID
 */
function findToolCallSteps(toolId: string, steps: Step[]): Step[] {
  return steps.filter(
    (step) =>
      (step as { type?: string; tool_id?: string }).type === 'tool_call' &&
      (step as { type?: string; tool_id?: string }).tool_id === toolId
  );
}

/**
 * Extracts all unique tool IDs that were called during the conversation.
 */
function getCalledToolIds(steps: Step[]): string[] {
  return [
    ...new Set(
      steps
        .filter((step) => (step as { type?: string }).type === 'tool_call')
        .map((step) => (step as { tool_id?: string }).tool_id)
        .filter((id): id is string => id !== undefined)
    ),
  ];
}

/**
 * Evaluates a tool call assertion with its specific criteria.
 * @param toolCallAssertion - The tool call assertion to evaluate
 * @param steps - The conversation steps to search for tool calls
 * @param evaluators - The evaluators to use for criteria evaluation
 * @param input - The input from the example
 * @param output - The chat output
 * @param metadata - The metadata from the example
 * @returns Evaluation result for the tool call
 */
const evaluateToolCallAssertion = async (
  toolCallAssertion: ToolCallAssertion,
  steps: Step[],
  evaluators: DefaultEvaluators,
  input: DatasetExample['input'],
  output: ChatTaskOutput,
  metadata: DatasetExample['metadata']
): Promise<EvaluationResult> => {
  const primaryToolCallSteps = findToolCallSteps(toolCallAssertion.id, steps);
  const primaryToolWasCalled = primaryToolCallSteps.length > 0;

  const alternativeIds = toolCallAssertion.acceptableAlternativeToolIds ?? [];
  const alternativeToolCalled =
    alternativeIds.length > 0 &&
    alternativeIds.some((altId) => findToolCallSteps(altId, steps).length > 0);

  const toolWasCalled = primaryToolWasCalled || alternativeToolCalled;

  if (!toolWasCalled) {
    const calledTools = getCalledToolIds(steps);
    const calledToolsSummary =
      calledTools.length > 0
        ? ` Tools actually called: [${calledTools.join(', ')}].`
        : ' No tools were called during the conversation.';
    return {
      score: 0,
      label: 'FAIL',
      explanation: `Tool "${toolCallAssertion.id}" was not called.${calledToolsSummary}`,
    };
  }

  if (alternativeToolCalled && !primaryToolWasCalled) {
    return {
      score: 1,
      label: 'PASS',
      explanation: `Primary tool "${toolCallAssertion.id}" was not called, but an acceptable alternative entity-analytics tool was called.`,
    };
  }

  // If no specific criteria for this tool call, just check that it was called
  if (!toolCallAssertion.criteria || toolCallAssertion.criteria.length === 0) {
    return {
      score: 1,
      label: 'PASS',
      explanation: `Tool "${toolCallAssertion.id}" was called during the conversation.`,
    };
  }

  // Evaluate the specific criteria for this tool call
  const toolCriteriaResult = await evaluators
    .criteria(toolCallAssertion.criteria)
    .evaluate({ input, expected: { criteria: toolCallAssertion.criteria }, output, metadata });

  const toolCallExplanation = `Tool "${toolCallAssertion.id}" was called during the conversation.`;
  const combinedExplanation = `${toolCallExplanation} ${toolCriteriaResult.explanation ?? ''}`;

  return {
    score: toolCriteriaResult.score ?? null,
    label: toolCriteriaResult.label ?? 'PASS',
    explanation: combinedExplanation,
  };
};

const evaluateAllToolCalls = async (
  toolCalls: ToolCallAssertion[],
  steps: Step[],
  evaluators: DefaultEvaluators,
  input: DatasetExample['input'],
  output: ChatTaskOutput,
  metadata: DatasetExample['metadata']
): Promise<EvaluationResult[]> => {
  const results: EvaluationResult[] = [];

  for (const toolCallAssertion of toolCalls) {
    const result = await evaluateToolCallAssertion(
      toolCallAssertion,
      steps,
      evaluators,
      input,
      output,
      metadata
    );
    results.push(result);
  }

  return results;
};

/**
 * Combines multiple evaluation results into a single result.
 * All results must pass for the overall result to pass.
 */
function combineEvaluationResults(results: EvaluationResult[]): EvaluationResult {
  const allPassed = results.every((result) => result.label === 'PASS' && (result.score ?? 0) > 0);

  const scores = results.map((r) => r.score ?? 0).filter((s) => s !== null);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const explanations = results.map((r) => r.explanation ?? '').filter((e) => e.length > 0);

  return {
    score: allPassed ? averageScore : 0,
    label: allPassed ? 'PASS' : 'FAIL',
    explanation: explanations.join(' '),
  };
}

interface EvaluateDatasetOpts {
  dataset: { name: string; description: string; examples: DatasetExample[] };
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 3;

interface CreateEvaluateDatasetOpts {
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  chatClient: EvaluationChatClient;
}

export function createEvaluateDataset({
  evaluators,
  executorClient,
  chatClient,
}: CreateEvaluateDatasetOpts): EvaluateDataset {
  return async function evaluateDataset({
    dataset: { name, description, examples },
    concurrency = DEFAULT_CONCURRENCY,
  }: EvaluateDatasetOpts) {
    const dataset = { name, description, examples } satisfies EvaluationDataset;

    // Observability (trace-based, zero per-example LLM cost): baseline latency /
    // token-usage signals derived from OTel spans for this task's trace.id.
    // NOTE: the framework fixture's `toolCalls` trace evaluator is intentionally
    // NOT wired here — this suite already defines a richer LLM-judged
    // `ToolCalls` evaluator (asserting against `expected.toolCalls`), and the
    // two share the same name, which would collide in the report.
    const { inputTokens, outputTokens, cachedTokens, latency } = evaluators.traceBasedEvaluators;

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        concurrency,
        task: async ({ input, output, metadata }) => {
          const response = await chatClient.converse({ messages: [{ message: input.question }] });

          let correctnessResult: { metadata?: unknown } | undefined;
          let groundednessResult: { metadata?: unknown } | undefined;

          try {
            const [correctness, groundedness] = await Promise.all([
              withEvaluatorSpan('CorrectnessAnalysis', {}, () =>
                evaluators.correctnessAnalysis().evaluate({
                  input,
                  expected: output,
                  output: response,
                  metadata,
                })
              ),
              withEvaluatorSpan('GroundednessAnalysis', {}, () =>
                evaluators.groundednessAnalysis().evaluate({
                  input,
                  expected: output,
                  output: response,
                  metadata,
                })
              ),
            ]);
            correctnessResult = correctness;
            groundednessResult = groundedness;
          } catch (err) {
            // Judge model may return invalid tool call args (toolValidationError); continue without
            // analysis so quantitative evaluators report "unavailable" instead of failing the test.
          }

          return {
            errors: response.errors,
            messages: response.messages,
            steps: response.steps,
            attachments: response.attachments,
            traceId: response.traceId,
            modelUsage: response.modelUsage,
            correctnessAnalysis: correctnessResult?.metadata,
            groundednessAnalysis: groundednessResult?.metadata,
          };
        },
      },
      [
        createCriteriaEvaluator({ evaluators }),
        createToolCallsEvaluator({ evaluators }),
        createAttachmentsEvaluator({ evaluators }),
        ...selectEvaluators([
          createQuantitativeGroundednessEvaluator(),
          ...createQuantitativeCorrectnessEvaluators().filter(
            (e) => e.name !== 'Factuality' && e.name !== 'Relevance'
            // Exclude Factuality/Relevance: expected output is criteria/toolCalls, not literal
            // ground truth text, so quantitative correctness comparison produces noise (low scores).
          ),
        ]),
        // Observability (trace-based, zero per-example LLM cost)
        latency as Evaluator<DatasetExample, ChatTaskOutput>,
        inputTokens as Evaluator<DatasetExample, ChatTaskOutput>,
        outputTokens as Evaluator<DatasetExample, ChatTaskOutput>,
        cachedTokens as Evaluator<DatasetExample, ChatTaskOutput>,
      ]
    );
  };
}

interface EvaluateOpts {
  input: DatasetExample['input'];
  output: ChatTaskOutput;
  expected: DatasetExample['output'];
  metadata: DatasetExample['metadata'];
}

const createCriteriaEvaluator = ({
  evaluators,
}: {
  evaluators: DefaultEvaluators;
}): Evaluator<DatasetExample, ChatTaskOutput> => {
  return {
    name: 'Criteria',
    kind: 'LLM' as const,
    evaluate: async ({ expected, ...rest }: EvaluateOpts) => {
      const criteria = expected.criteria ?? [];

      if (criteria.length === 0) {
        return {
          score: 1,
          label: 'PASS',
          explanation: 'No main criteria specified.',
        };
      }

      return evaluators.criteria(criteria).evaluate({ expected, ...rest });
    },
  };
};

const createToolCallsEvaluator = ({ evaluators }: { evaluators: DefaultEvaluators }) => {
  return {
    name: 'ToolCalls',
    kind: 'LLM' as const,
    evaluate: async ({ input, output, expected, metadata }: EvaluateOpts) => {
      const toolCalls = expected.toolCalls ?? [];
      const steps = output.steps ?? [];

      if (toolCalls.length === 0) {
        return {
          score: 1,
          label: 'PASS',
          explanation: 'No tool call assertions specified.',
        };
      }

      if (steps.length === 0) {
        const expectedToolIds = toolCalls.map((tc) => tc.id).join(', ');
        return {
          score: 0,
          label: 'FAIL',
          explanation: `No steps were returned from the conversation (steps array is ${
            output.steps === undefined ? 'undefined' : 'empty'
          }). Expected tool calls: [${expectedToolIds}].`,
        };
      }

      const toolCallResults = await evaluateAllToolCalls(
        toolCalls,
        steps,
        evaluators,
        input,
        output,
        metadata
      );

      return combineEvaluationResults(toolCallResults);
    },
  };
};

/**
 * Returns the current-version payload for an attachment, or `undefined` when
 * the record has no versions / current version mismatch. The Agent Builder
 * attachment API keeps version arrays 1-indexed so we locate the matching
 * entry rather than indexing blindly.
 */
const getCurrentAttachmentData = (attachment: AttachmentRecord): unknown => {
  const current = attachment.versions.find((v) => v.version === attachment.current_version);
  return current?.data;
};

interface AttachmentPayloadShape {
  shape?: 'single' | 'table';
  identifier?: string;
  identifierType?: string;
  entityStoreId?: string;
  entitiesCount?: number;
}

/**
 * Classifies an attachment payload into `single` / `table` shape and extracts
 * the identifier fields used by the matcher. Mirrors the discriminator logic
 * in `EntityAttachmentData` (single: `identifier` + `identifierType`;
 * table: `entities: []`).
 */
const classifyPayload = (data: unknown): AttachmentPayloadShape => {
  if (!data || typeof data !== 'object') {
    return {};
  }
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.entities)) {
    return { shape: 'table', entitiesCount: obj.entities.length };
  }
  if (typeof obj.identifier === 'string' && typeof obj.identifierType === 'string') {
    return {
      shape: 'single',
      identifier: obj.identifier,
      identifierType: obj.identifierType,
      entityStoreId: typeof obj.entityStoreId === 'string' ? obj.entityStoreId : undefined,
    };
  }
  return {};
};

/**
 * Checks whether an `entityId` assertion matches an attachment identifier.
 * Tolerant of the `{type}:` prefix so specs can assert either the canonical
 * EUID ("user:jsmith123") or the bare identity value ("jsmith123") — the tool
 * strips the prefix on single payloads (see `stripEntityIdPrefix`).
 */
const entityIdMatches = (expected: string, shape: AttachmentPayloadShape): boolean => {
  const candidates = [shape.identifier, shape.entityStoreId].filter(
    (v): v is string => typeof v === 'string'
  );
  const expectedLower = expected.toLowerCase();
  const expectedStripped = expectedLower.includes(':')
    ? expectedLower.slice(expectedLower.indexOf(':') + 1)
    : expectedLower;
  return candidates.some((c) => {
    const cLower = c.toLowerCase();
    return cLower === expectedLower || cLower === expectedStripped;
  });
};

const findMatchingAttachments = (
  assertion: AttachmentAssertion,
  attachments: AttachmentRecord[]
): Array<{ attachment: AttachmentRecord; shape: AttachmentPayloadShape }> => {
  return attachments
    .filter((a) => a.type === assertion.type && a.active !== false)
    .map((attachment) => ({
      attachment,
      shape: classifyPayload(getCurrentAttachmentData(attachment)),
    }))
    .filter(({ shape }) => {
      if (assertion.shape && shape.shape !== assertion.shape) return false;
      if (assertion.entityType && shape.identifierType !== assertion.entityType) return false;
      if (assertion.entityId && !entityIdMatches(assertion.entityId, shape)) return false;
      if (assertion.minEntities !== undefined) {
        if (shape.shape !== 'table') return false;
        if ((shape.entitiesCount ?? 0) < assertion.minEntities) return false;
      }
      return true;
    });
};

const formatCountBounds = (count: NonNullable<AttachmentAssertion['count']>): string => {
  const parts: string[] = [];
  if (count.exact !== undefined) parts.push(`exact=${count.exact}`);
  if (count.min !== undefined) parts.push(`min=${count.min}`);
  if (count.max !== undefined) parts.push(`max=${count.max}`);
  return parts.join(', ');
};

const evaluateAttachmentAssertion = async (
  assertion: AttachmentAssertion,
  attachments: AttachmentRecord[],
  evaluators: DefaultEvaluators,
  input: DatasetExample['input'],
  metadata: DatasetExample['metadata']
): Promise<EvaluationResult> => {
  const matches = findMatchingAttachments(assertion, attachments);
  const count = assertion.count;

  // Count-based assertion (including `count.exact: 0` for negative assertions).
  if (count) {
    const n = matches.length;
    const exactFail = count.exact !== undefined && n !== count.exact;
    const minFail = count.min !== undefined && n < count.min;
    const maxFail = count.max !== undefined && n > count.max;
    if (exactFail || minFail || maxFail) {
      return {
        score: 0,
        label: 'FAIL',
        explanation: `Expected ${formatCountBounds(count)} attachments of type "${
          assertion.type
        }" matching shape/entity filters, found ${n}.`,
      };
    }
    // If exact=0, pass here — no criteria to judge.
    if (count.exact === 0) {
      return {
        score: 1,
        label: 'PASS',
        explanation: `Confirmed 0 attachments of type "${assertion.type}" matching filters.`,
      };
    }
  } else if (matches.length === 0) {
    // Default: require at least one match.
    const typesSeen = [...new Set(attachments.map((a) => a.type))].join(', ') || '(none)';
    return {
      score: 0,
      label: 'FAIL',
      explanation: `No attachment matched type="${assertion.type}"${
        assertion.shape ? ` shape=${assertion.shape}` : ''
      }${assertion.entityId ? ` entityId=${assertion.entityId}` : ''}${
        assertion.entityType ? ` entityType=${assertion.entityType}` : ''
      }. Types present: [${typesSeen}].`,
    };
  }

  if (!assertion.criteria || assertion.criteria.length === 0) {
    return {
      score: 1,
      label: 'PASS',
      explanation: `Attachment assertion satisfied (${matches.length} match${
        matches.length === 1 ? '' : 'es'
      } of type "${assertion.type}").`,
    };
  }

  // Delegate free-form payload assertions to the LLM judge. Feed the matched
  // attachment data in as the evaluator `output` so the judge can reason over
  // the actual payload JSON.
  const payloadOutput = {
    attachments: matches.map(({ attachment, shape }) => ({
      id: attachment.id,
      type: attachment.type,
      shape: shape.shape,
      data: getCurrentAttachmentData(attachment),
    })),
  };
  const criteriaResult = await evaluators.criteria(assertion.criteria).evaluate({
    input,
    expected: { criteria: assertion.criteria },
    output: payloadOutput,
    metadata,
  });
  return {
    score: criteriaResult.score ?? null,
    label: criteriaResult.label ?? 'PASS',
    explanation: `Matched ${matches.length} attachment(s). ${criteriaResult.explanation ?? ''}`,
  };
};

const createAttachmentsEvaluator = ({
  evaluators,
}: {
  evaluators: DefaultEvaluators;
}): Evaluator<DatasetExample, ChatTaskOutput> => {
  return {
    name: 'Attachments',
    kind: 'LLM' as const,
    evaluate: async ({ input, output, expected, metadata }: EvaluateOpts) => {
      const assertions = expected.attachments ?? [];
      if (assertions.length === 0) {
        return {
          score: 1,
          label: 'PASS',
          explanation: 'No attachment assertions specified.',
        };
      }

      const attachments = output.attachments ?? [];
      const results: EvaluationResult[] = [];
      for (const assertion of assertions) {
        results.push(
          await evaluateAttachmentAssertion(assertion, attachments, evaluators, input, metadata)
        );
      }
      return combineEvaluationResults(results);
    },
  };
};
