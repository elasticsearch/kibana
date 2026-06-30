/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { KibanaRequest } from '@kbn/core-http-server';

import type { ElasticsearchPrivilegesType, KibanaPrivilegesType } from '../../roles';

/**
 * Interface for managing API keys in Elasticsearch, including creation,
 * validation, and invalidation of API keys,
 * as well as checking the status of API key features.
 */
export interface NativeAPIKeysType {
  /**
   * Determines if API Keys are enabled in Elasticsearch.
   */
  areAPIKeysEnabled(): Promise<boolean>;

  /**
   * Determines if Cross-Cluster API Keys are enabled in Elasticsearch.
   */
  areCrossClusterAPIKeysEnabled(): Promise<boolean>;

  /**
   * Tries to create an API key for the current user.
   *
   * Returns newly created API key or `null` if API keys are disabled.
   *
   * User needs `manage_api_key` privilege to create REST API keys and `manage_security` for Cross-Cluster API keys.
   *
   * @param request Request instance.
   * @param createParams The params to create an API key
   */
  create(
    request: KibanaRequest,
    createParams: CreateAPIKeyParams
  ): Promise<CreateAPIKeyResult | null>;

  /**
   * Attempts update an API key with the provided 'role_descriptors' and 'metadata'
   *
   * Returns `updated`, `true` if the update was successful, `false` if there was nothing to update
   *
   * User needs `manage_api_key` privilege to update REST API keys and `manage_security` for cross-cluster API keys.
   *
   * @param request Request instance.
   * @param updateParams The params to edit an API key
   */
  update(
    request: KibanaRequest,
    updateParams: UpdateAPIKeyParams
  ): Promise<UpdateAPIKeyResult | null>;

  /**
   * Tries to grant an API key for the current user.
   * @param request Request instance.
   * @param createParams Create operation parameters.
   */
  grantAsInternalUser(
    request: KibanaRequest,
    createParams: CreateRestAPIKeyParams | CreateRestAPIKeyWithKibanaPrivilegesParams
  ): Promise<GrantAPIKeyResult | null>;

  /**
   * Tries to validate an API key.
   * @param apiKeyPrams ValidateAPIKeyParams.
   */
  validate(apiKeyPrams: ValidateAPIKeyParams): Promise<boolean>;

  /**
   * Tries to invalidate an API keys.
   * @param request Request instance.
   * @param params The params to invalidate an API keys.
   */
  invalidate(
    request: KibanaRequest,
    params: InvalidateAPIKeysParams
  ): Promise<InvalidateAPIKeyResult | null>;

  /**
   * Tries to invalidate the API keys by using the internal user.
   * @param params The params to invalidate the API keys.
   */
  invalidateAsInternalUser(params: InvalidateAPIKeysParams): Promise<InvalidateAPIKeyResult | null>;

  /**
   * Clones an existing API key using the internal user, creating a new independent key
   * with the same role descriptors as the source. The source key credential is extracted
   * from the request's Authorization header.
   *
   * Requires the `clone_api_key` cluster privilege (available to `kibana_system`).
   *
   * @param request Request instance containing the source API key in the Authorization header.
   * @param cloneParams Clone operation parameters.
   */
  cloneAsInternalUser(
    request: KibanaRequest,
    cloneParams: CloneAPIKeyParams
  ): Promise<CloneAPIKeyResult | null>;
}

export type CreateAPIKeyParams =
  | CreateRestAPIKeyParams
  | CreateRestAPIKeyWithKibanaPrivilegesParams
  | CreateCrossClusterAPIKeyParams;

/**
 * Response of Kibana Create API key endpoint.
 */
export type CreateAPIKeyResult = estypes.SecurityCreateApiKeyResponse;

export interface CreateRestAPIKeyParams {
  type?: 'rest';
  expiration?: string;
  name: string;
  role_descriptors: Record<string, { [key: string]: any }>;
  metadata?: { [key: string]: any };
}

export interface CreateRestAPIKeyWithKibanaPrivilegesParams {
  type?: 'rest';
  expiration?: string;
  name: string;
  metadata?: { [key: string]: any };
  kibana_role_descriptors: Record<
    string,
    {
      elasticsearch: ElasticsearchPrivilegesType & { [key: string]: unknown };
      kibana: KibanaPrivilegesType;
    }
  >;
}

