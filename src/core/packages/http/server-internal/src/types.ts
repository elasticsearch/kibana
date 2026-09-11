/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginOpaqueId } from '@kbn/core-base-common';
import type {
  IRouter,
  RequestHandlerContextBase,
  IContextProvider,
  IAuthHeadersStorage,
  IContextContainer,
  HttpServiceSetup,
  HttpServiceStart,
  RouterDeprecatedApiDetails,
  KibanaRequest,
} from '@kbn/core-http-server';
import type { CoreKibanaRequest } from '@kbn/core-http-router-server-internal';
import type { PostValidationMetadata } from '@kbn/core-http-server';
import type { GenerateOpenApiDocumentOptionsFilters } from '@kbn/router-to-openapispec';
import type { HttpServerSetup } from './http_server';
import type { ExternalUrlConfig } from './external_url';
import type { InternalStaticAssets } from './static_assets';
import type { RateLimiterConfig } from './rate_limiter';
import type { HttpConfig } from './http_config';

/** @internal */
export interface InternalHttpServicePreboot
  extends Pick<
    InternalHttpServiceSetup,
    | 'auth'
    | 'csp'
    | 'staticAssets'
    | 'basePath'
    | 'externalUrl'
    | 'registerStaticDir'
    | 'registerRouteHandlerContext'
    | 'server'
    | 'getServerInfo'
    | 'prototypeHardening'
  > {
  registerRoutes<
    DefaultRequestHandlerType extends RequestHandlerContextBase = RequestHandlerContextBase
  >(
    path: string,
    callback: (router: IRouter<DefaultRequestHandlerType>) => void
  ): void;
}

/** @internal */
export interface InternalHttpServiceSetup
  extends Omit<HttpServiceSetup, 'createRouter' | 'registerRouteHandlerContext' | 'staticAssets'> {
  auth: HttpServerSetup['auth'];
  server: HttpServerSetup['server'];
  staticAssets: InternalStaticAssets;
  externalUrl: ExternalUrlConfig;
  prototypeHardening: boolean;
  config: HttpConfig;
  createRouter: <Context extends RequestHandlerContextBase = RequestHandlerContextBase>(
    path: string,
    plugin?: PluginOpaqueId
  ) => IRouter<Context>;
  rateLimiter: RateLimiterConfig;
  registerOnPostValidation(
    cb: (req: CoreKibanaRequest, metadata: PostValidationMetadata) => void
  ): void;
  registerRouterAfterListening: (router: IRouter) => void;
  registerStaticDir: (path: string, dirPath: string) => void;
  authRequestHeaders: IAuthHeadersStorage;
  registerRouteHandlerContext: <
    Context extends RequestHandlerContextBase,
    ContextName extends keyof Omit<Context, 'resolve' | 'loadPluginContract'>
  >(
    pluginOpaqueId: PluginOpaqueId,
    contextName: ContextName,
    provider: IContextProvider<Context, ContextName>
  ) => IContextContainer;
  getRegisteredDeprecatedApis: () => RouterDeprecatedApiDetails[];
}

/** @internal */
export interface InternalHttpServiceStart extends Omit<HttpServiceStart, 'staticAssets'> {
  staticAssets: InternalStaticAssets;
  generateOas: (args: GenerateOasArgs) => Promise<object>;
  /** Indicates if the http server is listening on the configured port */
  isListening: () => boolean;
  setRedactedSessionIdGetter: (
    getter: (request: KibanaRequest) => Promise<string | undefined>
  ) => void;
}

/** @internal */
export interface GenerateOasArgs {
  pluginId?: string;
  baseUrl: string;
  filters?: GenerateOpenApiDocumentOptionsFilters;
}
