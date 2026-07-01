/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import type {
  BaseStepDefinition,
  ConnectorContractUnion,
  StepDeprecationInfo,
  StepParamSummary,
} from '@kbn/workflows';
import {
  buildBuiltInStepSchema,
  buildConnectorStepSchema,
  buildOutputSummary,
  buildStepParamsSummary,
  builtInStepDefinitions,
  getDeprecatedStepMessage,
  StepCategories,
  StepCategory,
} from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import {
  addDynamicConnectorsToCache,
  getAllConnectors,
  getCachedAllConnectorsMap,
  getDeprecatedStepMetadata,
} from '@kbn/workflows-management-plugin/common/schema';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { workflowTools } from '../../common/constants';

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

interface StepDefinitionForAgent {
  id: string;
  label: string;
  description?: string;
  category: StepCategory;
  deprecated?: boolean;
  replacementStepType?: string;
  deprecationMessage?: string;
  connectorId?: 'required' | 'optional' | 'none';
  inputParams?: StepParamSummary[];
  configParams?: StepParamSummary[];
  outputSummary?: string;
  examples?: string[];
  stepSchema?: unknown;
}

export type { StepDefinitionForAgent };

export async function resolveConnectors(
  api: WorkflowsManagementApi,
  spaceId: string,
  request: unknown
): Promise<{ all: ConnectorContractUnion[]; byType: Map<string, ConnectorContractUnion> }> {
  const { connectorTypes } = await api.getAvailableConnectors(spaceId, request as never);
  const enabledConnectorTypes = Object.fromEntries(
    Object.entries(connectorTypes).filter(([, info]) => info.enabled !== false)
  );
  addDynamicConnectorsToCache(enabledConnectorTypes);
  return {
    all: getAllConnectors(),
    byType: getCachedAllConnectorsMap() ?? new Map(),
  };
}

function categorizeConnectorType(type: string): StepCategory {
  if (type.startsWith('kibana.')) return StepCategory.Kibana;
  if (type.startsWith('cases.')) return StepCategory.KibanaCases;
  if (type.startsWith('elasticsearch.')) return StepCategory.Elasticsearch;
  if (type.startsWith('ai.')) return StepCategory.Ai;
  if (type.startsWith('data.')) return StepCategory.Data;
  return StepCategory.External;
}

function zodToJsonSchemaSafe(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema, {
      target: 'draft-7',
      unrepresentable: 'any',
      reused: 'ref',
    });
  } catch {
    return undefined;
  }
}

export function formatBuiltInStep(step: BaseStepDefinition): StepDefinitionForAgent {
  const inputParams = buildStepParamsSummary(step.inputSchema);
  const configParams = step.configSchema ? buildStepParamsSummary(step.configSchema) : undefined;
  const outputSummary = buildOutputSummary(step.outputSchema);
  const deprecationMetadata = formatDeprecationMetadata(step.id, step.deprecation);

  return {
    id: step.id,
    label: step.label,
    description: step.description,
    category: step.category,
    ...deprecationMetadata,
    connectorId: 'none',
    ...(inputParams.length > 0 ? { inputParams } : {}),
    ...(configParams && configParams.length > 0 ? { configParams } : {}),
    ...(outputSummary ? { outputSummary } : {}),
    examples: step.documentation?.examples,
  };
}

export function formatConnectorStep(connector: ConnectorContractUnion): StepDefinitionForAgent {
  const connectorId = connector.hasConnectorId || 'none';
  const inputParams = buildStepParamsSummary(connector.paramsSchema);
  const configParams = connector.configSchema
    ? buildStepParamsSummary(connector.configSchema)
    : undefined;
  const outputSummary = buildOutputSummary(connector.outputSchema);
  const deprecation = connector.deprecation ?? getDeprecatedStepMetadata(connector.type);
  const deprecationMetadata = formatDeprecationMetadata(connector.type, deprecation);

  return {
    id: connector.type,
    label: connector.summary ?? connector.description ?? connector.type,
    description: truncateDescription(connector.description),
    category: categorizeConnectorType(connector.type),
    ...deprecationMetadata,
    connectorId,
    ...(inputParams.length > 0 ? { inputParams } : {}),
    ...(configParams && configParams.length > 0 ? { configParams } : {}),
    ...(outputSummary ? { outputSummary } : {}),
    examples: connector.examples?.snippet ? [connector.examples.snippet] : undefined,
  };
}

const MAX_DESCRIPTION_LENGTH = 200;

function truncateDescription(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return `${text.slice(0, MAX_DESCRIPTION_LENGTH)}...`;
}

function matchesSearch(search: string, ...fields: Array<string | undefined | null>): boolean {
  const term = search.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(term));
}

function formatDeprecationMetadata(
  stepType: string,
  deprecation: StepDeprecationInfo | undefined
): Pick<StepDefinitionForAgent, 'deprecated' | 'replacementStepType' | 'deprecationMessage'> {
  if (!deprecation) {
    return {};
  }

  return {
    deprecated: true,
    replacementStepType: deprecation.replacementStepType,
    deprecationMessage: getDeprecatedStepMessage(stepType, deprecation),
  };
}

