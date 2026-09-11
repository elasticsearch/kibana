/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { DefaultEvaluators, EvalsExecutorClient, TaskOutput } from '@kbn/evals';
import {
  toDatasetExample,
  createEvaluatePersonaMatrixDataset,
  createPersonaMatrixTrajectoryEvaluator,
  createPersonaMatrixExpectedToolCalledEvaluator,
  createPersonaMatrixFinalAnswerPresentEvaluator,
  createPersonaMatrixMinExpectedStepsEvaluator,
  createPersonaMatrixSkillInvokedEvaluator,
  isRankablePathContract,
  type PersonaMatrixDatasetExample,
} from './evaluate_dataset';
import type { PersonaMatrixChatClient } from './chat_client';
import {
  PERSONA_MATRIX_EXAMPLES,
  type PersonaMatrixExample,
} from './datasets/persona_matrix_prompts';

const baseExample: PersonaMatrixExample = {
  id: 'example-a',
  category: 'alert-analysis',
  variant: 'A',
  description: 'test example',
  input: { question: 'what happened?' },
  output: { reference: 'the reference answer' },
  metadata: {
    expectedSkill: 'alert-analysis',
    expectedTools: ['security.alerts', 'security.get_related_alerts'],
    severity: 'high',
    tags: ['triage'],
  },
};

