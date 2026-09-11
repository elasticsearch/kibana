/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { InferenceConnector } from './inference';
import { actionsConfigMock } from '@kbn/actions-plugin/server/actions_config.mock';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { Readable, Transform } from 'stream';
import {} from '@kbn/actions-plugin/server/types';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import type { InferenceInferenceResponse } from '@elastic/elasticsearch/lib/api/types';
import { TaskErrorSource, getErrorSource } from '@kbn/task-manager-plugin/server/task_running';
const OPENAI_CONNECTOR_ID = '123';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

describe('InferenceConnector', () => {
  let mockError: jest.Mock;
  const logger = loggingSystemMock.createLogger();
  const mockResponse: InferenceInferenceResponse = {
    completion: [
      {
        result:
          'Elastic is a company known for developing the Elasticsearch search and analytics engine, which allows for real-time data search, analysis, and visualization. Elasticsearch is part of the larger Elastic Stack (also known as the ELK Stack), which includes:\n\n1. **Elasticsearch**: A distributed, RESTful search and analytics engine capable of addressing a growing number of use cases. As the heart of the Elastic Stack, it centrally stores your data so you can discover the expected and uncover the unexpected.\n  \n2. **Logstash**: A server-side data processing pipeline that ingests data from multiple sources simultaneously, transforms it, and sends it to your preferred "stash," such as Elasticsearch.\n  \n3. **Kibana**: A data visualization dashboard for Elasticsearch. It allows you to search, view, and interact with data stored in Elasticsearch indices. You can perform advanced data analysis and visualize data in various charts, tables, and maps.\n\n4. **Beats**: Lightweight data shippers for different types of data. They send data from hundreds or thousands of machines and systems to Elasticsearch or Logstash.\n\nThe Elastic Stack is commonly used for various applications, such as log and event data analysis, full-text search, security analytics, business analytics, and more. It is employed across many industries to derive insights from large volumes of structured and unstructured data.\n\nElastic offers both open-source and paid versions of its software, providing a variety of features ranging from basic data ingestion and visualization to advanced machine learning and security capabilities.',
      },
    ],
  };

  describe('performApiUnifiedCompletion', () => {
    const mockEsClient = elasticsearchClientMock.createClusterClient().asScoped().asInternalUser;

    beforeEach(() => {
      mockEsClient.inference.inference.mockResolvedValue(mockResponse);
      mockError = jest.fn().mockImplementation(() => {
        throw new Error('API Error');
      });
    });

    const services = actionsMock.createServices();
    services.scopedClusterClient = mockEsClient;
    const connector = new InferenceConnector({
      configurationUtilities: actionsConfigMock.create(),
      connector: { id: '1', type: OPENAI_CONNECTOR_ID },
      config: {
        provider: 'openai',
        providerConfig: {
          url: 'https://api.openai.com/v1/chat/completions',
          model_id: DEFAULT_OPENAI_MODEL,
        },
        taskType: 'completion',
        inferenceId: 'test',
        taskTypeConfig: {},
      },
      secrets: { providerSecrets: { api_key: '123' } },
      logger,
      services,
    });

    it('uses the chat_completion task_type is supplied', async () => {
      mockEsClient.transport.request.mockResolvedValue({
        body: Readable.from([
          `data: {"id":"chatcmpl-AbLKRuRMZCAcMMQdl96KMTUgAfZNg","choices":[{"delta":{"content":" you"},"index":0}],"model":"gpt-4o-2024-08-06","object":"chat.completion.chunk"}\n\n`,
          `data: [DONE]\n\n`,
        ]),
        statusCode: 200,
      });

      const response = await connector.performApiUnifiedCompletion({
        body: { messages: [{ content: 'What is Elastic?', role: 'user' }] },
        telemetryMetadata: { pluginId: 'security_ai_assistant' },
      });
      expect(mockEsClient.transport.request).toHaveBeenCalledTimes(1);
      expect(mockEsClient.transport.request).toHaveBeenCalledWith(
        {
          body: {
            messages: [
              {
                content: 'What is Elastic?',
                role: 'user',
              },
            ],
            n: undefined,
          },
          method: 'POST',
          path: '_inference/chat_completion/test/_stream',
          querystring: { timeout: '180s' },
        },
        {
          asStream: true,
          meta: true,
          requestTimeout: 180_000,
          signal: undefined,
          compression: false,
          headers: {
            'X-Elastic-Product-Use-Case': 'security_ai_assistant',
          },
        }
      );
      expect(response.choices[0].message.content).toEqual(' you');
    });

    it('errors during API calls are properly handled', async () => {
      // @ts-ignore
      mockEsClient.transport.request = mockError;

      await expect(
        connector.performApiUnifiedCompletion({
          body: { messages: [{ content: 'What is Elastic?', role: 'user' }] },
        })
      ).rejects.toThrow('API Error');
    });

    it('marks 429 errors as user errors', async () => {
      // @ts-ignore
      mockEsClient.transport.request.mockResolvedValue({
        body: Readable.from([
          `{\"error\":{\"code\":\"insufficient_quota\",\"message\":\"Received a rate limit status code for request from inference entity id [openai-chat_completion-1p3u6iyzmes] status [429]. Error message: [You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.]\",\"type\":\"insufficient_quota\"}}`,
        ]),
        statusCode: 400,
      });

      try {
        await connector.performApiUnifiedCompletion({
          body: { messages: [{ content: 'What is Elastic?', role: 'user' }] },
        });
      } catch (e) {
        expect(getErrorSource(e)).toBe(TaskErrorSource.USER);
      }
    });
  });

  describe('performApiRerank', () => {
    const mockEsClient = elasticsearchClientMock.createClusterClient().asScoped().asInternalUser;
    const mockResponseRerank = {
      rerank: [
        {
          index: 2,
          relevance_score: 0.011597361,
          text: 'leia',
        },
        {
          index: 0,
          relevance_score: 0.006338922,
          text: 'luke',
        },
      ],
    };

    beforeEach(() => {
      mockEsClient.inference.inference.mockResolvedValue(mockResponseRerank);
      mockError = jest.fn().mockImplementation(() => {
        throw new Error('API Error');
      });
    });
    const services = actionsMock.createServices();
    services.scopedClusterClient = mockEsClient;
    it('the API call is successful with correct parameters', async () => {
      const connectorRerank = new InferenceConnector({
        configurationUtilities: actionsConfigMock.create(),
        connector: { id: '1', type: '123' },
        config: {
          provider: 'googlevertexai',
          providerConfig: {
            model_id: DEFAULT_OPENAI_MODEL,
          },
          taskType: 'rerank',
          inferenceId: 'test-rerank',
          taskTypeConfig: {},
        },
        secrets: { providerSecrets: { api_key: '123' } },
        logger,
        services,
      });
      const response = await connectorRerank.performApiRerank({
        input: ['apple', 'banana'],
        query: 'test',
      });
      expect(mockEsClient.inference.inference).toHaveBeenCalledWith(
        {
          inference_id: 'test-rerank',
          input: ['apple', 'banana'],
          query: 'test',
          task_type: 'rerank',
        },
        { asStream: false }
      );
      expect(response).toEqual(
        mockResponseRerank.rerank.map(({ relevance_score: score, ...rest }) => ({ ...rest, score }))
      );
    });
  });

  describe('performApiTextEmbedding', () => {
    const mockEsClient = elasticsearchClientMock.createClusterClient().asScoped().asInternalUser;

    beforeEach(() => {
      mockEsClient.inference.inference.mockResolvedValue(mockResponse);
      mockError = jest.fn().mockImplementation(() => {
        throw new Error('API Error');
      });
    });

    const services = actionsMock.createServices();
    services.scopedClusterClient = mockEsClient;
    const connectorTextEmbedding = new InferenceConnector({
      configurationUtilities: actionsConfigMock.create(),
      connector: { id: '1', type: OPENAI_CONNECTOR_ID },
      config: {
        providerConfig: {
          url: 'https://My-test-resource-123.openai.azure.com/openai/deployments/NEW-DEPLOYMENT-321/chat/completions?api-version=2023-05-15',
        },
        provider: 'elasticsearch',
        taskType: '',
        inferenceId: '',
        taskTypeConfig: {},
      },
      secrets: { providerSecrets: {} },
      logger: loggingSystemMock.createLogger(),
      services,
    });

    it('test the AzureAI API call is successful with correct parameters', async () => {
      const response = await connectorTextEmbedding.performApiTextEmbedding({
        input: 'Hello world',
        inputType: 'ingest',
      });
      expect(mockEsClient.inference.inference).toHaveBeenCalledWith(
        {
          inference_id: '',
          input: 'Hello world',
          task_settings: {
            input_type: 'ingest',
          },
          task_type: 'text_embedding',
        },
        { asStream: false }
      );
      expect(response).toEqual([]);
    });

    it('errors during API calls are properly handled', async () => {
      // @ts-ignore
      mockEsClient.inference.inference = mockError;

      await expect(
        connectorTextEmbedding.performApiTextEmbedding({
          input: 'Hello world',
          inputType: 'ingest',
        })
      ).rejects.toThrow('API Error');
    });
  });

  describe('performApiCompletionStream', () => {
    const mockEsClient = elasticsearchClientMock.createClusterClient().asScoped().asInternalUser;

    const mockStream = (
      dataToStream: string[] = [
        'data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"My"}}]}\ndata: {"object":"chat.completion.chunk","choices":[{"delta":{"content":" new"}}]}',
      ]
    ) => {
      const streamMock = createStreamMock();
      dataToStream.forEach((chunk) => {
        streamMock.write(chunk);
      });
      streamMock.complete();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockEsClient.inference.inference.mockResolvedValue(streamMock.transform as any);
    };

    beforeEach(() => {
      jest.clearAllMocks();
      // @ts-ignore
      mockStream();
    });

    const services = actionsMock.createServices();
    services.scopedClusterClient = mockEsClient;
    const connector = new InferenceConnector({
      configurationUtilities: actionsConfigMock.create(),
      connector: { id: '1', type: OPENAI_CONNECTOR_ID },
      config: {
        providerConfig: {
          url: 'https://My-test-resource-123.openai.azure.com/openai/deployments/NEW-DEPLOYMENT-321/chat/completions?api-version=2023-05-15',
        },
        provider: 'elasticsearch',
        taskType: 'completion',
        inferenceId: 'test',
        taskTypeConfig: {},
      },
      secrets: { providerSecrets: {} },
      logger: loggingSystemMock.createLogger(),
      services,
    });

    it('the API call is successful with correct request parameters', async () => {
      mockEsClient.transport.request.mockResolvedValue({
        body: Readable.from([`data: [DONE]\n\n`]),
        statusCode: 200,
      });

      await connector.performApiUnifiedCompletionStream({
        body: { messages: [{ content: 'Hello world', role: 'user' }] },
      });
      expect(mockEsClient.transport.request).toHaveBeenCalledTimes(1);
      expect(mockEsClient.transport.request).toHaveBeenCalledWith(
        {
          body: {
            messages: [
              {
                content: 'Hello world',
                role: 'user',
              },
            ],
            n: undefined,
          },
          method: 'POST',
          path: '_inference/chat_completion/test/_stream',
          querystring: { timeout: '180s' },
        },
        {
          asStream: true,
          meta: true,
          requestTimeout: 180_000,
          compression: false,
          headers: {
            'X-Elastic-Product-Use-Case': 'inference',
          },
        }
      );
    });

    it('signal is properly passed to streamApi', async () => {
      mockEsClient.transport.request.mockResolvedValue({
        body: Readable.from([`data: [DONE]\n\n`]),
        statusCode: 200,
      });

      const signal = jest.fn() as unknown as AbortSignal;
      await connector.performApiUnifiedCompletionStream({
        body: { messages: [{ content: 'Hello world', role: 'user' }] },
        signal,
      });

      expect(mockEsClient.transport.request).toHaveBeenCalledWith(
        {
          body: { messages: [{ content: 'Hello world', role: 'user' }], n: undefined },
          method: 'POST',
          path: '_inference/chat_completion/test/_stream',
          querystring: { timeout: '180s' },
        },
        {
          asStream: true,
          meta: true,
          requestTimeout: 180_000,
          signal,
          compression: false,
          headers: {
            'X-Elastic-Product-Use-Case': 'inference',
          },
        }
      );
    });

    it('errors during API calls are properly handled', async () => {
      // @ts-ignore
      mockEsClient.transport.request = mockError;

      await expect(
        connector.performApiUnifiedCompletionStream({
          body: { messages: [{ content: 'What is Elastic?', role: 'user' }] },
        })
      ).rejects.toThrow('API Error');
    });

    it('marks 429 errors as user errors', async () => {
      // @ts-ignore
      mockEsClient.transport.request.mockResolvedValue({
        body: Readable.from([
          `{\"error\":{\"code\":\"insufficient_quota\",\"message\":\"Received a rate limit status code for request from inference entity id [openai-chat_completion-1p3u6iyzmes] status [429]. Error message: [You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.]\",\"type\":\"insufficient_quota\"}}`,
        ]),
        statusCode: 400,
      });

      try {
        await connector.performApiUnifiedCompletionStream({
          body: { messages: [{ content: 'What is Elastic?', role: 'user' }] },
        });
      } catch (e) {
        expect(getErrorSource(e)).toBe(TaskErrorSource.USER);
      }
    });

    it('responds with a readable stream', async () => {
      const stream = Readable.from([
        `data: {"id":"chatcmpl-AbLKRuRMZCAcMMQdl96KMTUgAfZNg","choices":[{"delta":{"content":" you"},"index":0}],"model":"gpt-4o-2024-08-06","object":"chat.completion.chunk"}\n\n`,
        `data: [DONE]\n\n`,
      ]);
      mockEsClient.transport.request.mockResolvedValue({
        body: stream,
        statusCode: 200,
      });
      const response = await connector.performApiUnifiedCompletionStream({
        body: { messages: [{ content: 'What is Elastic?', role: 'user' }] },
      });
      expect(response instanceof Readable).toEqual(true);
    });
  });
});

function createStreamMock() {
  const transform: Transform = new Transform({});

  return {
    write: (data: string) => {
      transform.push(data);
    },
    fail: () => {
      transform.emit('error', new Error('Stream failed'));
      transform.end();
    },
    transform,
    complete: () => {
      transform.end();
    },
  };
}
