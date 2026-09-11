/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  IContextContainer,
  IContextProvider,
  IRouter,
  RequestHandlerContextBase,
  RouterDeprecatedApiDetails,
} from './router';
import type {
  AuthenticationHandler,
  OnPostAuthHandler,
  OnPreAuthHandler,
  OnPreResponseHandler,
  OnPreRoutingHandler,
} from './lifecycle';
import type { IBasePath } from './base_path';
import type { IStaticAssets } from './static_assets';
import type { ICspConfig } from './csp';
import type { GetAuthState, IsAuthenticated } from './auth_state';
import type { SessionStorageCookieOptions, SessionStorageFactory } from './session_storage';
import type { ApiVersion } from './versioning';
import type { KibanaRequest } from './router';

/**
 * @public
 */
export interface HttpAuth {
  /**
   * Gets authentication state for a request. Returned by `auth` interceptor.
   * {@link GetAuthState}
   */
  get: GetAuthState;
  /**
   * Returns authentication status for a request.
   * {@link IsAuthenticated}
   */
  isAuthenticated: IsAuthenticated;
}

/** @public */
export interface HttpSelfFetchQuery {
  [key: string]: string | number | boolean | string[] | number[] | boolean[] | undefined | null;
}

/** @public */
export interface HttpSelfFetchHeaders {
  [name: string]: string | string[] | undefined;
}

/** @public */
export interface HttpSelfFetchOptions<TRequestBody = unknown> {
  /** HTTP method. Defaults to `GET`. */
  method?: string;
  /** Query string parameters to append to the target path. */
  query?: HttpSelfFetchQuery;
  /** JSON-serializable or text request body. */
  body?: TRequestBody | string | null;
  /** Non-auth, non-Core-owned headers to send with the request. */
  headers?: HttpSelfFetchHeaders;
  /**
   * When `true`, forwards a Core-owned allowlist of safe headers from the incoming
   * request. Protected routing, auth, and Core-owned headers are never forwarded.
   */
  forwardRequestHeaders?: boolean;
  /** API version string used to populate the `elastic-api-version` header. */
  version?: ApiVersion;
  /** Abort signal for cancelling the outbound request. */
  signal?: AbortSignal | null;
  /** Request timeout in milliseconds. Defaults to a bounded Core value. */
  timeout?: number;
  /** Whether to include the incoming request base path and space prefix. Defaults to `true`. */
  prependBasePath?: boolean;
  /** When `true`, return response details instead of only the parsed response body. */
  asResponse?: boolean;
  /** When `true`, return the raw `Response` without parsing its body. Requires `asResponse: true`. */
  rawResponse?: boolean;
  /** Internal APIs are inaccessible unless explicitly requested. Defaults to `public`. */
  access?: 'public' | 'internal';
}

/** @public */
export interface HttpSelfResponse<TResponseBody = unknown, TRequestBody = unknown> {
  readonly fetchOptions: Readonly<HttpSelfFetchOptions<TRequestBody> & { path: string }>;
  readonly request: Readonly<Request>;
  readonly response: Readonly<Response>;
  readonly body?: TResponseBody;
}

/** @public */
export interface HttpSelfScopedClient {
  fetch<TResponseBody = unknown, TRequestBody = unknown>(
    path: string,
    options: HttpSelfFetchOptions<TRequestBody> & { asResponse: true }
  ): Promise<HttpSelfResponse<TResponseBody, TRequestBody>>;

  fetch<TResponseBody = unknown, TRequestBody = unknown>(
    path: string,
    options?: HttpSelfFetchOptions<TRequestBody>
  ): Promise<TResponseBody>;
}

/**
 * Creates scoped clients for calling Kibana's own HTTP routes.
 *
 * Self calls do not support mTLS. Calls fail when Kibana's current
 * `server.ssl.clientAuthentication` is `optional` or `required`. Core cannot detect
 * mTLS configured only on an external proxy or public URL, so callers must not use
 * this client with such a target.
 *
 * @public
 */
export interface HttpSelfService {
  asScoped(request: KibanaRequest): HttpSelfScopedClient;
}

