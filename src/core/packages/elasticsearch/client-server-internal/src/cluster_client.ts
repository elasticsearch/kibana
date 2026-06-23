/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/logging';
import type { Headers, IAuthHeadersStorage } from '@kbn/core-http-server';
import {
  ensureRawRequest,
  filterHeaders,
  isKibanaRequest,
  isRealRequest,
} from '@kbn/core-http-router-server-internal';
import type {
  ScopeableRequest,
  UnauthorizedErrorHandler,
  ICustomClusterClient,
  IScopedClusterClient,
  ElasticsearchClientConfig,
  AsScopedOptions,
} from '@kbn/core-elasticsearch-server';
import { HTTPAuthorizationHeader, isUiamCredential } from '@kbn/core-security-server';
import type { InternalSecurityServiceSetup } from '@kbn/core-security-server-internal';
import { configureClient } from './configure_client';
import { ScopedClusterClient } from './scoped_cluster_client';
import {
  getDefaultHeaders,
  ES_SECONDARY_AUTH_HEADER,
  ES_SECONDARY_CLIENT_AUTH_HEADER,
  ES_CLIENT_AUTHENTICATION_HEADER,
} from './headers';
import {
  createInternalErrorHandler,
  type InternalUnauthorizedErrorHandler,
} from './retry_unauthorized';
import { createTransport, type OnRequestHandler } from './create_transport';
import type { AgentFactoryProvider } from './agent_manager';

export type { OnRequestHandler };

const noop = () => undefined;

interface CommonFactoryRoutingOpts {
  logger: Logger;
  request?: ScopeableRequest;
}

interface SpaceFactoryRoutingOpts extends CommonFactoryRoutingOpts {
  projectRouting: 'space';
  request: ScopeableRequest;
}

interface ExpressionFactoryRoutingOpts extends CommonFactoryRoutingOpts {
  projectRouting: 'expression';
  value: string;
}

/**
 * Union of routing options passed to {@link OnRequestHandlerFactory}.
 * The `'space'` variant carries the request so the factory can extract the space NPRE.
 * The `'expression'` variant carries a caller-supplied `project_routing` expression that is
 * injected verbatim.
 * @internal
 */
export type FactoryRoutingOpts =
  | CommonFactoryRoutingOpts
  | SpaceFactoryRoutingOpts
  | ExpressionFactoryRoutingOpts;
/**
 * A factory that produces an {@link OnRequestHandler}, which can be bound to a request context.
 * @internal
 */
export type OnRequestHandlerFactory = (opts: FactoryRoutingOpts) => OnRequestHandler;

/** @internal **/
export class ClusterClient implements ICustomClusterClient {
  private readonly config: ElasticsearchClientConfig;
  private readonly authHeaders?: IAuthHeadersStorage;
  private readonly security?: InternalSecurityServiceSetup;
  private readonly rootScopedClient: Client;
  private readonly kibanaVersion: string;
  private readonly logger: Logger;
  private readonly getUnauthorizedErrorHandler: () => UnauthorizedErrorHandler | undefined;
  private readonly getExecutionContext: () => string | undefined;
  private readonly onRequestHandlerFactory: OnRequestHandlerFactory;
  private isClosed = false;

  public readonly asInternalUser: Client;

  constructor({
    config,
    logger,
    type,
    authHeaders,
    security,
    getExecutionContext = noop,
    getUnauthorizedErrorHandler = noop,
    agentFactoryProvider,
    kibanaVersion,
    onRequestHandlerFactory,
  }: {
    config: ElasticsearchClientConfig;
    logger: Logger;
    type: string;
    authHeaders?: IAuthHeadersStorage;
    security?: InternalSecurityServiceSetup;
    getExecutionContext?: () => string | undefined;
    getUnauthorizedErrorHandler?: () => UnauthorizedErrorHandler | undefined;
    agentFactoryProvider: AgentFactoryProvider;
    kibanaVersion: string;
    onRequestHandlerFactory: OnRequestHandlerFactory;
  }) {
    this.config = config;
    this.authHeaders = authHeaders;
    this.security = security;
    this.kibanaVersion = kibanaVersion;
    this.logger = logger;
    this.getExecutionContext = getExecutionContext;
    this.getUnauthorizedErrorHandler = getUnauthorizedErrorHandler;
    this.onRequestHandlerFactory = onRequestHandlerFactory;

    const internalUserOnRequest = onRequestHandlerFactory({ logger });

    this.asInternalUser = configureClient(config, {
      logger,
      type,
      getExecutionContext,
      agentFactoryProvider,
      kibanaVersion,
      onRequest: internalUserOnRequest,
    });
    this.rootScopedClient = configureClient(config, {
      scoped: true,
      logger,
      type,
      getExecutionContext,
      agentFactoryProvider,
      kibanaVersion,
      onRequest: internalUserOnRequest,
    });
  }

