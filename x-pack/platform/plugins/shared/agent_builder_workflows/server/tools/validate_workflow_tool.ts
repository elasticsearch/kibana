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
    annotations: {
      title: 'Validate Workflow',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description: `Validate a workflow YAML string against all validation rules.
Use this tool AFTER generating or modifying workflow YAML and BEFORE proposing changes to the user.
It checks YAML syntax, schema conformance, step name uniqueness, and Liquid template syntax.
Pass \`expectedInputRefs\` when the workflow must consume a known payload contract, to also verify it declares that input and only references fields the contract defines.
When validation fails, step type definitions used in the workflow are automatically included to help fix issues.
If validation fails, fix the issues and re-validate until the YAML is valid.

API documentation — Workflows guide: https://www.elastic.co/docs/explore-analyze/workflows — Workflows API: https://www.elastic.co/docs/api/doc/kibana/group/endpoint-workflows`,
    schema: z.object({
      yaml: z.string().describe('The complete workflow YAML string to validate'),
      expectedInputRefs: z
        .array(z.string().max(512))
        .max(10)
        .optional()
        .describe(
          'Optional built-in input contract refs the workflow must satisfy, e.g. ' +
            '"#/kibana/definitions/alertingV2NotificationGroup". When set, validation also checks ' +
            'that the workflow declares an input with that $ref and that every template path under ' +
            'that input exists in the ref schema.'
        ),
    }),
    tags: ['workflows', 'yaml', 'validation'],
    handler: async ({ yaml, expectedInputRefs }, { spaceId, request }) => {
      const result = await api.validateWorkflow(
        yaml,
        spaceId,
        request,
        expectedInputRefs ? { expectedInputRefs } : undefined
      );

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
