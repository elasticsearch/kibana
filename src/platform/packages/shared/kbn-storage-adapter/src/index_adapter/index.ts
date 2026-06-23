/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  BulkOperationContainer,
  BulkOperationType,
  EsqlQueryRequest,
  IndexResponse,
  IndicesIndexState,
  IndicesIndexTemplate,
  IndicesPutIndexTemplateIndexTemplateMapping,
  MappingProperty,
  SearchHit,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';
import { last, mapValues, padStart } from 'lodash';
import type { DiagnosticResult } from '@elastic/elasticsearch';
import { errors } from '@elastic/elasticsearch';
import type { TransportRequestOptions } from '@elastic/transport';
import { esql } from '@elastic/esql';
import type { ESQLSearchResponse } from '@kbn/es-types';
import type {
  IndexStorageSettings,
  StorageClientBulkResponse,
  StorageClientDeleteResponse,
  StorageClientBulk,
  StorageClientDelete,
  StorageClientIndex,
  StorageClientIndexResponse,
  StorageClientSearch,
  StorageClientGet,
  StorageClientExistsIndex,
  StorageDocumentOf,
  StorageClientSearchResponse,
  StorageClientClean,
  StorageClientCleanResponse,
  StorageClientEsql,
  InternalIStorageClient,
  StorageTransportOptions,
} from '../..';
import { getSchemaVersion } from '../get_schema_version';
import type { StorageMappingProperty } from '../../types';
import { BulkOperationError } from '../errors';

function getAliasName(name: string) {
  return name;
}

function getIndexPattern(name: string) {
  return `${name}-*`;
}

/** Creates names like: .my-index-0000001 */
function getIndexName(name: string, count: number) {
  const countId = padStart(count.toString(), 6, '0');
  return `${name}-${countId}`;
}

function getIndexTemplateName(name: string) {
  return `${name}`;
}

// TODO: this function is here to strip properties when we add back optional/multi-value
// which should be implemented in pipelines
function toElasticsearchMappingProperty(property: StorageMappingProperty): MappingProperty {
  return property;
}

function catchConflictError(error: Error) {
  if (
    isResponseError(error) &&
    error.statusCode === 400 &&
    error.body?.error?.type === 'resource_already_exists_exception'
  ) {
    return;
  }
  throw error;
}

function isNotFoundError(error: Error): error is errors.ResponseError & { statusCode: 404 } {
  return isResponseError(error) && error.statusCode === 404;
}

// ES|QL signals a missing index as a 400 `verification_exception` with
// `"Unknown index [<name>]"` instead of 404 — match it explicitly so we
// stay consistent with `search`/`get`'s missing-index handling.
export function isEsqlUnknownIndexError(error: unknown): boolean {
  if (!isResponseError(error as Error)) return false;
  const responseError = error as errors.ResponseError;
  if (responseError.statusCode !== 400) return false;
  const body = responseError.body as { error?: { type?: string; reason?: string } } | undefined;
  return (
    body?.error?.type === 'verification_exception' &&
    typeof body?.error?.reason === 'string' &&
    body.error.reason.includes('Unknown index')
  );
}

function isServerlessSettingsError(error: unknown): boolean {
  if (!isResponseError(error as Error)) {
    return false;
  }
  const reason: string = (error as errors.ResponseError).body?.error?.reason ?? '';
  return reason.includes('not available when running in serverless mode');
}

/*
 * When calling into Elasticsearch, the stack trace is lost.
 * If we create an error before calling, and append it to
 * any stack of the caught error, we get a more useful stack
 * trace.
 */
function wrapEsCall<T>(p: Promise<T>): Promise<T> {
  const error = new Error();
  return p.catch((caughtError) => {
    caughtError.stack += error.stack;
    throw caughtError;
  });
}

function optionalTransportArgs(
  transportOptions?: StorageTransportOptions
): [] | [TransportRequestOptions] {
  return transportOptions ? [transportOptions] : [];
}

