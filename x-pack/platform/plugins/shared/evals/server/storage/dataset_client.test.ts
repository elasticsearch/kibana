/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { InternalIStorageClient } from '@kbn/storage-adapter';
import type { DatasetExampleStorageProperties } from './examples_storage';
import type { DatasetStorageProperties } from './datasets_storage';
import type {
  DatasetExamplesStorageAdapter,
  DatasetsStorageAdapter,
  DatasetExampleInput,
} from './dataset_client';
import { DatasetClient } from './dataset_client';
import { DatasetAlreadyExistsError } from './dataset_already_exists_error';
import { ExampleAlreadyExistsError } from './example_already_exists_error';
import { ExampleNotFoundError } from './example_not_found_error';

type DatasetStorageDocument = DatasetStorageProperties & { _id?: string };
type DatasetExampleStorageDocument = DatasetExampleStorageProperties & { _id?: string };

/**
 * Mirrors how the real StorageIndexAdapter handles `_source` projections:
 * `_source: false` is rejected at runtime (the adapter's `maybeMigrateSource`
 * throws on a non-object source), and `_source: ['field', ...]` returns a
 * partial document. Keeping the mock faithful means a regression to
 * `_source: false` blows up unit tests, not just the adapter-contract suite.
 */
const projectSource = <TDoc extends object>(source: TDoc, sourceParam: unknown): Partial<TDoc> => {
  if (sourceParam === false) {
    throw new Error(`Source must be an object, got undefined`);
  }
  if (Array.isArray(sourceParam)) {
    const projected: Record<string, unknown> = {};
    for (const field of sourceParam) {
      if (typeof field === 'string' && field in source) {
        projected[field] = (source as Record<string, unknown>)[field];
      }
    }
    return projected as Partial<TDoc>;
  }
  return source;
};

const createDatasetStorageClient = () => {
  const docs = new Map<string, DatasetStorageDocument>();

  const search = jest.fn(async (params: Record<string, unknown>) => {
    const query = (params.query ?? {}) as {
      term?: Record<string, string>;
      bool?: {
        should?: Array<Record<string, any>>;
        must_not?: Array<Record<string, any>>;
      };
    };
    const termQuery = query.term;
    const boolQuery = query.bool;
    let rows = Array.from(docs.entries()).map(([id, document]) => ({ _id: id, _source: document }));

    if (termQuery?.name) {
      rows = rows.filter((row) => row._source.name === termQuery.name);
    } else if (termQuery?._id) {
      rows = rows.filter((row) => row._id === termQuery._id);
    } else if (boolQuery) {
      // Backfill query: datasets missing the denormalized count.
      for (const clause of boolQuery.must_not ?? []) {
        if (clause.exists?.field === 'examples_count') {
          rows = rows.filter((row) => row._source.examples_count === undefined);
        }
      }

      // Search query: wildcard on name (keyword) OR match on description (text).
      const shouldClauses = boolQuery.should;
      if (shouldClauses && shouldClauses.length > 0) {
        const wildcardValue = shouldClauses
          .map((clause) => clause.wildcard?.name?.value as string | undefined)
          .find((value): value is string => typeof value === 'string');
        const matchValue = shouldClauses
          .map((clause) => clause.match?.description as string | undefined)
          .find((value): value is string => typeof value === 'string');
        const needle = (wildcardValue ?? '').replace(/^\*/, '').replace(/\*$/, '').toLowerCase();
        rows = rows.filter((row) => {
          const nameMatch = needle ? row._source.name.toLowerCase().includes(needle) : false;
          const descMatch = matchValue
            ? row._source.description.toLowerCase().includes(matchValue.toLowerCase())
            : false;
          return nameMatch || descMatch;
        });
      }
    }

    const sortClause = (
      params.sort as Array<Record<string, { order?: 'asc' | 'desc' }>> | undefined
    )?.[0];
    if (sortClause) {
      const [field, { order = 'asc' }] = Object.entries(sortClause)[0];
      rows.sort((left, right) => {
        const leftVal = (left._source as unknown as Record<string, unknown>)[field];
        const rightVal = (right._source as unknown as Record<string, unknown>)[field];
        let comparison: number;
        if (typeof leftVal === 'number' && typeof rightVal === 'number') {
          comparison = leftVal - rightVal;
        } else {
          comparison = String(leftVal ?? '').localeCompare(String(rightVal ?? ''));
        }
        return order === 'desc' ? -comparison : comparison;
      });
    }

    const from = (params.from as number | undefined) ?? 0;
    const size = (params.size as number | undefined) ?? rows.length;
    const paged = rows.slice(from, from + size).map((row) => ({
      _id: row._id,
      _source: projectSource(row._source, params._source),
    }));

    return {
      hits: {
        hits: paged,
        total: { value: rows.length },
      },
    };
  });

  const index = jest.fn(async ({ id, op_type: opType, document }: Record<string, unknown>) => {
    if (opType === 'create' && docs.has(id as string)) {
      throw new errors.ResponseError({
        statusCode: 409,
        body: {},
        headers: {},
        warnings: [],
        meta: {} as any,
      });
    }

    docs.set(id as string, document as DatasetStorageDocument);
    return { result: 'created' };
  });

  const remove = jest.fn(async ({ id }: Record<string, unknown>) => {
    const deleted = docs.delete(id as string);
    return { result: deleted ? 'deleted' : 'not_found' };
  });

  const bulk = jest.fn(
    async ({
      operations,
    }: {
      operations: Array<{
        index?: { _id: string; document: DatasetStorageDocument };
        delete?: { _id: string };
      }>;
    }) => {
      const items: Array<{ index?: { status: number }; delete?: { status: number } }> = [];

      for (const operation of operations) {
        if (operation.index) {
          // ES `index` action overwrites (no 409), matching the storage adapter.
          docs.set(operation.index._id, operation.index.document);
          items.push({ index: { status: 200 } });
          continue;
        }

        if (operation.delete) {
          docs.delete(operation.delete._id);
          items.push({ delete: { status: 200 } });
        }
      }

      return { items };
    }
  );

  const client = {
    search,
    index,
    delete: remove,
    bulk,
  } as unknown as InternalIStorageClient<DatasetStorageDocument>;

  return { docs, client };
};

