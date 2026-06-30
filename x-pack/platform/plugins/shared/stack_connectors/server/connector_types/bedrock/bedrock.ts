/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ServiceParams } from '@kbn/actions-plugin/server';
import { SubActionConnector } from '@kbn/actions-plugin/server';
import { trace } from '@opentelemetry/api';
import aws from 'aws4';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { SmithyMessageDecoderStream } from '@smithy/eventstream-codec';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { AxiosError, Method } from 'axios';
import type { IncomingMessage } from 'http';
import { PassThrough, Readable } from 'stream';
import { getCustomAgents } from '@kbn/actions-plugin/server/lib/get_custom_agents';
import type { SubActionRequestParams } from '@kbn/actions-plugin/server/sub_action_framework/types';
import type { ConnectorUsageCollector } from '@kbn/actions-plugin/server/types';
import type { ConverseRequest, ConverseStreamRequest } from '@aws-sdk/client-bedrock-runtime';
import {
  SUB_ACTION,
  DEFAULT_TOKEN_LIMIT,
  DEFAULT_TIMEOUT_MS,
  RunActionParamsSchema,
  InvokeAIActionParamsSchema,
  InvokeAIRawActionParamsSchema,
  InvokeAIRawActionResponseSchema,
  StreamingResponseSchema,
  RunActionResponseSchema,
  RunApiLatestResponseSchema,
  BedrockClientSendParamsSchema,
  ConverseActionParamsSchema,
  ConverseStreamActionParamsSchema,
  DashboardActionParamsSchema,
  ConverseResponseSchema,
  claudeModelSupportsTemperature,
} from '@kbn/connector-schemas/bedrock';
import type {
  Config,
  Secrets,
  RunActionParams,
  RunActionResponse,
  InvokeAIActionParams,
  InvokeAIActionResponse,
  InvokeAIRawActionParams,
  InvokeAIRawActionResponse,
  RunApiLatestResponse,
  ConverseActionParams,
  ConverseActionResponse,
  ConverseParams,
  ConverseStreamParams,
  DashboardActionParams,
  DashboardActionResponse,
  ConverseResponse,
  StreamingResponse,
} from '@kbn/connector-schemas/bedrock';
import { initDashboard } from '../lib/gen_ai/create_gen_ai_dashboard';
import {
  extractRegionId,
  formatBedrockBody,
  parseContent,
  tee,
  usesDeprecatedArguments,
} from './utils';
interface SignedRequest {
  host: string;
  headers: Record<string, string>;
  body: string;
  path: string;
}

export class BedrockConnector extends SubActionConnector<Config, Secrets> {
  private url;
  private model;
  private bedrockClient;
  private region;

