/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Headers,
  HttpServiceSetup,
  IClusterClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import { deepFreeze } from '@kbn/std';
import type { PublicMethodsOf } from '@kbn/utility-types';

import type { AuthenticatedUser } from '../../../common';
import { KIBANA_AUTH_FULL_HEADER } from '../../../common/constants';
import type { AuthenticationInfo } from '../../elasticsearch';
import type { SessionValue } from '../../session_management';
import type { UiamServicePublic } from '../../uiam';
import { AuthenticationResult } from '../authentication_result';
import type { DeauthenticationResult } from '../deauthentication_result';
import type { Tokens } from '../tokens';

/**
 * Represents available provider options.
 */
export interface AuthenticationProviderOptions {
  name: string;
  getServerBaseURL: () => string;
  basePath: HttpServiceSetup['basePath'];
  getRequestOriginalURL: (
    request: KibanaRequest,
    additionalQueryStringParameters?: Array<[string, string]>
  ) => string;
  client: IClusterClient;
  logger: Logger;
  tokens: PublicMethodsOf<Tokens>;
  uiam?: UiamServicePublic;
  urls: {
    loggedOut: (request: KibanaRequest) => string;
  };
  isElasticCloudDeployment: () => boolean;
}

/**
 * Represents available provider specific options.
 */
export type AuthenticationProviderSpecificOptions = Record<string, unknown>;

/**
 * Name of the Elastic Cloud built-in SSO realm.
 */
export const ELASTIC_CLOUD_SSO_REALM_NAME = 'cloud-saml-kibana';

/**
 * Names of the user properties that aren't available in the "minimal" authentication mode, and should throw an error
 * when accessed.
 */
const USER_PROPERTIES_NOT_AVAILABLE_IN_MIN_AUTHC_MODE = new Set([
  'elastic_cloud_user',
  'authentication_realm',
  'lookup_realm',
  'authentication_type',
]);

/**
 * Base class that all authentication providers should extend.
 */
export abstract class BaseAuthenticationProvider<TState = unknown> {
  /**
   * Type of the provider.
   */
  static readonly type: string;

  /**
   * Type of the provider. We use `this.constructor` trick to get access to the static `type` field
   * of the specific `BaseAuthenticationProvider` subclass.
   */
  public readonly type = (this.constructor as any).type as string;

  /**
   * Logger instance bound to a specific provider context.
   */
  protected readonly logger: Logger;

  /**
   * Instantiates AuthenticationProvider.
   * @param options Provider options object.
   */
  constructor(protected readonly options: Readonly<AuthenticationProviderOptions>) {
    this.logger = options.logger;
  }

  /**
   * Determines whether intermediate session should be invalidated after a successful login.
   * Some providers need to have their state checked to make sure all pending login attempts have
   * completed before invalidating the session. This is particularly important for the SAML Provider,
   * which may have pending login requests pending
   * @param [state] Optional state object associated with the provider.
   * @returns `true` if the intermediate session should be invalidated, `false` otherwise.
   */
  shouldInvalidateIntermediateSessionAfterLogin(state?: unknown) {
    return true;
  }

  /**
   * Performs initial login request and creates user session. Provider isn't required to implement
   * this method if it doesn't support initial login request.
   * @param request Request instance.
   * @param loginAttempt Login attempt associated with the provider.
   * @param [session] Optional session object associated with the provider.
   */
  async login(
    request: KibanaRequest,
    loginAttempt: unknown,
    session?: SessionValue<TState> | null
  ): Promise<AuthenticationResult> {
    return AuthenticationResult.notHandled();
  }

  /**
   * Performs request authentication based on the session created during login or other information
   * associated with the request (e.g. `Authorization` HTTP header).
   * @param request Request instance.
   * @param [session] Optional session object associated with the provider.
   */
  abstract authenticate(
    request: KibanaRequest,
    session: SessionValue<TState> | null
  ): Promise<AuthenticationResult>;

  /**
   * Invalidates user session associated with the request.
   * @param request Request instance.
   * @param [session] Optional session object associated with the provider.
   */
  abstract logout(
    request: KibanaRequest,
    session?: SessionValue<TState> | null
  ): Promise<DeauthenticationResult>;