export interface StorageIndexAdapterOptions<TApplicationType> {
  /**
   * If this callback is provided, it will be called on every _source before returned to the caller of the search or get methods.
   * This is useful for migrating documents from one version to another, or for transforming the document before returning it.
   * This should be used as rarely as possible - in most cases, new properties should be added as optional.
   */
  migrateSource?: (document: Record<string, unknown>) => TApplicationType;
  /**
   * When true, index settings (e.g. `number_of_shards`, `auto_expand_replicas`)
   * are omitted from index templates because Serverless ES does not support them
   * on user-visible indices.
   *
   * Detection is three-tiered:
   * 1. Explicit - this option is used when provided.
   * 2. Proactive - `esClient.info()` is called to check `build_flavor`.
   * 3. Reactive - if both above are unavailable, the adapter catches
   *    the `illegal_argument_exception` on the first write and retries.
   */
  isServerless?: boolean;
}

/**
 * Adapter for writing and reading documents to/from Elasticsearch,
 * using plain indices.
 *
 * Index management is lazy — no resources are created at construction time.
 *
 * - **Writes** (`index`, `bulk`): ensure the index template, backing index,
 *   and mappings all exist and are up-to-date before executing.
 * - **Reads** (`search`, `get`): ensure mappings are up-to-date before
 *   executing.
 *
 * Mapping updates are applied in-place via `putMapping` on the existing
 * write index — no rollover is performed. This supports additive schema
 * changes (new fields, new sub-fields) but not incompatible ones
 * (type changes, field removal).
 *
 * TODO:
 * - Schema upgrades w/ fallbacks (rollover + reindex for incompatible changes)
 */
export class StorageIndexAdapter<
  TStorageSettings extends IndexStorageSettings,
  TApplicationType extends Partial<StorageDocumentOf<TStorageSettings>>
