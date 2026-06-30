/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';
import type { TransportRequestOptionsWithOutMeta } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type * as api from '@elastic/elasticsearch/lib/api/types';
import type { GetFieldsOf, MappingsDefinition } from '@kbn/es-mappings';
import type {
  AnyDataStreamDefinition,
  BaseSearchRuntimeMappings,
  IDataStreamClient,
  DataStreamDefinition,
} from './types';
import type { ClientHelpers } from './types/client';
import type { ClientSearchRequest, ClientCreateRequest } from './types/es_api';

import { initialize } from './initialize';
import { initializeIndexTemplate } from './initialize/index_template';
import { initializeDataStream } from './initialize/data_stream';
import { getExistingDataStream, getExistingIndexTemplate } from './initialize/exists_checks';
import { validateClientArgs } from './validate_client_args';
import {
  generateSpacePrefixedId,
  throwOnIdWithSeparator,
  decorateDocumentWithSpace,
  buildSpaceFilter,
  buildSpaceAgnosticFilter,
} from './space_utils';

export const DEFAULT_SPACE = 'default';

export class DataStreamClient<
  MappingsInDefinition extends MappingsDefinition,
  FullDocumentType extends GetFieldsOf<MappingsInDefinition> = GetFieldsOf<MappingsInDefinition>,
  SRM extends BaseSearchRuntimeMappings = never