  /**
   * Returns HTTP authentication scheme that provider uses within `Authorization` HTTP header that
   * it attaches to all successfully authenticated requests to Elasticsearch or `null` in case
   * provider doesn't attach any additional `Authorization` HTTP headers.
   */
  abstract getHTTPAuthenticationScheme(): string | null;

  /**
   * Queries Elasticsearch `_authenticate` endpoint to authenticate request and retrieve the user
   * information of authenticated user.
   * @param request Request instance.
   * @param [authHeaders] Optional `Headers` dictionary to send with the request.
   * @param [session] Optional session object associated with the provider.
   */
  protected async getUser(
    request: KibanaRequest,
    authHeaders?: Headers,
    session?: SessionValue<TState>
  ) {
    // For "minimal" authentication, we don't need to call the `_authenticate` endpoint and can just
    // return a static user proxy. The caveat here is that we don't validate credentials, but it
    // will be done by the Elasticsearch itself.
    // We also want to skip minimal authentication for requests that explicitly ask for the full authentication
    // information by setting `kbn-auth-full` header to `true` (e.g., during re-authentication).
    if (
      session &&
      session.username &&
      request.route.options.security?.authc?.enabled === 'minimal' &&
      request.headers[KIBANA_AUTH_FULL_HEADER] !== 'true'
    ) {
      this.logger.debug(`Performing "minimal" authentication for request ${request.url.pathname}.`);
      return this.getMinAuthenticationUserProxy(session);
    }

    return this.authenticationInfoToAuthenticatedUser(
      // @ts-expect-error Metadata is defined as Record<string, any>
      await this.options.client
        // Use original request if no additional auth headers are provided, otherwise fall back to
        // the "fake" request with combined headers.
        .asScoped(authHeaders ? { headers: { ...request.headers, ...authHeaders } } : request)
        .asCurrentUser.security.authenticate()
    );
  }

  /**
   * Converts Elasticsearch Authentication result to a Kibana authenticated user.
   * @param authenticationInfo Result returned from the `_authenticate` operation.
   */
  protected authenticationInfoToAuthenticatedUser(authenticationInfo: AuthenticationInfo) {
    return deepFreeze({
      ...authenticationInfo,
      authentication_provider: { type: this.type, name: this.options.name },
      elastic_cloud_user:
        this.options.isElasticCloudDeployment() &&
        authenticationInfo.authentication_realm.type === 'saml' &&
        authenticationInfo.authentication_realm.name === ELASTIC_CLOUD_SSO_REALM_NAME,
      http_authentication_scheme: null,
    } as AuthenticatedUser);
  }

  private getMinAuthenticationUserProxy(session: SessionValue) {
    // We can retrieve only a portion of user properties from the session, and these are relatively safe to use without
    // re-validation. However, `elastic_cloud_user`, `authentication_realm`, `lookup_realm`, `authentication_type`,
    // and `roles` are not available in this mode, accessing them should throw an error. Currently, audit logs rely on
    // `roles` property being present on the user object. We should probably refactor audit logs to avoid using `roles`
    // property for minimally authenticated users and then remove this property altogether and throw for its access.
    const minUserStub: Partial<AuthenticatedUser> = {
      enabled: true,
      username: session.username,
      authentication_provider: session.provider,
      profile_uid: session.userProfileId,
      // TODO: Currently audit logs rely on `roles` property being present on the user object.
      // We should probably refactor audit logs to avoid using `roles` property for minimally
      // authenticated users and then remove this property altogether and throw for its access.
      roles: [],
      // Minimally-authenticated users are session-cookie requests, not HTTP-credential requests.
      http_authentication_scheme: null,
    };

    return deepFreeze(
      new Proxy(minUserStub as AuthenticatedUser, {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);
          if (USER_PROPERTIES_NOT_AVAILABLE_IN_MIN_AUTHC_MODE.has(prop.toString())) {
            throw new Error(
              `Property "${String(prop)}" is not available for minimally authenticated users.`
            );
          }
          return value;
        },
      })
    );
  }
}
