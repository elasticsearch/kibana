/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { createErrorResult } from '@kbn/agent-builder-server';
import { ToolResultType } from '@kbn/agent-builder-common';
import type { CoreSetup } from '@kbn/core/server';
import type { RetrieveDocumentationResultDoc } from '@kbn/llm-tasks-plugin/server';
import type { LlmTasksPluginStart } from '@kbn/llm-tasks-plugin/server';
import {
  resolveDefaultInferenceIdFromInferenceGet,
  resolveInstalledProductDocInferenceId,
} from '@kbn/product-doc-common';
import type { AgentBuilderPlatformPluginStart, PluginStartDependencies } from '../types';

const productDocumentationSchema = z.object({
  query: z
    .string()
    .describe(
      'Search query to retrieve documentation about Elastic products. Rewritten in English to best match the documentation content.'
    ),
  product: z
    .enum(['kibana', 'elasticsearch', 'observability', 'security'])
    .optional()
    .describe('Product to filter by: "kibana", "elasticsearch", "observability", or "security"'),
  max: z
    .number()
    .optional()
    .default(3)
    .describe('Maximum number of documents to return. Defaults to 3.'),
});

// Path to GenAI Settings within the management app
const GENAI_SETTINGS_APP_PATH = '/app/management/ai/genAiSettings';

export const productDocumentationTool = (
  coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>
): BuiltinToolDefinition<typeof productDocumentationSchema> => {
  let startServicesPromise: ReturnType<CoreSetup['getStartServices']> | undefined;
  const getStartServices = () => {
    if (!startServicesPromise) {
      startServicesPromise = coreSetup.getStartServices();
    }
    return startServicesPromise;
  };

  const getLlmTasks = async (): Promise<LlmTasksPluginStart | undefined> => {
    const [, plugins] = await getStartServices();
    return (plugins as PluginStartDependencies).llmTasks;
  };

  const getDefaultInferenceId = async () => {
    const [coreStart] = await getStartServices();
    return resolveDefaultInferenceIdFromInferenceGet(() =>
      coreStart.elasticsearch.client.asInternalUser.inference.get({})
    );
  };

  const baseTool: BuiltinToolDefinition<typeof productDocumentationSchema> = {
    id: platformCoreTools.productDocumentation,
    type: ToolType.builtin,
    description: `Search and retrieve documentation about Elastic products (Kibana, Elasticsearch, Elastic Security, Elastic Observability).`,
    schema: productDocumentationSchema,
    handler: async ({ query, product, max = 3 }, { modelProvider, logger, request }) => {
      const llmTasks = await getLlmTasks();
      if (!llmTasks) {
        return {
          results: [
            createErrorResult({
              message:
                'Product documentation tool is not available. LlmTasks plugin is not available.',
            }),
          ],
        };
      }

      const inferenceId = await resolveInstalledProductDocInferenceId({
        getDefaultInferenceId,
        isDocumentationAvailable: (candidateInferenceId) =>
          llmTasks.retrieveDocumentationAvailable({ inferenceId: candidateInferenceId }),
      });
      if (!inferenceId) {
        const basePath = coreSetup.http.basePath.get(request);
        const settingsUrl = `${basePath}${GENAI_SETTINGS_APP_PATH}`;

        return {
          results: [
            createErrorResult({
              message: `Product documentation is not installed. To use this tool, please install Elastic documentation from the GenAI Settings page: ${settingsUrl}. Do not perform any other tool calls, and provide the user with a link to install the documentation.`,
              metadata: {
                settingsUrl,
              },
            }),
          ],
        };
      }

      try {
        const model = await modelProvider.getDefaultModel();
        const connector = model.connector;

        const result = await llmTasks.retrieveDocumentation({
          searchTerm: query,
          products: product ? [product as any] : undefined,
          max,
          connectorId: connector.connectorId,
          request,
          inferenceId,
        });

        if (!result.success || result.documents.length === 0) {
          return {
            results: [
              createErrorResult({
                message: 'No documentation found for the given query.',
                metadata: {
                  query,
                  product: product || 'all',
                },
              }),
            ],
          };
        }

        return {
          results: result.documents.map((doc: RetrieveDocumentationResultDoc) => ({
            type: ToolResultType.other,
            data: {
              reference: {
                url: doc.url,
                title: doc.title,
              },
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
        logger.error(`Error retrieving product documentation: ${error.message}`);
        return {
          results: [
            createErrorResult({
              message: `Failed to retrieve product documentation: ${error.message}`,
            }),
          ],
        };
      }
    },
    tags: [],
    // Tool is always available - handler will check if docs are installed and provide guidance
    availability: {
      cacheMode: 'global',
      handler: async () => {
        return { status: 'available' };
      },
    },
  };

  return baseTool;
};
