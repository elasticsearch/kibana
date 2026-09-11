/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { readFileSync } from 'fs';
import { chunk, partition } from 'lodash';
import { Agent } from 'undici';

import type { Logger } from '@kbn/core/server';
import {
  deriveInternalCallerAttestation,
  HTTPAuthorizationHeader,
  UIAM_INTERNAL_CALLER_ATTESTATION_HEADER,
} from '@kbn/core-security-server';
import type {
  CreateUiamOAuthClientParams,
  ServiceAccount,
  ServiceAccountAssumableBy,
  ServiceAccountRoleAssignments,
  UiamOAuthClientLogo,
  UiamOAuthClientResponse,
  UiamOAuthClientType,
  UiamOAuthConnectionResponse,
  UiamResolvedUsersResponse,
  UpdateUiamOAuthClientParams,
  UpdateUiamOAuthConnectionParams,
} from '@kbn/core-security-server';
import type {
  ClientAuthentication,
  GrantUiamAPIKeyParams,
} from '@kbn/security-plugin-types-server';

import { ES_CLIENT_AUTHENTICATION_HEADER } from '../../common/constants';
import type { UiamConfigType } from '../config';
import { getDetailedErrorMessage } from '../errors';
import { securityTelemetry } from '../otel/instrumentation';

/**
 * Represents the request body for creating a service account via UIAM.
 */
interface CreateServiceAccountRequestBody {
  /** Organization that owns the service account. */
  organization_id: string;
  /** A descriptive name for the service account. */
  name: string;
  /** Roles granted to the service account, referenced by name. */
  role_assignments: ServiceAccountRoleAssignments;
  /** Principals allowed to exchange the service account's credentials for a token. */
  assumable_by: ServiceAccountAssumableBy[];
}

/**
 * Represents the request body for granting an API key via UIAM.
 */
export interface GrantUiamApiKeyRequestBody {
  /** A descriptive name for the API key. */
  description: string;
  /** Indicates whether this is an internal API key. */
  internal: boolean;
  /** Optional expiration time for the API key (e.g., '1d', '7d'). */
  expiration?: string;
  /** Role assignments that define access and resource limits for the API key. */
  role_assignments: {
    /** Limits defining the scope of the API key. */
    limit: {
      /** Access types granted to the API key (e.g., 'application'). */
      access: string[];
      /** Resource types the API key can access (e.g., 'project'). */
      resource: string[];
    };
  };
}

/**
 * Options that control how a request is authenticated to UIAM.
 */
export interface UiamClientAuthenticationOptions {
  /**
   * Whether to present Kibana's shared secret header alongside the caller credential. UIAM
   * authenticates the credential and Kibana independently, and requires the two to agree: an
   * internal API key or a session token must arrive with the shared secret, while an external
   * (organization) API key must arrive without it, so that internal credentials that leak cannot
   * be replayed through customer-facing code paths. Presenting the wrong combination fails
   * authentication. The mTLS client certificate is always presented when configured, regardless
   * of this option.
   *
   * Defaults to `true`, which is correct for everything except an external API key.
   */
  includeClientAuthentication?: boolean;
}

/**
 * Represents the response from granting an API key via UIAM.
 */
export interface GrantUiamApiKeyResponse {
  /** The unique identifier for the API key. */
  id: string;
  /** The API key value (encoded). */
  key: string;
  /** A descriptive name/description for the API key. */
  description: string;
}

/**
 * Represents a single key entry in the convert API keys request body.
 */
export interface ConvertUiamApiKeyRequestEntry {
  type: 'elasticsearch';
  key: string;
  endpoint: string;
}

/**
 * Represents the request body for converting API keys via UIAM.
 */
export interface ConvertUiamApiKeysRequestBody {
  keys: ConvertUiamApiKeyRequestEntry[];
}

/**
 * Represents the response from converting API keys via UIAM, containing per-key results.
 */
export interface ConvertUiamApiKeysResponse {
  results: Array<
    | {
        status: 'success';
        id: string;
        key: string;
        description: string;
        organization_id: string;
        internal: boolean;
        role_assignments: Record<string, unknown>;
        creation_date: string;
        expiration_date: string | null;
      }
    | { status: 'failed'; code: string; message: string; resource: string | null; type: string }
  >;
}