  asScoped(request: ScopeableRequest, opts?: AsScopedOptions): IScopedClusterClient {
    const createScopedClient = () => {
      const scopedHeaders = this.getScopedHeaders(request);
      const factoryOpts: FactoryRoutingOpts = opts
        ? { ...opts, logger: this.logger, request }
        : { logger: this.logger, request };
      const transportClass = createTransport({
        scoped: true,
        getExecutionContext: this.getExecutionContext,
        getUnauthorizedErrorHandler: this.createInternalErrorHandlerAccessor(request),
        onRequest: this.onRequestHandlerFactory(factoryOpts),
        logger: this.logger,
      });

      // TODO: callers who pass { Transport: CustomTransport } to child() bypass our
      // onRequest handler and lose CPS routing. Consider intercepting child() to extend
      // any custom Transport with our onRequest so routing is always preserved.
      return this.rootScopedClient.child({
        headers: scopedHeaders,
        Transport: transportClass,
      });
    };

    const createSecondaryScopedClient = () => {
      const secondaryAuthHeaders = this.getSecondaryAuthHeaders(request);

      return this.asInternalUser.child({
        headers: secondaryAuthHeaders,
      });
    };

    return new ScopedClusterClient({
      asInternalUser: this.asInternalUser,
      asCurrentUserFactory: createScopedClient,
      asSecondaryAuthUserFactory: createSecondaryScopedClient,
    });
  }

  public async close() {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    await Promise.all([this.asInternalUser.close(), this.rootScopedClient.close()]);
  }

  private createInternalErrorHandlerAccessor = (
    request: ScopeableRequest
  ): (() => InternalUnauthorizedErrorHandler) | undefined => {
    if (!this.authHeaders) {
      return undefined;
    }
    return () =>
      createInternalErrorHandler({
        request,
        getHandler: this.getUnauthorizedErrorHandler,
        setAuthHeaders: this.authHeaders!.set,
      });
  };

  private getScopedHeaders(request: ScopeableRequest): Headers {
    let scopedHeaders: Headers;
    if (isRealRequest(request)) {
      const requestHeaders = ensureRawRequest(request).headers ?? {};
      const requestIdHeaders = isKibanaRequest(request) ? { 'x-opaque-id': request.id } : {};
      const authHeaders = this.authHeaders?.get(request) ?? {};

      scopedHeaders = {
        ...filterHeaders(requestHeaders, this.config.requestHeadersWhitelist),
        ...requestIdHeaders,
        ...authHeaders,
      };
    } else {
      scopedHeaders = filterHeaders(request?.headers ?? {}, this.config.requestHeadersWhitelist);

      // If we're creating scoped headers for a fake request, we need to check if we're in UIAM mode
      // and if the credentials in the headers are UIAM credentials. If so, we need to add the shared
      // secret to the headers, so that ES can forward it to UIAM service for validation.
      if (this.security?.uiam) {
        const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest({
          headers: scopedHeaders,
        });
        if (authorizationHeader && isUiamCredential(authorizationHeader)) {
          scopedHeaders = {
            ...scopedHeaders,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.security.uiam.sharedSecret,
          };
        }
      }
    }

    return {
      ...getDefaultHeaders(this.kibanaVersion),
      ...this.config.customHeaders,
      ...scopedHeaders,
    };
  }

  private getSecondaryAuthHeaders(request: ScopeableRequest): Headers {
    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest({
      headers: isRealRequest(request) ? this.authHeaders?.get(request) ?? {} : request.headers,
    });
    if (!authorizationHeader) {
      throw new Error(
        `asSecondaryAuthUser called from a client scoped to a request without 'authorization' header.`
      );
    }

    return {
      ...getDefaultHeaders(this.kibanaVersion),
      ...this.config.customHeaders,
      [ES_SECONDARY_AUTH_HEADER]: authorizationHeader.toString(),
      // If the credentials in the authorization header are UIAM credentials, we need to pass the
      // shared secret to ES as well, so that ES can forward it to UIAM service for validation.
      ...(this.security?.uiam && isUiamCredential(authorizationHeader)
        ? { [ES_SECONDARY_CLIENT_AUTH_HEADER]: this.security.uiam.sharedSecret }
        : {}),
    };
  }
}
