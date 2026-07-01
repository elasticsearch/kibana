/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginStartContract as ActionsPluginStart,
  PluginSetupContract as ActionsPluginSetup,
  ActionsClient,
} from '@kbn/actions-plugin/server';
import type { InMemoryConnector } from '@kbn/actions-plugin/server';
import type { InferenceTaskType } from '@elastic/elasticsearch/lib/api/types';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';

/**
 * Narrow interface for the actions plugin dependency used internally by the
 * inference plugin.
 *
 * - `getActionsClientWithRequest` produces the request-scoped client used for
 *   most operations.
 * - `inMemoryConnectors` is exposed because preconfigured connectors strip
 *   their `config` from API responses unless `exposeConfig: true` is set
 *   (see `actions/server/application/connector/methods/get_all/get_all.ts`).
 *   The inference plugin needs the full config server-side for capability
 *   detection (e.g. spotting Azure-hosted gpt-5 / o1 / o3 deployments that
 *   reject `temperature: 0`). Reading `inMemoryConnectors` directly bypasses
 *   the API stripping without forcing every preconfigured `.gen-ai` connector
 *   to opt into `exposeConfig`. It is optional so existing test mocks of
 *   `ActionsClientProvider` keep compiling.
 */
export interface ActionsClientProvider {
  getActionsClientWithRequest(request: KibanaRequest): Promise<PublicMethodsOf<ActionsClient>>;
  inMemoryConnectors?: InMemoryConnector[];
}
import type {
  BoundInferenceClient,
  BoundOptions,
  InferenceClient,
  InferenceConnector,
} from '@kbn/inference-common';
import type { InferenceChatModel, InferenceChatModelParams } from '@kbn/inference-langchain';
import type { InferenceCallbacks } from '@kbn/inference-common/src/chat_complete';
import type {
  AnonymizationPluginStart,
  AnonymizationPluginSetup,
} from '@kbn/anonymization-plugin/server';
import type { InferenceEndpoint } from './util/get_inference_endpoints';

/* eslint-disable @typescript-eslint/no-empty-interface*/

export interface InferenceSetupDependencies {
  actions: ActionsPluginSetup;
  anonymization?: AnonymizationPluginSetup;
}

export interface InferenceStartDependencies {
  actions: ActionsPluginStart;
  anonymization?: AnonymizationPluginStart;
}

/**
 * Setup contract of the inference plugin.
 */
export interface InferenceServerSetup {}

/**
 * Options to create an inference client using the {@link InferenceServerStart.getClient} API.
 */
export interface InferenceUnboundClientCreateOptions {
  /**
   * The request to scope the client to.
   */
  request: KibanaRequest;
  /**
   * Callbacks to be used by the client to report lifecycle events.
   */
  callbacks?: InferenceCallbacks;
}

/**
 * Options to create a bound inference client using the {@link InferenceServerStart.getClient} API.
 */
export interface InferenceBoundClientCreateOptions extends InferenceUnboundClientCreateOptions {
  /**
   * The parameters to bind the client to.
   */
  bindTo: BoundOptions;
}

/**
 * Options to create an inference client using the {@link InferenceServerStart.getClient} API.
 */
export type InferenceClientCreateOptions =
  | InferenceUnboundClientCreateOptions
  | InferenceBoundClientCreateOptions;

/**
 * Start contract of the inference plugin, exposing APIs to interact with LLMs.
 */
export interface InferenceServerStart {
  /**
   * Creates an {@link InferenceClient}, scoped to a request.
   *
   * @example
   * ```ts
   * const inferenceClient = myStartDeps.inference.getClient({ request });
   *
   * const chatResponse = inferenceClient.chatComplete({
   *   connectorId: 'my-connector-id',
   *   messages: [{ role: MessageRole.User, content: 'Do something' }],
   * });
   * ```
   *
   * It is also possible to bind a client to its configuration parameters, to avoid passing connectorId
   * to every call, for example. Defining the `bindTo` parameter will return a {@link BoundInferenceClient}
   *
   * @example
   * ```ts
   * const inferenceClient = myStartDeps.inference.getClient({
   *   request,
   *   bindTo: {
   *    connectorId: 'my-connector-id',
   *    functionCalling: 'simulated',
   *   }
   * });
   *
   * const chatResponse = inferenceClient.chatComplete({
   *   messages: [{ role: MessageRole.User, content: 'Do something' }],
   * });
   * ```
   */
  getClient: <T extends InferenceClientCreateOptions>(
    options: T
  ) => T extends InferenceBoundClientCreateOptions ? BoundInferenceClient : InferenceClient;

