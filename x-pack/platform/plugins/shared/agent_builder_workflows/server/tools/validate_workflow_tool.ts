/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import type { ConnectorContractUnion } from '@kbn/workflows';
import { builtInStepDefinitions } from '@kbn/workflows';
import { parseYamlToJSONWithoutValidation } from '@kbn/workflows-yaml';
import { z } from '@kbn/zod/v4';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { StepDefinitionForAgent } from './get_step_definitions_tool';
import {
  formatBuiltInStep,
  formatConnectorStep,
  resolveConnectors,
} from './get_step_definitions_tool';
import { workflowTools } from '../../common/constants';
type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

const extractStepTypes = (yaml: string): string[] => {
  const parsed = parseYamlToJSONWithoutValidation(yaml);
  if (!parsed.success) return [];

  const steps = parsed.json?.steps;
  if (!Array.isArray(steps)) return [];

  const types = new Set<string>();
  for (const step of steps) {
    if (step && typeof step === 'object' && typeof step.type === 'string') {
      types.add(step.type);
    }
  }
  return [...types];
};

const compactFields = ({
  id,
  label,
  description,
  inputParams,
  examples,
}: StepDefinitionForAgent) => ({
  id,
  label,
  description,
  inputParams,
  examples,
});

const lookupStepDefinitions = async (
  stepTypes: string[],
  api: WorkflowsManagementApi,
  spaceId: string,
  request: unknown
) => {
  const builtInMap = new Map(builtInStepDefinitions.map((s) => [s.id, s]));

  let connectorMap = new Map<string, ConnectorContractUnion>();
  try {
    ({ byType: connectorMap } = await resolveConnectors(api, spaceId, request));
  } catch {
    // connector lookup failed; continue with built-in types only
  }

  const definitions = [];
  for (const stepType of stepTypes) {
    const builtIn = builtInMap.get(stepType);
    if (builtIn) {
      definitions.push(compactFields(formatBuiltInStep(builtIn)));
    } else {
      const connector = connectorMap.get(stepType);
      if (connector) {
        definitions.push(compactFields(formatConnectorStep(connector)));
      }
    }
  }
  return definitions;
};

export function registerValidateWorkflowTool(
  agentBuilder: AgentBuilderPluginSetup,
  api: WorkflowsManagementApi
): void {
  agentBuilder.tools.register({
    id: workflowTools.validateWorkflow,
    type: ToolType.builtin,
    description: `Validate a workflow YAML string against all validation rules.
Use this tool AFTER generating or modifying workflow YAML and BEFORE proposing changes to the user.
It checks YAML syntax, schema conformance, step name uniqueness, and Liquid template syntax.
When validation fails, step type definitions used in the workflow are automatically included to help fix issues.
If validation fails, fix the issues and re-validate until the YAML is valid.`,
    schema: z.object({
      yaml: z.string().describe('The complete workflow YAML string to validate'),
    }),
    tags: ['workflows', 'yaml', 'validation'],
    handler: async ({ yaml }, { spaceId, request }) => {
      const result = await api.validateWorkflow(yaml, spaceId, request);

      const { parsedWorkflow: _stripped, ...compactResult } = result;

      if (!result.valid) {
        const stepTypes = extractStepTypes(yaml);
        const stepDefinitions =
          stepTypes.length > 0 ? await lookupStepDefinitions(stepTypes, api, spaceId, request) : [];

        return {
          results: [
            {
              type: 'other' as const,
              data: {
                result: compactResult,
                ...(stepDefinitions.length > 0 ? { stepDefinitions } : {}),
              },
            },
          ],
        };
      }

      return {
        results: [
          {
            type: 'other' as const,
            data: { result: compactResult },
          },
        ],
      };
    },
  });
}