/**
 * Kibana HTTP Service provides an abstraction to work with the HTTP stack at the `preboot` stage. This functionality
 * allows Kibana to serve user requests even before Kibana becomes fully operational. Only Core and `preboot` plugins
 * can define HTTP routes at this stage.
 *
 * @example
 * To handle an incoming request in your preboot plugin you should:
 * - Use `@kbn/config-schema` package to create a schema to validate the request `params`, `query`, and `body`. Every incoming request will be validated against the created schema. If validation failed, the request is rejected with `400` status and `Bad request` error without calling the route's handler.
 * To opt out of validating the request, specify `false`.
 * ```ts
 * import { schema, TypeOf } from '@kbn/config-schema';
 * const validate = {
 *   params: schema.object({
 *     id: schema.string(),
 *   }),
 * };
 * ```
 *
 * - Declare a function to respond to incoming request.
 * The function will receive `request` object containing request details: url, headers, matched route, as well as validated `params`, `query`, `body`.
 * And `response` object instructing HTTP server to create HTTP response with information sent back to the client as the response body, headers, and HTTP status.
 * Any exception raised during the handler call will generate `500 Server error` response and log error details for further investigation. See below for returning custom error responses.
 * ```ts
 * const handler = async (context: RequestHandlerContext, request: KibanaRequest, response: ResponseFactory) => {
 *   const data = await findObject(request.params.id);
 *   // creates a command to respond with 'not found' error
 *   if (!data) {
 *     return response.notFound();
 *   }
 *   // creates a command to send found data to the client and set response headers
 *   return response.ok({
 *     body: data,
 *     headers: { 'content-type': 'application/json' }
 *   });
 * }
 * ```
 * * - Acquire `preboot` {@link IRouter} instance and register route handler for GET request to 'path/{id}' path.
 * ```ts
 * import { schema, TypeOf } from '@kbn/config-schema';
 *
 * const validate = {
 *   params: schema.object({
 *     id: schema.string(),
 *   }),
 * };
 *
 * httpPreboot.registerRoutes('my-plugin', (router) => {
 *   router.get({ path: 'path/{id}', validate }, async (context, request, response) => {
 *     const data = await findObject(request.params.id);
 *     if (!data) {
 *       return response.notFound();
 *     }
 *     return response.ok({
 *       body: data,
 *       headers: { 'content-type': 'application/json' }
 *     });
 *   });
 * });
 * ```
 * @public
 */
export interface HttpServicePreboot<
  DefaultRequestHandlerType extends RequestHandlerContextBase = RequestHandlerContextBase
> {
  /**
   * Provides ability to acquire `preboot` {@link IRouter} instance for a particular top-level path and register handler
   * functions for any number of nested routes.
   *
   * @remarks
   * Each route can have only one handler function, which is executed when the route is matched.
   * See the {@link IRouter} documentation for more information.
   *
   * @example
   * ```ts
   * registerRoutes('my-plugin', (router) => {
   *   // handler is called when '/my-plugin/path' resource is requested with `GET` method
   *   router.get({ path: '/path', validate: false }, (context, req, res) => res.ok({ content: 'ok' }));
   * });
   * ```
   * @public
   */
  registerRoutes<ContextType extends DefaultRequestHandlerType = DefaultRequestHandlerType>(
    path: string,
    callback: (router: IRouter<ContextType>) => void
  ): void;

  /**
   * Access or manipulate the Kibana base path
   * See {@link IBasePath}.
   */
  basePath: IBasePath;

  /**
   * Provides common {@link HttpServerInfo | information} about the running preboot http server.
   */
  getServerInfo: () => HttpServerInfo;
}