export function registerGetStepDefinitionsTool(
  agentBuilder: AgentBuilderPluginSetup,
  api: WorkflowsManagementApi
): void {
  agentBuilder.tools.register({
    id: workflowTools.getStepDefinitions,
    type: ToolType.builtin,
    description: `Get available workflow step types, their parameters, and usage examples.

**When to use:** Before generating step YAML, to discover available step types, their input params (\`with\` block), config params (step-level fields like \`connector-id\`), and usage examples.
**When NOT to use:** To find connector instances configured in the environment (use get_connectors instead).

Supports filtering by exact step type, keyword search, or category.
Deprecated steps are excluded from broad discovery by default, but exact step type lookups still return them.
When a small number of results is returned, input/config parameter summaries and usage examples are included.
Common step properties (name, type, if, timeout, on-failure) are NOT listed per step -- they apply to all steps (see skill prompt).
Set includeOutputSummary=true to get a compact one-line summary of each step's output fields (useful for knowing what data is available via \`{{ steps.name.field }}\`).
Set includeFullSchema=true to get the full JSON Schema for step input params (use sparingly -- only when examples are insufficient).`,
    schema: z.object({
      stepType: z
        .string()
        .optional()
        .describe('Filter by exact step type ID (e.g., "http", "foreach", "kibana.createCase")'),
      search: z
        .string()
        .optional()
        .describe(
          'Search term to match against step type IDs, labels, and descriptions (e.g., "case", "slack", "loop")'
        ),
      includeDeprecated: z
        .boolean()
        .optional()
        .describe(
          'When true, include deprecated step types in discovery results. Exact stepType lookups return deprecated steps even when this is false.'
        ),
      category: z
        .enum(StepCategories as [StepCategory, ...StepCategory[]])
        .optional()
        .describe('Filter by step category'),
      includeOutputSummary: z
        .boolean()
        .optional()
        .describe(
          'When true, include a one-line summary of each step\'s output fields (e.g. "object with: id (string), title (string)").'
        ),
      includeFullSchema: z
        .boolean()
        .optional()
        .describe(
          'When true, include the full JSON Schema for step input params. Use sparingly -- the compact summary and examples are usually sufficient.'
        ),
    }),
    tags: ['workflows', 'yaml', 'steps'],
    handler: async (
      { stepType, search, category, includeDeprecated, includeOutputSummary, includeFullSchema },
      { spaceId, request }
    ) => {
      const builtInTypes = new Set(builtInStepDefinitions.map((s) => s.id));
      const { all: allConnectors } = await resolveConnectors(api, spaceId, request);

      const connectorDefinitions = allConnectors
        .filter((connector) => !builtInTypes.has(connector.type))
        .map(formatConnectorStep);
      const builtInFormatted = builtInStepDefinitions.map(formatBuiltInStep);

      let allDefinitions: StepDefinitionForAgent[] = [...builtInFormatted, ...connectorDefinitions];

      if (includeDeprecated !== true && !stepType) {
        allDefinitions = allDefinitions.filter((def) => !def.deprecated);
      }

      if (stepType) {
        allDefinitions = allDefinitions.filter((def) => def.id === stepType);
      }

      if (search) {
        allDefinitions = allDefinitions.filter((def) =>
          matchesSearch(search, def.id, def.label, def.description)
        );
      }

      if (category) {
        allDefinitions = allDefinitions.filter((def) => def.category === category);
      }

      if (allDefinitions.length === 0 && (stepType || search)) {
        return {
          results: [
            {
              type: 'other' as const,
              data: {
                error: stepType
                  ? `Step type "${stepType}" not found`
                  : `No step types found for search "${search}"`,
                hint: 'Use the "search" parameter to find step types by keyword',
              },
            },
          ],
        };
      }

      const includeDetails = allDefinitions.length <= 5;

      const formattedResults = allDefinitions.map((def) => {
        if (!includeDetails) {
          return { id: def.id, label: def.label, category: def.category };
        }

        const result: Record<string, unknown> = {
          id: def.id,
          label: def.label,
          description: def.description,
          category: def.category,
        };

        if (def.deprecated) {
          result.deprecated = true;
          if (def.replacementStepType) {
            result.replacementStepType = def.replacementStepType;
          }
          if (def.deprecationMessage) {
            result.deprecationMessage = def.deprecationMessage;
          }
        }

        if (def.connectorId && def.connectorId !== 'none') {
          result.connectorId = def.connectorId;
        }
        if (def.examples) {
          result.examples = def.examples;
        }
        if (def.inputParams && def.inputParams.length > 0) {
          result.inputParams = def.inputParams;
        }
        if (def.configParams && def.configParams.length > 0) {
          result.configParams = def.configParams;
        }
        if (includeOutputSummary && def.outputSummary) {
          result.outputSummary = def.outputSummary;
        }

        if (includeFullSchema) {
          const fullStep = getFullSchemaForStep(def.id);
          if (fullStep) {
            result.stepSchema = fullStep.stepSchema;
          }
        }

        return result;
      });

      return {
        results: [
          {
            type: 'other' as const,
            data: {
              count: formattedResults.length,
              ...(search && { searchTerm: search }),
              stepTypes: formattedResults,
            },
          },
        ],
      };

      function getFullSchemaForStep(id: string): { stepSchema: unknown } | undefined {
        const builtIn = builtInStepDefinitions.find((s) => s.id === id);
        if (builtIn) {
          return { stepSchema: zodToJsonSchemaSafe(buildBuiltInStepSchema(builtIn)) };
        }
        const connector = allConnectors.find((c) => c.type === id);
        if (connector) {
          return { stepSchema: zodToJsonSchemaSafe(buildConnectorStepSchema(connector)) };
        }
        return undefined;
      }
    },
  });
}
