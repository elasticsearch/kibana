/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  BulkRequest,
  BulkResponse,
  DeleteRequest,
  GetRequest,
  GetResponse,
  IndexRequest,
  IndexResponse,
  QueryDslQueryContainer,
  Result,
  SearchRequest,
} from '@elastic/elasticsearch/lib/api/types';
import type { TransportRequestOptions } from '@elastic/transport';
import type { ComposerQuery } from '@elastic/esql';
import type { ESQLSearchResponse, InferSearchResponseOf } from '@kbn/es-types';
import type { StorageFieldTypeOf, StorageMappingProperty } from './types';

/**
 * Curated subset of transport-level options that can be forwarded
 * to the underlying Elasticsearch client on a per-request basis.
 */
export type StorageTransportOptions = Pick<
  TransportRequestOptions,
  'requestTimeout' | 'maxResponseSize' | 'maxCompressedResponseSize' | 'signal'
>;

interface StorageSchemaProperties {
  [x: string]: StorageMappingProperty;
}

export interface StorageSchema {
  properties: StorageSchemaProperties;
}

interface StorageSettingsBase {
  schema: StorageSchema;
}

export interface IndexStorageSettings extends StorageSettingsBase {
  name: string;
}

export type StorageSettings = IndexStorageSettings;

export type StorageClientSearchRequest = Omit<SearchRequest, 'index'> & {
  track_total_hits: boolean | number;
  size: number;
};

export type StorageClientSearchResponse<
  TDocument,
  TSearchRequest extends Omit<SearchRequest, 'index'>
> = InferSearchResponseOf<TDocument, TSearchRequest>;

/**
 * Optimistic concurrency metadata for bulk `index` actions.
 * elasticsearch requires `if_seq_no` and `if_primary_term` together — omit both for unconditional writes.
 */
export type StorageClientBulkIndexOccMetadata =
  | { if_seq_no?: never; if_primary_term?: never }
  | { if_seq_no: number; if_primary_term: number };

export type StorageClientBulkOperation<TDocument extends { _id?: string }> =
  | {
      index: {
        document: Omit<TDocument, '_id'>;
        _id?: string;
      } & StorageClientBulkIndexOccMetadata;
    }
  | {
      /**
       * ES bulk `create` action: fails with a 409 conflict if `_id` already exists.
       * Use `index` instead if you want silent upsert (overwrite) behaviour.
       */
      create: { document: Omit<TDocument, '_id'>; _id?: string };
    }
  | { delete: { _id: string } };

export interface StorageClientBulkOptions {
  /**
   * If true, throws BulkOperationError when any operation in the bulk request fails.
   * If false (default), returns the response with errors field populated, similar to Promise.allSettled behavior.
   * @default false
   */
  throwOnFail?: boolean;
}

export type StorageClientBulkRequest<TDocument extends { _id?: string }> = Omit<
  BulkRequest,
  'operations' | 'index'
> & {
  operations: Array<StorageClientBulkOperation<TDocument>>;
} & StorageClientBulkOptions;
export type StorageClientBulkResponse = BulkResponse;

export type StorageClientDeleteRequest = Omit<DeleteRequest, 'index'>;

export interface StorageClientDeleteResponse {
  acknowledged: boolean;
  result: Extract<Result, 'deleted' | 'not_found'>;
}

export interface StorageClientCleanResponse {
  acknowledged: boolean;
  result: Extract<Result, 'deleted' | 'noop'>;
}

export type StorageClientIndexRequest<TDocument = unknown> = Omit<
  IndexRequest<Omit<TDocument, '_id'>>,
  'index'
>;

export type StorageClientIndexResponse = IndexResponse;

export type StorageClientGetRequest = Omit<GetRequest & SearchRequest, 'index'>;
export type StorageClientGetResponse<TDocument extends { _id?: string }> = GetResponse<TDocument>;

export type StorageClientSearch<TDocumentType = never> = <
  TSearchRequest extends StorageClientSearchRequest
>(
  request: TSearchRequest,
  transportOptions?: StorageTransportOptions
) => Promise<StorageClientSearchResponse<TDocumentType, TSearchRequest>>;

/**
 * Performs bulk operations on documents.
 *
 * By default, behaves similar to Promise.allSettled - individual operation failures
 * are returned in the response without throwing an error. Set `throwOnFail: true`
 * to throw a BulkOperationError when any operation fails.
 */
export type StorageClientBulk<TDocumentType extends { _id?: string } = never> = (
  request: StorageClientBulkRequest<TDocumentType>,
  transportOptions?: StorageTransportOptions
) => Promise<StorageClientBulkResponse>;

export type StorageClientIndex<TDocumentType = never> = (
  request: StorageClientIndexRequest<TDocumentType>,
  transportOptions?: StorageTransportOptions
) => Promise<StorageClientIndexResponse>;

