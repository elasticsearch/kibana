/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core/server';
import { getMetadataEntitiesDataStreamName } from '../asset_manager/metadata_data_stream';
import { runWithSpan } from '../../telemetry/traces';
import type { BulkCreateEntityMetadataDocsResult } from '../../infra/elasticsearch/entity_metadata';
import { bulkCreateEntityMetadataDocs } from '../../infra/elasticsearch/entity_metadata';

interface EntityMetadataClientDependencies {
  logger: Logger;
  esClient: ElasticsearchClient;
  namespace: string;
}

/**
 * Generic write surface for the entity metadata datastream
 * (`.entities.v2.metadata.security_{namespace}`). The datastream is shared
 * across event kinds — relationships today, behaviors/anomalies/etc.
 * tomorrow — so this client owns the append primitive and stays
 * event-action agnostic. Domain-specific read clients live in their own
 * folders and call this for writes.
 */
export class EntityMetadataClient {
  private readonly logger: Logger;
  private readonly esClient: ElasticsearchClient;
  private readonly namespace: string;

  constructor(deps: EntityMetadataClientDependencies) {
    this.logger = deps.logger;
    this.esClient = deps.esClient;
    this.namespace = deps.namespace;
    this.initWithTracing();
  }

  private initWithTracing(): void {
    const namespace = this.namespace;

    const baseBulkAppendMetadata = this.bulkAppendMetadata.bind(this);
    const tracedBulkAppendMetadata = <TDoc extends object>(
      docs: TDoc[]
    ): Promise<BulkCreateEntityMetadataDocsResult> =>
      runWithSpan({
        name: 'entityStore.metadata.bulk_append',
        namespace,
        attributes: {
          'entity_store.metadata.operation': 'bulk_append',
          'entity_store.objects.count': docs.length,
        },
        cb: () => baseBulkAppendMetadata(docs),
      });

    Object.defineProperty(this, 'bulkAppendMetadata', {
      value: tracedBulkAppendMetadata,
      configurable: true,
      writable: true,
    });
  }

  /**
   * Appends one or more documents to the entity metadata datastream.
   * Does not throw on partial bulk failure — the underlying helper retries
   * transient errors and reports unrecoverable per-doc drops via its `onDrop`
   * hook (logged in the infra layer). Resolves to `{ successful, failed }`
   * counts. Transport-level exceptions propagate to the caller's boundary.
   *
   * The caller owns the doc shape (must include `event.action` and any
   * domain-specific fields). The client does not validate the shape.
   */
  public async bulkAppendMetadata<TDoc extends object>(
    docs: TDoc[]
  ): Promise<BulkCreateEntityMetadataDocsResult> {
    if (docs.length === 0) return { successful: 0, failed: 0 };

    const { successful, failed } = await bulkCreateEntityMetadataDocs(this.esClient, {
      index: getMetadataEntitiesDataStreamName(this.namespace),
      docs,
      logger: this.logger,
    });

    this.logger.debug(`Appended ${successful} entity metadata docs, dropped ${failed}`);
    return { successful, failed };
  }
}
