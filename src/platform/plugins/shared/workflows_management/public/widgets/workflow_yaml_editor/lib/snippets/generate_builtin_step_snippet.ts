/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToStringOptions } from 'yaml';
import { stringify } from 'yaml';
import type { BuiltInStepType } from '@kbn/workflows';
import {
  type NormalizableFieldSchema,
  normalizeFieldsToJsonSchema,
} from '@kbn/workflows/spec/lib/field_conversion';

interface GenerateBuiltInStepSnippetOptions {
  full?: boolean;
  withStepsSection?: boolean;
}

/**
 * Generates a YAML snippet for a built-in workflow step based on the specified type.
 * @param stepType - The type of built-in step ('foreach', 'if', 'parallel', 'merge', 'http', 'wait', 'workflow.output', 'workflow.fail', etc.)
 * @param options - Configuration options for snippet generation
 * @param options.full - Whether to include the full YAML structure with step name and type prefix
 * @param options.withStepsSection - Whether to include the "steps:" section
 * @param workflowOutputs - Declared workflow outputs for workflow.output step snippet
 * @returns The formatted YAML step snippet with appropriate parameters and structure
 */
// Switch is good readable
// eslint-disable-next-line complexity
export function generateBuiltInStepSnippet(
  stepType: BuiltInStepType,
  { full, withStepsSection }: GenerateBuiltInStepSnippetOptions = {},
  workflowOutputs?: NormalizableFieldSchema
): string {
  const stringifyOptions: ToStringOptions = { indent: 2 };
  let parameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  switch (stepType) {
    case 'foreach':
      parameters = {
        foreach: '{{context.items}}',
        steps: [
          {
            name: 'process-item',
            type: '# Add step type here',
          },
        ],
      };
      break;
    case 'if':
      parameters = {
        condition: 'steps.step_1.output: "value"',
        steps: [{ name: 'then-step', type: '# Add step type here' }],
      };
      break;
    case 'switch':
      parameters = {
        expression: '{{ steps.step_1.output.value }}',
        cases: [
          {
            match: 'value_1',
            steps: [{ name: 'case-1-step', type: '# Add step type here' }],
          },
          {
            match: 'value_2',
            steps: [{ name: 'case-2-step', type: '# Add step type here' }],
          },
        ],
        default: [{ name: 'default-step', type: '# Add step type here' }],
      };
      break;
    case 'while':
      parameters = {
        condition: 'steps.inner_step.output: "value"',
        steps: [{ name: 'inner-step', type: '# Add step type here' }],
      };
      break;
    case 'parallel':
      parameters = {
        branches: [
          { name: 'branch-1', steps: [{ name: 'step-1', type: '# Add step type here' }] },
          { name: 'branch-2', steps: [{ name: 'step-2', type: '# Add step type here' }] },
        ],
      };
      break;
    case 'merge':
      parameters = {
        sources: ['branch-1', 'branch-2'],
        steps: [{ name: 'merge-step', type: '# Add step type here' }],
      };
      break;
    case 'data.set':
      parameters = {
        with: {
          variable_name: 'value',
          another_variable: '{{steps.previous_step.output}}',
        },
      };
      break;
    case 'wait':
      parameters = {
        with: { duration: '5s' },
      };
      break;
    case 'waitForInput':
      parameters = {
        with: { message: 'User action is required' },
      };
      break;
    case 'waitForApproval':
      parameters = {
        timeout: '24h',
        with: {
          message: 'Your approval is required to continue',
          approveLabel: 'Approve',
          rejectLabel: 'Decline',
        },
      };
      break;
    case 'workflow.execute':
    case 'workflow.executeAsync':
      parameters = {
        with: {
          'workflow-id': 'workflow-id',
          inputs: {},
        },
      };
      break;
    case 'workflow.output': {
      const withBlock: Record<string, string> = {};
      const normalized = normalizeFieldsToJsonSchema(workflowOutputs);
      if (normalized?.properties && Object.keys(normalized.properties).length > 0) {
        for (const [name, propSchema] of Object.entries(normalized.properties)) {
          const type =
            propSchema && typeof propSchema === 'object' && 'type' in propSchema
              ? (propSchema as { type?: string }).type
              : undefined;
          const placeholder = type === 'string' ? '"${1:value}"' : '${1:value}';
          withBlock[name] = placeholder;
        }
      } else {
        withBlock.output_name = '${1:value}';
      }
      parameters = { with: withBlock };
      break;
    }
    case 'workflow.fail':
      parameters = {
        with: { message: '${1:Error message}' },
      };
    case 'loop.break':
    case 'loop.continue':
      parameters = {};
      break;
    default:
      parameters = {
        with: { '# Add parameters here': '' },
      };
  }

  if (full) {
    // if the full snippet is requested, return the whole step node as a sequence item
    // - name: ${stepType}_step
    //   type: ${stepType}
    //   ...parameters
    const step = [
      {
        name: `${stepType.replaceAll('.', '_')}_step`,
        type: stepType,
        ...parameters,
      },
    ];
    if (withStepsSection) {
      return stringify({ steps: step }, stringifyOptions);
    }
    return stringify(step, stringifyOptions);
  }

  // otherwise, the "type:" is already present, so we just return the type value and parameters
  // (type:)${stepType}
  // ...parameters
  return `${stepType}\n${stringify(parameters, stringifyOptions)}`;
}