> implements IDataStreamClient<MappingsInDefinition, FullDocumentType, SRM>
{
  private readonly runtimeFields: string[];
  private constructor(
    private readonly client: ElasticsearchClient,
    private readonly dataStreamDefinition: DataStreamDefinition<
      MappingsInDefinition,
      FullDocumentType,
      SRM
    >
  ) {
    this.runtimeFields = Object.keys(dataStreamDefinition.searchRuntimeMappings ?? {});
  }

  /**
   * This function ensures setup has been run before returning an instance of the client.
   *
   * @remark This function should execute early in the application lifecycle and preferably once per
   *         data stream. However, it should be idempotent.
   */
  public static async initialize<
    MappingsInDefinition extends MappingsDefinition,
    FullDocumentType extends GetFieldsOf<MappingsInDefinition> = GetFieldsOf<MappingsInDefinition>,
    SRM extends BaseSearchRuntimeMappings = never
  >(args: {
    dataStream: DataStreamDefinition<MappingsInDefinition, FullDocumentType, SRM>;
    elasticsearchClient: ElasticsearchClient;
    logger: Logger;
    lazyCreation?: boolean;
  }) {
    validateClientArgs(args);
    const { dataStreamReady } = await initialize({ ...args, lazyCreation: args.lazyCreation });
    if (!dataStreamReady) {
      return;
    }

    return new DataStreamClient(args.elasticsearchClient, args.dataStream);
  }

  /**
   * Install or update the index template for a data stream without creating the data stream.
   *
   * Use this at plugin setup time (e.g. with the internal/system user) to ensure the template
   * is in place before the first write happens. The data stream itself will be auto-created by
   * Elasticsearch on the first write.
   *
   * If a data stream already exists when this is called (e.g. on a deploy that bumps `version`),
   * mapping changes are applied to the current write index — same contract as
   * {@link DataStreamClient.initialize}, minus the data stream creation step.
   *
   * Use {@link DataStreamClient.fromDefinition} to obtain a client at runtime.
   *
   * @remark Idempotent: subsequent calls with the same definition are no-ops; calls with a higher
   *         `version` will update the template and migrate mappings on the existing write index.
   */
  public static async initializeTemplate(args: {
    dataStream: AnyDataStreamDefinition;
    elasticsearchClient: ElasticsearchClient;
    logger: Logger;
  }): Promise<void> {
    validateClientArgs(args);
    const { dataStream, elasticsearchClient } = args;
    const logger = args.logger.get('data-streams-setup');

    if (!dataStream.name) {
      throw new Error('Data stream name is required');
    }

    const [existingDataStream, existingIndexTemplate] = await Promise.all([
      getExistingDataStream(elasticsearchClient, dataStream.name, logger),
      getExistingIndexTemplate(elasticsearchClient, dataStream.name, logger),
    ]);

    await initializeIndexTemplate({
      logger,
      dataStream,
      elasticsearchClient,
      existingIndexTemplate,
      skipCreation: false,
    });

    // Apply mapping migrations to the existing write index when present. The pre-update
    // `existingIndexTemplate` reference is intentional: it lets `initializeDataStream` detect
    // a version bump and run `simulateIndexTemplate` + `putMapping` against the write index.
    // When no data stream exists yet, this is a no-op thanks to the `skipCreation` guard.
    await initializeDataStream({
      logger,
      dataStream,
      elasticsearchClient,
      existingDataStream,
      existingIndexTemplate,
      skipCreation: true,
    });
  }

  /**
   * Build a client for an already-initialized data stream.
   *
   * Use this in request-scoped code paths to avoid re-running setup on every call. The
   * data stream's index template should already have been installed at startup via
   * {@link DataStreamClient.initializeTemplate} (or {@link DataStreamClient.initialize}).
   *
   * If the data stream does not exist yet, Elasticsearch will auto-create it on the first
   * write through this client, provided a matching index template is in place.
   */
  public static fromDefinition<
    MappingsInDefinition extends MappingsDefinition,
    FullDocumentType extends GetFieldsOf<MappingsInDefinition> = GetFieldsOf<MappingsInDefinition>,
    SRM extends BaseSearchRuntimeMappings = never
  >(args: {
    dataStream: DataStreamDefinition<MappingsInDefinition, FullDocumentType, SRM>;
    elasticsearchClient: ElasticsearchClient;
  }): DataStreamClient<MappingsInDefinition, FullDocumentType, SRM> {
    return new DataStreamClient(args.elasticsearchClient, args.dataStream);
  }

  public helpers: ClientHelpers<SRM> = {
    getFieldsFromHit: (hit) => {
      const fields = (hit.fields ?? {}) as Record<keyof SRM, unknown[]>;
      return fields;
    },
  };

  public async create(args: ClientCreateRequest<FullDocumentType>) {
    const { space: rawSpace, documents, ...restArgs } = args;
    const space = rawSpace === '' ? DEFAULT_SPACE : rawSpace;

    // Convert documents to ES bulk format: [metadata, document] pairs
    const operations: Array<api.BulkOperationContainer | FullDocumentType> = [];

    for (const doc of documents) {
      // Extract _id from document if present
      const { _id, ...documentWithoutId } = doc as { _id?: string; [key: string]: unknown };

      // Validate _id if provided
      if (typeof _id !== 'undefined') {
        throwOnIdWithSeparator(_id);
      }

      // Process ID and document based on space
      let processedId: string | undefined = _id;
      let processedDocument: FullDocumentType;

      if (space !== undefined) {
        // Space-aware mode: prefix ID and decorate document (including 'default' space)
        processedId = generateSpacePrefixedId(space, _id);
        processedDocument = decorateDocumentWithSpace(documentWithoutId as FullDocumentType, space);
      } else {
        // Space-agnostic mode: no prefixing or decoration
        processedDocument = documentWithoutId as FullDocumentType;
      }

      // Add create metadata
      operations.push({
        create: processedId ? { _id: processedId } : {},
      } as api.BulkOperationContainer);

      // Add document
      operations.push(processedDocument);
    }

    return this.client.bulk<FullDocumentType>({
      index: this.dataStreamDefinition.name,
      ...restArgs,
      operations,
    });
  }

  public async exists() {
    return this.client.indices.exists({
      index: this.dataStreamDefinition.name,
    });
  }

  public async search<Agg extends Record<string, api.AggregationsAggregate> = {}>(
    args: ClientSearchRequest<SRM>,
    transportOpts?: TransportRequestOptionsWithOutMeta
  ) {
    const { space: rawSpace, query, ...restArgs } = args;
    const space = rawSpace === '' ? DEFAULT_SPACE : rawSpace;

    // Build the space-aware query
    const spaceQuery = this.buildSpaceAwareQuery(query, space);
    const response = await this.client.search<FullDocumentType, Agg>(
      {
        index: this.dataStreamDefinition.name,
        runtime_mappings: this.dataStreamDefinition.searchRuntimeMappings,
        fields: this.runtimeFields,
        ...restArgs,
        query: spaceQuery,
      },
      transportOpts
    );

    // Strip the system-managed kibana.space_ids property from all hits
    if (space !== undefined && response.hits?.hits) {
      return {
        ...response,
        hits: {
          ...response.hits,
          hits: response.hits.hits.map((hit) => ({
            ...hit,
            _source: this.stripSpaceProperty(hit._source),
          })),
        },
      };
    }

    return response;
  }

  /**
   * Remove the system-managed `kibana` property from a document before returning to the caller.
   */
  private stripSpaceProperty(doc?: FullDocumentType): FullDocumentType | undefined {
    if (typeof doc !== 'object' || doc === null) {
      return doc;
    }
    const { kibana: _, ...rest } = doc as Record<string, unknown>;
    return rest as FullDocumentType;
  }

  /**
   * Build a space-aware query by wrapping the original query with space filtering.
   * All named spaces (including 'default') filter strictly by kibana.space_ids.
   * When space is undefined, only space-agnostic documents (no kibana.space_ids) are returned.
   */
  private buildSpaceAwareQuery(
    originalQuery?: api.QueryDslQueryContainer,
    space?: string
  ): api.QueryDslQueryContainer {
    const filter = space !== undefined ? buildSpaceFilter(space) : buildSpaceAgnosticFilter();
    if (originalQuery) {
      return { bool: { must: [originalQuery], filter: [filter] } };
    }
    return filter;
  }
}
