/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { lookupTriggerDefinitionsForAgent } from '@kbn/workflows-management-plugin/common/build_trigger_definitions_for_agent';
import { z } from '@kbn/zod/v4';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { workflowTools } from '../../common/constants';

type GetRegisteredTriggersApi = Pick<
  WorkflowsServerPluginSetup['management'],
  'getRegisteredTriggers'
>;

export function registerGetTriggerDefinitionsTool(
  agentBuilder: AgentBuilderPluginSetup,
  api: GetRegisteredTriggersApi
): void {
  agentBuilder.tools.register({
    id: workflowTools.getTriggerDefinitions,
    type: ToolType.builtin,
    description: `Get available workflow trigger types with schemas and YAML examples.

**When to use:** To learn how to configure the \`triggers\` section of a workflow, or to understand what \`{{ event.* }}\` variables are available at runtime for a given trigger type.
**When NOT to use:** For step definitions (use get_step_definitions) or connector instances (use get_connectors).

Returns built-in trigger types (manual, scheduled, alert) plus event-driven triggers (e.g. cases.caseUpdated) including the event context schema that describes what \`{{ event.* }}\` contains at runtime.`,
    schema: z.object({
      triggerType: z
        .string()
        .optional()
        .describe(
          'Filter by exact trigger type (e.g., "manual", "scheduled", "alert", "workflows.failed", "cases.caseUpdated")'
        ),
    }),
    tags: ['workflows', 'yaml', 'triggers'],
    handler: async ({ triggerType }) => ({
      results: [
        {
          type: 'other' as const,
          data: lookupTriggerDefinitionsForAgent({
            registeredTriggers: await api.getRegisteredTriggers(),
            triggerType,
          }),
        },
      ],
    }),
  });
}
