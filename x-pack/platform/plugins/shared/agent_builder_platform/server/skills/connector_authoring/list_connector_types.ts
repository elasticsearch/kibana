/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType, isOtherResult } from '@kbn/agent-builder-common/tools/tool_result';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { connectorsSpecs } from '@kbn/connector-specs';
import type { ConnectorSpec } from '@kbn/connector-specs';
import { supportsAgentBuilder } from './utils';

interface ListedConnectorAction {
  name: string;
  description: string;
}

interface ListedConnectorType {
  connector_type: string;
  name: string;
  description: string;
  minimum_license: string;
  technical_preview: boolean;
  auth_methods: string[];
  tool_actions: ListedConnectorAction[];
}

const isConnectorSpec = (value: unknown): value is ConnectorSpec =>
  !!value && typeof value === 'object' && 'metadata' in value && 'actions' in value;

const projectConnectorType = (spec: ConnectorSpec): ListedConnectorType => ({
  connector_type: spec.metadata.id,
  name: spec.metadata.displayName,
  description: spec.metadata.description,
  minimum_license: spec.metadata.minimumLicense,
  technical_preview: spec.metadata.isTechnicalPreview ?? false,
  auth_methods: (spec.auth?.types ?? []).map((authType) =>
    typeof authType === 'string' ? authType : authType.type
  ),
  tool_actions: Object.entries(spec.actions)
    .filter(([, action]) => action.isTool)
    .map(([actionName, action]) => ({
      name: actionName,
      description: action.description ?? actionName,
    })),
});

const listConnectorTypesSchema = z.object({}).describe('No parameters.');

export type ListConnectorTypesInput = z.infer<typeof listConnectorTypesSchema>;

/**
 * Inline tool that enumerates the connector types the agent can create from chat.
 *
 * Only spec-backed connector types ({@link https://github.com/elastic/kibana | @kbn/connector-specs})
 * that declare support for Agent Builder are returned, because those are the
 * ones the agent can subsequently *use* (their tool sub-actions are described by
 * the spec). The `connector-authoring` skill mandates calling this BEFORE
 * `propose_connector` so the draft references a real connector type id.
 *
 * Deployment-level enablement/licensing is enforced later by the connector
 * flyout the user completes — this list reflects the full spec catalog.
 */
export const createListConnectorTypesTool = (): BuiltinSkillBoundedTool<
  typeof listConnectorTypesSchema
> => ({
  id: 'list_connector_types',
  type: ToolType.builtin,
  description:
    'List the connector types that can be created from chat, returning each type id, display name, description, required license, supported auth methods, and the sub-actions the agent could call afterwards. Call this BEFORE `propose_connector` so the draft references a connector type id that actually exists. Pick the `connector_type` value verbatim from the result — never invent one.',
  schema: listConnectorTypesSchema,
  confirmation: { askUser: 'never' },
  handler: async () => {
    try {
      const connectorTypes = Object.values(connectorsSpecs)
        .filter(isConnectorSpec)
        .filter(supportsAgentBuilder)
        .map(projectConnectorType)
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              connector_types: connectorTypes,
              total: connectorTypes.length,
            },
          },
        ],
      };
    } catch (error) {
      return {
        results: [
          createErrorResult({
            message: `Failed to list connector types: ${(error as Error).message}`,
          }),
        ],
      };
    }
  },
  summarizeToolReturn: (toolReturn) => {
    if (toolReturn.results.length === 0) return undefined;
    const result = toolReturn.results[0];
    if (!isOtherResult(result)) return undefined;
    const data = result.data as { total?: number };
    const total = data.total ?? 0;
    return [
      {
        ...result,
        data: {
          summary: `Listed ${total} connector types available for setup.`,
          total,
        },
      },
    ];
  },
});
