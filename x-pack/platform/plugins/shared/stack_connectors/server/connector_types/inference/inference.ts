/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { text as streamToString } from 'node:stream/consumers';
import type { ServiceParams } from '@kbn/actions-plugin/server';
import { SubActionConnector } from '@kbn/actions-plugin/server';
import { Stream } from 'openai/streaming';
import type { Readable } from 'stream';

import type { AxiosError } from 'axios';
import type {
  InferenceInferenceRequest,
  InferenceInferenceResponse,
} from '@elastic/elasticsearch/lib/api/types';
import type { ConnectorUsageCollector } from '@kbn/actions-plugin/server/usage';
import { isUserError } from '@kbn/task-manager-plugin/server/task_running';
import { trace } from '@opentelemetry/api';
import type { Observable } from 'rxjs';
import { filter, from, identity, map, mergeMap, tap } from 'rxjs';
import type OpenAI from 'openai';
import type { ChatCompletionChunk } from 'openai/resources';
import {
  SUB_ACTION,
  ChatCompleteParamsSchema,
  RerankParamsSchema,
  SparseEmbeddingParamsSchema,
  TextEmbeddingParamsSchema,
  UnifiedChatCompleteParamsSchema,
} from '@kbn/connector-schemas/inference';
import type {
  Config,
  Secrets,
  RerankParams,
  RerankResponse,
  SparseEmbeddingParams,
  SparseEmbeddingResponse,
  TextEmbeddingParams,
  TextEmbeddingResponse,
  UnifiedChatCompleteParams,
  UnifiedChatCompleteResponse,
  DashboardActionParams,
  DashboardActionResponse,
  ChatCompleteParams,
  ChatCompleteResponse,
} from '@kbn/connector-schemas/inference';
import { initDashboard } from '../lib/gen_ai/create_gen_ai_dashboard';
import {
  chunksIntoMessage,
  eventSourceStreamIntoObservable,
  detectandThrowUserError,
} from './helpers';

export class InferenceConnector extends SubActionConnector<Config, Secrets> {
  // Not using Axios
  protected getResponseErrorMessage(error: AxiosError): string {
    throw new Error(error.message || 'Method not implemented.');
  }

  private inferenceId;
  private taskType;

  constructor(params: ServiceParams<Config, Secrets>) {
    super(params);

    this.provider = this.config.provider;
    this.taskType = this.config.taskType;
    this.inferenceId = this.config.inferenceId;
    this.logger = this.logger;
    this.connectorID = this.connector.id;
    this.connectorTokenClient = params.services.connectorTokenClient;

    this.registerSubActions();
  }

  private registerSubActions() {
    // non-streaming unified completion task
    this.registerSubAction({
      name: SUB_ACTION.UNIFIED_COMPLETION,
      method: 'performApiUnifiedCompletion',
      schema: UnifiedChatCompleteParamsSchema,
    });

    // streaming unified completion task
    this.registerSubAction({
      name: SUB_ACTION.UNIFIED_COMPLETION_STREAM,
      method: 'performApiUnifiedCompletionStream',
      schema: UnifiedChatCompleteParamsSchema,
    });

    // streaming unified completion task for langchain
    this.registerSubAction({
      name: SUB_ACTION.UNIFIED_COMPLETION_ASYNC_ITERATOR,
      method: 'performApiUnifiedCompletionAsyncIterator',
      schema: UnifiedChatCompleteParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.RERANK,
      method: 'performApiRerank',
      schema: RerankParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.SPARSE_EMBEDDING,
      method: 'performApiSparseEmbedding',
      schema: SparseEmbeddingParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.TEXT_EMBEDDING,
      method: 'performApiTextEmbedding',
      schema: TextEmbeddingParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.COMPLETION,
      method: 'performApiCompletion',
      schema: ChatCompleteParamsSchema,
    });
  }