> {
  private static readonly INDEX_SETTINGS = {
    auto_expand_replicas: '0-1',
    number_of_shards: 1,
  } as const;

  private readonly logger: Logger;
  private updateMappingsPromise: Promise<void> | undefined;
  private serverlessCheck: Promise<boolean | undefined> | undefined;
  private isServerless: boolean | undefined;

  constructor(
    private readonly esClient: ElasticsearchClient,
    logger: Logger,
    private readonly storage: TStorageSettings,
    private readonly options: StorageIndexAdapterOptions<TApplicationType> = {}
  ) {
    this.logger = logger.get('storage').get(this.storage.name);
    this.isServerless = options.isServerless;
  }

  /**
   * Probes the ES cluster via `info()` to determine if we're running
   * against Serverless ES. The result is cached for the lifetime of
   * this adapter instance. Returns `undefined` when the check cannot
   * be performed (e.g. missing method on a mock client, or
   * insufficient privileges).
   */
  private detectServerless(): Promise<boolean | undefined> {
    if (!this.serverlessCheck) {
      this.serverlessCheck = (async () => {
        try {
          const info = await this.esClient.info();
          return info.version.build_flavor === 'serverless';
        } catch {
          return undefined;
        }
      })();
    }
    return this.serverlessCheck;
  }

  private getSearchIndexPattern(): string {
    return `${getAliasName(this.storage.name)}`;
  }

  private getWriteTarget(): string {
    return getAliasName(this.storage.name);
  }

  private async createOrUpdateIndexTemplate(): Promise<void> {
    const version = getSchemaVersion(this.storage);

    const mappings: IndicesPutIndexTemplateIndexTemplateMapping['mappings'] = {
      _meta: { version },
      dynamic: 'strict',
      properties: {
        ...mapValues(this.storage.schema.properties, toElasticsearchMappingProperty),
      },
    };

    const aliases: IndicesPutIndexTemplateIndexTemplateMapping['aliases'] = {
      [getAliasName(this.storage.name)]: {
        is_write_index: true,
      },
    };

    const putTemplate = (includeSettings: boolean) =>
      wrapEsCall(
        this.esClient.indices.putIndexTemplate({
          name: getIndexTemplateName(this.storage.name),
          create: false,
          allow_auto_create: false,
          index_patterns: getIndexPattern(this.storage.name),
          _meta: { version },
          template: {
            ...(includeSettings ? { settings: StorageIndexAdapter.INDEX_SETTINGS } : {}),
            mappings,
            aliases,
          },
        })
      ).catch(catchConflictError);

    const serverless = this.isServerless ?? (await this.detectServerless());
    if (serverless !== undefined) {
      await putTemplate(!serverless);
      return;
    }

    try {
      await putTemplate(true);
      this.isServerless = false;
    } catch (error) {
      if (isServerlessSettingsError(error)) {
        this.isServerless = true;
        this.logger.debug(
          'Index settings are unavailable (serverless ES); retrying template without settings'
        );
        await putTemplate(false);
      } else {
        throw error;
      }
    }
  }

  private async getExistingIndexTemplate(): Promise<IndicesIndexTemplate | undefined> {
    return await wrapEsCall(
      this.esClient.indices.getIndexTemplate({
        name: getIndexTemplateName(this.storage.name),
      })
    )
      .then((templates) => templates.index_templates[0]?.index_template)
      .catch((error) => {
        if (isNotFoundError(error)) {
          return undefined;
        }
        throw error;
      });
  }

  private async getCurrentWriteIndex(): Promise<
    { name: string; state: IndicesIndexState } | undefined
  > {
    const [writeIndex, indices] = await Promise.all([
      this.getCurrentWriteIndexName(),
      this.getExistingIndices(),
    ]);

    return writeIndex ? { name: writeIndex, state: indices[writeIndex] } : undefined;
  }

  private async getExistingIndices() {
    return wrapEsCall(
      this.esClient.indices.get({
        index: getIndexPattern(this.storage.name),
        allow_no_indices: true,
      })
    );
  }

  private async getCurrentWriteIndexName(): Promise<string | undefined> {
    const aliasName = getAliasName(this.storage.name);

    const aliases = await wrapEsCall(
      this.esClient.indices.getAlias({
        name: getAliasName(this.storage.name),
      })
    ).catch((error) => {
      if (isResponseError(error) && error.statusCode === 404) {
        return {};
      }
      throw error;
    });

    const writeIndex = Object.entries(aliases)
      .map(([name, alias]) => {
        return {
          name,
          isWriteIndex: alias.aliases[aliasName]?.is_write_index === true,
        };
      })
      .find(({ isWriteIndex }) => {
        return isWriteIndex;
      });

    return writeIndex?.name;
  }

  private async createIndex(): Promise<void> {
    const writeIndex = await this.getCurrentWriteIndexName();

    const indexName = getIndexName(
      this.storage.name,
      writeIndex ? parseInt(last(writeIndex.split('-'))!, 10) : 1
    );

    await wrapEsCall(
      this.esClient.indices.create({
        index: indexName,
      })
    ).catch(catchConflictError);
  }

  private async updateMappingsOfExistingIndex({ name }: { name: string }) {
    const simulateIndexTemplateResponse = await this.esClient.indices.simulateIndexTemplate({
      name: getIndexName(this.storage.name, 999999),
    });

    if (simulateIndexTemplateResponse.template.mappings) {
      await this.esClient.indices.putMapping({
        index: name,
        ...simulateIndexTemplateResponse.template.mappings,
      });
    }
  }

  /**
   * If a write index already exists and its mappings are stale,
   * updates the index template and pushes the new mappings.
   * No-op when no index exists yet (preserving lazy-write semantics)
   * or when mappings are already up-to-date.
   */
  private async updateMappingsIfNeeded(): Promise<void> {
    const expectedSchemaVersion = getSchemaVersion(this.storage);

    const writeIndex = await this.getCurrentWriteIndex();
    if (!writeIndex) {
      return;
    }

    if (writeIndex.state.mappings?._meta?.version !== expectedSchemaVersion) {
      this.logger.debug(
        `Updating index template and mappings of existing index due to schema version mismatch`
      );
      await this.createOrUpdateIndexTemplate();
      await this.updateMappingsOfExistingIndex({ name: writeIndex.name });
    }
  }

  /**
   * Validates whether:
   * - an index template exists
   * - the index template has the right version (if not, update it)
   * - the index exists (if it doesn't, create it)
   * - the index has the right version (if not, update it)
   */
  private async validateComponentsBeforeWriting<T>(cb: () => Promise<T>): Promise<T> {
    const expectedSchemaVersion = getSchemaVersion(this.storage);
    await this.createOrUpdateIndexTemplate();

    const writeIndex = await this.getCurrentWriteIndex();
    if (!writeIndex) {
      this.logger.debug(`Creating index`);
      await this.createIndex();
    } else {
      if (writeIndex.state.mappings?._meta?.version !== expectedSchemaVersion) {
        this.logger.debug(`Updating mappings of existing index due to schema version mismatch`);
        await this.updateMappingsOfExistingIndex({
          name: writeIndex.name,
        });
      }
    }

    return await cb();
  }

  private async ensureMappingsBeforeReading<T>(cb: () => Promise<T>): Promise<T> {
    if (!this.updateMappingsPromise) {
      this.updateMappingsPromise = this.updateMappingsIfNeeded().catch((error) => {
        this.updateMappingsPromise = undefined;
        throw error;
      });
    }

    await this.updateMappingsPromise;
    return cb();
  }

  private search: StorageClientSearch<TApplicationType> = async (request, transportOptions) => {
    return this.ensureMappingsBeforeReading(async () => {
      const searchRequest = {
        ...request,
        index: this.getSearchIndexPattern(),
        allow_no_indices: true,
      };
      return (await wrapEsCall(
        this.esClient
          .search(searchRequest, ...optionalTransportArgs(transportOptions))
          .then((response) => {
            return {
              ...response,
              hits: {
                ...response.hits,
                hits: response.hits.hits.map((hit) => ({
                  ...hit,
                  _source: this.maybeMigrateSource(hit._source),
                })),
              },
            };
          })
          .catch((error): StorageClientSearchResponse<TApplicationType, any> => {
            if (isNotFoundError(error)) {
              return {
                _shards: {
                  failed: 0,
                  successful: 0,
                  total: 0,
                },
                hits: {
                  hits: [],
                  total: {
                    relation: 'eq',
                    value: 0,
                  },
                },
                timed_out: false,
                took: 0,
              };
            }
            throw error;
          })
      )) as unknown as ReturnType<StorageClientSearch<TApplicationType>>;
    });
  };

  private index: StorageClientIndex<TApplicationType> = async (
    { id, refresh = 'wait_for', ...request },
    transportOptions
  ): Promise<StorageClientIndexResponse> => {
    const attemptIndex = async (): Promise<IndexResponse> => {
      const indexResponse = await wrapEsCall(
        this.esClient.index(
          {
            ...request,
            id,
            refresh,
            index: this.getWriteTarget(),
            require_alias: true,
          },
          ...optionalTransportArgs(transportOptions)
        )
      );

      return indexResponse;
    };

    return this.validateComponentsBeforeWriting(attemptIndex).then(async (response) => {
      this.logger.debug(() => `Indexed document ${id} into ${response._index}`);

      return response;
    });
  };

  private bulk: StorageClientBulk<TApplicationType> = (
    { operations, refresh = 'wait_for', throwOnFail = false, ...request },
    transportOptions
  ): Promise<StorageClientBulkResponse> => {
    if (operations.length === 0) {
      this.logger.debug(`Bulk request with 0 operations is a noop`);
      return Promise.resolve({
        errors: false,
        items: [],
        took: 0,
        ingest_took: 0,
      });
    }

    this.logger.debug(`Processing ${operations.length} bulk operations`);

    const bulkOperations = operations.flatMap((operation): BulkOperationContainer[] => {
      if ('index' in operation) {
        const { if_seq_no: ifSeqNo, if_primary_term: ifPrimaryTerm } = operation.index;
        const hasSeqNo = ifSeqNo != null;
        const hasPrimaryTerm = ifPrimaryTerm != null;
        if (hasSeqNo !== hasPrimaryTerm) {
          throw new Error(
            'Bulk index OCC requires both if_seq_no and if_primary_term to be set together'
          );
        }

        return [
          {
            index: {
              _id: operation.index._id,
              ...(hasSeqNo && hasPrimaryTerm
                ? { if_seq_no: ifSeqNo, if_primary_term: ifPrimaryTerm }
                : {}),
            },
          },
          operation.index.document as {},
        ];
      }

      if ('create' in operation) {
        return [
          {
            create: {
              _id: operation.create._id,
            },
          },
          operation.create.document as {},
        ];
      }

      return [operation];
    });

    const attemptBulk = async () => {
      return wrapEsCall(
        this.esClient.bulk(
          {
            ...request,
            refresh,
            operations: bulkOperations,
            index: this.getWriteTarget(),
            require_alias: true,
          },
          ...optionalTransportArgs(transportOptions)
        )
      );
    };

    return this.validateComponentsBeforeWriting(attemptBulk).then(async (response) => {
      // Check for errors and throw if throwOnFail is true
      if (throwOnFail) {
        const erroredItems = response.items.filter((item) => {
          const operation = Object.keys(item)[0] as BulkOperationType;
          return item[operation]?.error;
        });
        if (erroredItems.length > 0) {
          throw new BulkOperationError(
            `Bulk operation failed for ${erroredItems.length} out of ${
              response.items.length
            } items: ${JSON.stringify(erroredItems)}`,
            response
          );
        }
      }
      return response;
    });
  };

  private clean: StorageClientClean = async (): Promise<StorageClientCleanResponse> => {
    const allIndices = await this.getExistingIndices();
    const hasIndices = Object.keys(allIndices).length > 0;
    // Delete all indices
    await Promise.all(
      Object.keys(allIndices).map((index) =>
        wrapEsCall(
          this.esClient.indices.delete({
            index,
          })
        )
      )
    );
    // Delete the index template
    const template = await this.getExistingIndexTemplate();
    const hasTemplate = !!template;
    if (template) {
      await wrapEsCall(
        this.esClient.indices.deleteIndexTemplate({
          name: getIndexTemplateName(this.storage.name),
        })
      );
    }

    return {
      acknowledged: true,
      result: hasIndices || hasTemplate ? 'deleted' : 'noop',
    };
  };

  private delete: StorageClientDelete = async (
    { id, refresh = 'wait_for', ...request },
    transportOptions
  ): Promise<StorageClientDeleteResponse> => {
    this.logger.debug(`Deleting document with id ${id}`);
    const searchResponse = await this.search({
      track_total_hits: false,
      size: 1,
      query: {
        bool: {
          filter: [
            {
              term: {
                _id: id,
              },
            },
          ],
        },
      },
    });

    const document = searchResponse.hits.hits[0];

    if (document) {
      await wrapEsCall(
        this.esClient.delete(
          {
            ...request,
            refresh,
            id,
            index: document._index,
          },
          ...optionalTransportArgs(transportOptions)
        )
      );

      return { acknowledged: true, result: 'deleted' };
    }

    return { acknowledged: true, result: 'not_found' };
  };

  private get: StorageClientGet<TApplicationType> = async (
    { id, ...request },
    transportOptions
  ) => {
    const response = await this.search(
      {
        track_total_hits: false,
        size: 1,
        terminate_after: 1,
        query: {
          bool: {
            filter: [
              {
                term: {
                  _id: id,
                },
              },
            ],
          },
        },
        ...request,
      },
      transportOptions
    );

    const hit: SearchHit = response.hits.hits[0];

    if (!hit) {
      throw new errors.ResponseError({
        meta: {
          aborted: false,
          attempts: 1,
          connection: null,
          context: null,
          name: 'resource_not_found_exception',
          request: {} as unknown as DiagnosticResult['meta']['request'],
        },
        warnings: [],
        body: 'resource_not_found_exception',
        statusCode: 404,
      });
    }

    return {
      _id: hit._id!,
      _index: hit._index,
      found: true,
      _source: this.maybeMigrateSource(hit._source),
      _ignored: hit._ignored,
      _primary_term: hit._primary_term,
      _routing: hit._routing,
      _seq_no: hit._seq_no,
      _version: hit._version,
      fields: hit.fields,
    };
  };

  private maybeMigrateSource = (_source: unknown): TApplicationType => {
    // check whether source is an object, if not fail
    if (typeof _source !== 'object' || _source === null) {
      throw new Error(`Source must be an object, got ${typeof _source}`);
    }
    if (this.options.migrateSource) {
      return this.options.migrateSource(_source as Record<string, unknown>);
    }
    return _source as TApplicationType;
  };

  /**
   * Checks whether the backing index exists. No mapping
   * reconciliation is performed.
   */
  private existsIndex: StorageClientExistsIndex = () => {
    return this.esClient.indices.exists({
      index: this.getSearchIndexPattern(),
    });
  };

  /**
   * @see {@link StorageClientEsql}
   */

  private esql: StorageClientEsql = (
    { pipeline, metadata, filter, drop_null_columns = true, migrateSource = true, setOptions },
    transportOptions
  ) =>
    this.ensureMappingsBeforeReading(async () => {
      const emptyResponse: ESQLSearchResponse = { columns: [], values: [] };

      // Build the adapter-owned FROM clause; callers supply only the pipeline.
      const fromQuery =
        metadata && metadata.length > 0
          ? esql.from([this.getSearchIndexPattern()], metadata)
          : esql.from([this.getSearchIndexPattern()]);

      // Prepend any SET options (e.g. unmapped_fields="LOAD") before the FROM clause.
      if (setOptions) {
        for (const [key, value] of Object.entries(setOptions)) {
          fromQuery.addSetCommand(key, value);
        }
      }

      const { query: fromStr } = fromQuery.toRequest();
      const { query: pipelineStr, params } = pipeline.toRequest();

      // Reject pipelines that include their own FROM. The adapter owns the
      // FROM clause; chaining `FROM <ours> | FROM <theirs>` is invalid ES|QL
      // and would surface as an opaque 400 from ES.
      if (/^\s*FROM\b/i.test(pipelineStr)) {
        throw new Error(
          `StorageClientEsql: pipeline must not start with a FROM clause; the storage adapter owns the FROM. Got: ${pipelineStr.slice(
            0,
            80
          )}`
        );
      }

      const query = `${fromStr} | ${pipelineStr}`;

      try {
        const esqlRequest = {
          query,
          ...(params && params.length > 0 ? { params } : {}),
          ...(filter !== undefined ? { filter } : {}),
          drop_null_columns,
          format: 'json' as const,
        } as unknown as EsqlQueryRequest;
        const response = (await wrapEsCall(
          this.esClient.esql.query(esqlRequest, ...optionalTransportArgs(transportOptions))
        )) as unknown as ESQLSearchResponse;

        if (migrateSource && this.options.migrateSource && metadata?.includes('_source')) {
          const sourceIdx = response.columns.findIndex((c) => c.name === '_source');
          if (sourceIdx >= 0) {
            response.values = response.values.map((row) => {
              const copy = [...row];
              copy[sourceIdx] = this.options.migrateSource!(
                copy[sourceIdx] as Record<string, unknown>
              );
              return copy;
            });
          }
        }

        return response;
      } catch (error) {
        if (isNotFoundError(error) || isEsqlUnknownIndexError(error)) return emptyResponse;
        throw error;
      }
    });

  getClient(): InternalIStorageClient<TApplicationType> {
    return {
      bulk: this.bulk,
      delete: this.delete,
      clean: this.clean,
      index: this.index,
      search: this.search,
      get: this.get,
      existsIndex: this.existsIndex,
      esql: this.esql,
    };
  }
}

export type SimpleStorageIndexAdapter<TStorageSettings extends IndexStorageSettings> =
  StorageIndexAdapter<TStorageSettings, StorageDocumentOf<TStorageSettings>>;