  constructor(params: ServiceParams<Config, Secrets>) {
    super(params);

    this.url = this.config.apiUrl;
    this.model = this.config.defaultModel;
    this.region = this.config.region ?? extractRegionId(this.config.apiUrl) ?? 'us-east-1';
    const { httpAgent, httpsAgent } = getCustomAgents(
      this.configurationUtilities,
      this.logger,
      this.url
    );
    const isHttps = this.url.toLowerCase().startsWith('https');
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      credentials: {
        accessKeyId: this.secrets.accessKey,
        secretAccessKey: this.secrets.secret,
      },
      requestHandler: new NodeHttpHandler(isHttps ? { httpsAgent } : { httpAgent }),
    });
    this.registerSubActions();
  }

  private registerSubActions() {
    this.registerSubAction({
      name: SUB_ACTION.RUN,
      method: 'runApi',
      schema: RunActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.DASHBOARD,
      method: 'getDashboard',
      schema: DashboardActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.TEST,
      method: 'runApi',
      schema: RunActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.INVOKE_AI,
      method: 'invokeAI',
      schema: InvokeAIActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.INVOKE_STREAM,
      method: 'invokeStream',
      schema: InvokeAIActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.INVOKE_AI_RAW,
      method: 'invokeAIRaw',
      schema: InvokeAIRawActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.BEDROCK_CLIENT_SEND,
      method: 'bedrockClientSend',
      schema: BedrockClientSendParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.CONVERSE,
      method: 'converse',
      schema: ConverseActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.CONVERSE_STREAM,
      method: 'converseStream',
      schema: ConverseStreamActionParamsSchema,
    });
  }

  protected getResponseErrorMessage(error: AxiosError<{ message?: string }>): string {
    if (!error.response?.status) {
      return `Unexpected API Error: ${error.code ?? ''} - ${error.message ?? 'Unknown error'}`;
    }
    if (
      error.response.status === 400 &&
      error.response?.data?.message === 'The requested operation is not recognized by the service.'
    ) {
      // Leave space in the string below, \n is not being rendered in the UI
      return `API Error: ${error.response.data.message}

The Kibana Connector in use may need to be reconfigured with an updated Amazon Bedrock endpoint, like \`bedrock-runtime\`.`;
    }
    if (error.response.status === 401) {
      return `Unauthorized API Error${
        error.response?.data?.message ? `: ${error.response.data.message}` : ''
      }`;
    }
    return `API Error: ${error.response?.statusText}${
      error.response?.data?.message ? ` - ${error.response.data.message}` : ''
    }`;
  }

  /**
   * provides the AWS signature to the external API endpoint
   * @param body The request body to be signed.
   * @param path The path of the request URL.
   */
  private signRequest(body: string, path: string, stream: boolean) {
    const { host } = new URL(this.url);
    return aws.sign(
      {
        host,
        region: this.region,
        headers: stream
          ? {
              accept: 'application/vnd.amazon.eventstream',
              'Content-Type': 'application/json',
              'x-amzn-bedrock-accept': '*/*',
            }
          : {
              'Content-Type': 'application/json',
              Accept: '*/*',
            },
        body,
        path,
        // Despite AWS docs, this value does not always get inferred. We need to always send it
        service: 'bedrock',
      },
      {
        secretAccessKey: this.secrets.secret,
        accessKeyId: this.secrets.accessKey,
      }
    ) as SignedRequest;
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
      genAIProvider: 'Bedrock',
    });

    return { available: response.success };
  }

  private async runApiRaw(
    params: SubActionRequestParams<RunActionResponse | InvokeAIRawActionResponse>,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<RunActionResponse | InvokeAIRawActionResponse> {
    const response = await this.request(params, connectorUsageCollector);
    return response.data;
  }

  private async runApiLatest(
    params: SubActionRequestParams<RunApiLatestResponse>,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<RunActionResponse> {
    const response = await this.request(params, connectorUsageCollector);
    // keeping the response the same as claude 2 for our APIs
    // adding the usage object for better token tracking
    return {
      completion: parseContent(response.data.content),
      stop_reason: response.data.stop_reason,
      usage: response.data.usage,
    };
  }

  /**
   * responsible for making a POST request to the external API endpoint and returning the response data
   * @param body The stringified request body to be sent in the POST request.
   * @param model Optional model to be used for the API request. If not provided, the default model from the connector will be used.
   * @param signal Optional signal to cancel the request.
   * @param timeout Optional timeout for the request.
   * @param raw Optional flag to indicate if the response should be returned as raw data.
   */
  public async runApi(
    { body, model: reqModel, signal, timeout, raw }: RunActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<RunActionResponse | InvokeAIRawActionResponse> {
    const parentSpan = trace.getActiveSpan();
    parentSpan?.setAttribute('bedrock.raw_request', body);
    // set model on per request basis
    // Application Inference Profile IDs need to be encoded when using the API
    // Decode first to ensure an existing encoded value is not double encoded
    const model = reqModel ?? this.model;
    if (!model) {
      throw new Error('No model specified. Please configure a default model.');
    }
    const currentModel = encodeURIComponent(decodeURIComponent(model));
    const path = `/model/${currentModel}/invoke`;
    const signed = this.signRequest(body, path, false);
    const requestArgs = {
      ...signed,
      url: `${this.url}${path}`,
      method: 'post' as Method,
      data: body,
      signal,
      // give up to 2 minutes for response
      timeout: timeout ?? DEFAULT_TIMEOUT_MS,
    };

    if (raw) {
      return this.runApiRaw(
        { ...requestArgs, responseSchema: InvokeAIRawActionResponseSchema },
        connectorUsageCollector
      );
    }
    // possible api received deprecated arguments, which will still work with the deprecated Claude 2 models
    if (usesDeprecatedArguments(body)) {
      return this.runApiRaw(
        { ...requestArgs, responseSchema: RunActionResponseSchema },
        connectorUsageCollector
      );
    }
    return this.runApiLatest(
      { ...requestArgs, responseSchema: RunApiLatestResponseSchema },
      connectorUsageCollector
    );
  }

  /**
   *  NOT INTENDED TO BE CALLED DIRECTLY
   *  call invokeStream instead
   *  responsible for making a POST request to a specified URL with a given request body.
   *  The response is then processed based on whether it is a streaming response or a regular response.
   * @param body The stringified request body to be sent in the POST request.
   * @param model Optional model to be used for the API request. If not provided, the default model from the connector will be used.
   */
  private async streamApi(
    { body, model: reqModel, signal, timeout }: RunActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<StreamingResponse> {
    const parentSpan = trace.getActiveSpan();
    parentSpan?.setAttribute('bedrock.raw_request', body);
    // set model on per request basis
    // Application Inference Profile IDs need to be encoded when using the API
    // Decode first to ensure an existing encoded value is not double encoded
    const model = reqModel ?? this.model;
    if (!model) {
      throw new Error('No model specified. Please configure a default model.');
    }
    const currentModel = encodeURIComponent(decodeURIComponent(model));
    const path = `/model/${currentModel}/invoke-with-response-stream`;
    const signed = this.signRequest(body, path, true);

    const response = await this.request(
      {
        ...signed,
        url: `${this.url}${path}`,
        method: 'post',
        responseSchema: StreamingResponseSchema,
        data: body,
        responseType: 'stream',
        signal,
        timeout,
      },
      connectorUsageCollector
    );

    return response.data.pipe(new PassThrough());
  }

  /**
   *  takes in an array of messages and a model as inputs. It calls the streamApi method to make a
   *  request to the Bedrock API with the formatted messages and model. It then returns a Transform stream
   *  that pipes the response from the API through the transformToString function,
   *  which parses the proprietary response into a string of the response text alone
   * @param messages An array of messages to be sent to the API
   * @param model Optional model to be used for the API request. If not provided, the default model from the connector will be used.
   */
  public async invokeStream(
    {
      messages,
      model,
      stopSequences,
      system,
      temperature,
      signal,
      timeout,
      tools,
      toolChoice,
    }: InvokeAIRawActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<IncomingMessage> {
    const actualModel = model ?? this.model;
    const effectiveTemperature = claudeModelSupportsTemperature(actualModel)
      ? temperature ?? 0
      : undefined;
    const res = (await this.streamApi(
      {
        body: JSON.stringify(
          formatBedrockBody({
            messages,
            stopSequences,
            system,
            temperature: effectiveTemperature,
            tools,
            toolChoice,
          })
        ),
        model,
        signal,
        timeout,
      },
      connectorUsageCollector
    )) as unknown as IncomingMessage;
    return res;
  }

  /**
   * Non-streamed security solution AI Assistant requests
   * Responsible for invoking the runApi method with the provided body.
   * It then formats the response into a string
   * @param messages An array of messages to be sent to the API
   * @param model Optional model to be used for the API request. If not provided, the default model from the connector will be used.
   * @returns an object with the response string as a property called message
   */
  public async invokeAI(
    {
      messages,
      model,
      stopSequences,
      system,
      temperature,
      maxTokens,
      signal,
      timeout,
      tools,
      toolChoice,
    }: InvokeAIActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<InvokeAIActionResponse> {
    const actualModel = model ?? this.model;
    const effectiveTemperature = claudeModelSupportsTemperature(actualModel)
      ? temperature ?? 0
      : undefined;
    const res = (await this.runApi(
      {
        body: JSON.stringify(
          formatBedrockBody({
            messages,
            stopSequences,
            system,
            temperature: effectiveTemperature,
            maxTokens,
            tools,
            toolChoice,
          })
        ),
        model,
        signal,
        timeout,
      },
      connectorUsageCollector
    )) as RunActionResponse;
    return { message: res.completion.trim(), usage: res?.usage };
  }

  public async invokeAIRaw(
    {
      messages,
      model,
      stopSequences,
      system,
      temperature,
      maxTokens = DEFAULT_TOKEN_LIMIT,
      signal,
      timeout,
      tools,
      toolChoice,
      anthropicVersion,
    }: InvokeAIRawActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<InvokeAIRawActionResponse> {
    const actualModel = model ?? this.model;
    const effectiveTemperature = claudeModelSupportsTemperature(actualModel)
      ? temperature
      : undefined;
    const res = await this.runApi(
      {
        body: JSON.stringify({
          messages,
          stop_sequences: stopSequences,
          system,
          ...(effectiveTemperature !== undefined ? { temperature: effectiveTemperature } : {}),
          max_tokens: maxTokens,
          tools,
          tool_choice: toolChoice,
          anthropic_version: anthropicVersion,
        }),
        model,
        signal,
        timeout,
        raw: true,
      },
      connectorUsageCollector
    );
    return res;
  }

  /**
   * Sends a request via the BedrockRuntimeClient to perform a conversation action.
   * @param params - The parameters for the conversation action.
   * @param params.signal - The signal to cancel the request.
   * @param params.command - The command class to be sent to the API. (ConverseCommand | ConverseStreamCommand)
   * @param connectorUsageCollector - The usage collector for the connector.
   * @returns A promise that resolves to the response of the conversation action.
   */
  public async bedrockClientSend(
    { signal, command }: ConverseActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<ConverseActionResponse> {
    if (command.input.modelId === 'preconfigured') {
      command.input.modelId = this.model;
    }
    connectorUsageCollector.addRequestBodyBytes(undefined, command);
    const res = await this.bedrockClient.send(command, {
      abortSignal: signal,
    });

    if ('stream' in res) {
      const resultStream = res.stream as SmithyMessageDecoderStream<unknown>;
      // splits the stream in two, [stream = consumer, tokenStream = token tracking]
      const [stream, tokenStream] = tee(resultStream);
      return { ...res, stream, tokenStream };
    }

    return res;
  }

  /**
   * Implements support for Bedrock's converse API which provides a simpler interface for single-turn conversations
   * Adapted from invokeAI and runApi to use the native Bedrock converse API endpoint
   * @param params Conversation parameters including messages, model, etc.
   * @param connectorUsageCollector Collector for usage metrics
   * @returns A promise that resolves to the conversation response
   */
  public async converse(
    {
      messages,
      model: reqModel,
      stopSequences,
      system,
      temperature,
      maxTokens,
      tools,
      toolChoice,
      signal,
      timeout = DEFAULT_TIMEOUT_MS,
    }: ConverseParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<ConverseResponse> {
    const modelId = reqModel ?? this.model;
    if (!modelId) {
      throw new Error('No model specified. Please configure a default model.');
    }
    const currentModel = encodeURIComponent(decodeURIComponent(modelId));
    const path = `/model/${currentModel}/converse`;

    const toolConfig =
      tools !== undefined || toolChoice !== undefined
        ? {
            tools,
            toolChoice,
          }
        : undefined;

    const request: ConverseRequest = {
      messages,
      inferenceConfig: {
        ...(claudeModelSupportsTemperature(modelId) ? { temperature } : {}),
        stopSequences,
        maxTokens,
      },
      ...(toolConfig ? { toolConfig } : {}),
      system,
      modelId,
    };
    const requestBody = JSON.stringify(request);

    const signed = this.signRequest(requestBody, path, true);
    const requestArgs = {
      ...signed,
      url: `${this.url}${path}`,
      method: 'post' as const,
      data: requestBody,
      signal,
      timeout,
      responseSchema: ConverseResponseSchema,
    };
    const response = await this.request(requestArgs, connectorUsageCollector);

    return response.data;
  }
  private async _converseStream({
    messages,
    model: reqModel,
    stopSequences,
    system,
    temperature,
    maxTokens,
    tools,
    toolChoice,
    signal,
    timeout = DEFAULT_TIMEOUT_MS,
    connectorUsageCollector,
  }: ConverseStreamParams): Promise<ConverseActionResponse> {
    const modelId = reqModel ?? this.model;
    if (!modelId) {
      throw new Error('No model specified. Please configure a default model.');
    }
    const currentModel = encodeURIComponent(decodeURIComponent(modelId));
    const path = `/model/${currentModel}/converse-stream`;

    const toolConfig =
      tools !== undefined || toolChoice !== undefined
        ? {
            tools,
            toolChoice,
          }
        : undefined;

    const request: ConverseStreamRequest = {
      messages,
      inferenceConfig: {
        ...(claudeModelSupportsTemperature(modelId) ? { temperature } : {}),
        stopSequences,
        maxTokens,
      },
      ...(toolConfig ? { toolConfig } : {}),
      system,
      modelId,
    };
    const requestBody = JSON.stringify(request);

    const signed = this.signRequest(requestBody, path, true);

    const parentSpan = trace.getActiveSpan();
    parentSpan?.setAttribute('bedrock.raw_request', requestBody);

    const response = await this.request(
      {
        ...signed,
        url: `${this.url}${path}`,
        method: 'post' as const,
        responseSchema: StreamingResponseSchema,
        data: requestBody,
        responseType: 'stream',
        signal,
        timeout,
      },
      connectorUsageCollector
    );

    if (response.data) {
      const resultStream = response.data as SmithyMessageDecoderStream<unknown>;
      // splits the stream in two, [stream = consumer, tokenStream = token tracking]
      const [stream, tokenStream] = tee(resultStream);
      return {
        ...response.data,
        stream: Readable.from(stream).pipe(new PassThrough()),
        tokenStream: Readable.from(tokenStream).pipe(new PassThrough()),
      };
    }

    return response;
  }

  /**
   * Implements support for Bedrock's converse-stream API which provides a streaming interface for conversations
   * Adapted from invokeStream and streamApi to use the native Bedrock converse-stream API endpoint
   * @param params Conversation parameters including messages, model, etc.
   * @param connectorUsageCollector Collector for usage metrics
   * @returns A streaming response as an IncomingMessage
   */
  public async converseStream(
    {
      messages,
      model: reqModel,
      stopSequences,
      system,
      temperature,
      maxTokens,
      tools,
      toolChoice,
      signal,
      timeout = DEFAULT_TIMEOUT_MS,
    }: ConverseStreamParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<ConverseActionResponse> {
    return await this._converseStream({
      messages,
      model: reqModel,
      stopSequences,
      system,
      temperature,
      maxTokens,
      tools,
      toolChoice,
      signal,
      timeout,
      connectorUsageCollector,
    });
  }
}