export type OAuthClientLogo = UiamOAuthClientLogo;
export type OAuthClientType = UiamOAuthClientType;
export type OAuthClientResponse = UiamOAuthClientResponse;
export type OAuthConnectionResponse = UiamOAuthConnectionResponse;
export type CreateOAuthClientRequestBody = CreateUiamOAuthClientParams;
export type PatchOAuthClientRequestBody = UpdateUiamOAuthClientParams;
export type PatchOAuthConnectionRequestBody = UpdateUiamOAuthConnectionParams;
export type ResolvedUsersResponse = UiamResolvedUsersResponse;

/**
 * Maximum number of user IDs in a single request (aligned with UIAM limit).
 */
const RESOLVE_USERS_BATCH_SIZE = 100;

/**
 * Shape of the `error` object inside a UIAM non-2xx response payload, mirroring
 * UIAM's `ErrorDetails` schema. All fields are optional per the UIAM contract.
 * @see https://github.com/elastic/uiam/blob/main/api/openapi.yaml
 */
interface UiamErrorDetails {
  code?: string;
  message?: string;
  resource?: string;
  type?: string;
}

/**
 * Telemetry `oauthErrorType` for an OAuth token exchange that Kibana itself rejected
 * as opposed to a failure reported by UIAM.
 */
const OAUTH_AUDIENCE_MISMATCH_ERROR_TYPE = 'KIBANA.AUDIENCE_MISMATCH';

/**
 * Telemetry `oauthErrorType` for an OAuth token exchange failure that carries no
 * recognizable classification.
 */
const OAUTH_UNKNOWN_ERROR_TYPE = 'UNKNOWN';

/**
 * Response containing a list of OAuth clients.
 */
export interface OAuthClientsResponse {
  clients: OAuthClientResponse[];
}

/**
 * Response containing a list of OAuth connections.
 */
export interface OAuthConnectionsResponse {
  connections: OAuthConnectionResponse[];
}

/**
 * The service that integrates with UIAM for user authentication and session management.
 */
export interface UiamServicePublic {
  /**
   * Creates a set of authentication headers used to authenticate user with UIAM service.
   * @param accessToken UIAM session access token.
   */
  getAuthenticationHeaders(accessToken: string): Record<string, string>;

  /**
   * Returns the header(s) a trusted loopback caller stamps on a real HTTP request that carries an
   * internal UIAM (`essu_`) credential, so the ES cluster client re-attaches the shared secret on
   * its behalf. Carries a non-reversible HMAC of the shared secret (never the secret itself), bound
   * to `credential` so it authorizes that credential only.
   */
  getInternalCallerAttestationHeaders(credential: HTTPAuthorizationHeader): Record<string, string>;

  /**
   * Returns the Elasticsearch client authentication information with the shared secret value. This is to be used with
   * `client_authentication` option in Elasticsearch client.
   */
  getClientAuthentication(): ClientAuthentication;

  /**
   * Refreshes the UIAM user session and returns new access and refresh session tokens.
   * @param refreshToken UIAM session refresh token.
   */
  refreshSessionTokens(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }>;

  /**
   * Invalidates the UIAM user session represented by the provided access and refresh tokens.
   * @param accessToken UIAM session access token.
   * @param refreshToken UIAM session refresh token.
   */
  invalidateSessionTokens(accessToken: string, refreshToken: string): Promise<void>;

  /**
   * Grants an API key using the UIAM service.
   * @param authorization The HTTP authorization header containing scheme and credentials.
   * @param params The parameters for creating the API key (name and optional expiration).
   * @param options The options that control how the grant request itself is authenticated to UIAM.
   * @returns A promise that resolves to an object containing the API key details.
   */
  grantApiKey(
    authorization: HTTPAuthorizationHeader,
    params: GrantUiamAPIKeyParams,
    options?: UiamClientAuthenticationOptions
  ): Promise<GrantUiamApiKeyResponse>;

  /**
   * Exchanges an OAuth access token for an ephemeral UIAM token. Validates that the audience
   * returned by UIAM matches the expected Kibana server audience and throws if there is a mismatch.
   * @param accessToken The OAuth access token.
   * @returns The ephemeral token.
   */
  exchangeOAuthToken(accessToken: string): Promise<string>;

  /**
   * Revokes a UIAM API key by its ID.
   * @param apiKeyId The ID of the API key to revoke.
   * @param apiKey The API key to revoke; will be used for authentication on this request.
   */
  revokeApiKey(apiKeyId: string, apiKey: string): Promise<void>;