const buildLog = (): ToolingLog =>
  ({
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as ToolingLog);

describe('path contract classification', () => {
  it('keeps probes diagnostic and leaves candidate/rankable paths measurable', () => {
    expect(isRankablePathContract({ pathContract: 'probe' })).toBe(false);
    expect(isRankablePathContract({ pathContract: 'candidate' })).toBe(true);
    expect(isRankablePathContract({ pathContract: 'rankable' })).toBe(true);
    expect(isRankablePathContract(undefined)).toBe(true);
  });

  it('marks every measured 0/5 hunt example as a probe', () => {
    const probePrefixes = [
      'alert-analysis-',
      'entity-analytics-',
      'multi-step-',
      'threat-hunting-',
    ];
    const probes = PERSONA_MATRIX_EXAMPLES.filter((example) =>
      probePrefixes.some((prefix) => example.id.startsWith(prefix))
    );
    expect(probes).toHaveLength(12);
    expect(probes.every((example) => example.metadata.pathContract === 'probe')).toBe(true);
  });
});

describe('toDatasetExample', () => {
  it('resolves the golden path from metadata.expectedTools into output.tool_sequence', () => {
    // The trajectory evaluator's goldenPathExtractor only receives `expected`
    // (a sibling of `metadata`, not a parent — kbn-evals/src/evaluators/trajectory/index.ts,
    // kbn-evals/src/types.ts). Without this mapping step the annotation on
    // `metadata.expectedTools` is unreachable from inside that callback.
    const wrapped = toDatasetExample(baseExample);
    expect(wrapped.output.tool_sequence).toEqual([
      'security.alerts',
      'security.get_related_alerts',
    ]);
  });

  it('mirrors reference into output.expected so correctness/index.ts resolves ground truth', () => {
    // correctness/index.ts reads `expected?.expected`, not `expected?.reference`.
    const wrapped = toDatasetExample(baseExample);
    expect(wrapped.output.reference).toBe('the reference answer');
    expect(wrapped.output.expected).toBe('the reference answer');
  });

  it('omits tool_sequence when the example has no expectedTools annotation', () => {
    const unannotated: PersonaMatrixExample = {
      ...baseExample,
      metadata: { ...baseExample.metadata, expectedTools: undefined },
    };
    const wrapped = toDatasetExample(unannotated);
    expect(wrapped.output).not.toHaveProperty('tool_sequence');
  });

  it('populates expected for every example in the real dataset', () => {
    // Regression guard for the class of bug this suite shipped with: a
    // silent drop here means correctness/index.ts silently judges `undefined`
    // again for every example, and only a real run would surface it.
    const wrapped = PERSONA_MATRIX_EXAMPLES.map(toDatasetExample);
    expect(wrapped).toHaveLength(21);
    for (const example of wrapped) {
      expect(typeof example.output.expected).toBe('string');
      expect(example.output.expected.length).toBeGreaterThan(0);
      expect(example.output.expected).toBe(example.output.reference);
    }
  });
});

describe('createPersonaMatrixTrajectoryEvaluator', () => {
  const buildArgs = (
    example: PersonaMatrixExample,
    steps: Array<{ type?: string; tool_id?: string }>
  ) => {
    const wrapped: PersonaMatrixDatasetExample = toDatasetExample(example);
    return {
      input: wrapped.input,
      expected: wrapped.output,
      output: { steps } as unknown as TaskOutput,
      metadata: wrapped.metadata,
    } as unknown as Parameters<
      ReturnType<typeof createPersonaMatrixTrajectoryEvaluator>['evaluate']
    >[0];
  };

  it('returns N/A, not a score, when the example has no tool_sequence annotation', async () => {
    const evaluator = createPersonaMatrixTrajectoryEvaluator();
    const unannotated: PersonaMatrixExample = {
      ...baseExample,
      metadata: { ...baseExample.metadata, expectedTools: undefined },
    };
    const result = await evaluator.evaluate(
      buildArgs(unannotated, [{ type: 'tool_call', tool_id: 'security.alerts' }])
    );
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('scores non-null when the example is annotated and the agent calls the golden tools', async () => {
    // Regression guard for the inverted-scoring bug: before the fix, an
    // annotated example whose agent correctly called tools scored a hard
    // 0.0 because goldenPathExtractor read the (always-empty) tool_sequence
    // field directly instead of the mapped output.
    const evaluator = createPersonaMatrixTrajectoryEvaluator();
    const result = await evaluator.evaluate(
      buildArgs(baseExample, [
        { type: 'tool_call', tool_id: 'security.alerts' },
        { type: 'tool_call', tool_id: 'security.get_related_alerts' },
      ])
    );
    expect(result.score).not.toBeNull();
    expect(result.score).toBeGreaterThan(0);
  });

  it('excludes filestore.read from the actual tool sequence', async () => {
    const evaluator = createPersonaMatrixTrajectoryEvaluator();
    const result = await evaluator.evaluate(
      buildArgs(baseExample, [
        { type: 'tool_call', tool_id: 'filestore.read' },
        { type: 'tool_call', tool_id: 'security.alerts' },
        { type: 'tool_call', tool_id: 'security.get_related_alerts' },
      ])
    );
    const metadata = result.metadata as { actual: string[] } | undefined;
    expect(metadata?.actual).not.toContain('filestore.read');
  });

  it('every real dataset example resolves a non-empty expected tool list in evaluator metadata', async () => {
    // Countable per-example gate (not an aggregate score): for each of the
    // 21 annotated examples, the resolved `expected` tool list in evaluator
    // metadata must be non-empty and equal that example's expectedTools.
    // Falsifiable against the dataset and immune to how the agent orders
    // its calls.
    const evaluator = createPersonaMatrixTrajectoryEvaluator();
    for (const example of PERSONA_MATRIX_EXAMPLES) {
      const wrapped = toDatasetExample(example);
      const result = await evaluator.evaluate(
        buildArgs(
          example,
          (example.metadata.expectedTools ?? []).map((toolId) => ({
            type: 'tool_call',
            tool_id: toolId,
          }))
        )
      );
      if (example.metadata.pathContract === 'probe') {
        expect(result.score).toBeNull();
        expect(result.metadata).toMatchObject({ pathContract: 'probe' });
      } else {
        expect(result.score).not.toBeNull();
        const metadata = result.metadata as { expected: string[] } | undefined;
        expect(metadata?.expected).toEqual(wrapped.output.tool_sequence);
      }
    }
  });
});

describe('createPersonaMatrixExpectedToolCalledEvaluator', () => {
  it('scores 1 when every declared expected tool was called', async () => {
    const evaluator = createPersonaMatrixExpectedToolCalledEvaluator();
    const result = await evaluator.evaluate({
      input: { question: 'q' },
      expected: toDatasetExample(baseExample).output,
      output: {
        steps: [
          { type: 'tool_call', tool_id: 'security.alerts' },
          { type: 'tool_call', tool_id: 'security.get_related_alerts' },
        ],
      } as unknown as TaskOutput,
      metadata: baseExample.metadata,
    } as unknown as Parameters<ReturnType<typeof createPersonaMatrixExpectedToolCalledEvaluator>['evaluate']>[0]);
    expect(result.score).toBe(1);
  });

  it('returns N/A when the example has no expectedTools annotation', async () => {
    const evaluator = createPersonaMatrixExpectedToolCalledEvaluator();
    const unannotated: PersonaMatrixExample = {
      ...baseExample,
      metadata: { ...baseExample.metadata, expectedTools: undefined },
    };
    const result = await evaluator.evaluate({
      input: { question: 'q' },
      expected: toDatasetExample(unannotated).output,
      output: { steps: [] } as unknown as TaskOutput,
      metadata: unannotated.metadata,
    } as unknown as Parameters<ReturnType<typeof createPersonaMatrixExpectedToolCalledEvaluator>['evaluate']>[0]);
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  // Regression: only `expectedTools[0]` used to be checked, so a run that
  // skipped every later declared tool still scored a full 1.
  it('scores 0 when a non-primary expected tool was skipped', async () => {
    const evaluator = createPersonaMatrixExpectedToolCalledEvaluator();
    const multiTool: PersonaMatrixExample = {
      ...baseExample,
      metadata: {
        ...baseExample.metadata,
        expectedTools: ['platform.core.generate_esql', 'platform.core.execute_esql'],
      },
    };
    const result = await evaluator.evaluate({
      input: { question: 'q' },
      expected: toDatasetExample(multiTool).output,
      output: {
        steps: [{ type: 'tool_call', tool_id: 'platform.core.generate_esql' }],
      } as unknown as TaskOutput,
      metadata: multiTool.metadata,
    } as unknown as Parameters<ReturnType<typeof createPersonaMatrixExpectedToolCalledEvaluator>['evaluate']>[0]);
    expect(result.score).toBe(0);
    expect((result.metadata as { missingToolIds: string[] }).missingToolIds).toEqual([
      'platform.core.execute_esql',
    ]);
  });

  it('scores 1 only when every declared expected tool was called', async () => {
    const evaluator = createPersonaMatrixExpectedToolCalledEvaluator();
    const multiTool: PersonaMatrixExample = {
      ...baseExample,
      metadata: {
        ...baseExample.metadata,
        expectedTools: ['platform.core.generate_esql', 'platform.core.execute_esql'],
      },
    };
    const result = await evaluator.evaluate({
      input: { question: 'q' },
      expected: toDatasetExample(multiTool).output,
      output: {
        steps: [
          { type: 'tool_call', tool_id: 'platform.core.generate_esql' },
          { type: 'tool_call', tool_id: 'platform.core.list_indices' },
          { type: 'tool_call', tool_id: 'platform.core.execute_esql' },
        ],
      } as unknown as TaskOutput,
      metadata: multiTool.metadata,
    } as unknown as Parameters<ReturnType<typeof createPersonaMatrixExpectedToolCalledEvaluator>['evaluate']>[0]);
    expect(result.score).toBe(1);
    expect((result.metadata as { missingToolIds: string[] }).missingToolIds).toEqual([]);
  });
});

describe('createPersonaMatrixFinalAnswerPresentEvaluator', () => {
  const evaluate = (output: unknown) =>
    createPersonaMatrixFinalAnswerPresentEvaluator().evaluate({
      input: { question: 'q' },
      expected: undefined,
      output,
      metadata: {},
    } as unknown as Parameters<ReturnType<typeof createPersonaMatrixFinalAnswerPresentEvaluator>['evaluate']>[0]);

  it('scores 1 when the run produced a non-empty final message', async () => {
    const result = await evaluate({ messages: [{ message: 'Rule created: ...' }] });
    expect(result.score).toBe(1);
  });

  // Regression: 62% of detection-rule-edit runs in the 2026-08-21 sweep ended
  // on a tool call with no user-facing closing text.
  it('scores 0 when every message is empty', async () => {
    const result = await evaluate({ messages: [{ message: '' }] });
    expect(result.score).toBe(0);
  });

  it('scores 0 when messages are missing from the output', async () => {
    const result = await evaluate({ steps: [] });
    expect(result.score).toBe(0);
  });

  const ruleToolStep = (data: unknown, toolId = 'security.create_detection_rule') => ({
    type: 'tool_call',
    tool_id: toolId,
    results: [{ type: 'other', data }],
  });

  // The detection-rule-edit references ask the agent to render the created rule
  // attachment inline "rather than describing the rule in prose only", so a run
  // that ends on a successful rule tool call HAS answered the user. Scoring it 0
  // measured the harness, not the model: 86% of FinalAnswerPresent=0 runs in the
  // family had successfully created a rule.
  it('scores 1 when the run ended on a rendered rule artifact instead of prose', async () => {
    const result = await evaluate({
      messages: [{ message: '' }],
      steps: [ruleToolStep({ success: true, rule: { id: 'abc', severity: 'high' } })],
    });
    expect(result.score).toBe(1);
    expect(result.explanation).toContain('artifact');
  });

  it('scores 1 for an update_detection_rule artifact as well', async () => {
    const result = await evaluate({
      messages: [],
      steps: [
        ruleToolStep({ success: true, rule: { id: 'abc' } }, 'security.update_detection_rule'),
      ],
    });
    expect(result.score).toBe(1);
  });

  // The gate must keep biting real silent failures: 27 of 196 FinalAnswerPresent=0
  // runs in the family produced no rule at all.
  it('still scores 0 when the rule tool call failed', async () => {
    const result = await evaluate({
      messages: [{ message: '' }],
      steps: [ruleToolStep({ success: false, rule: { id: 'abc' } })],
    });
    expect(result.score).toBe(0);
  });

  it('still scores 0 when a rule tool reported success without a rule payload', async () => {
    const result = await evaluate({
      messages: [{ message: '' }],
      steps: [ruleToolStep({ success: true })],
    });
    expect(result.score).toBe(0);
  });

  it('does not count a non-artifact tool call as an answer', async () => {
    const result = await evaluate({
      messages: [{ message: '' }],
      steps: [ruleToolStep({ success: true, rule: { id: 'abc' } }, 'security.run_rule_preview')],
    });
    expect(result.score).toBe(0);
  });

  it('returns N/A when there is no task output at all', async () => {
    const result = await evaluate(undefined);
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });
});

describe('createPersonaMatrixMinExpectedStepsEvaluator', () => {
  const toolStep = (id: string) => ({ type: 'tool_call', tool_id: id });
  const evaluate = (output: unknown, expectedTools?: string[]) =>
    createPersonaMatrixMinExpectedStepsEvaluator().evaluate({
      input: { question: 'q' },
      expected: expectedTools ? { tool_sequence: expectedTools } : {},
      output,
      metadata: expectedTools ? { expectedTools } : {},
    } as unknown as Parameters<ReturnType<typeof createPersonaMatrixMinExpectedStepsEvaluator>['evaluate']>[0]);

  it('scores 1 when tool calls meet the expected minimum', async () => {
    const result = await evaluate(
      { steps: [toolStep('platform.core.generate_esql'), toolStep('platform.core.execute_esql')] },
      ['platform.core.generate_esql', 'platform.core.execute_esql']
    );
    expect(result.score).toBe(1);
  });

  // Regression: ~90 original-sweep runs produced an answer in <3 steps having
  // called nothing — premature termination that FinalAnswerPresent alone misses.
  it('scores 0 when the agent gave up without trying (fewer calls than expected)', async () => {
    const result = await evaluate({ steps: [] }, ['on_call_lookup']);
    expect(result.score).toBe(0);
  });

  it('scores 0 when only some of the expected tools were called', async () => {
    const result = await evaluate({ steps: [toolStep('platform.core.generate_esql')] }, [
      'platform.core.generate_esql',
      'platform.core.execute_esql',
    ]);
    expect(result.score).toBe(0);
  });

  it('returns N/A when the example declares no expectedTools', async () => {
    const result = await evaluate({ steps: [toolStep('x')] });
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('returns N/A when there is no task output', async () => {
    const result = await evaluate(undefined, ['on_call_lookup']);
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });
});

describe('createPersonaMatrixSkillInvokedEvaluator', () => {
  const buildEvaluatorArgs = (metadata: PersonaMatrixExample['metadata'], traceId?: string) =>
    ({
      input: { question: 'q' },
      expected: {},
      output: { traceId } as unknown as TaskOutput,
      metadata,
    } as unknown as Parameters<
      ReturnType<typeof createPersonaMatrixSkillInvokedEvaluator>['evaluate']
    >[0]);

  it('returns N/A when the example has no expectedSkill/allowSkills annotation', async () => {
    // 4 of the 21 real examples (workflow-authoring-b/c, workflow-execution-a/b)
    // legitimately have no expectedSkill — platform.core.generate_workflow does
    // not require a skill load. Those must report N/A, not a failing score.
    const evaluator = createPersonaMatrixSkillInvokedEvaluator({
      traceEsClient: { esql: { query: jest.fn() } } as unknown as EsClient,
      log: buildLog(),
    });
    const result = await evaluator.evaluate(
      buildEvaluatorArgs({ ...baseExample.metadata, expectedSkill: undefined }, 'abcd')
    );
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('returns unavailable, not a failing score, when there is no usable traceId', async () => {
    const evaluator = createPersonaMatrixSkillInvokedEvaluator({
      traceEsClient: { esql: { query: jest.fn() } } as unknown as EsClient,
      log: buildLog(),
    });
    const result = await evaluator.evaluate(buildEvaluatorArgs(baseExample.metadata, undefined));
    expect(result.score).toBeNull();
    expect(result.label).toBe('unavailable');
  });

  it('matches load_skill by skill ID while retaining the legacy SKILL.md path', async () => {
    // `load_skill` accepts an ID or path. Current traces store {"skill":"<id>"};
    // older traces may contain a SKILL.md path.
    const query = jest.fn().mockResolvedValue({
      columns: [{ name: 'total_tool_spans' }, { name: 'skill_invoked' }],
      values: [[2, 1]],
    });
    const evaluator = createPersonaMatrixSkillInvokedEvaluator({
      traceEsClient: { esql: { query } } as unknown as EsClient,
      log: buildLog(),
    });

    await evaluator.evaluate(
      buildEvaluatorArgs(baseExample.metadata, '0af7651916cd43dd8448eb211c80319c')
    );

    const sent = query.mock.calls[0][0].query as string;
    expect(sent).toContain('load_skill');
    expect(sent).toContain('filestore.read');
    expect(sent).toContain('*\\"skill\\":\\"alert-analysis\\"*');
    expect(sent).toContain('*/alert-analysis/SKILL.md*');
  });
});

describe('task output shape', () => {
  it('the real converse answer is reachable at messages[last].message', () => {
    // Regression guard for blocker #2: the shared correctness/groundedness
    // evaluators read output.messages[output.messages.length - 1].message.
    // This suite must never store the answer only under `response`.
    const taskOutput: TaskOutput = {
      messages: [{ message: 'the real answer' }],
      steps: [],
      errors: [],
      traceId: 'trace-1',
    };
    const messages = (taskOutput as { messages?: Array<{ message?: string }> }).messages ?? [];
    const latestMessage = messages[messages.length - 1]?.message;
    expect(latestMessage).toBe('the real answer');
  });

  it('forwards messageSource so a fallback answer is distinguishable from a real final turn', async () => {
    // chat_client falls back to the last non-empty reasoning/output step when a
    // model ends its turn on a tool call, and tags which one it used via
    // `messageSource`. If the task drops that tag, every stored cell looks like
    // a genuine closing answer and mid-run narration ("I will now preview the
    // detection rule...") is scored as if it were the model's final response.
    // Measured 2026-09-07: 0 of 2422 Sep-4+ detection-rule-edit score docs
    // carried messageSource, because taskOutput never forwarded it.
    const log = buildLog();
    let capturedTask: ((example: unknown) => Promise<unknown>) | undefined;

    const evaluateDataset = createEvaluatePersonaMatrixDataset({
      chatClient: {
        query: jest.fn().mockResolvedValue({
          messages: [{ message: 'I will now preview the detection rule.' }],
          messageSource: 'last_assistant_step',
          steps: [],
          errors: [],
          traceId: 'trace-1',
        }),
      } as unknown as PersonaMatrixChatClient,
      evaluators: {
        traceBasedEvaluators: {
          inputTokens: { name: 'inputTokens' },
          outputTokens: { name: 'outputTokens' },
          toolCalls: { name: 'toolCalls' },
          latency: { name: 'latency' },
        },
        criteria: jest.fn(),
        correctnessAnalysis: () => ({ evaluate: jest.fn().mockResolvedValue({ metadata: {} }) }),
        groundednessAnalysis: () => ({ evaluate: jest.fn().mockResolvedValue({ metadata: {} }) }),
      } as unknown as DefaultEvaluators,
      executorClient: {
        runExperiment: jest.fn(async (params: { task: unknown }) => {
          capturedTask = params.task as (example: unknown) => Promise<unknown>;
        }),
      } as unknown as EvalsExecutorClient,
      traceEsClient: {} as EsClient,
      log,
    });

    await evaluateDataset({
      dataset: { name: 'ds', description: 'desc', examples: [baseExample] },
    });

    const output = (await capturedTask!(toDatasetExample(baseExample))) as Record<string, unknown>;

    expect(output.messageSource).toBe('last_assistant_step');
  });
});

describe('task judge failure isolation', () => {
  it('keeps the trajectory and degrades qualitative scores when a judge call rejects', async () => {
    // Regression guard for the determinism-sweep suite deaths: a single judge
    // call failing (e.g. inference 500 toolValidationError) must not throw out
    // of the task and take down all remaining examples.
    const log = buildLog();
    let capturedTask: ((example: unknown) => Promise<unknown>) | undefined;

    const evaluateDataset = createEvaluatePersonaMatrixDataset({
      chatClient: {
        query: jest.fn().mockResolvedValue({
          messages: [{ message: 'the real answer' }],
          steps: [],
          errors: [],
          traceId: 'trace-1',
        }),
      } as unknown as PersonaMatrixChatClient,
      evaluators: {
        traceBasedEvaluators: {
          inputTokens: { name: 'inputTokens' },
          outputTokens: { name: 'outputTokens' },
          toolCalls: { name: 'toolCalls' },
          latency: { name: 'latency' },
        },
        criteria: jest.fn(),
        correctnessAnalysis: () => ({
          evaluate: jest.fn().mockRejectedValue(new Error('toolValidationError')),
        }),
        groundednessAnalysis: () => ({
          evaluate: jest.fn().mockResolvedValue({ metadata: { verdict: 'grounded' } }),
        }),
      } as unknown as DefaultEvaluators,
      executorClient: {
        runExperiment: jest.fn(async (params: { task: unknown }) => {
          capturedTask = params.task as (example: unknown) => Promise<unknown>;
        }),
      } as unknown as EvalsExecutorClient,
      traceEsClient: {} as EsClient,
      log,
    });

    await evaluateDataset({
      dataset: { name: 'ds', description: 'desc', examples: [baseExample] },
    });

    expect(capturedTask).toBeDefined();
    const output = (await capturedTask!(toDatasetExample(baseExample))) as Record<string, unknown>;

    // The failed judge degrades to an absent analysis (quantitative evaluators
    // then report "unavailable"); the successful judge and the agent's real
    // trajectory are preserved.
    expect(output.correctnessAnalysis).toBeUndefined();
    expect(output.groundednessAnalysis).toEqual({ verdict: 'grounded' });
    expect((output.messages as Array<{ message: string }>)[0].message).toBe('the real answer');
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('CorrectnessAnalysis failed'));
    expect((log.error as jest.Mock).mock.calls.flat().join(' ')).toContain('toolValidationError');
  });
});