  /**
   * responsible for making a esClient inference method to perform chat completion task endpoint and returning the service response data
   * @param input the text on which you want to perform the inference task.
   * @signal abort signal
   */
  public async performApiUnifiedCompletion(
    params: UnifiedChatCompleteParams
  ): Promise<UnifiedChatCompleteResponse> {
    const res = await this.performApiUnifiedCompletionStream(params);

    const obs$ = from(eventSourceStreamIntoObservable(res as unknown as Readable)).pipe(
      filter((line) => !!line && line !== '[DONE]'),
      map((line) => {
        return JSON.parse(line) as
          | OpenAI.ChatCompletionChunk
          | { error: { message?: string; reason?: string } };
      }),
      tap((line) => {
        if ('error' in line) {
          throw new Error(line.error.message || line.error.reason || 'Unknown error');
        }
        if (
          'choices' in line &&
          line.choices.length &&
          line.choices[0].finish_reason === 'length'
        ) {
          throw new Error('createTokenLimitReachedError()');
        }
      }),
      filter((line): line is OpenAI.ChatCompletionChunk => {
        return 'object' in line && line.object === 'chat.completion.chunk';
      }),
      mergeMap((chunk): Observable<UnifiedChatCompleteResponse> => {
        const events: UnifiedChatCompleteResponse[] = [];
        events.push({
          choices: chunk.choices.map((c) => ({
            message: {
              tool_calls: c.delta.tool_calls?.map((t) => ({
                index: t.index,
                id: t.id,
                function: t.function,
                type: t.type,
              })),
              content: c.delta.content,
              refusal: c.delta.refusal,
              role: c.delta.role,
            },
            finish_reason: c.finish_reason,
            index: c.index,
          })),
          id: chunk.id,
          model: chunk.model,
          object: chunk.object,
          usage: chunk.usage,
        });
        return from(events);
      }),
      identity
    );

    return chunksIntoMessage(obs$);
  }

  /**
   * responsible for making a esClient inference method to perform chat completion task endpoint and returning the service response data
   * @param input the text on which you want to perform the inference task.
   * @signal abort signal
   */
  public async performApiUnifiedCompletionStream(params: UnifiedChatCompleteParams) {
    const parentSpan = trace.getActiveSpan();
    const body = { ...params.body, n: undefined }; // exclude n param for now, constant is used on the inference API side
    if (parentSpan?.isRecording()) {
      parentSpan.setAttribute('inference.raw_request', JSON.stringify(body));
    }
    const response = await this.esClient.transport.request<UnifiedChatCompleteResponse>(
      {
        method: 'POST',
        path: `_inference/chat_completion/${this.inferenceId}/_stream`,
        querystring: {
          timeout: '180s',
        },
        body,
      },
      {
        asStream: true,
        meta: true,
        requestTimeout: 180_000,
        signal: params.signal,
        // Compression must be disabled for streaming requests: the transport skips
        // decompression when asStream is true, so a compressed response would be
        // returned as raw bytes and fail to parse as SSE events.
        compression: false,
        headers: {
          // always send a value for EIS
          'X-Elastic-Product-Use-Case': params.telemetryMetadata?.pluginId ?? 'inference',
        },
      }
    );
    // errors should be thrown as it will not be a stream response
    if (response.statusCode >= 400) {
      const error = await streamToString(response.body as unknown as Readable);
      detectandThrowUserError(error);
      throw new Error(error);
    }

    return response.body;
  }

