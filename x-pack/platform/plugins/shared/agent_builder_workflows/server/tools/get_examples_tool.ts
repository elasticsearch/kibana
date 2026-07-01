/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { getWorkflowExamples, WORKFLOW_EXAMPLE_IDS } from '@kbn/workflows';
import { loadWorkflowExampleContent } from '@kbn/workflows/server';
import { z } from '@kbn/zod/v4';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { workflowTools } from '../../common/constants';

export function registerGetExamplesTool(agentBuilder: AgentBuilderPluginSetup): void {
  agentBuilder.tools.register({
    id: workflowTools.getExamples,
    type: ToolType.builtin,
    description: `Search and retrieve example workflow YAML files from the bundled library.

**When to use:** Before generating workflow YAML, to learn correct syntax patterns for triggers, steps, inputs, on-failure handling, etc.
**When NOT to use:** To find workflows in the user's environment (use sml_search instead).

Available categories: security, integrations, examples, utilities, search.
Supports keyword search across names, descriptions, and tags.`,
    schema: z.object({
      category: z
        .string()
        .optional()
        .describe('Filter by category (e.g., "security", "integrations", "examples")'),
      search: z
        .string()
        .optional()
        .describe(
          'Search term to find in example names, descriptions, or tags (e.g., "parallel", "alert", "slack")'
        ),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of examples to return (default: 3, max: 5)'),
    }),
    tags: ['workflows', 'yaml', 'examples'],
    handler: async ({ category, search, limit }) => {
      const effectiveLimit = Math.min(limit ?? 3, 5);
      const entries = getWorkflowExamples({ category, search });

      const examples = await Promise.all(
        entries.slice(0, effectiveLimit).map(async (entry) => {
          if (!WORKFLOW_EXAMPLE_IDS.has(entry.id)) {
            return { id: entry.id, name: entry.name, category: entry.category };
          }
          const yaml = await loadWorkflowExampleContent(entry);
          return {
            id: entry.id,
            name: entry.name,
            category: entry.category,
            ...(yaml ? { yaml } : {}),
          };
        })
      );

      return {
        results: [
          {
            type: 'other' as const,
            data: {
              count: examples.length,
              totalAvailable: entries.length,
              ...(search && { searchTerm: search }),
              examples,
            },
          },
        ],
      };
    },
  });
}
