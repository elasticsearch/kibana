/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type {
  ErrorCause,
  IngestFieldAccessPattern,
  IngestProcessorContainer,
} from '@elastic/elasticsearch/lib/api/types';
import { apiTest } from '@kbn/scout';

/**
 * Optional pipeline settings applied when a pipeline is created for an ingest call.
 */
export interface TestBedPipelineOptions {
  field_access_pattern?: IngestFieldAccessPattern;
}

export interface TestBedIngestOptions {
  pipeline?: TestBedPipelineOptions;
}

export interface TestBedFixture {
  testBed: {
    /**
     * Ingests documents into an index with an optional ingest pipeline.
     * An `order_id` field is automatically added to each document to allow for deterministic sorting.
     * @param indexName The name of the index.
     * @param documents An array of documents to ingest.
     * @param processors An optional array of ingest processors to create a pipeline.
     * @param options Optional ingest options, e.g. pipeline settings like `field_access_pattern`.
     * @returns An object containing the number of ingested documents and an array of errors.
     */
    ingest: (
      indexName: string,
      documents: Array<Record<string, unknown>>,
      processors?: IngestProcessorContainer[],
      options?: TestBedIngestOptions
    ) => Promise<{ errors: ErrorCause[]; docs: number }>;
    /**
     * Gets all documents from an index in their natural, non-deterministic order.
     * @param indexName The name of the index.
     * @returns An array of documents.
     */
    getDocs: (indexName: string) => Promise<Array<Record<string, unknown>>>;
    /**
     * Gets all documents from an index, sorted deterministically by the internal `order_id`.
     * @param indexName The name of the index.
     * @returns A sorted array of documents.
     */
    getDocsOrdered: (indexName: string) => Promise<Array<Record<string, unknown>>>;
    /**
     * Serializes documents with each nested field represented in dot notation.
     * Helpful to compare documents returned by ES|QL queries. Returns in non-deterministic order.
     * @param indexName
     */
    getFlattenedDocs: (indexName: string) => Promise<Array<Record<string, unknown>>>;
    /**
     * Serializes documents with each nested field represented in dot notation, sorted deterministically by `order_id`.
     * @param indexName
     */
    getFlattenedDocsOrdered: (indexName: string) => Promise<Array<Record<string, unknown>>>;
    /**
     * Deletes an index.
     * @param indexName The name of the index to delete.
     */
    clean: (indexName: string) => Promise<void>;
  };
}

export const testBedFixture = apiTest.extend<TestBedFixture>({
  testBed: [
    async ({ esClient }, use) => {
      const createdPipelines = new Set<string>();
      const createdIndexes = new Set<string>();

      const createPipeline = async (
        processors: IngestProcessorContainer[],
        pipelineOptions?: TestBedPipelineOptions
      ) => {
        const pipelineId = `test-bed-pipeline-${Date.now()}`;
        await esClient.ingest.putPipeline({
          id: pipelineId,
          processors,
          ...pipelineOptions,
        });
        createdPipelines.add(pipelineId);
        return pipelineId;
      };

      const ingest = async (
        indexName: string,
        documents: Array<Record<string, unknown>>,
        processors?: IngestProcessorContainer[],
        options?: TestBedIngestOptions
      ) => {
        let pipelineId: string | undefined;
        if (processors && processors.length > 0) {
          pipelineId = await createPipeline(processors, options?.pipeline);
        }

        await ensureIndexCreated(indexName, esClient);
        createdIndexes.add(indexName);

        if (!documents || documents.length === 0) {
          return { docs: 0, errors: [] };
        }

        const body = documents
          .map((doc, idx) => ({ ...doc, order_id: idx })) // Add order_id for deterministic sorting
          .flatMap((doc) => [{ index: { _index: indexName } }, doc]);

        const bulkRequest: Record<string, unknown> = {
          refresh: true,
          body,
        };
        if (pipelineId) {
          bulkRequest.pipeline = pipelineId;
        }

        const esResp = await esClient.bulk(bulkRequest);

        if (esResp.errors) {
          const errorsCauses = esResp.items
            .map((item) => (item.index || item.create || item.update || item.delete)?.error)
            .filter((error): error is ErrorCause => error !== undefined);

          // eslint-disable-next-line no-console
          console.error('Bulk ingestion errors:', JSON.stringify(errorsCauses, null, 2));
          return { docs: 0, errors: errorsCauses };
        }

        return { docs: documents.length, errors: [] };
      };

      const getDocs = async (indexName: string) => {
        const response = await esClient.search({
          index: indexName,
          query: { match_all: {} },
          size: 1000,
        });

        return response.hits.hits.map((hit) => hit._source as Record<string, unknown>);
      };

      const getDocsOrdered = async (indexName: string) => {
        const docs = await getDocs(indexName);
        return docs.sort((a, b) => (a.order_id as number) - (b.order_id as number));
      };

      const getFlattenedDocs = async (indexName: string) => {
        const docs = await getDocs(indexName);

        const docsWithDottedNames = docs.map((doc) => {
          const result: Record<string, unknown> = {};

          const flatten = (obj: Record<string, unknown>, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
              const prefixedKey = prefix ? `${prefix}.${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value as Record<string, unknown>, prefixedKey);
              } else {
                result[prefixedKey] = value;
              }
            }
          };

          flatten(doc);
          return result;
        });

        return docsWithDottedNames;
      };

      const getFlattenedDocsOrdered = async (indexName: string) => {
        const docs = await getFlattenedDocs(indexName);
        return docs.sort((a, b) => (a.order_id as number) - (b.order_id as number));
      };

      const clean = async (indexName: string) => {
        if (await esClient.indices.exists({ index: indexName })) {
          await esClient.indices.delete({
            index: indexName,
            ignore_unavailable: true,
          });
          createdIndexes.delete(indexName);
        }
      };

      // Test execution phase
      await use({
        ingest,
        getDocs,
        getDocsOrdered,
        getFlattenedDocs,
        getFlattenedDocsOrdered,
        clean,
      });

      // Cleanup phase
      await Promise.all([...createdIndexes].map((indexName) => clean(indexName)));
      await Promise.all(
        [...createdPipelines].map((pipelineId) =>
          esClient.ingest.deletePipeline({ id: pipelineId })
        )
      );
    },
    { scope: 'test' },
  ],
});

async function ensureIndexCreated(indexName: string, esClient: Client) {
  if (await esClient.indices.exists({ index: indexName })) {
    return;
  }

  return esClient.indices.create({
    index: indexName,
    mappings: {
      dynamic: 'true',
    },
  });
}