  /**
   * Creates a langchain {@link InferenceChatModel} that will be using the inference framework
   * under the hood.
   *
   * @example
   * ```ts
   * const chatModel = await myStartDeps.inference.getChatModel({
   *   request,
   *   connectorId: 'my-connector-id',
   *   chatModelOptions: {
   *    temperature: 0.3,
   *   }
   * });
   */
  getChatModel: (options: CreateChatModelOptions) => Promise<InferenceChatModel>;

  /**
   * Returns a list of all available inference connectors.
   *
   * @param request - The Kibana request to scope the operation to
   * @returns A promise that resolves to an array of inference connectors
   */
  getConnectorList: (request: KibanaRequest) => Promise<InferenceConnector[]>;

  /**
   * Retrieves the default inference connector configured for the system.
   *
   * @param request - The Kibana request to scope the operation to
   * @returns A promise that resolves to the default inference connector
   */
  getDefaultConnector: (request: KibanaRequest) => Promise<InferenceConnector | undefined>;

  /**
   * Retrieves a specific inference connector by its ID.
   *
   * @param id - The unique identifier of the connector to retrieve
   * @param request - The Kibana request to scope the operation to
   * @returns A promise that resolves to the requested inference connector
   * @throws Error if the connector with the specified ID does not exist
   */
  getConnectorById: (id: string, request: KibanaRequest) => Promise<InferenceConnector>;

  /**
   * Creates an {@link InferenceClient} using pre-scoped services instead of a
   * {@link KibanaRequest}. This is useful for background tasks (e.g. alerting rule
   * executors) that have scoped clients but no HTTP request context.
   *
   * Note: anonymization features are not available on clients created this way.
   *
   * @param actionsClient - A pre-scoped actions client
   * @param esClient - A pre-scoped Elasticsearch client
   */
  getClientWithoutRequest: (
    actionsClient: PublicMethodsOf<ActionsClient>,
    esClient: ElasticsearchClient
  ) => InferenceClient;

  /**
   * Retrieves a specific inference connector by its ID, using pre-scoped services
   * instead of a {@link KibanaRequest}. This is useful for background tasks (e.g.
   * alerting rule executors) that have scoped clients but no HTTP request.
   *
   * @param id - The unique identifier of the connector to retrieve
   * @param actionsClient - A pre-scoped actions client
   * @param esClient - A pre-scoped Elasticsearch client
   * @returns A promise that resolves to the requested inference connector
   * @throws Error if the connector with the specified ID does not exist
   */
  getConnectorByIdWithoutClientRequest: (
    id: string,
    actionsClient: PublicMethodsOf<ActionsClient>,
    esClient: ElasticsearchClient
  ) => Promise<InferenceConnector>;

  /**
   * Lists available Elasticsearch inference endpoints, optionally filtered by task type.
   *
   * @param taskType - Optional task type to filter by (e.g. 'chat_completion')
   * @returns A promise that resolves to an array of inference endpoints
   */
  getInferenceEndpoints: (taskType?: InferenceTaskType) => Promise<InferenceEndpoint[]>;

  /**
   * Retrieves a specific Elasticsearch inference endpoint by its ID.
   *
   * @param inferenceId - The unique identifier of the inference endpoint
   * @returns A promise that resolves to the inference endpoint metadata
   * @throws Error if the endpoint does not exist
   */
  getInferenceEndpointById: (inferenceId: string) => Promise<InferenceEndpoint>;

  /**
   * Installs the managed inference token usage dashboard (and its data view) into
   * the default space. Idempotent: existing assets are overwritten.
   *
   * Callers are responsible for gating this on whether token usage tracking is
   * enabled — the inference plugin no longer self-installs the dashboard.
   */
  installTokenUsageDashboard: () => Promise<void>;
}

/**
 * Options to create an inference chat model using the {@link InferenceServerStart.getChatModel} API.
 */
export interface CreateChatModelOptions {
  /**
   * The request to scope the client to.
   */
  request: KibanaRequest;
  /**
   * The id of the GenAI connector to use.
   */
  connectorId: string;
  /**
   * Callback to be used by the client to report lifecycle events.
   */
  callbacks?: InferenceCallbacks;
  /**
   * Additional parameters to be passed down to the model constructor.
   */
  chatModelOptions: Omit<InferenceChatModelParams, 'connector' | 'chatComplete' | 'logger'>;
}