  /**
   * Converts Elasticsearch API keys into UIAM API keys. The Elasticsearch endpoint is injected
   * automatically from the cloud.id configuration.
   * @param keys The base64-encoded Elasticsearch API key values to convert.
   * @returns A promise that resolves to a response containing per-key success/failure results.
   */
  convertApiKeys(keys: string[]): Promise<ConvertUiamApiKeysResponse>;

  /**
   * Creates a service account via the UIAM service.
   *
   * Called with the caller's own credential, so UIAM downscopes the new account
   * to a subset of that caller's privileges.
   *
   * @param authorization The caller's UIAM authorization header.
   * @param body The request body for creating the service account.
   * @param options Whether to include Kibana client authentication.
   */
  createServiceAccount(
    authorization: HTTPAuthorizationHeader,
    body: CreateServiceAccountRequestBody,
    options?: UiamClientAuthenticationOptions
  ): Promise<ServiceAccount>;

  /**
   * Exchanges a service account ID for an ephemeral access token via the UIAM service.
   *
   * UIAM authorizes the exchange against the service account's `assumable_by` policy.
   *
   * @param serviceAccountId The ID of the service account to exchange a token for.
   */
  exchangeServiceAccountToken(serviceAccountId: string): Promise<{ token: string }>;

  /**
   * Creates an OAuth client via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param body The request body for creating the OAuth client.
   */
  createOAuthClient(
    accessToken: string,
    body: CreateOAuthClientRequestBody
  ): Promise<OAuthClientResponse>;

  /**
   * Lists OAuth clients via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId Optional client ID filter.
   * @param projectId Optional project ID filter.
   */
  listOAuthClients(
    accessToken: string,
    clientId?: string,
    projectId?: string
  ): Promise<OAuthClientsResponse>;

  /**
   * Updates an OAuth client's metadata via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId The ID of the client to update.
   * @param body The request body for updating the OAuth client.
   */
  updateOAuthClient(
    accessToken: string,
    clientId: string,
    body: PatchOAuthClientRequestBody
  ): Promise<OAuthClientResponse>;

  /**
   * Revokes an OAuth client via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId The ID of the client to revoke.
   * @param reason Optional reason for revocation.
   */
  revokeOAuthClient(
    accessToken: string,
    clientId: string,
    reason?: string
  ): Promise<OAuthClientResponse>;

  /**
   * Permanently deletes an OAuth client, and all of its connections, via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId The ID of the client to delete.
   */
  deleteOAuthClient(accessToken: string, clientId: string): Promise<void>;

  /**
   * Lists OAuth connections via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId Optional client ID filter.
   * @param connectionId Optional connection ID filter.
   * @param projectId Optional project ID filter.
   */
  listOAuthConnections(
    accessToken: string,
    clientId?: string,
    connectionId?: string,
    projectId?: string
  ): Promise<OAuthConnectionsResponse>;

  /**
   * Updates an OAuth connection's display name via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId The ID of the client owning the connection.
   * @param connectionId The ID of the connection to update.
   * @param body The request body for updating the OAuth connection.
   */
  updateOAuthConnection(
    accessToken: string,
    clientId: string,
    connectionId: string,
    body: PatchOAuthConnectionRequestBody
  ): Promise<OAuthConnectionResponse>;

  /**
   * Revokes an OAuth connection via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId The ID of the client owning the connection.
   * @param connectionId The ID of the connection to revoke.
   * @param reason Optional reason for revocation.
   */
  revokeOAuthConnection(
    accessToken: string,
    clientId: string,
    connectionId: string,
    reason?: string
  ): Promise<OAuthConnectionResponse>;

  /**
   * Permanently deletes an OAuth connection via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param clientId The ID of the client owning the connection.
   * @param connectionId The ID of the connection to delete.
   */
  deleteOAuthConnection(accessToken: string, clientId: string, connectionId: string): Promise<void>;

  /**
   * Resolves one or more user IDs into basic user information via the UIAM service.
   * @param accessToken UIAM session access token.
   * @param userIds The user IDs to resolve.
   */
  resolveUsers(accessToken: string, userIds: string[]): Promise<ResolvedUsersResponse>;
}

interface UiamServiceOptions {
  /** The URL of the Kibana resource server. */
  kibanaServerResourceURL: string;
  /** The URL of the Elasticsearch cluster. */
  elasticsearchUrl?: string;
  /** The Kibana version, used to set the User-Agent header on outbound UIAM requests. */
  kibanaVersion: string;
}