/**
 * Kibana HTTP Service provides own abstraction for work with HTTP stack.
 * Plugins don't have direct access to `hapi` server and its primitives anymore. Moreover,
 * plugins shouldn't rely on the fact that HTTP Service uses one or another library under the hood.
 * This gives the platform flexibility to upgrade or changing our internal HTTP stack without breaking plugins.
 * If the HTTP Service lacks functionality you need, we are happy to discuss and support your needs.
 *
 * @example
 * To handle an incoming request in your plugin you should:
 * - Create a `Router` instance.
 * ```ts
 * const router = httpSetup.createRouter();
 * ```
 *
 * - Use `@kbn/config-schema` package to create a schema to validate the request `params`, `query`, and `body`. Every incoming request will be validated against the created schema. If validation failed, the request is rejected with `400` status and `Bad request` error without calling the route's handler.
 * To opt out of validating the request, specify `false`.
 * ```ts
 * import { schema, TypeOf } from '@kbn/config-schema';
 * const validate = {
 *   params: schema.object({
 *     id: schema.string(),
 *   }),
 * };
 * ```
 *
 * - Declare a function to respond to incoming request.
 * The function will receive `request` object containing request details: url, headers, matched route, as well as validated `params`, `query`, `body`.
 * And `response` object instructing HTTP server to create HTTP response with information sent back to the client as the response body, headers, and HTTP status.
 * Unlike, `hapi` route handler in the Legacy platform, any exception raised during the handler call will generate `500 Server error` response and log error details for further investigation. See below for returning custom error responses.
 * ```ts
 * const handler = async (context: RequestHandlerContext, request: KibanaRequest, response: ResponseFactory) => {
 *   const data = await findObject(request.params.id);
 *   // creates a command to respond with 'not found' error
 *   if (!data) return response.notFound();
 *   // creates a command to send found data to the client and set response headers
 *   return response.ok({
 *     body: data,
 *     headers: {
 *       'content-type': 'application/json'
 *     }
 *   });
 * }
 * ```
 *
 * - Register route handler for GET request to 'path/{id}' path
 * ```ts
 * import { schema, TypeOf } from '@kbn/config-schema';
 * const router = httpSetup.createRouter();
 *
 * const validate = {
 *   params: schema.object({
 *     id: schema.string(),
 *   }),
 * };
 *
 * router.get({
 *   path: 'path/{id}',
 *   validate
 * },
 * async (context, request, response) => {
 *   const data = await findObject(request.params.id);
 *   if (!data) return response.notFound();
 *   return response.ok({
 *     body: data,
 *     headers: {
 *       'content-type': 'application/json'
 *     }
 *   });
 * });
 * ```
 * @public
 */
export interface HttpServiceSetup<
  DefaultRequestHandlerType extends RequestHandlerContextBase = RequestHandlerContextBase
