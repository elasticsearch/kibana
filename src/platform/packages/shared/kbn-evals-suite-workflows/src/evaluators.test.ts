/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Evaluator } from '@kbn/evals';
import type { WorkflowEditExample, WorkflowTaskOutput } from './types';
import {
  createEditSuccessEvaluator,
  createEfficiencyEvaluator,
  createToolTrajectoryEvaluator,
  createCriteriaEvaluator,
  createEditPreservationEvaluator,
  createStructuralCorrectnessEvaluator,
  createBulkOperationsShapeEvaluator,
  createLiquidCorrectnessEvaluator,
  createLiquidPresenceEvaluator,
  createRejectionEvaluator,
  createSelfCorrectionEvaluator,
  skipCompositeMode,
  skipInfraErrors,
  skipNegativeCases,
} from './evaluators';

const toolCall = (
  toolId: string,
  resultData: Record<string, unknown>
): WorkflowTaskOutput['steps'] extends (infer T)[] | undefined ? T : never => ({
  type: 'tool_call' as const,
  tool_id: toolId,
  results: [{ type: 'other', data: resultData }],
});

const mockOutput = (steps: ReturnType<typeof toolCall>[]): WorkflowTaskOutput => ({
  messages: [],
  steps,
  errors: [],
});

const createMockWorkflowEvaluator = (): {
  evaluate: jest.Mock;
  evaluator: Evaluator<WorkflowEditExample, WorkflowTaskOutput>;
} => {
  const evaluate = jest.fn().mockResolvedValue({ score: 0.42 });
  return {
    evaluate,
    evaluator: {
      name: 'Inner',
      kind: 'CODE' as const,
      evaluate,
    },
  };
};

describe('EditToolSuccess evaluator', () => {
  const evaluator = createEditSuccessEvaluator();

  it('scores 1 when all edit results succeed', async () => {
    const output = mockOutput([
      toolCall('generate_workflow', { success: true }),
      toolCall('generate_workflow', { success: true }),
    ]);
    const result = await evaluator.evaluate({ output });
    expect(result.score).toBe(1);
  });

  it('scores 1 when final edit result succeeds despite intermediate failures', async () => {
    const output = mockOutput([
      toolCall('generate_workflow', { success: false, error: 'splice error' }),
      toolCall('generate_workflow', { success: true }),
    ]);
    const result = await evaluator.evaluate({ output });
    expect(result.score).toBe(1);
    expect(result.metadata.hadIntermediateFailures).toBe(true);
  });

  it('scores 0 when final edit result fails', async () => {
    const output = mockOutput([
      toolCall('generate_workflow', { success: true }),
      toolCall('generate_workflow', { success: false, error: 'some error' }),
    ]);
    const result = await evaluator.evaluate({ output });
    expect(result.score).toBe(0);
  });

  it('scores 0 when no workflow edit tool calls are found', async () => {
    const output = mockOutput([toolCall('get_step_definitions', {})]);
    const result = await evaluator.evaluate({ output });
    expect(result.score).toBe(0);
  });
});