export interface CreateCrossClusterAPIKeyParams {
  type: 'cross_cluster';
  expiration?: string;
  name: string;
  metadata?: { [key: string]: any };
  /**
   * The certificate identity to associate with this cross-cluster API key. Restricts the API key to
   * connections authenticated by a specific TLS certificate (matching the certificate's
   * distinguished name). Validation of this value is performed by Elasticsearch.
   */
  certificate_identity?: string;
  access: {
    search?: Array<{
      names: string[];
      query?: unknown;
      field_security?: unknown;
      allow_restricted_indices?: boolean;
    }>;
    replication?: Array<{
      names: string[];
      allow_restricted_indices?: boolean;
    }>;
  };
}

export interface GrantAPIKeyResult {
  /**
   * Unique id for this API key
   */
  id: string;
  /**
   * Name for this API key
   */
  name: string;
  /**
   * Generated API key
   */
  api_key: string;
}

export interface CloneAPIKeyParams {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface CloneAPIKeyResult {
  id: string;
  name: string;
  api_key: string;
  encoded: string;
}

/**
 * Represents the parameters for validating API Key credentials.
 */
export interface ValidateAPIKeyParams {
  /**
   * Unique id for this API key
   */
  id: string;

  /**
   * Generated API Key (secret)
   */
  api_key: string;
}

/**
 * Represents the params for invalidating multiple API keys
 */
export interface InvalidateAPIKeysParams {
  /**
   * List of unique API key IDs
   */
  ids: string[];
}

/**
 * The return value when invalidating an API key in Elasticsearch.
 */
export interface InvalidateAPIKeyResult {
  /**
   * The IDs of the API keys that were invalidated as part of the request.
   */
  invalidated_api_keys: string[];
  /**
   * The IDs of the API keys that were already invalidated.
   */
  previously_invalidated_api_keys: string[];
  /**
   * The number of errors that were encountered when invalidating the API keys.
   */
  error_count: number;
  /**
   * Details about these errors. This field is not present in the response when error_count is 0.
   */
  error_details?: Array<{
    type?: string;
    code?: string;
    reason?: string | null;
    caused_by?: {
      type?: string;
      reason?: string | null;
    };
  }>;
}

/**
 * Response of Kibana Update API key endpoint.
 */
export type UpdateAPIKeyResult = estypes.SecurityUpdateApiKeyResponse;

/**
 * Request body of Kibana Update API key endpoint.
 */
export type UpdateAPIKeyParams =
  | UpdateRestAPIKeyParams
  | UpdateCrossClusterAPIKeyParams
  | UpdateRestAPIKeyWithKibanaPrivilegesParams;

export interface UpdateRestAPIKeyParams {
  id: string;
  type?: 'rest';
  expiration?: string;
  role_descriptors: Record<string, { [key: string]: unknown }>;
  metadata?: { [key: string]: any };
}

export interface UpdateCrossClusterAPIKeyParams {
  id: string;
  type: 'cross_cluster';
  expiration?: string;
  metadata?: { [key: string]: any };
  /**
   * The certificate identity to associate with this cross-cluster API key. Restricts the API key to
   * connections authenticated by a specific TLS certificate (matching the certificate's
   * distinguished name). Pass `null` to clear a previously assigned value. Validation of this value
   * is performed by Elasticsearch.
   */
  certificate_identity?: string | null;
  access: {
    search?: Array<{
      names: string[];
      query?: unknown;
      field_security?: unknown;
      allow_restricted_indices?: boolean;
    }>;
    replication?: Array<{
      names: string[];
      allow_restricted_indices?: boolean;
    }>;
  };
}

export interface UpdateRestAPIKeyWithKibanaPrivilegesParams {
  id: string;
  type?: 'rest';
  expiration?: string;
  metadata?: { [key: string]: any };
  kibana_role_descriptors: Record<
    string,
    {
      elasticsearch: ElasticsearchPrivilegesType & { [key: string]: unknown };
      kibana: KibanaPrivilegesType;
    }
  >;
}

export function isCreateRestAPIKeyParams(params: any): params is CreateRestAPIKeyParams {
  return 'role_descriptors' in params;
}
