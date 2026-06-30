/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';

/**
 * Interface representing an API key the way it is returned by Elasticsearch GET endpoint.
 */
export type ApiKey = RestApiKey | CrossClusterApiKey;

/**
 * Interface representing a REST API key the way it is returned by Elasticsearch GET endpoint.
 *
 * TODO: Remove this type when `@elastic/elasticsearch` has been updated.
 */
export interface RestApiKey extends BaseApiKey {
  type: 'rest';
}

/**
 * Interface representing a cross-cluster API key the way it is returned by Elasticsearch GET endpoint.
 *
 * TODO: Remove this type when `@elastic/elasticsearch` has been updated.
 */
export interface CrossClusterApiKey extends BaseApiKey {
  type: 'cross_cluster';

  /**
   * The access to be granted to this API key. The access is composed of permissions for cross-cluster
   * search and cross-cluster replication. At least one of them must be specified.
   */
  access: CrossClusterApiKeyAccess;

  /**
   * The certificate identity associated with this cross-cluster API key (strong identity
   * verification). Restricts the API key to connections authenticated by a specific TLS certificate.
   */
  certificate_identity?: string;
}

/**
 * Fixing up `estypes.SecurityApiKey` type since some fields are marked as optional even though they are guaranteed to be returned.
 *
 * TODO: Remove this type when `@elastic/elasticsearch` has been updated to make `role_descriptors` required.
 */
export interface BaseApiKey extends estypes.SecurityApiKey {
  role_descriptors: Required<estypes.SecurityApiKey>['role_descriptors'];
}

// TODO: Remove this type when `@elastic/elasticsearch` has been updated.
export interface CrossClusterApiKeyAccess {
  /**
   * A list of indices permission entries for cross-cluster search.
   */
  search?: CrossClusterApiKeySearch[];

  /**
   * A list of indices permission entries for cross-cluster replication.
   */
  replication?: CrossClusterApiKeyReplication[];
}

// TODO: Remove this type when `@elastic/elasticsearch` has been updated.
type CrossClusterApiKeySearch = Pick<
  estypes.SecurityIndicesPrivileges,
  'names' | 'field_security' | 'query' | 'allow_restricted_indices'
>;

// TODO: Remove this type when `@elastic/elasticsearch` has been updated.
type CrossClusterApiKeyReplication = Pick<
  estypes.SecurityIndicesPrivileges,
  'names' | 'allow_restricted_indices'
>;

export type ApiKeyRoleDescriptors = Record<string, estypes.SecurityRoleDescriptor>;

export interface ApiKeyToInvalidate {
  id: string;
  name: string;
}

export interface ApiKeyAggregations {
  usernames?: estypes.AggregationsStringTermsAggregate;
  types?: estypes.AggregationsStringTermsAggregate;
  expired?: estypes.AggregationsFilterAggregateKeys;
  managed?: {
    buckets: {
      metadataBased: estypes.AggregationsFilterAggregateKeys;
      namePrefixBased: estypes.AggregationsFilterAggregateKeys;
    };
  };
}

/**
 * Response of Kibana Query API keys endpoint.
 */
export type QueryApiKeyResult = SuccessQueryApiKeyResult | ErrorQueryApiKeyResult;

interface SuccessQueryApiKeyResult extends BaseQueryApiKeyResult {
  apiKeys: ApiKey[];
  count: number;
  total: number;
  queryError: never;
  /**
   * The search_after cursor for the next page of results.
   * Use this value in the next request to get the following page.
   */
  searchAfter?: estypes.SortResults;
}

interface ErrorQueryApiKeyResult extends BaseQueryApiKeyResult {
  queryError: { name: string; message: string };
  apiKeys: never;
  total: never;
}

interface BaseQueryApiKeyResult {
  canManageCrossClusterApiKeys: boolean;
  canManageApiKeys: boolean;
  canManageOwnApiKeys: boolean;
  aggregationTotal: number;
  aggregations: Record<string, estypes.SecurityQueryApiKeysApiKeyAggregate> | undefined;
}

/**
 * Interface representing a REST API key that is managed by Kibana.
 */
export interface ManagedApiKey extends Omit<BaseApiKey, 'type'> {
  type: estypes.SecurityApiKeyType | 'managed';
}

/**
 * Interface representing an API key the way it is presented in the Kibana UI  (with Kibana system
 * API keys given its own dedicated `managed` type).
 */
export type CategorizedApiKey = (ApiKey | ManagedApiKey) & {
  expired: boolean;
};