describe('BulkOperationsShape evaluator', () => {
  const evaluator = createBulkOperationsShapeEvaluator();

  const buildOutput = (yaml: string): WorkflowTaskOutput => ({
    messages: [],
    steps: [],
    errors: [],
    resultYaml: yaml,
  });

  it('returns N/A when case did not opt in', async () => {
    const result = await evaluator.evaluate({
      output: buildOutput('name: x\nsteps: []'),
      expected: {},
    });
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('scores 1 when elasticsearch.bulk operations is a Liquid reference', async () => {
    const yaml = `
name: bulk
steps:
  - name: load
    type: elasticsearch.bulk
    with:
      operations: "{{ steps.fetch.output.body }}"
`;
    const result = await evaluator.evaluate({
      output: buildOutput(yaml),
      expected: { expectsBulkOperationShape: true },
    });
    expect(result.score).toBe(1);
  });

  it('scores 1 when elasticsearch.bulk operations is an array', async () => {
    const yaml = `
name: bulk
steps:
  - name: load
    type: elasticsearch.bulk
    with:
      operations:
        - id: a
        - id: b
`;
    const result = await evaluator.evaluate({
      output: buildOutput(yaml),
      expected: { expectsBulkOperationShape: true },
    });
    expect(result.score).toBe(1);
  });

  it('fails when elasticsearch.bulk operations is a plain (non-Liquid) string', async () => {
    const yaml = `
name: bulk
steps:
  - name: load
    type: elasticsearch.bulk
    with:
      operations: "this is not valid"
`;
    const result = await evaluator.evaluate({
      output: buildOutput(yaml),
      expected: { expectsBulkOperationShape: true },
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('FAIL');
  });

  it('fails when no bulk step is present at all', async () => {
    const yaml = `
name: nobulk
steps:
  - name: log
    type: console
`;
    const result = await evaluator.evaluate({
      output: buildOutput(yaml),
      expected: { expectsBulkOperationShape: true },
    });
    expect(result.score).toBe(0);
  });

  it('fails when elasticsearch.request _bulk body is an array', async () => {
    const yaml = `
name: bulk_via_request
steps:
  - name: load
    type: elasticsearch.request
    with:
      method: POST
      path: /my-index/_bulk
      body:
        - id: a
        - id: b
`;
    const result = await evaluator.evaluate({
      output: buildOutput(yaml),
      expected: { expectsBulkOperationShape: true },
    });
    expect(result.score).toBe(0);
  });

  it('passes when elasticsearch.request _bulk body is NDJSON string', async () => {
    const yaml = `
name: bulk_via_request
steps:
  - name: load
    type: elasticsearch.request
    with:
      method: POST
      path: /my-index/_bulk
      body: |
        {"index":{}}
        {"id":"a"}
        {"index":{}}
        {"id":"b"}
`;
    const result = await evaluator.evaluate({
      output: buildOutput(yaml),
      expected: { expectsBulkOperationShape: true },
    });
    expect(result.score).toBe(1);
  });
});

describe('Efficiency evaluator', () => {
  const evaluator = createEfficiencyEvaluator();

  it('scores 1 when all tool calls succeed', async () => {
    const output = mockOutput([toolCall('generate_workflow', { success: true })]);
    const result = await evaluator.evaluate({ output, expected: {} });
    expect(result.score).toBe(1);
    expect(result.metadata.totalToolCalls).toBe(1);
  });

  it('penalizes when half of workflow calls fail', async () => {
    const output = mockOutput([
      toolCall('generate_workflow', { success: false, error: 'error' }),
      toolCall('generate_workflow', { success: true }),
    ]);
    const result = await evaluator.evaluate({ output, expected: {} });
    // 0.3 * failedCallScore (0.5) + 0.5 * budgetScore (1) + 0.2 * redundantLookupScore (1) = 0.85
    expect(result.score).toBe(0.85);
    expect(result.metadata.failedCalls).toBe(1);
    expect(result.metadata.failedCallScore).toBe(0.5);
    expect(result.metadata.budgetScore).toBe(1);
  });

  it('linear-penalizes a chatty agent that overshoots the budget by 4×', async () => {
    // Default budget is 4; simulate 16 generate_workflow calls (the 47-call
    // real-world rampage was even worse, but 16 keeps the test concise).
    const steps = Array.from({ length: 16 }, () =>
      toolCall('generate_workflow', { success: true })
    );
    const output = mockOutput(steps);
    const result = await evaluator.evaluate({ output, expected: {} });
    // budget / actual = 4 / 16 = 0.25. failed = 1, redundant lookups = 1.
    // 0.3 * 1 + 0.5 * 0.25 + 0.2 * 1 = 0.3 + 0.125 + 0.2 = 0.625
    expect(result.metadata.budget).toBe(4);
    expect(result.metadata.budgetScore).toBe(0.25);
    expect(result.score).toBeLessThan(0.65);
  });

  it('excludes lookup calls from waste calculation', async () => {
    const output = mockOutput([
      toolCall('get_step_definitions', {}),
      toolCall('get_connectors', {}),
      toolCall('generate_workflow', { success: true }),
    ]);
    const result = await evaluator.evaluate({ output, expected: {} });
    expect(result.score).toBe(1);
    expect(result.metadata.lookupCalls).toBe(2);
    expect(result.metadata.totalToolCalls).toBe(3);
  });

  it('penalizes heavily when all workflow calls fail', async () => {
    const output = mockOutput([toolCall('generate_workflow', { success: false, error: 'error' })]);
    const result = await evaluator.evaluate({ output, expected: {} });
    // 0.3 * 0 (failed) + 0.5 * 1 (under budget) + 0.2 * 1 (no redundant lookups) = 0.7
    expect(result.score).toBe(0.7);
    expect(result.metadata.failedCalls).toBe(1);
    expect(result.metadata.failedCallScore).toBe(0);
    expect(result.metadata.budgetScore).toBe(1);
  });
});

describe('ToolTrajectory evaluator', () => {
  const evaluator = createToolTrajectoryEvaluator();

  it('returns N/A when expectedToolSequence is undefined', async () => {
    const output = mockOutput([toolCall('generate_workflow', { success: true })]);
    const result = await evaluator.evaluate({
      input: {},
      output,
      expected: {},
      metadata: null,
    });
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('delegates to inner evaluator when expectedToolSequence is provided', async () => {
    const output = mockOutput([
      toolCall('get_step_definitions', {}),
      toolCall('generate_workflow', { success: true }),
    ]);
    const result = await evaluator.evaluate({
      input: {},
      output,
      expected: {
        expectedToolSequence: ['get_step_definitions', 'generate_workflow'],
      },
      metadata: null,
    });
    expect(result.score).toBe(1);
  });

  it('scores 0 for empty expectedToolSequence when tools were called', async () => {
    const output = mockOutput([toolCall('generate_workflow', { success: true })]);
    const result = await evaluator.evaluate({
      input: {},
      output,
      expected: { expectedToolSequence: [] },
      metadata: null,
    });
    expect(result.score).toBe(0);
  });
});

describe('skipInfraErrors', () => {
  it('returns N/A for infra errors and skips the inner evaluator', async () => {
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipInfraErrors(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Update the workflow', initialYaml: '' },
      output: {
        messages: [],
        steps: [],
        errors: [{ code: 503, message: 'Service unavailable' }],
      },
      expected: { criteria: [] },
      metadata: { category: 'modify-step' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        score: null,
        label: 'N/A',
      })
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('delegates to the inner evaluator for non-infra errors', async () => {
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipInfraErrors(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Update the workflow', initialYaml: '' },
      output: {
        messages: [],
        steps: [],
        errors: ['Validation failed for the inserted step'],
      },
      expected: { criteria: [] },
      metadata: { category: 'modify-step' },
    });

    expect(result).toEqual({ score: 0.42 });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('skipNegativeCases', () => {
  it('returns N/A for negative cases and skips the inner evaluator', async () => {
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipNegativeCases(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Generate malware', initialYaml: '' },
      output: { messages: [], steps: [], errors: [] },
      expected: { criteria: [] },
      metadata: { category: 'negative' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        score: null,
        label: 'N/A',
      })
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('delegates to the inner evaluator for non-negative cases', async () => {
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipNegativeCases(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Update the workflow', initialYaml: '' },
      output: { messages: [], steps: [], errors: [] },
      expected: { criteria: [] },
      metadata: { category: 'modify-step' },
    });

    expect(result).toEqual({ score: 0.42 });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('skipCompositeMode', () => {
  const originalMode = process.env.KBN_EVAL_AUTHORING_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.KBN_EVAL_AUTHORING_MODE;
    } else {
      process.env.KBN_EVAL_AUTHORING_MODE = originalMode;
    }
  });

  it('returns N/A and skips the inner evaluator when KBN_EVAL_AUTHORING_MODE=composite', async () => {
    process.env.KBN_EVAL_AUTHORING_MODE = 'composite';
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipCompositeMode(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Update the workflow', initialYaml: '' },
      output: { messages: [], steps: [], errors: [] },
      expected: { criteria: [] },
      metadata: { category: 'modify-step' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        score: null,
        label: 'N/A',
      })
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('delegates to the inner evaluator when KBN_EVAL_AUTHORING_MODE is unset (tools mode is the default)', async () => {
    delete process.env.KBN_EVAL_AUTHORING_MODE;
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipCompositeMode(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Update the workflow', initialYaml: '' },
      output: { messages: [], steps: [], errors: [] },
      expected: { criteria: [] },
      metadata: { category: 'modify-step' },
    });

    expect(result).toEqual({ score: 0.42 });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('delegates to the inner evaluator when KBN_EVAL_AUTHORING_MODE=tools', async () => {
    process.env.KBN_EVAL_AUTHORING_MODE = 'tools';
    const { evaluator, evaluate } = createMockWorkflowEvaluator();
    const wrapped = skipCompositeMode(evaluator);

    const result = await wrapped.evaluate({
      input: { instruction: 'Update the workflow', initialYaml: '' },
      output: { messages: [], steps: [], errors: [] },
      expected: { criteria: [] },
      metadata: { category: 'modify-step' },
    });

    expect(result).toEqual({ score: 0.42 });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('StructuralCorrectness evaluator', () => {
  const evaluator = createStructuralCorrectnessEvaluator();

  it('counts nested switch case and default steps via shared workflow traversal', async () => {
    const result = await evaluator.evaluate({
      output: {
        messages: [],
        steps: [],
        errors: [],
        resultYaml: `name: route_by_status
triggers:
  - type: manual
steps:
  - name: route_by_status
    type: switch
    expression: "{{ steps.check.output.status }}"
    cases:
      - match: success
        steps:
          - name: on_success
            type: wait
            with:
              duration: "30s"
    default:
      - name: on_unknown
        type: wait
        with:
          duration: "30s"`,
      },
      expected: {
        expectedStepCount: 3,
        expectedStepNames: ['route_by_status', 'on_success', 'on_unknown'],
        expectedStepTypes: ['switch', 'wait'],
      },
    });

    expect(result.score).toBe(1);
  });
});

describe('EditPreservation evaluator', () => {
  const evaluator = createEditPreservationEvaluator();

  it('treats steps with reordered keys as unchanged', async () => {
    const result = await evaluator.evaluate({
      input: {
        instruction: 'Keep the existing wait step',
        initialYaml: `name: wait_workflow
triggers:
  - type: manual
steps:
  - name: wait_before_retry
    type: wait
    with:
      duration: "30s"`,
      },
      expected: {
        criteria: [],
        preservedStepNames: ['wait_before_retry'],
      },
      output: {
        messages: [],
        steps: [],
        errors: [],
        resultYaml: `name: wait_workflow
triggers:
  - type: manual
steps:
  - type: wait
    with:
      duration: "30s"
    name: wait_before_retry`,
      },
    });

    expect(result.score).toBe(1);
    expect(result.metadata.results).toEqual([
      {
        name: 'wait_before_retry',
        preserved: true,
        detail: 'unchanged',
      },
    ]);
  });
});

describe('Criteria evaluator', () => {
  const mockCriteriaEvaluate = jest.fn().mockResolvedValue({ score: 0.9 });
  const mockEvaluators = {
    criteria: jest.fn().mockReturnValue({ evaluate: mockCriteriaEvaluate }),
  } as any;
  const evaluator = createCriteriaEvaluator({ evaluators: mockEvaluators });

  beforeEach(() => jest.clearAllMocks());

  it('fails with score 0 when resultYaml is missing on a positive case', async () => {
    const result = await evaluator.evaluate({
      input: { instruction: 'Create a workflow' },
      output: { messages: [], steps: [], errors: [] } as WorkflowTaskOutput,
      expected: { criteria: ['Has a trigger'] },
      metadata: { category: 'creation' },
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('FAIL');
    expect(mockCriteriaEvaluate).not.toHaveBeenCalled();
  });

  it('sends response text to judge for negative cases', async () => {
    await evaluator.evaluate({
      input: { instruction: 'Create a workflow' },
      output: {
        messages: [{ message: 'I need more details.' }],
        steps: [],
        errors: [],
      } as WorkflowTaskOutput,
      expected: { criteria: ['Model asks for clarification'] },
      metadata: { category: 'negative' },
    });
    expect(mockCriteriaEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { response: 'I need more details.' },
      })
    );
  });

  it('sends resultYaml + response transcript to judge for positive cases', async () => {
    await evaluator.evaluate({
      input: { instruction: 'Fix this YAML' },
      output: {
        messages: [
          { message: 'Fix this YAML' },
          { message: 'I see an indent mismatch on the steps key; fixing.' },
        ],
        steps: [],
        errors: [],
        resultYaml: 'name: test',
      } as WorkflowTaskOutput,
      expected: { criteria: ['Has a name'] },
      metadata: { category: 'creation' },
    });
    expect(mockCriteriaEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        output: {
          resultYaml: 'name: test',
          response: 'Fix this YAML\nI see an indent mismatch on the steps key; fixing.',
        },
      })
    );
  });

  it('forwards empty response when no messages are present', async () => {
    await evaluator.evaluate({
      input: { instruction: 'Create a workflow' },
      output: {
        messages: [],
        steps: [],
        errors: [],
        resultYaml: 'name: test',
      } as WorkflowTaskOutput,
      expected: { criteria: ['Has a name'] },
      metadata: { category: 'creation' },
    });
    expect(mockCriteriaEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { resultYaml: 'name: test', response: '' },
      })
    );
  });
});

describe('LiquidCorrectness evaluator', () => {
  const evaluator = createLiquidCorrectnessEvaluator();

  const evaluateYaml = (yaml: string) =>
    evaluator.evaluate({ output: { messages: [], errors: [], resultYaml: yaml } });

  it('returns N/A when no result YAML is produced', async () => {
    const result = await evaluator.evaluate({
      output: { messages: [], errors: [] },
    });
    expect(result.label).toBe('N/A');
    expect(result.score).toBeNull();
  });

  it('returns N/A when YAML has no Liquid expressions', async () => {
    const yaml = `name: Simple
triggers:
  - type: manual
steps:
  - name: log
    type: console
    with:
      message: "Plain text"`;
    const result = await evaluateYaml(yaml);
    expect(result.label).toBe('N/A');
  });

  it('passes when a step reference targets an existing step', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
steps:
  - name: fetch
    type: http
    with:
      url: "https://api.example.com"
  - name: log
    type: console
    with:
      message: "Fetched {{ steps.fetch.output.status }} items"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
    expect(result.metadata?.total).toBe(1);
    expect(result.metadata?.correct).toBe(1);
  });

  it('fails when a step reference targets a nonexistent step', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
steps:
  - name: log
    type: console
    with:
      message: "{{ steps.does_not_exist.output.foo }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(0);
    expect(result.metadata?.failures[0].reason).toMatch(/does_not_exist/);
  });

  it('passes foreach.item references inside a foreach', async () => {
    const yaml = `name: Test
triggers:
  - type: alert
steps:
  - name: loop
    type: foreach
    foreach: "{{ event.alerts }}"
    steps:
      - name: log_each
        type: console
        with:
          message: "{{ foreach.item.id }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
    expect(result.metadata?.total).toBe(2);
  });

  it('fails foreach.item references outside any foreach', async () => {
    const yaml = `name: Test
triggers:
  - type: alert
steps:
  - name: log
    type: console
    with:
      message: "{{ foreach.item.id }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(0);
    expect(result.metadata?.failures[0].reason).toMatch(/outside any foreach/);
  });

  it('passes event.* references under an alert trigger', async () => {
    const yaml = `name: Test
triggers:
  - type: alert
steps:
  - name: log
    type: console
    with:
      message: "{{ event.alerts }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
  });

  it('fails event.* references under a manual trigger', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
steps:
  - name: log
    type: console
    with:
      message: "{{ event.alerts }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(0);
    expect(result.metadata?.failures[0].reason).toMatch(/alert.*detection-rule.*webhook/);
  });

  it('passes consts references when the key is declared', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
consts:
  api_key: "redacted"
steps:
  - name: req
    type: http
    with:
      headers:
        Authorization: "{{ consts.api_key }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
  });

  it('fails consts references when the key is missing', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
consts:
  api_key: "redacted"
steps:
  - name: req
    type: http
    with:
      headers:
        Authorization: "{{ consts.missing_secret }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(0);
    expect(result.metadata?.failures[0].reason).toMatch(/missing_secret/);
  });

  it('strips filters and validates the underlying reference', async () => {
    const yaml = `name: Test
triggers:
  - type: alert
steps:
  - name: log
    type: console
    with:
      message: "{{ event.alerts | json }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
  });

  it('handles control-flow form ${{ ... }} the same as {{ ... }}', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
steps:
  - name: a
    type: console
    with:
      message: "first"
  - name: b
    type: if
    condition: "\${{ steps.a.output != empty }}"
    steps:
      - name: log
        type: console
        with:
          message: "ok"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
  });

  it('tracks foreach context across nested foreach loops', async () => {
    const yaml = `name: Test
triggers:
  - type: alert
steps:
  - name: outer
    type: foreach
    foreach: "{{ event.alerts }}"
    steps:
      - name: inner
        type: foreach
        foreach: "{{ foreach.item.alert_ids }}"
        steps:
          - name: log
            type: console
            with:
              message: "{{ foreach.item }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(1);
  });

  it('counts mixed valid + invalid references and returns a partial score', async () => {
    const yaml = `name: Test
triggers:
  - type: manual
steps:
  - name: a
    type: console
    with:
      message: "{{ steps.a.output.x }} and {{ steps.missing.output.y }}"`;
    const result = await evaluateYaml(yaml);
    expect(result.score).toBe(0.5);
    expect(result.metadata?.total).toBe(2);
    expect(result.metadata?.correct).toBe(1);
    const failures = result.metadata?.failures as Array<{ ref: string; reason: string }>;
    expect(failures).toHaveLength(1);
    expect(failures[0].ref).toBe('steps.missing.output.y');
    expect(failures[0].reason).toContain('unknown step');
    expect(failures[0].reason).toContain('missing');
    expect(result.explanation).toContain('steps.missing.output.y');
  });
});

describe('SelfCorrection evaluator', () => {
  const evaluator = createSelfCorrectionEvaluator();

  const run = (turnsToRecovery: number | null, maxTurns: number) =>
    evaluator.evaluate({
      output: { messages: [], errors: [], turnsToRecovery },
      expected: { maxTurns, criteria: [] },
    });

  it('scores 0 with FAIL when the agent never recovers', async () => {
    const result = await run(null, 3);
    expect(result.score).toBe(0);
    expect(result.label).toBe('FAIL');
  });

  it('scores 1 with PASS when the agent recovers on turn 1', async () => {
    const result = await run(1, 3);
    expect(result.score).toBe(1);
    expect(result.label).toBe('PASS');
  });

  it('scores 0.5 when the agent recovers on the last allowed turn', async () => {
    const result = await run(3, 3);
    expect(result.score).toBe(0.5);
    expect(result.label).toBe('FAIL');
  });

  it('decays linearly between first and last turn', async () => {
    const result = await run(2, 3);
    expect(result.score).toBe(0.75);
    expect(result.label).toBe('PASS');
  });

  it('clamps turnsToRecovery to maxTurns', async () => {
    const result = await run(99, 3);
    expect(result.score).toBe(0.5);
  });

  it('scores 1 with PASS when maxTurns is 1 and the agent recovers', async () => {
    const result = await run(1, 1);
    expect(result.score).toBe(1);
    expect(result.label).toBe('PASS');
  });

  it('surfaces brokenKind from input in metadata', async () => {
    const result = await evaluator.evaluate({
      input: { brokenYaml: 'name:', brokenKind: 'syntax', instruction: 'fix it' },
      output: { messages: [], errors: [], turnsToRecovery: 2 },
      expected: { maxTurns: 3, criteria: [] },
    });
    expect(result.metadata?.brokenKind).toBe('syntax');
  });

  it('surfaces brokenKind even when the agent never recovers', async () => {
    const result = await evaluator.evaluate({
      input: { brokenYaml: 'name:', brokenKind: 'semantic', instruction: 'fix it' },
      output: { messages: [], errors: [], turnsToRecovery: null },
      expected: { maxTurns: 3, criteria: [] },
    });
    expect(result.metadata?.brokenKind).toBe('semantic');
    expect(result.score).toBe(0);
  });
});

describe('Rejection evaluator', () => {
  const evaluator = createRejectionEvaluator();
  const negativeExpected = {
    criteria: [],
    expectedRefusalReason: 'out-of-scope' as const,
  };

  const negativeInput = { instruction: 'do impossible thing' };

  it('returns N/A when the example is not a negative case', async () => {
    const result = await evaluator.evaluate({
      input: negativeInput,
      output: { messages: [], errors: [] },
      expected: negativeExpected,
      metadata: undefined,
    });
    expect(result.label).toBe('N/A');
    expect(result.score).toBeNull();
  });

  it('passes when the agent refuses and surfaces the expected reason', async () => {
    const result = await evaluator.evaluate({
      input: negativeInput,
      output: { messages: [], errors: [] },
      expected: negativeExpected,
      metadata: { category: 'negative' },
    });
    expect(result.score).toBe(1);
    expect(result.label).toBe('PASS');
    expect(result.metadata?.expectedRefusalReason).toBe('out-of-scope');
    expect(result.explanation).toContain('out-of-scope');
  });

  it('fails when the agent produced YAML despite the negative case', async () => {
    const result = await evaluator.evaluate({
      input: negativeInput,
      output: { messages: [], errors: [], resultYaml: 'name: nope' },
      expected: negativeExpected,
      metadata: { category: 'negative' },
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('FAIL');
    expect(result.metadata?.expectedRefusalReason).toBe('out-of-scope');
  });

  it('passes when the agent returns the seeded edit YAML unchanged', async () => {
    const initialYaml = 'name: seed\nsteps:\n  - name: a\n    type: console';
    const result = await evaluator.evaluate({
      input: { instruction: 'add error handling to nothing', initialYaml },
      output: { messages: [], errors: [], resultYaml: `${initialYaml}\n` },
      expected: negativeExpected,
      metadata: { category: 'negative' },
    });
    expect(result.score).toBe(1);
    expect(result.label).toBe('PASS');
    expect(result.metadata?.echoedSeed).toBe(true);
    expect(result.explanation).toContain('seeded YAML unchanged');
  });

  it('fails when the agent edited the seeded YAML despite the negative case', async () => {
    const initialYaml = 'name: seed';
    const result = await evaluator.evaluate({
      input: { instruction: 'edit it anyway', initialYaml },
      output: { messages: [], errors: [], resultYaml: 'name: seed\nsteps: []' },
      expected: negativeExpected,
      metadata: { category: 'negative' },
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('FAIL');
    expect(result.metadata?.echoedSeed).toBe(false);
  });
});

describe('LiquidPresence evaluator', () => {
  const evaluator = createLiquidPresenceEvaluator();

  it('returns N/A when no expected chains are declared', async () => {
    const result = await evaluator.evaluate({
      output: { messages: [], errors: [], resultYaml: 'name: x' },
      expected: { criteria: [] },
    });
    expect(result.label).toBe('N/A');
    expect(result.score).toBeNull();
  });

  it('returns N/A when no result YAML is produced', async () => {
    const result = await evaluator.evaluate({
      output: { messages: [], errors: [] },
      expected: {
        criteria: [],
        expectedLiquidChains: [{ ref: 'event.alerts' }],
      },
    });
    expect(result.label).toBe('N/A');
  });

  it('passes when every expected reference appears in the YAML', async () => {
    const yaml = 'name: x\nsteps:\n  - with: "{{ event.alerts }} {{ steps.a.output.id }}"';
    const result = await evaluator.evaluate({
      output: { messages: [], errors: [], resultYaml: yaml },
      expected: {
        criteria: [],
        expectedLiquidChains: [{ ref: 'event.alerts' }, { ref: 'steps.a.output.id' }],
      },
    });
    expect(result.score).toBe(1);
    expect(result.label).toBe('PASS');
    expect(result.metadata?.missing).toEqual([]);
  });

  it('reports missing references and scores partially', async () => {
    const yaml = 'name: x\nsteps:\n  - with: "{{ event.alerts }}"';
    const result = await evaluator.evaluate({
      output: { messages: [], errors: [], resultYaml: yaml },
      expected: {
        criteria: [],
        expectedLiquidChains: [{ ref: 'event.alerts' }, { ref: 'steps.a.output.id' }],
      },
    });
    expect(result.score).toBe(0.5);
    expect(result.label).toBe('FAIL');
    expect(result.metadata?.missing).toEqual(['steps.a.output.id']);
  });
});
