/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createConnectorInvokedEvaluator,
  collectProducedText,
} from './connector_invoked_evaluator';

const SLACK_CONNECTOR_ID = 'd7306385-cbe6-4541-9726-49afdff59ba5';

/** A workflow that genuinely posts to Slack — the passing baseline. */
const WORKFLOW_WITH_SLACK = `
name: chrysalis-triage-summary
triggers:
  - type: manual
inputs:
  - name: message
    type: string
steps:
  - name: post-to-slack
    type: http
    connector_id: ${SLACK_CONNECTOR_ID}
    with:
      body: "{{ inputs.message }}"
`;

/** Same workflow with the Slack step removed — the mutation. */
const WORKFLOW_WITHOUT_SLACK = `
name: chrysalis-triage-summary
triggers:
  - type: manual
inputs:
  - name: message
    type: string
steps:
  - name: log-only
    type: console
    with:
      body: "{{ inputs.message }}"
`;

const expectation = {
  expectedConnectorId: SLACK_CONNECTOR_ID,
  expectedStepType: 'http',
};

const run = async (output: unknown, metadata: unknown = expectation) => {
  const evaluator = createConnectorInvokedEvaluator();
  return evaluator.evaluate({ output, metadata } as never);
};

describe('ConnectorInvoked evaluator', () => {
  it('scores 1 when the authored workflow targets the Slack connector', async () => {
    const result = await run({ messages: [{ message: WORKFLOW_WITH_SLACK }] });
    expect(result.score).toBe(1);
    expect(result.metadata).toMatchObject({ connectorPresent: true, stepPresent: true });
  });

  // The mutation that matters: this is exactly the false-green the evaluator
  // exists to catch. ExpectedToolCalled scores this 1.0; we must score it 0.
  it('scores 0 when the Slack step is removed from the workflow', async () => {
    const result = await run({ messages: [{ message: WORKFLOW_WITHOUT_SLACK }] });
    expect(result.score).toBe(0);
    expect(result.explanation).toContain(SLACK_CONNECTOR_ID);
  });

  it('scores 0 when the workflow points at a different connector', async () => {
    const wrong = WORKFLOW_WITH_SLACK.replace(
      SLACK_CONNECTOR_ID,
      '00000000-dead-beef-0000-000000000000'
    );
    const result = await run({ messages: [{ message: wrong }] });
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ connectorPresent: false });
  });

  it('does not accept prose that merely describes using an http step', async () => {
    const prose =
      `I would create a workflow that uses an http step against the Slack connector ` +
      `${SLACK_CONNECTOR_ID}, posting the triage summary to #general.`;
    const result = await run({ messages: [{ message: prose }] });
    // Connector id is mentioned, but there is no `type: http` key — narration
    // must not score as an authored workflow.
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ connectorPresent: true, stepPresent: false });
  });

  it('returns N/A when the example declares no connector expectation', async () => {
    const result = await run({ messages: [{ message: WORKFLOW_WITH_SLACK }] }, {});
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('finds the workflow whether it is in the final answer or a tool result', async () => {
    const inToolResult = {
      messages: [{ message: 'Here is your workflow.' }],
      steps: [{ tool_id: 'platform.core.generate_workflow', result: WORKFLOW_WITH_SLACK }],
    };
    const result = await run(inToolResult);
    expect(result.score).toBe(1);
  });

  it('treats regex metacharacters in the step type literally', async () => {
    // Unescaped, `a.b` would match `type: axb`. The value comes from dataset
    // metadata, so it must be escaped before being spliced into a RegExp.
    const result = await run(
      { messages: [{ message: 'steps:\n  - type: axb\n' }] },
      { expectedStepType: 'a.b' }
    );
    expect(result.score).toBe(0);
  });

  describe('collectProducedText', () => {
    it('gathers strings from nested structures', () => {
      const text = collectProducedText({ a: 'one', b: [{ c: 'two' }], d: { e: ['three'] } });
      expect(text).toContain('one');
      expect(text).toContain('two');
      expect(text).toContain('three');
    });
  });
});