export type StorageClientDelete = (
  request: StorageClientDeleteRequest,
  transportOptions?: StorageTransportOptions
) => Promise<StorageClientDeleteResponse>;

export type StorageClientClean = () => Promise<StorageClientCleanResponse>;

export type StorageClientGet<TDocumentType extends { _id?: string } = never> = (
  request: StorageClientGetRequest,
  transportOptions?: StorageTransportOptions
) => Promise<StorageClientGetResponse<TDocumentType>>;

export type StorageClientExistsIndex = () => Promise<boolean>;

/**
 * Executes an ES|QL query against the storage adapter's index. The adapter
 * owns the `FROM`/`METADATA` prefix and applies the same read-side guarantees
 * as `search`/`get`; the caller supplies the post-FROM pipeline via
 * `pipeline`.
 */
export type StorageClientEsql = (
  request: StorageClientEsqlRequest,
  transportOptions?: StorageTransportOptions
) => Promise<ESQLSearchResponse>;

export interface StorageClientEsqlRequest {
  /**
   * The ES|QL processing pipeline (everything after FROM), built with the `esql` tagged template
   * from `@elastic/esql`. The FROM clause is auto-generated from the adapter's storage index.
   *
   * Template holes (`${{ name: value }}`) are promoted to named parameters sent to Elasticsearch
   * at the protocol level, never interpolated into the query string.
   *
   * @example
   * ```ts
   * import { esql } from '@elastic/esql';
   * pipeline: esql`WHERE _id == ${{ id }} | LIMIT 1`
   * ```
   */
  pipeline: ComposerQuery;
  /** METADATA fields for the auto-generated `FROM` clause (e.g. `['_id', '_source']`). */
  metadata?: string[];
  /** DSL query ANDed with the pipeline. */
  filter?: QueryDslQueryContainer;
  drop_null_columns?: boolean;
  /** Apply `maybeMigrateSource` to the `_source` column (default true; no-op without `metadata: ['_source', ...]`). */
  migrateSource?: boolean;
  /**
   * SET options prepended before the FROM clause (e.g. `{ unmapped_fields: 'LOAD' }`).
   * Use when querying indices with `dynamic: false` fields that must be loaded from `_source`.
   */
  setOptions?: Record<string, string>;
}

export interface InternalIStorageClient<TDocumentType extends { _id?: string } = never> {
  search: StorageClientSearch<TDocumentType>;
  bulk: StorageClientBulk<TDocumentType>;
  index: StorageClientIndex<TDocumentType>;
  delete: StorageClientDelete;
  clean: StorageClientClean;
  get: StorageClientGet<TDocumentType>;
  existsIndex: StorageClientExistsIndex;
  esql: StorageClientEsql;
  /**
   * Applies any pending mapping changes to the current write index via putMapping.
   * Throws if the schema has incompatible structural changes that require a full rebuild.
   */
  reconcileMappings: () => Promise<void>;
}

type UnionKeys<T> = T extends T ? keyof T : never;
type Exact<T, U> = T extends U
  ? Exclude<UnionKeys<T>, UnionKeys<U>> extends never
    ? true
    : false
  : false;

type MissingKeysError<T extends string> = Error &
  `The following keys are missing from the schema: ${T}`;

// The storage settings need to support the application payload type, but it's OK if the
// storage document can hold more fields than the application document.
// To keep the type safety of the application type in the consuming code, both the storage
// settings and the application type are passed to the IStorageClient type.
// The IStorageClient type then checks if the application type is a subset of the storage
// document type. If this is not the case, the IStorageClient type is set to never, which
// will cause a type error in the consuming code.
export type IStorageClient<
  TSchema extends IndexStorageSettings,
  TApplicationType extends StorageDocumentOf<TSchema>
> = Exact<TApplicationType, StorageDocumentOf<TSchema>> extends true
  ? InternalIStorageClient<TApplicationType>
  : MissingKeysError<Exclude<UnionKeys<TApplicationType>, UnionKeys<StorageDocumentOf<TSchema>>>>;

export type SimpleIStorageClient<TStorageSettings extends IndexStorageSettings> = IStorageClient<
  TStorageSettings,
  StorageDocumentOf<TStorageSettings>
>;

export type StorageDocumentOf<TStorageSettings extends StorageSettings> = Partial<
  StorageFieldTypeOf<{
    type: 'object';
    properties: TStorageSettings['schema']['properties'];
  }>
>;

export { StorageIndexAdapter, isEsqlUnknownIndexError } from './src/index_adapter';

export { BulkOperationError } from './src/errors';

export { getSchemaVersion } from './src/get_schema_version';

export { types } from './types';
