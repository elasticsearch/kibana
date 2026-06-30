/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { createErrorResult } from '@kbn/agent-builder-server';
import { ResourceTypes, resolveDefaultInferenceIdFromInferenceGet } from '@kbn/product-doc-common';
import type { RetrieveDocumentationResultDoc } from '@kbn/llm-tasks-plugin/server';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';
import { securityTool } from './constants';

const securityLabsSearchSchema = z.object({
  query: z
    .string()
    .describe(
      'A natural language query expressing the search request for Security Labs articles. Use this to find Security Labs content about specific malware, attack techniques, MITRE ATT&CK techniques, or rule names.'
    ),
});

export const SECURITY_LABS_SEARCH_TOOL_ID = securityTool('security_labs_search');

// Path to GenAI Settings within the management app
const GENAI_SETTINGS_APP_PATH = '/app/management/ai/genAiSettings';

export const securityLabsSearchTool = (
  core: SecuritySolutionPluginCoreSetupDependencies
): BuiltinToolDefinition<typeof securityLabsSearchSchema> => {
  return {
    id: SECURITY_LABS_SEARCH_TOOL_ID,
    type: ToolType.builtin,
    description: `Search and analyze Security Labs content installed via the AI knowledge base artifacts. Use this tool to find Security Labs articles about specific malware, attack techniques, MITRE ATT&CK techniques, or rule names. Limits results to 3 articles.`,
    schema: securityLabsSearchSchema,
    // Tool is always available - handler will check if docs are installed and provide guidance
    availability: {
      cacheMode: 'global',
      handler: async () => {
        return { status: 'available' };
      },
    },
    handler: async ({ query: nlQuery }, { request, modelProvider, logger }) => {
      logger.debug(`${SECURITY_LABS_SEARCH_TOOL_ID} tool called with query: ${nlQuery}`);

      try {
        const [coreStart, pluginsStart] = await core.getStartServices();
        const llmTasks = pluginsStart.llmTasks;
        if (!llmTasks) {
          return {
            results: [
              createErrorResult({
                message: 'Security Labs tool is not available. LlmTasks plugin is not available.',
              }),
            ],
          };
        }

        const inferenceId = await resolveDefaultInferenceIdFromInferenceGet(
          () => coreStart.elasticsearch.client.asInternalUser.inference.get({}),
          { resourceType: ResourceTypes.securityLabs }
        );
        const isAvailable =
          (await llmTasks.retrieveDocumentationAvailable({
            inferenceId,
            resourceType: ResourceTypes.securityLabs,
          })) ?? false;

        if (!isAvailable) {
          const basePath = coreStart.http.basePath.get(request);
          const settingsUrl = `${basePath}${GENAI_SETTINGS_APP_PATH}`;
          return {
            results: [
              createErrorResult({
                message: `Security Labs content is not installed. To use this tool, please install Security Labs from the GenAI Settings page: ${settingsUrl}. Do not perform any other tool calls, and provide the user with a link to install the documentation.`,
                metadata: { settingsUrl },
              }),
            ],
          };
        }

        const model = await modelProvider.getDefaultModel();
        const connector = model.connector;

        const result = await llmTasks.retrieveDocumentation({
          searchTerm: nlQuery,
          max: 3,
          connectorId: connector.connectorId,
          request,
          inferenceId,
          resourceTypes: [ResourceTypes.securityLabs],
        });

        if (!result.success || result.documents.length === 0) {
          return { results: [] };
        }

        return {
          results: result.documents.map((doc: RetrieveDocumentationResultDoc) => ({
            type: ToolResultType.other,
            data: {
              reference: { url: doc.url, title: doc.title },
              partial: doc.summarized,
              content: {
                title: doc.title,
                url: doc.url,
                content: doc.content,
                summarized: doc.summarized,
              },
            },
          })),
        };
      } catch (error) {
        logger.error(`Error in ${SECURITY_LABS_SEARCH_TOOL_ID} tool: ${error.message}`);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Error: ${error.message}`,
              },
            },
          ],
        };
      }
    },
    tags: ['security', 'security-labs', 'knowledge-base', 'search'],
  };
};