const createExamplesStorageClient = () => {
  const docs = new Map<string, DatasetExampleStorageDocument>();

  const search = jest.fn(async (params: Record<string, unknown>) => {
    const termQuery = (params.query as { term?: Record<string, string> } | undefined)?.term;
    const termsQuery = (params.query as { terms?: { dataset_id?: string[] } } | undefined)?.terms
      ?.dataset_id;

    let rows = Array.from(docs.entries()).map(([id, document]) => ({ _id: id, _source: document }));

    if (termQuery?.dataset_id) {
      rows = rows.filter((row) => row._source.dataset_id === termQuery.dataset_id);
    } else if (termQuery?._id) {
      rows = rows.filter((row) => row._id === termQuery._id);
    } else if (termsQuery) {
      rows = rows.filter((row) => termsQuery.includes(row._source.dataset_id));
    }

    const sortOrder = (
      params.sort as Array<{ created_at?: { order?: 'asc' | 'desc' } }> | undefined
    )?.[0]?.created_at?.order;
    if (sortOrder) {
      rows.sort((left, right) => {
        const leftAt = left._source.created_at ?? '';
        const rightAt = right._source.created_at ?? '';
        return sortOrder === 'desc' ? rightAt.localeCompare(leftAt) : leftAt.localeCompare(rightAt);
      });
    }

    const size = (params.size as number | undefined) ?? rows.length;
    const hits = rows.slice(0, size).map((row) => ({
      _id: row._id,
      _source: projectSource(row._source, params._source),
    }));

    if ((params.aggs as { by_dataset_id?: unknown } | undefined)?.by_dataset_id) {
      const countsByDatasetId = new Map<string, number>();
      for (const row of rows) {
        countsByDatasetId.set(
          row._source.dataset_id,
          (countsByDatasetId.get(row._source.dataset_id) ?? 0) + 1
        );
      }
      return {
        hits: { hits, total: { value: rows.length } },
        aggregations: {
          by_dataset_id: {
            buckets: Array.from(countsByDatasetId.entries()).map(([key, docCount]) => ({
              key,
              doc_count: docCount,
            })),
          },
        },
      };
    }

    return {
      hits: {
        hits,
        total: { value: rows.length },
      },
    };
  });

  const index = jest.fn(async ({ id, document }: Record<string, unknown>) => {
    docs.set(id as string, document as DatasetExampleStorageDocument);
    return { result: 'created' };
  });

  const remove = jest.fn(async ({ id }: Record<string, unknown>) => {
    const deleted = docs.delete(id as string);
    return { result: deleted ? 'deleted' : 'not_found' };
  });

  const bulk = jest.fn(
    async ({
      operations,
      throwOnFail,
    }: {
      operations: Array<{
        index?: { _id: string; document: DatasetExampleStorageDocument };
        delete?: { _id: string };
      }>;
      throwOnFail?: boolean;
    }) => {
      const items: Array<{ index?: { status: number }; delete?: { status: number } }> = [];

      for (const operation of operations) {
        if (operation.index) {
          const { _id: id, document } = operation.index;
          if (docs.has(id)) {
            items.push({ index: { status: 409 } });
          } else {
            docs.set(id, document);
            items.push({ index: { status: 201 } });
          }
          continue;
        }

        if (operation.delete) {
          docs.delete(operation.delete._id);
          items.push({ delete: { status: 200 } });
        }
      }

      if (
        throwOnFail &&
        items.some((item) => (item.index?.status ?? item.delete?.status ?? 200) >= 400)
      ) {
        throw new Error('bulk operation failed');
      }

      return { items };
    }
  );

  const client = {
    search,
    index,
    delete: remove,
    bulk,
  } as unknown as InternalIStorageClient<DatasetExampleStorageDocument>;

  return { docs, client };
};

