/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RetrievalQAChain } from '@langchain/classic/chains';
import type { DynamicStructuredTool, DynamicTool } from '@langchain/core/tools';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { ExecuteConnectorRequestBody } from '@kbn/elastic-assistant-common/impl/schemas';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type { AssistantToolParams } from '@kbn/elastic-assistant-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';
import { PRODUCT_DOCUMENTATION_TOOL } from './product_documentation_tool';
import type {
  LlmTasksPluginStart,
  RetrieveDocumentationResultDoc,
} from '@kbn/llm-tasks-plugin/server';
import type {
  ContentReferencesStore,
  ProductDocumentationContentReference,
} from '@kbn/elastic-assistant-common';
import { newContentReferencesStoreMock } from '@kbn/elastic-assistant-common/impl/content_references/content_references_store/__mocks__/content_references_store.mock';

describe('ProductDocumentationTool', () => {
  const chain = {} as RetrievalQAChain;
  const inferenceGet = jest.fn();
  const esClient = {
    inference: {
      get: inferenceGet,
    },
  } as unknown as ElasticsearchClient;
  const request = {} as unknown as KibanaRequest<unknown, unknown, ExecuteConnectorRequestBody>;
  const logger = loggerMock.create();
  const retrieveDocumentation = jest.fn();
  const retrieveDocumentationAvailable = jest.fn();
  const llmTasks = {
    retrieveDocumentation,
    retrieveDocumentationAvailable,
  } as LlmTasksPluginStart;
  const connectorId = 'fake-connector';
  const contentReferencesStore = newContentReferencesStoreMock();
  const defaultArgs = {
    chain,
    esClient,
    logger,
    request,
    llmTasks,
    connectorId,
    isEnabledKnowledgeBase: true,
    contentReferencesStore,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    inferenceGet.mockResolvedValue({
      endpoints: [{ inference_id: defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID }],
    });
    retrieveDocumentationAvailable.mockImplementation(async ({ inferenceId }) => {
      return inferenceId === defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID;
    });
  });

  describe('isSupported', () => {
    it('returns true if connectorId and llmTasks have values', () => {
      expect(PRODUCT_DOCUMENTATION_TOOL.isSupported(defaultArgs)).toBe(true);
    });
  });

  describe('getTool', () => {
    it('should return a tool as expected when all required values are present', async () => {
      const tool = (await PRODUCT_DOCUMENTATION_TOOL.getTool(defaultArgs)) as DynamicTool;
      expect(tool.name).toEqual('ProductDocumentationTool');
      expect(tool.tags).toEqual(['product-documentation']);
    });

    it('returns null if llmTasks plugin is not provided', async () => {
      const tool = await PRODUCT_DOCUMENTATION_TOOL.getTool({
        ...defaultArgs,
        llmTasks: undefined,
      });

      expect(tool).toBeNull();
    });

    it('returns null if connectorId is not provided', async () => {
      const tool = await PRODUCT_DOCUMENTATION_TOOL.getTool({
        ...defaultArgs,
        connectorId: undefined,
      });

      expect(tool).toBeNull();
    });

    it('returns null if esClient is not provided', async () => {
      const tool = await PRODUCT_DOCUMENTATION_TOOL.getTool({
        ...defaultArgs,
        esClient: undefined,
      } as unknown as AssistantToolParams);

      expect(tool).toBeNull();
    });
  });
  describe('DynamicStructuredTool', () => {
    beforeEach(() => {
      retrieveDocumentation.mockResolvedValue({ documents: [] });
    });
    it('the tool invokes retrieveDocumentation with the installed inference ID', async () => {
      const tool = (await PRODUCT_DOCUMENTATION_TOOL.getTool(defaultArgs)) as DynamicStructuredTool;

      await tool.func({ query: 'What is Kibana Security?', product: 'kibana' });

      expect(retrieveDocumentation).toHaveBeenCalledWith({
        searchTerm: 'What is Kibana Security?',
        products: ['kibana'],
        max: 3,
        connectorId: 'fake-connector',
        request,
        functionCalling: 'auto',
        inferenceId: defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
      });
    });

    it('falls back to default ELSER when docs are installed for that model', async () => {
      inferenceGet.mockResolvedValue({
        endpoints: [{ inference_id: defaultInferenceEndpoints.ELSER }],
      });
      retrieveDocumentationAvailable.mockImplementation(async ({ inferenceId }) => {
        return inferenceId === defaultInferenceEndpoints.ELSER;
      });

      const tool = (await PRODUCT_DOCUMENTATION_TOOL.getTool(defaultArgs)) as DynamicStructuredTool;

      await tool.func({ query: 'What is Kibana Security?', product: 'kibana' });

      expect(retrieveDocumentation).toHaveBeenCalledWith(
        expect.objectContaining({
          inferenceId: defaultInferenceEndpoints.ELSER,
        })
      );
    });

    it('includes citations', async () => {
      const tool = (await PRODUCT_DOCUMENTATION_TOOL.getTool(defaultArgs)) as DynamicStructuredTool;

      (retrieveDocumentation as jest.Mock).mockResolvedValue({
        documents: [
          {
            title: 'exampleTitle',
            url: 'exampleUrl',
            content: 'exampleContent',
            summarized: false,
          },
        ] as RetrieveDocumentationResultDoc[],
      });

      (contentReferencesStore.add as jest.Mock).mockImplementation(
        (creator: Parameters<ContentReferencesStore['add']>[0]) => {
          const reference = creator({ id: 'exampleContentReferenceId' });
          expect(reference.type).toEqual('ProductDocumentation');
          expect((reference as ProductDocumentationContentReference).title).toEqual('exampleTitle');
          expect((reference as ProductDocumentationContentReference).url).toEqual('exampleUrl');
          return reference;
        }
      );

      const result = await tool.func({ query: 'What is Kibana Security?', product: 'kibana' });

      expect(result).toEqual({
        content: {
          documents: [
            {
              citation: '{reference(exampleContentReferenceId)}',
              content: 'exampleContent',
              title: 'exampleTitle',
              url: 'exampleUrl',
              summarized: false,
            },
          ],
        },
      });
    });
  });
});
