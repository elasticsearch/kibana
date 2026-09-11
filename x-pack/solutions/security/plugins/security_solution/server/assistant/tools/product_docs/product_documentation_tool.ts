/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tool } from '@langchain/core/tools';

import { z } from '@kbn/zod/v4';
import type { AssistantTool, AssistantToolParams } from '@kbn/elastic-assistant-plugin/server';
import {
  contentReferenceBlock,
  productDocumentationReference,
} from '@kbn/elastic-assistant-common';
import type { ContentReferencesStore } from '@kbn/elastic-assistant-common';
import type { RetrieveDocumentationResultDoc } from '@kbn/llm-tasks-plugin/server';
import type { Require } from '@kbn/elastic-assistant-plugin/server/types';
import {
  resolveDefaultInferenceIdFromInferenceGet,
  resolveInstalledProductDocInferenceId,
} from '@kbn/product-doc-common';
import { APP_UI_ID } from '../../../../common';

export type ProductDocumentationToolParams = Require<
  AssistantToolParams,
  'llmTasks' | 'connectorId' | 'esClient'
>;

const toolDetails = {
  // note: this description is overwritten when `getTool` is called
  // local definitions exist ../elastic_assistant/server/lib/prompt/tool_prompts.ts
  // local definitions can be overwritten by security-ai-prompt integration definitions
  description:
    'Use this tool to retrieve documentation about Elastic products. You can retrieve documentation about the Elastic stack, such as Kibana and Elasticsearch, or for Elastic solutions, such as Elastic Security, Elastic Observability or Elastic Enterprise Search.',
  id: 'product-documentation-tool',
  name: 'ProductDocumentationTool',
};
export const PRODUCT_DOCUMENTATION_TOOL: AssistantTool = {
  ...toolDetails,
  sourceRegister: APP_UI_ID,
  isSupported: (params: AssistantToolParams): params is ProductDocumentationToolParams => {
    return params.llmTasks != null && params.connectorId != null && params.esClient != null;
  },
  async getTool(params: AssistantToolParams) {
    if (!this.isSupported(params)) return null;

    const { connectorId, llmTasks, request, contentReferencesStore, esClient } =
      params as ProductDocumentationToolParams;

    const getDefaultInferenceId = () =>
      resolveDefaultInferenceIdFromInferenceGet(() => esClient.inference.get({}));

    return tool(
      async ({ query, product }) => {
        const inferenceId =
          (await resolveInstalledProductDocInferenceId({
            getDefaultInferenceId,
            isDocumentationAvailable: (candidateInferenceId) =>
              llmTasks.retrieveDocumentationAvailable({ inferenceId: candidateInferenceId }),
          })) ?? (await getDefaultInferenceId());

        const response = await llmTasks.retrieveDocumentation({
          searchTerm: query,
          products: product ? [product] : undefined,
          max: 3,
          connectorId,
          request,
          functionCalling: 'auto',
          inferenceId,
        });

        const enrichedDocuments = response.documents.map(enrichDocument(contentReferencesStore));

        return {
          content: {
            documents: enrichedDocuments,
          },
        };
      },
      {
        name: toolDetails.name,
        description: params.description || toolDetails.description,
        schema: z.object({
          query: z.string().describe(
            `The query to use to retrieve documentation
            Examples:
            - "How to enable TLS for Elasticsearch?"
            - "What is Kibana Security?"`
          ),
          product: z
            .enum(['kibana', 'elasticsearch', 'observability', 'security'])
            .describe(
              `If specified, will filter the products to retrieve documentation for
            Possible options are:
            - "kibana": Kibana product
            - "elasticsearch": Elasticsearch product
            - "observability": Elastic Observability solution
            - "security": Elastic Security solution
            If not specified, will search against all products
            `
            )
            .optional(),
        }),
        tags: ['product-documentation'],
      }
    );
  },
};

type EnrichedDocument = RetrieveDocumentationResultDoc & {
  citation?: string;
};

const enrichDocument = (contentReferencesStore: ContentReferencesStore) => {
  return (document: RetrieveDocumentationResultDoc): EnrichedDocument => {
    const reference = contentReferencesStore.add((p) =>
      productDocumentationReference(p.id, document.title, document.url)
    );
    return {
      ...document,
      citation: contentReferenceBlock(reference),
    };
  };
};