/**
 * See {@link UiamServicePublic}.
 */
export class UiamService implements UiamServicePublic {
  readonly #logger: Logger;
  readonly #config: Required<UiamConfigType>;
  readonly #dispatcher: Agent | undefined;
  readonly #kibanaServerResourceURL: string;
  readonly #elasticsearchUrl?: string;
  readonly #userAgentHeader: string;

  constructor(logger: Logger, config: UiamConfigType, options: UiamServiceOptions) {
    this.#logger = logger;
    this.#kibanaServerResourceURL = options.kibanaServerResourceURL;
    this.#elasticsearchUrl = options.elasticsearchUrl;
    this.#userAgentHeader = `Kibana/${options.kibanaVersion}`;

    // Destructure existing config and re-create it again after validation to make TypeScript can infer the proper types.
    const { enabled, url, sharedSecret, ssl } = config;
    if (!enabled) {
      throw new Error('UIAM is not enabled.');
    }

    if (!url) {
      throw new Error('UIAM URL is not configured.');
    }

    if (!sharedSecret) {
      throw new Error('UIAM shared secret is not configured.');
    }

    this.#config = { enabled, url, sharedSecret, ssl };
    this.#dispatcher = this.#createFetchDispatcher();
  }

  /**
   * See {@link UiamServicePublic.getAuthenticationHeaders}.
   */
  getAuthenticationHeaders(accessToken: string): Record<string, string> {
    return {
      authorization: new HTTPAuthorizationHeader('Bearer', accessToken).toString(),
      [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
    };
  }

  /**
   * See {@link UiamServicePublic.getInternalCallerAttestationHeaders}.
   */
  getInternalCallerAttestationHeaders(credential: HTTPAuthorizationHeader): Record<string, string> {
    return {
      [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: deriveInternalCallerAttestation(
        this.#config.sharedSecret,
        credential
      ),
    };
  }

  /**
   * See {@link UiamServicePublic.getClientAuthentication}.
   */
  getClientAuthentication(): ClientAuthentication {
    return { scheme: 'SharedSecret', value: this.#config.sharedSecret };
  }

  /**
   * See {@link UiamServicePublic.refreshSessionTokens}.
   */
  async refreshSessionTokens(refreshToken: string) {
    try {
      this.#logger.debug('Attempting to refresh session tokens.');

      const tokens = await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/tokens/_refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );
      return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
    } catch (err) {
      this.#logger.error(() => `Failed to refresh session tokens: ${getDetailedErrorMessage(err)}`);

      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.invalidateSessionTokens}.
   */
  async invalidateSessionTokens(accessToken: string, refreshToken: string) {
    try {
      this.#logger.debug('Attempting to invalidate session tokens.');

      await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/tokens/_invalidate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ tokens: [accessToken, refreshToken] }),
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      this.#logger.debug('Successfully invalidated session tokens.');
    } catch (err) {
      this.#logger.error(
        () => `Failed to invalidate session tokens: ${getDetailedErrorMessage(err)}`
      );

      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.exchangeOAuthToken}.
   */
  async exchangeOAuthToken(accessToken: string): Promise<string> {
    this.#logger.debug('Attempting to exchange OAuth access token for ephemeral token.');

    const expectedAudience = this.#kibanaServerResourceURL;
    const url = new URL(`${this.#config.url}/uiam/api/v1/authentication/_authenticate`);
    url.searchParams.set('include_token', 'true');
    url.searchParams.set('audience', expectedAudience);

    const startTime = performance.now();
    try {
      const response = await UiamService.#parseUiamResponse(
        await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.#userAgentHeader,
            Authorization: `Bearer ${accessToken}`,
          },
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      const audience = response.credentials?.oauth?.audience;
      if (audience !== expectedAudience) {
        throw Boom.badRequest(
          `OAuth token audience mismatch: expected "${expectedAudience}" but got "${audience}".`,
          { oauthErrorType: OAUTH_AUDIENCE_MISMATCH_ERROR_TYPE }
        );
      }

      securityTelemetry.recordOAuthTokenExchangeAttempt(performance.now() - startTime, {
        outcome: 'success',
      });

      return response.token;
    } catch (err) {
      securityTelemetry.recordOAuthTokenExchangeAttempt(performance.now() - startTime, {
        outcome: 'failure',
        ...UiamService.#getOAuthTokenExchangeErrorAttributes(err),
      });

      this.#logger.error(
        () => `Failed to exchange OAuth access token: ${getDetailedErrorMessage(err)}`
      );

      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.grantApiKey}.
   */
  async grantApiKey(
    authorization: HTTPAuthorizationHeader,
    params: GrantUiamAPIKeyParams,
    { includeClientAuthentication = true }: UiamClientAuthenticationOptions = {}
  ) {
    this.#logger.debug(
      `Attempting to grant API key using authorization scheme: ${authorization.scheme}`
    );