> {
  /**
   * Creates cookie based session storage factory {@link SessionStorageFactory}
   * @param cookieOptions {@link SessionStorageCookieOptions} - options to configure created cookie session storage.
   */
  createCookieSessionStorageFactory: <T extends object>(
    cookieOptions: SessionStorageCookieOptions<T>
  ) => Promise<SessionStorageFactory<T>>;

  /**
   * To define custom logic to perform for incoming requests before server performs a route lookup.
   *
   * @remarks
   * It's the only place when you can forward a request to another URL right on the server.
   * Can register any number of registerOnPreRouting, which are called in sequence
   * (from the first registered to the last). See {@link OnPreRoutingHandler}.
   *
   * @param handler {@link OnPreRoutingHandler} - function to call.
   *
   * @deprecated No remaining consumers in Kibana plugins. The Spaces plugin was the
   * main user (URL rewriting for `/s/<spaceId>/...`) and that logic now lives in Core's
   * `onRequest` handler. Use {@link HttpServiceSetup.registerOnPreAuth} for similar
   * interception needs that don't require URL rewriting before routing. This API may
   * be removed in a future release.
   */
  registerOnPreRouting: (handler: OnPreRoutingHandler) => void;

  /**
   * To define custom logic to perform for incoming requests before
   * the Auth interceptor performs a check that user has access to requested resources.
   *
   * @remarks
   * Can register any number of registerOnPreAuth, which are called in sequence
   * (from the first registered to the last). See {@link OnPreAuthHandler}.
   *
   * @param handler {@link OnPreRoutingHandler} - function to call.
   */
  registerOnPreAuth: (handler: OnPreAuthHandler) => void;

  /**
   * To define custom authentication and/or authorization mechanism for incoming requests.
   *
   * @remarks
   * A handler should return a state to associate with the incoming request.
   * The state can be retrieved later via http.auth.get(..)
   * Only one AuthenticationHandler can be registered. See {@link AuthenticationHandler}.
   *
   * @param handler {@link AuthenticationHandler} - function to perform authentication.
   */
  registerAuth: (handler: AuthenticationHandler) => void;

  /**
   * To define custom logic after Auth interceptor did make sure a user has access to the requested resource.
   *
   * @remarks
   * The auth state is available at stage via http.auth.get(..)
   * Can register any number of registerOnPostAuth, which are called in sequence
   * (from the first registered to the last). See {@link OnPostAuthHandler}.
   *
   * @param handler {@link OnPostAuthHandler} - function to call.
   */
  registerOnPostAuth: (handler: OnPostAuthHandler) => void;

  /**
   * To define custom logic to perform for the server response.
   *
   * @remarks
   * Doesn't provide the whole response object.
   * Supports extending response with custom headers.
   * See {@link OnPreResponseHandler}.
   *
   * @param handler {@link OnPreResponseHandler} - function to call.
   */
  registerOnPreResponse: (handler: OnPreResponseHandler) => void;

  /**
   * Access or manipulate the Kibana base path
   * See {@link IBasePath}.
   */
  basePath: IBasePath;

  /**
   * APIs for creating hrefs to static assets.
   * See {@link IStaticAssets}
   */
  staticAssets: IStaticAssets;

  /**
   * The CSP config used for Kibana.
   */
  csp: ICspConfig;

  /**
   * Provides ability to declare a handler function for a particular path and HTTP request method.
   *
   * @remarks
   * Each route can have only one handler function, which is executed when the route is matched.
   * See the {@link IRouter} documentation for more information.
   *
   * @example
   * ```ts
   * const router = createRouter();
   * // handler is called when '/path' resource is requested with `GET` method
   * router.get({ path: '/path', validate: false }, (context, req, res) => res.ok({ content: 'ok' }));
   * ```
   * @public
   */
  createRouter: <
    Context extends DefaultRequestHandlerType = DefaultRequestHandlerType
  >() => IRouter<Context>;

  /**
   * Register a context provider for a route handler.
   * @example
   * ```ts
   *  // my-plugin.ts
   *  interface MyRequestHandlerContext extends RequestHandlerContext {
   *    myApp: { search(id: string): Promise<Result> };
   *  }
   *  deps.http.registerRouteHandlerContext<MyRequestHandlerContext, 'myApp'>(
   *    'myApp',
   *    (context, req) => {
   *     async function search (id: string) {
   *       return await context.elasticsearch.client.asCurrentUser.find(id);
   *     }
   *     return { search };
   *    }
   *  );
   *
   * // my-route-handler.ts
   *  import type { MyRequestHandlerContext } from './my-plugin.ts';
   *  const router = createRouter<MyRequestHandlerContext>();
   *  router.get({ path: '/', validate: false }, async (context, req, res) => {
   *    const response = await context.myApp.search(...);
   *    return res.ok(response);
   *  });
   * ```
   * @public
   */
  registerRouteHandlerContext: <
    Context extends DefaultRequestHandlerType,
    ContextName extends keyof Omit<Context, 'resolve' | 'loadPluginContract'>
  >(
    contextName: ContextName,
    provider: IContextProvider<Context, ContextName>
  ) => IContextContainer;

  /**
   * Provides common {@link HttpServerInfo | information} about the running http server.
   */
  getServerInfo: () => HttpServerInfo;

  /**
   * Provides a list of all registered deprecated routes {{@link RouterDeprecatedApiDetails | information}}.
   * The routers will be evaluated everytime this function gets called to
   * accommodate for any late route registrations
   * @returns {RouterDeprecatedApiDetails[]}
   */
  getDeprecatedRoutes: () => RouterDeprecatedApiDetails[];
}

/** @public */
export interface HttpServiceStart {
  /**
   * Access or manipulate the Kibana base path
   * See {@link IBasePath}.
   */
  basePath: IBasePath;

  /**
   * APIs for creating hrefs to static assets.
   * See {@link IStaticAssets}
   */
  staticAssets: IStaticAssets;

  /**
   * Auth status.
   * See {@link HttpAuth}
   */
  auth: HttpAuth;

  /**
   * Provides common {@link HttpServerInfo | information} about the running http server.
   */
  getServerInfo: () => HttpServerInfo;

  /**
   * Make outbound HTTP calls to Kibana's own APIs on behalf of the current request user.
   */
  selfClient: HttpSelfService;
}

/**
 * Information about what hostname, port, and protocol the server process is
 * running on. Note that this may not match the URL that end-users access
 * Kibana at. For the public URL, see {@link BasePath.publicBaseUrl}.
 * @public
 */
export interface HttpServerInfo {
  /** The name of the Kibana server */
  name: string;
  /** The hostname of the server */
  hostname: string;
  /** The port the server is listening on */
  port: number;
  /** The protocol used by the server */
  protocol: 'http' | 'https' | 'socket';
}

/**
 * Defines an http protocol.
 * (Only supporting http1 for now)
 *
 * - http1: regroups all http/1.x protocols
 * - http2: h2
 */
export type HttpProtocol = 'http1' | 'http2';