  /**
   * Streamed requests (langchain)
   * @param params - the request body
   * @returns {
   *  consumerStream: Stream<UnifiedChatCompleteResponse>; the result to be read/transformed on the server and sent to the client via Server Sent Events
   *  tokenCountStream: Stream<UnifiedChatCompleteResponse>; the result for token counting stream
   * }
   */
  public async performApiUnifiedCompletionAsyncIterator(
    params: UnifiedChatCompleteParams & { signal?: AbortSignal },
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<{
    consumerStream: Stream<ChatCompletionChunk>;
    tokenCountStream: Stream<ChatCompletionChunk>;
  }> {
    try {
      connectorUsageCollector.addRequestBodyBytes(undefined, params.body);
      const res = await this.performApiUnifiedCompletionStream(params);
      const controller = new AbortController();
      // splits the stream in two, one is used for the UI and other for token tracking

      const stream = Stream.fromSSEResponse<ChatCompletionChunk>(
        { body: res } as unknown as Response,
        controller
      );
      const teed = stream.tee();
      return { consumerStream: teed[0], tokenCountStream: teed[1] };
      // since we do not use the sub action connector request method, we need to do our own error handling
    } catch (e) {
      if (isUserError(e)) {
        // Bubble up user errors as-is
        throw e;
      }
      const errorMessage = this.getResponseErrorMessage(e);
      throw new Error(errorMessage);
    }
  }

  /**
   * responsible for making a esClient inference method to rerank task endpoint and returning the response data
   * @param input the text on which you want to perform the inference task. input can be a single string or an array.
   * @query the search query text
   * @signal abort signal
   */
  public async performApiRerank({
    input,
    query,
    signal,
  }: RerankParams & { signal?: AbortSignal }): Promise<RerankResponse> {
    const response = await this.performInferenceApi(
      {
        query,
        inference_id: this.inferenceId,
        input,
        task_type: 'rerank',
      },
      false,
      signal
    );
    return (response?.rerank ?? []).map(({ relevance_score: score, ...rest }) => ({
      score,
      ...rest,
    }));
  }

  /**
   * responsible for making a esClient inference method sparse embedding task endpoint and returning the response data
   * @param input the text on which you want to perform the inference task.
   * @signal abort signal
   */
  public async performApiSparseEmbedding({
    input,
    signal,
  }: SparseEmbeddingParams & { signal?: AbortSignal }): Promise<SparseEmbeddingResponse> {
    const response = await this.performInferenceApi(
      { inference_id: this.inferenceId, input, task_type: 'sparse_embedding' },
      false,
      signal
    );
    return response?.sparse_embedding ?? [];
  }

  /**
   * responsible for making a esClient inference method text embedding task endpoint and returning the response data
   * @param input the text on which you want to perform the inference task.
   * @signal abort signal
   */
  public async performApiTextEmbedding({
    input,
    inputType,
    signal,
  }: TextEmbeddingParams & { signal?: AbortSignal }): Promise<TextEmbeddingResponse> {
    const response = await this.performInferenceApi(
      {
        inference_id: this.inferenceId,
        input,
        task_type: 'text_embedding',
        task_settings: {
          input_type: inputType,
        },
      },
      false,
      signal
    );
    return response?.text_embedding ?? [];
  }

  /**
   * private generic method to avoid duplication esClient inference inference execute.
   * @param params InferenceInferenceRequest params.
   * @param asStream defines the type of the responce, regular or stream
   * @signal abort signal
   */
  private async performInferenceApi(
    params: InferenceInferenceRequest,
    asStream = false,
    signal?: AbortSignal
  ): Promise<InferenceInferenceResponse> {
    try {
      const response = await this.esClient?.inference.inference(params, { asStream, signal });
      this.logger.info(
        `Perform Inference endpoint for task type "${this.taskType}" and inference id ${this.inferenceId}`
      );
      // TODO: const usageMetadata = response?.data?.usageMetadata;
      return response;
    } catch (err) {
      this.logger.error(`error perform inference endpoint API: ${err}`);
      throw err;
    }
  }

  /**
   * responsible for making a esClient inference method to perform chat completetion task endpoint and returning the service response data
   * @param input the text on which you want to perform the inference task.
   * @signal abort signal
   */
  public async performApiCompletion({
    input,
    signal,
  }: ChatCompleteParams & { signal?: AbortSignal }): Promise<ChatCompleteResponse> {
    const response = await this.performInferenceApi(
      { inference_id: this.inferenceId, input, task_type: 'completion' },
      false,
      signal
    );
    return response?.completion ?? [];
  }

  /**
   *  retrieves a dashboard from the Kibana server and checks if the
   *  user has the necessary privileges to access it.
   * @param dashboardId The ID of the dashboard to retrieve.
   */
  public async getDashboard({
    dashboardId,
  }: DashboardActionParams): Promise<DashboardActionResponse> {
    const privilege = (await this.esClient.transport.request({
      path: '/_security/user/_has_privileges',
      method: 'POST',
      body: {
        index: [
          {
            names: ['.kibana-event-log-*'],
            allow_restricted_indices: true,
            privileges: ['read'],
          },
        ],
      },
    })) as { has_all_requested: boolean };

    if (!privilege?.has_all_requested) {
      return { available: false };
    }

    const response = await initDashboard({
      logger: this.logger,
      savedObjectsClient: this.savedObjectsClient,
      dashboardId,
      genAIProvider: 'Inference',
    });

    return { available: response.success };
  }
}
