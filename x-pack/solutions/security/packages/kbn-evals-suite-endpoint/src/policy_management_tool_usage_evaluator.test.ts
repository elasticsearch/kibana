/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createPolicyManagementToolUsageEvaluator,
  POLICY_MANAGEMENT_ASSESS_POLICY_CHANGE_TOOL_ID,
  POLICY_MANAGEMENT_GET_POLICY_TOOL_ID,
  POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID,
} from './policy_management_tool_usage_evaluator';

const evaluateWith = async ({
  requiredTools = [POLICY_MANAGEMENT_GET_POLICY_TOOL_ID],
  forbiddenTools = [POLICY_MANAGEMENT_ASSESS_POLICY_CHANGE_TOOL_ID],
  steps = [
    {
      type: 'tool_call',
      tool_id: POLICY_MANAGEMENT_GET_POLICY_TOOL_ID,
    },
  ],
}: {
  requiredTools?: readonly string[];
  forbiddenTools?: readonly string[];
  steps?: unknown[];
}) =>
  createPolicyManagementToolUsageEvaluator().evaluate({
    input: { question: 'unused' },
    output: { steps },
    expected: {
      criteria: [],
      required_tools: requiredTools,
      forbidden_tools: forbiddenTools,
    },
    metadata: {},
  });

describe('createPolicyManagementToolUsageEvaluator', () => {
  it('passes when required exact tool IDs are present and forbidden IDs are absent', async () => {
    const result = await evaluateWith({});

    expect(result).toEqual({ score: 1, label: 'pass' });
  });

  it.each([
    {
      name: 'a required exact tool ID is missing',
      requiredTools: [POLICY_MANAGEMENT_GET_POLICY_TOOL_ID],
      forbiddenTools: [POLICY_MANAGEMENT_ASSESS_POLICY_CHANGE_TOOL_ID],
      steps: [
        {
          type: 'tool_call',
          tool_id: POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID,
        },
      ],
    },
    {
      name: 'a configured forbidden exact tool ID is present',
      requiredTools: [POLICY_MANAGEMENT_GET_POLICY_TOOL_ID],
      forbiddenTools: [POLICY_MANAGEMENT_ASSESS_POLICY_CHANGE_TOOL_ID],
      steps: [
        {
          type: 'tool_call',
          tool_id: POLICY_MANAGEMENT_GET_POLICY_TOOL_ID,
        },
        {
          type: 'tool_call',
          tool_id: POLICY_MANAGEMENT_ASSESS_POLICY_CHANGE_TOOL_ID,
        },
      ],
    },
  ])('fails when $name', async ({ requiredTools, forbiddenTools, steps }) => {
    const result = await evaluateWith({
      requiredTools,
      forbiddenTools,
      steps,
    });

    expect(result).toEqual({ score: 0, label: 'fail' });
  });

  it('passes when list_policies includes endpoint usage', async () => {
    const result = await evaluateWith({
      requiredTools: [POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID],
      forbiddenTools: [],
      steps: [
        {
          type: 'tool_call',
          tool_id: POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID,
          params: { includeEndpointUsage: true },
        },
      ],
    });

    expect(result).toEqual({ score: 1, label: 'pass' });
  });

  it('fails when list_policies does not include endpoint usage', async () => {
    const result = await evaluateWith({
      requiredTools: [POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID],
      forbiddenTools: [],
      steps: [
        {
          type: 'tool_call',
          tool_id: POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID,
          params: { includeEndpointUsage: false },
        },
      ],
    });

    expect(result).toEqual({ score: 0, label: 'fail' });
  });
});
