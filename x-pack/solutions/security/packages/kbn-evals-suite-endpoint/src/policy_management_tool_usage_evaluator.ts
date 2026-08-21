/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, TaskOutput } from '@kbn/evals';
import type { PolicyManagementDatasetExample } from './evaluate_policy_management_dataset';

export const POLICY_MANAGEMENT_GET_POLICY_TOOL_ID = 'security.policy_management.get_policy';
export const POLICY_MANAGEMENT_GET_POLICY_FIELD_REFERENCE_TOOL_ID =
  'security.policy_management.get_policy_field_reference';
export const POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID = 'security.policy_management.list_policies';
export const POLICY_MANAGEMENT_COMPARE_POLICIES_TOOL_ID =
  'security.policy_management.compare_policies';
export const POLICY_MANAGEMENT_ASSESS_POLICY_CHANGE_TOOL_ID =
  'security.policy_management.assess_policy_change';
export const POLICY_MANAGEMENT_GET_POLICY_ROLLOUT_STATUS_TOOL_ID =
  'security.policy_management.get_policy_rollout_status';

export const POLICY_MANAGEMENT_TOOL_USAGE_EVALUATOR_NAME = 'Policy Management Tool Usage';

export interface PolicyManagementToolUsageExpected {
  required_tools?: readonly string[];
  forbidden_tools?: readonly string[];
}

interface ToolCallStep {
  type?: unknown;
  tool_id?: unknown;
  params?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getToolCallSteps = (output: TaskOutput): ToolCallStep[] => {
  if (!isRecord(output) || !Array.isArray(output.steps)) {
    return [];
  }

  return output.steps.filter(
    (step): step is ToolCallStep => isRecord(step) && step.type === 'tool_call'
  );
};

const hasListPoliciesIncludeEndpointUsage = (steps: ToolCallStep[]): boolean =>
  steps.some(
    (step) =>
      step.tool_id === POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID &&
      isRecord(step.params) &&
      step.params.includeEndpointUsage === true
  );

export function createPolicyManagementToolUsageEvaluator(): Evaluator<
  PolicyManagementDatasetExample,
  TaskOutput
> {
  return {
    name: POLICY_MANAGEMENT_TOOL_USAGE_EVALUATOR_NAME,
    kind: 'CODE',
    direction: 'maximize',
    evaluate: async ({ output, expected }) => {
      const steps = getToolCallSteps(output);
      const observedToolIds = new Set(
        steps
          .map((step) => step.tool_id)
          .filter((toolId): toolId is string => typeof toolId === 'string')
      );
      const requiredTools = expected?.required_tools ?? [];
      const forbiddenTools = expected?.forbidden_tools ?? [];
      const requiredToolsPresent = requiredTools.every((toolId) => observedToolIds.has(toolId));
      const forbiddenToolsAbsent = forbiddenTools.every((toolId) => !observedToolIds.has(toolId));
      const listPoliciesArgumentValid =
        !requiredTools.includes(POLICY_MANAGEMENT_LIST_POLICIES_TOOL_ID) ||
        hasListPoliciesIncludeEndpointUsage(steps);
      const score =
        requiredToolsPresent && forbiddenToolsAbsent && listPoliciesArgumentValid ? 1 : 0;

      return {
        score,
        label: score === 1 ? 'pass' : 'fail',
      };
    },
  };
}