    try {
      const body: GrantUiamApiKeyRequestBody = {
        description: params.name,
        internal: true,
        ...(params.expiration ? { expiration: params.expiration } : {}),
        role_assignments: {
          // currently required  to downscope privileges
          limit: {
            // limit access to applications within projects (i.e. application_roles, not cloud roles)
            access: ['application'],
            // limit access to projects  (i.e. not deployments, organizations, etc.)
            resource: ['project'],
          },
        },
      };
      const requestOptions: RequestInit & { dispatcher?: Agent } = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.#userAgentHeader,
          ...(includeClientAuthentication
            ? { [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret }
            : {}),
          Authorization: authorization.toString(),
        },
        body: JSON.stringify(body),
        dispatcher: this.#dispatcher,
      };

      const response = await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/api-keys/_grant`, requestOptions)
      );

      this.#logger.debug(`Successfully granted API key with id ${response.id}`);
      return response;
    } catch (err) {
      this.#logger.error(() => `Failed to grant API key: ${getDetailedErrorMessage(err)}`);

      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.revokeApiKey}.
   */
  async revokeApiKey(apiKeyId: string, apiKey: string): Promise<void> {
    try {
      this.#logger.debug(`Attempting to revoke API key: ${apiKeyId}`);

      await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/api-keys/${apiKeyId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
            Authorization: `ApiKey ${apiKey}`,
          },
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      this.#logger.debug(`Successfully revoked API key: ${apiKeyId}`);
    } catch (err) {
      this.#logger.error(() => `Failed to revoke API key: ${getDetailedErrorMessage(err)}`);

      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.convertApiKeys}.
   */
  async convertApiKeys(keys: string[]): Promise<ConvertUiamApiKeysResponse> {
    if (!this.#elasticsearchUrl) {
      throw new Error(
        'Cannot convert API keys: Elasticsearch URL could not be resolved from cloud.id'
      );
    }

    try {
      this.#logger.debug(`Attempting to convert ${keys.length} API key(s).`);

      const body: ConvertUiamApiKeysRequestBody = {
        keys: keys.map((key) => ({
          type: 'elasticsearch' as const,
          key,
          endpoint: this.#elasticsearchUrl!,
        })),
      };

      const response = await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/api-keys/_convert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
          },
          body: JSON.stringify(body),
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      this.#logger.debug(`Successfully converted API key(s).`);
      return response;
    } catch (err) {
      this.#logger.error(() => `Failed to convert API keys: ${getDetailedErrorMessage(err)}`);

      throw err;
    }
  }

  /**
   * See {@link UiamService.createServiceAccount}.
   */
  async createServiceAccount(
    authorization: HTTPAuthorizationHeader,
    body: CreateServiceAccountRequestBody,
    { includeClientAuthentication = true }: UiamClientAuthenticationOptions = {}
  ): Promise<ServiceAccount> {
    try {
      this.#logger.debug('Attempting to create service account.');

      const requestOptions: RequestInit & { dispatcher?: Agent } = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.#userAgentHeader,
          ...(includeClientAuthentication
            ? { [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret }
            : {}),
          Authorization: authorization.toString(),
        },
        body: JSON.stringify({ ...body, type: 'project' }),
        dispatcher: this.#dispatcher,
      };
      const response = await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/service-accounts`, requestOptions)
      );

      this.#logger.debug(`Successfully created service account with id ${response.id}`);
      return response;
    } catch (err) {
      this.#logger.error(() => `Failed to create service account: ${getDetailedErrorMessage(err)}`);

      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.exchangeServiceAccountToken}.
   */
  async exchangeServiceAccountToken(serviceAccountId: string): Promise<{ token: string }> {
    this.#logger.debug(
      `Attempting to exchange service account [id=${serviceAccountId}] for an ephemeral token.`
    );
    const requestOptions: RequestInit & { dispatcher: Agent | undefined } = {
      method: 'POST',
      headers: { 'User-Agent': this.#userAgentHeader },
      // The certificate identifies Kibana's project for the account's assumable_by policy.
      dispatcher: this.#dispatcher,
    };
    let response: { token: string };
    try {
      response = await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/service-accounts/${encodeURIComponent(
            serviceAccountId
          )}/credentials/_exchange`,
          requestOptions
        )
      );
    } catch (err) {
      this.#logger.error(
        `Failed to exchange service account [id=${serviceAccountId}] for a token (HTTP status: ${
          Boom.isBoom(err) ? err.output.statusCode : 'unavailable'
        }).`
      );
      throw err;
    }

    this.#logger.debug(
      `Successfully exchanged service account [id=${serviceAccountId}] for an ephemeral token.`
    );
    return response;
  }

  /**
   * See {@link UiamServicePublic.createOAuthClient}.
   */
  async createOAuthClient(
    accessToken: string,
    body: CreateOAuthClientRequestBody
  ): Promise<OAuthClientResponse> {
    try {
      this.#logger.debug('Attempting to create OAuth client.');

      const response = await UiamService.#parseUiamResponse(
        await fetch(`${this.#config.url}/uiam/api/v1/oauth/clients`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      this.#logger.debug(`Successfully created OAuth client with id ${response.id}`);
      return response;
    } catch (err) {
      this.#logger.error(() => `Failed to create OAuth client: ${getDetailedErrorMessage(err)}`);
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.listOAuthClients}.
   */
  async listOAuthClients(
    accessToken: string,
    clientId?: string,
    projectId?: string
  ): Promise<OAuthClientsResponse> {
    try {
      this.#logger.debug('Attempting to list OAuth clients.');

      const url = new URL(`${this.#config.url}/uiam/api/v1/oauth/clients`);
      if (clientId) {
        url.searchParams.set('client_id', clientId);
      }
      if (projectId) {
        url.searchParams.set('project_id', projectId);
      }

      const response = await UiamService.#parseUiamResponse(
        await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
            Authorization: `Bearer ${accessToken}`,
          },
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      this.#logger.debug('Successfully listed OAuth clients.');
      return response;
    } catch (err) {
      this.#logger.error(() => `Failed to list OAuth clients: ${getDetailedErrorMessage(err)}`);
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.updateOAuthClient}.
   */
  async updateOAuthClient(
    accessToken: string,
    clientId: string,
    body: PatchOAuthClientRequestBody
  ): Promise<OAuthClientResponse> {
    try {
      this.#logger.debug(`Attempting to update OAuth client: ${clientId}`);

      const response = await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/oauth/clients/${encodeURIComponent(clientId)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(body),
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          }
        )
      );

      this.#logger.debug(`Successfully updated OAuth client: ${clientId}`);
      return response;
    } catch (err) {
      this.#logger.error(
        () => `Failed to update OAuth client ${clientId}: ${getDetailedErrorMessage(err)}`
      );
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.revokeOAuthClient}.
   */
  async revokeOAuthClient(
    accessToken: string,
    clientId: string,
    reason?: string
  ): Promise<OAuthClientResponse> {
    try {
      this.#logger.debug(`Attempting to revoke OAuth client: ${clientId}`);

      const response = await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/oauth/clients/${encodeURIComponent(clientId)}/_revoke`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ reason }),
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          }
        )
      );

      this.#logger.debug(`Successfully revoked OAuth client: ${clientId}`);
      return response;
    } catch (err) {
      this.#logger.error(
        () => `Failed to revoke OAuth client ${clientId}: ${getDetailedErrorMessage(err)}`
      );
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.deleteOAuthClient}.
   */
  async deleteOAuthClient(accessToken: string, clientId: string): Promise<void> {
    try {
      this.#logger.debug(`Attempting to delete OAuth client: ${clientId}`);

      await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/oauth/clients/${encodeURIComponent(clientId)}`,
          {
            method: 'DELETE',
            headers: {
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          }
        )
      );

      this.#logger.debug(`Successfully deleted OAuth client: ${clientId}`);
    } catch (err) {
      this.#logger.error(
        () => `Failed to delete OAuth client ${clientId}: ${getDetailedErrorMessage(err)}`
      );
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.listOAuthConnections}.
   */
  async listOAuthConnections(
    accessToken: string,
    clientId?: string,
    connectionId?: string,
    projectId?: string
  ): Promise<OAuthConnectionsResponse> {
    try {
      this.#logger.debug('Attempting to list OAuth connections.');

      const url = new URL(`${this.#config.url}/uiam/api/v1/oauth/connections`);
      if (clientId) {
        url.searchParams.set('client_id', clientId);
      }
      if (connectionId) {
        url.searchParams.set('connection_id', connectionId);
      }
      if (projectId) {
        url.searchParams.set('project_id', projectId);
      }

      const response = await UiamService.#parseUiamResponse(
        await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': this.#userAgentHeader,
            [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
            Authorization: `Bearer ${accessToken}`,
          },
          // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
          dispatcher: this.#dispatcher,
        })
      );

      this.#logger.debug('Successfully listed OAuth connections.');
      return response;
    } catch (err) {
      this.#logger.error(() => `Failed to list OAuth connections: ${getDetailedErrorMessage(err)}`);
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.updateOAuthConnection}.
   */
  async updateOAuthConnection(
    accessToken: string,
    clientId: string,
    connectionId: string,
    body: PatchOAuthConnectionRequestBody
  ): Promise<OAuthConnectionResponse> {
    try {
      this.#logger.debug(`Attempting to update OAuth connection: ${connectionId}`);

      const response = await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/oauth/clients/${encodeURIComponent(
            clientId
          )}/connections/${encodeURIComponent(connectionId)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(body),
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          }
        )
      );

      this.#logger.debug(`Successfully updated OAuth connection: ${connectionId}`);
      return response;
    } catch (err) {
      this.#logger.error(
        () => `Failed to update OAuth connection ${connectionId}: ${getDetailedErrorMessage(err)}`
      );
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.revokeOAuthConnection}.
   */
  async revokeOAuthConnection(
    accessToken: string,
    clientId: string,
    connectionId: string,
    reason?: string
  ): Promise<OAuthConnectionResponse> {
    try {
      this.#logger.debug(`Attempting to revoke OAuth connection: ${connectionId}`);

      const response = await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/oauth/clients/${encodeURIComponent(
            clientId
          )}/connections/${encodeURIComponent(connectionId)}/_revoke`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ reason }),
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          }
        )
      );

      this.#logger.debug(`Successfully revoked OAuth connection: ${connectionId}`);
      return response;
    } catch (err) {
      this.#logger.error(
        () => `Failed to revoke OAuth connection ${connectionId}: ${getDetailedErrorMessage(err)}`
      );
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.deleteOAuthConnection}.
   */
  async deleteOAuthConnection(
    accessToken: string,
    clientId: string,
    connectionId: string
  ): Promise<void> {
    try {
      this.#logger.debug(`Attempting to delete OAuth connection: ${connectionId}`);

      await UiamService.#parseUiamResponse(
        await fetch(
          `${this.#config.url}/uiam/api/v1/oauth/clients/${encodeURIComponent(
            clientId
          )}/connections/${encodeURIComponent(connectionId)}`,
          {
            method: 'DELETE',
            headers: {
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          }
        )
      );

      this.#logger.debug(`Successfully deleted OAuth connection: ${connectionId}`);
    } catch (err) {
      this.#logger.error(
        () =>
          `Failed to delete OAuth connection ${connectionId} for client ${clientId}: ${getDetailedErrorMessage(
            err
          )}`
      );
      throw err;
    }
  }

  /**
   * See {@link UiamServicePublic.resolveUsers}.
   */
  async resolveUsers(accessToken: string, userIds: string[]): Promise<ResolvedUsersResponse> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return { users: {} };
    }

    this.#logger.debug(`Attempting to resolve ${uniqueUserIds.length} user(s).`);

    const batches = chunk(uniqueUserIds, RESOLVE_USERS_BATCH_SIZE);
    const results = await Promise.allSettled(
      batches.map(async (batch): Promise<ResolvedUsersResponse> => {
        const url = new URL(`${this.#config.url}/uiam/api/v1/users`);
        url.searchParams.set('user_id', batch.join(','));

        return UiamService.#parseUiamResponse(
          await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'User-Agent': this.#userAgentHeader,
              [ES_CLIENT_AUTHENTICATION_HEADER]: this.#config.sharedSecret,
              Authorization: `Bearer ${accessToken}`,
            },
            // @ts-expect-error Undici `fetch` supports `dispatcher` option, see https://github.com/nodejs/undici/pull/1411.
            dispatcher: this.#dispatcher,
          })
        );
      })
    );

    const [fulfilled, failures] = partition(
      results,
      (result): result is PromiseFulfilledResult<ResolvedUsersResponse> =>
        result.status === 'fulfilled'
    );

    const users: ResolvedUsersResponse['users'] = Object.assign(
      {},
      ...fulfilled.map((result) => result.value.users)
    );

    if (failures.length === batches.length) {
      throw failures[0].reason;
    }

    if (failures.length > 0) {
      this.#logger.warn(
        () =>
          `Failed to resolve ${failures.length} of ${batches.length} user batch(es); returning partial results.`
      );
    }

    this.#logger.debug('Successfully resolved users.');
    return { users };
  }

  /**
   * Creates a custom dispatcher for the native `fetch` to use custom TLS connection settings.
   */
  #createFetchDispatcher() {
    const { certificateAuthorities, verificationMode } = this.#config.ssl;

    const readFile = (file: string) => readFileSync(file, 'utf8');

    // Read client certificate and key for mTLS from PEM files.
    const cert = this.#config.ssl.certificate ? readFile(this.#config.ssl.certificate) : undefined;
    const key = this.#config.ssl.key ? readFile(this.#config.ssl.key) : undefined;

    // Read CA certificate(s) from the file paths defined in the config.
    const ca = certificateAuthorities
      ? (Array.isArray(certificateAuthorities)
          ? certificateAuthorities
          : [certificateAuthorities]
        ).map((caPath) => readFile(caPath))
      : undefined;

    // If we don't have any custom TLS settings and the full verification is required, we don't
    // need a custom dispatcher as it's the default `fetch` behavior.
    if (!ca && !cert && !key && verificationMode === 'full') {
      return;
    }

    return new Agent({
      connect: {
        ca,
        cert,
        key,
        // The applications, including Kibana, running inside the MKI cluster should not need access to things like the
        // root CA and should be able to work with the CAs related to that particular cluster. The trust bundle we
        // currently deploy in the Kibana pods includes only the intermediate CA that is scoped to the application
        // cluster. Therefore, we need to allow partial trust chain validation.
        allowPartialTrustChain: true,
        rejectUnauthorized: verificationMode !== 'none',
        // By default, Node.js is checking the server identity to match SAN/CN in certificate.
        ...(verificationMode === 'certificate' ? { checkServerIdentity: () => undefined } : {}),
      },
    });
  }

  /**
   * Parses the UIAM service response as free-form JSON if it's a successful response, otherwise
   * throws a Boom error derived from UIAM's {@link https://github.com/elastic/uiam/blob/main/api/openapi.yaml ErrorDetails}
   * payload (`{ code, message, resource, type }`). The full payload is preserved on
   * `err.output.payload` so downstream loggers pick up the additional context via
   * {@link getDetailedErrorMessage}.
   */
  static async #parseUiamResponse(response: Response) {
    if (response.ok) {
      if (response.status === 204) {
        return;
      }

      return await response.json();
    }

    const payload = await response.json();
    const { code, message, resource, type }: UiamErrorDetails = payload?.error ?? {};

    // Build a compact, greppable summary for log output: `[code/type] message (resource: ...)`.
    const qualifiers: string[] = [];
    if (code) qualifiers.push(code);
    if (type) qualifiers.push(type);
    const prefix = qualifiers.length > 0 ? `[${qualifiers.join('/')}] ` : '';
    const suffix = resource ? ` (resource: ${resource})` : '';
    const summary = `${prefix}${message ?? 'Unknown error'}${suffix}`;

    const err = new Boom.Boom(summary);

    err.output = {
      statusCode: response.status,
      payload,
      headers: Object.fromEntries(response.headers.entries()),
    };

    throw err;
  }

  static #getOAuthTokenExchangeErrorAttributes(err: unknown): {
    oauthErrorType: string;
    oauthErrorCode: string | undefined;
  } {
    if (!Boom.isBoom(err)) {
      return { oauthErrorType: OAUTH_UNKNOWN_ERROR_TYPE, oauthErrorCode: undefined };
    }

    const payload = err.output?.payload as { error?: UiamErrorDetails } | undefined;

    return {
      oauthErrorType: err.data?.oauthErrorType ?? payload?.error?.type ?? OAUTH_UNKNOWN_ERROR_TYPE,
      oauthErrorCode: payload?.error?.code,
    };
  }
}