const createClient = () => {
  const datasetsStorage = createDatasetStorageClient();
  const examplesStorage = createExamplesStorageClient();

  const datasetsStorageAdapter = {
    getClient: () => datasetsStorage.client,
  } as unknown as DatasetsStorageAdapter;
  const examplesStorageAdapter = {
    getClient: () => examplesStorage.client,
  } as unknown as DatasetExamplesStorageAdapter;

  const client = new DatasetClient({
    datasetsStorageAdapter,
    examplesStorageAdapter,
  });

  return { client, datasetsStorage, examplesStorage };
};

describe('DatasetClient', () => {
  const baseExampleA: DatasetExampleInput = {
    input: { question: 'What is Kibana?' },
    output: { expected: 'An observability and security UI' },
    metadata: { source: 'docs' },
  };
  const baseExampleB: DatasetExampleInput = {
    input: { question: 'What is Elasticsearch?' },
    output: { expected: 'A search and analytics engine' },
    metadata: { source: 'docs' },
  };
  const baseExampleC: DatasetExampleInput = {
    input: { question: 'What is an index?' },
    output: { expected: 'A logical namespace for documents' },
    metadata: { source: 'guide' },
  };

  it('creates and lists datasets with example counts', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA, baseExampleB]);
    const listing = await client.list({ page: 1, perPage: 10 });
    const fetched = await client.get(created.id);

    expect(created.name).toBe('dataset-1');
    expect(created.examples).toHaveLength(2);
    expect(fetched?.examples).toHaveLength(2);
    expect(listing.total).toBe(1);
    expect(listing.datasets[0]).toMatchObject({
      id: created.id,
      name: 'dataset-1',
      description: 'A dataset',
      examples_count: 2,
    });
  });

  it('updates dataset description without changing the ID', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);
    const updated = await client.update(created.id, {
      description: 'Updated description',
    });

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(created.id);
    expect(updated?.name).toBe('dataset-1');
    expect(updated?.description).toBe('Updated description');
    expect(updated?.examples).toHaveLength(1);
  });

  it('deletes dataset and all associated examples', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA, baseExampleB]);
    const deleted = await client.delete(created.id);
    const fetched = await client.get(created.id);

    expect(deleted).toBe(true);
    expect(fetched).toBeUndefined();
  });

  it('returns true for datasetExists when the dataset exists', async () => {
    const { client, datasetsStorage } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);

    await expect(client.datasetExists(created.id)).resolves.toBe(true);
    expect(datasetsStorage.client.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ _source: ['name'] })
    );
  });

  it('returns false for datasetExists when the dataset does not exist', async () => {
    const { client } = createClient();

    await expect(client.datasetExists('non-existent-id')).resolves.toBe(false);
  });

  it('deletes a single example and preserves remaining examples', async () => {
    const { client, examplesStorage } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA, baseExampleB]);
    const exampleToDelete = created.examples[0];

    await client.deleteExample(exampleToDelete.id, created.id);
    const fetched = await client.get(created.id);

    expect(fetched?.examples).toHaveLength(1);
    expect(fetched?.examples[0].input).toEqual(baseExampleB.input);
    expect(examplesStorage.client.search).toHaveBeenCalledWith(
      expect.objectContaining({ _source: ['dataset_id'] })
    );
  });

  it('throws ExampleNotFoundError when deleting a non-existent example', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);

    await expect(client.deleteExample('non-existent-example-id', created.id)).rejects.toThrow(
      ExampleNotFoundError
    );
  });

  it('deletes an example when expectedDatasetId matches', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);
    const exampleToDelete = created.examples[0];

    await client.deleteExample(exampleToDelete.id, created.id);
    const fetched = await client.get(created.id);

    expect(fetched?.examples).toHaveLength(0);
  });

  it('throws ExampleNotFoundError when expectedDatasetId does not match', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);
    const exampleToDelete = created.examples[0];

    await expect(client.deleteExample(exampleToDelete.id, 'wrong-dataset-id')).rejects.toThrow(
      ExampleNotFoundError
    );

    const fetched = await client.get(created.id);
    expect(fetched?.examples).toHaveLength(1);
  });

  it('updates an example when expectedDatasetId matches', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);
    const exampleToUpdate = created.examples[0];

    const updated = await client.updateExample(
      exampleToUpdate.id,
      { output: { expected: 'updated' } },
      created.id
    );

    expect(updated).toBeDefined();
    expect(updated?.output).toEqual({ expected: 'updated' });
  });

  it('throws ExampleNotFoundError when updating with non-matching expectedDatasetId', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);
    const exampleToUpdate = created.examples[0];

    await expect(
      client.updateExample(
        exampleToUpdate.id,
        { output: { expected: 'updated' } },
        'wrong-dataset-id'
      )
    ).rejects.toThrow(ExampleNotFoundError);

    const fetched = await client.get(created.id);
    expect(fetched?.examples[0].output).toEqual(baseExampleA.output);
  });

  it('deleteExamplesByDatasetId removes all examples for a dataset', async () => {
    const { client, examplesStorage } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA, baseExampleB]);
    const result = await client.deleteExamplesByDatasetId(created.id);

    expect(result).toEqual({ deleted: 2 });

    const fetched = await client.get(created.id);
    expect(fetched?.examples).toHaveLength(0);
    expect(examplesStorage.client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        _source: ['dataset_id'],
        query: { term: { dataset_id: created.id } },
      })
    );
  });

  it('deleteExamplesByDatasetId returns zero when dataset has no examples', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset');
    const result = await client.deleteExamplesByDatasetId(created.id);

    expect(result).toEqual({ deleted: 0 });
  });

  it('throws DatasetAlreadyExistsError when creating a dataset with a duplicate name', async () => {
    const { client } = createClient();

    await client.create('dataset-1', 'A dataset');
    await expect(client.create('dataset-1', 'Duplicate')).rejects.toThrow(
      DatasetAlreadyExistsError
    );
  });

  it('upsert diffs examples and reports added removed unchanged', async () => {
    const { client } = createClient();

    await client.create('dataset-1', 'A dataset', [baseExampleA, baseExampleB]);
    const result = await client.upsert('dataset-1', 'Updated description', [
      baseExampleB,
      baseExampleC,
    ]);
    const dataset = await client.get(result.dataset_id);

    expect(result).toEqual({
      dataset_id: DatasetClient.getDatasetId('dataset-1'),
      added: 1,
      removed: 1,
      unchanged: 1,
    });
    expect(dataset?.description).toBe('Updated description');
    expect(dataset?.examples).toHaveLength(2);
    expect(dataset?.examples.map((example) => example.input)).toEqual([
      baseExampleB.input,
      baseExampleC.input,
    ]);
  });

  it('throws ExampleAlreadyExistsError when updating an example to match another existing example', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA, baseExampleB]);
    const exampleToUpdate = created.examples[0];

    await expect(
      client.updateExample(
        exampleToUpdate.id,
        {
          input: baseExampleB.input,
          output: baseExampleB.output,
          metadata: baseExampleB.metadata ?? undefined,
        },
        created.id
      )
    ).rejects.toThrow(ExampleAlreadyExistsError);

    const dataset = await client.get(created.id);
    expect(dataset?.examples).toHaveLength(2);
  });

  it('throws ExampleAlreadyExistsError when adding a duplicate example', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);

    await expect(client.addExamples(created.id, [baseExampleA])).rejects.toThrow(
      ExampleAlreadyExistsError
    );

    const dataset = await client.get(created.id);
    expect(dataset?.examples).toHaveLength(1);
  });

  it('filters datasets by name via search', async () => {
    const { client } = createClient();

    await client.create('kibana-dataset', 'About dashboards', [baseExampleA]);
    await client.create('elasticsearch-dataset', 'About queries', [baseExampleB]);

    const result = await client.list({ search: 'kibana' });

    expect(result.total).toBe(1);
    expect(result.datasets.map((dataset) => dataset.name)).toEqual(['kibana-dataset']);
  });

  it('filters datasets by description via search', async () => {
    const { client } = createClient();

    await client.create('dataset-a', 'covers dashboards', [baseExampleA]);
    await client.create('dataset-b', 'covers ingest pipelines', [baseExampleB]);

    const result = await client.list({ search: 'ingest' });

    expect(result.total).toBe(1);
    expect(result.datasets.map((dataset) => dataset.name)).toEqual(['dataset-b']);
  });

  it('sorts datasets by example count', async () => {
    const { client } = createClient();

    await client.create('few', 'A dataset', [baseExampleA]);
    await client.create('many', 'A dataset', [baseExampleA, baseExampleB, baseExampleC]);

    const ascending = await client.list({ sortField: 'examples_count', sortOrder: 'asc' });
    expect(ascending.datasets.map((dataset) => dataset.name)).toEqual(['few', 'many']);

    const descending = await client.list({ sortField: 'examples_count', sortOrder: 'desc' });
    expect(descending.datasets.map((dataset) => dataset.name)).toEqual(['many', 'few']);
  });

  it('maintains examples_count as examples are added and removed', async () => {
    const { client } = createClient();

    const created = await client.create('dataset-1', 'A dataset', [baseExampleA]);
    expect((await client.list()).datasets[0].examples_count).toBe(1);

    await client.addExamples(created.id, [baseExampleB]);
    expect((await client.list()).datasets[0].examples_count).toBe(2);

    await client.deleteExample(created.examples[0].id, created.id);
    expect((await client.list()).datasets[0].examples_count).toBe(1);
  });

  it('backfills examples_count for datasets missing it and is idempotent', async () => {
    const { client, datasetsStorage } = createClient();

    const created = await client.create('legacy', 'legacy dataset', [baseExampleA, baseExampleB]);

    // Simulate a dataset written before examples_count existed.
    const stored = datasetsStorage.docs.get(created.id);
    expect(stored).toBeDefined();
    const updatedAtBefore = stored!.updated_at;
    delete (stored as { examples_count?: number }).examples_count;

    const firstRun = await client.backfillDatasetCounts();
    expect(firstRun.updated).toBe(1);
    expect(datasetsStorage.docs.get(created.id)?.examples_count).toBe(2);
    // Backfill preserves updated_at (it is not a user-facing modification).
    expect(datasetsStorage.docs.get(created.id)?.updated_at).toBe(updatedAtBefore);

    const secondRun = await client.backfillDatasetCounts();
    expect(secondRun.updated).toBe(0);
  });
});
