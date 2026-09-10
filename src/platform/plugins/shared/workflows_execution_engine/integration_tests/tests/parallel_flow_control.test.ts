/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schema } from '@kbn/config-schema';
import { ExecutionStatus } from '@kbn/workflows';
import { FakeConnectors } from '../mocks/actions_plugin_mock';
import { WorkflowRunFixture } from '../workflow_run_fixture';

const executions = (fixture: WorkflowRunFixture, stepId: string) =>
  [...fixture.stepExecutionRepositoryMock.stepExecutions.values()].filter(
    (execution) => execution.stepId === stepId
  );
const workflow = (fixture: WorkflowRunFixture) =>
  fixture.workflowExecutionRepositoryMock.workflowExecutions.get('fake_workflow_execution_id');

const drain = async (fixture: WorkflowRunFixture) => {
  for (let tick = 0; tick < 20 && workflow(fixture)?.status === ExecutionStatus.WAITING; tick++) {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    await fixture.resumeWorkflow();
  }
};

describe('parallel branch flow control', () => {
  it('isolates per-alert variables across conditions and sequential loops', async () => {
    const fixture = new WorkflowRunFixture();
    await fixture.runWorkflow({
      workflowYaml: readFileSync(
        join(__dirname, '../../examples/parallel_branch_execution.yml'),
        'utf8'
      ),
    });
    await drain(fixture);
    expect(workflow(fixture)?.status).toBe(ExecutionStatus.COMPLETED);
    expect(executions(fixture, 'result').map((step) => JSON.parse(step.output as string))).toEqual(
      expect.arrayContaining([
        { owner: 'a', selected: 'left', values: [1, 2] },
        { owner: 'b', selected: 'right', values: [1, 2] },
      ])
    );
    expect(executions(fixture, 'accumulate')).toHaveLength(4);
    expect(JSON.parse(executions(fixture, 'parentResult')[0].output as string)).toEqual({
      owner: 'parent',
      values: [],
    });
  });

  it('resumes nested parallel joins without repeating completed work', async () => {
    const fixture = new WorkflowRunFixture();
    jest.replaceProperty(
      fixture.configMock.eviction,
      'minPayloadSize',
      schema.byteSize().validate('1b')
    );
    await fixture.runWorkflow({
      workflowYaml: `
steps:
  - name: outer
    type: parallel
    foreach: '["a", "b"]'
    steps:
      - name: outerIdentity
        type: data.set
        with:
          owner: '{{ foreach.item }}'
      - name: inner
        type: parallel
        foreach: '[1, 2]'
        steps:
          - name: innerIdentity
            type: data.set
            with:
              alert: '{{ variables.owner }}'
              owner: '{{ foreach.item }}'
          - name: beforeWait
            type: console
            with:
              message: '{{ variables.owner }}'
          - name: pause
            type: wait
            with:
              duration: 1ms
          - name: afterWait
            type: console
            with:
              message: '{{ variables.alert }}:{{ foreach.item }}'
      - name: branchEnd
        type: console
        with:
          message: '{{ variables.owner }}|{{ steps.inner.output.results[0].output }}'
`,
    });
    expect(workflow(fixture)?.status).toBe(ExecutionStatus.WAITING);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await drain(fixture);
    expect(workflow(fixture)?.status).toBe(ExecutionStatus.COMPLETED);
    expect(executions(fixture, 'beforeWait')).toHaveLength(4);
    expect(executions(fixture, 'afterWait')).toHaveLength(4);
    expect(
      executions(fixture, 'branchEnd')
        .map((step) => step.output)
        .sort()
    ).toEqual(['a|a:1', 'b|b:1']);
  });

  it('contains exhausted retries and fallback inside each settled branch', async () => {
    const fixture = new WorkflowRunFixture();
    await fixture.runWorkflow({
      workflowYaml: `
steps:
  - name: alerts
    type: parallel
    mode: settled
    foreach: '["a", "b"]'
    steps:
      - name: flaky
        type: ${FakeConnectors.constantlyFailing.actionTypeId}
        connector-id: ${FakeConnectors.constantlyFailing.name}
        with:
          message: '{{ foreach.item }}'
        on-failure:
          retry:
            max-attempts: 2
            delay: 1ms
          fallback:
            - name: recovery
              type: console
              with:
                message: '{{ foreach.item }}'
  - name: afterJoin
    type: console
    with:
      message: done
`,
    });
    await drain(fixture);
    expect(workflow(fixture)?.status).toBe(ExecutionStatus.COMPLETED);
    expect(
      executions(fixture, 'flaky').filter(
        (step) => step.stepType === FakeConnectors.constantlyFailing.actionTypeId
      )
    ).toHaveLength(6);
    expect(
      executions(fixture, 'recovery')
        .map((step) => step.output)
        .sort()
    ).toEqual(['a', 'b']);
    expect(executions(fixture, 'afterJoin')).toHaveLength(1);
    expect(executions(fixture, 'alerts')[0].output).toMatchObject({ failed: 2, succeeded: 0 });
  });

  it('continues after a handled failure while a sibling skips the conditional step', async () => {
    const fixture = new WorkflowRunFixture();
    await fixture.runWorkflow({
      workflowYaml: `
steps:
  - name: alerts
    type: parallel
    foreach: '["a", "b"]'
    steps:
      - name: optionalEnrichment
        type: ${FakeConnectors.constantlyFailing.actionTypeId}
        connector-id: ${FakeConnectors.constantlyFailing.name}
        if: 'foreach.item: a'
        with:
          message: '{{ foreach.item }}'
        on-failure:
          retry:
            max-attempts: 1
          continue: true
      - name: result
        type: console
        with:
          message: '{{ foreach.item }}'
`,
    });
    await drain(fixture);
    expect(workflow(fixture)?.status).toBe(ExecutionStatus.COMPLETED);
    expect(
      executions(fixture, 'optionalEnrichment').filter(
        (step) => step.stepType === FakeConnectors.constantlyFailing.actionTypeId
      )
    ).toHaveLength(2);
    expect(
      executions(fixture, 'result')
        .map((step) => step.output)
        .sort()
    ).toEqual(['a', 'b']);
    expect(executions(fixture, 'alerts')[0].output).toMatchObject({ failed: 0, succeeded: 2 });
  });
  it('keeps each branch loop source available when another branch exits its shorter loop', async () => {
    const fixture = new WorkflowRunFixture();
    jest.replaceProperty(
      fixture.configMock.eviction,
      'minPayloadSize',
      schema.byteSize().validate('1b')
    );
    await fixture.runWorkflow({
      workflowYaml: `
steps:
  - name: parallelWork
    type: parallel
    foreach:
      - [a]
      - [b, c, d, e]
    steps:
      - name: source
        type: console
        with:
          message: '{{ foreach.item | json }}'
      - name: loop
        type: foreach
        foreach: '{{ steps.source.output }}'
        steps:
          - name: pause
            type: wait
            with: { duration: 1ms }
          - name: value
            type: console
            with:
              message: '{{ foreach.item }}'
`,
    });
    await drain(fixture);
    expect(workflow(fixture)?.status).toBe(ExecutionStatus.COMPLETED);
    expect(
      executions(fixture, 'value')
        .map((step) => step.output)
        .sort()
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
