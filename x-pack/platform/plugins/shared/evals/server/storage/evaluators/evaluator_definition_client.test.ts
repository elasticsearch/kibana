/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/logging';
import type { InternalIStorageClient } from '@kbn/storage-adapter';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { getEvaluatorDefinitionId } from '@kbn/evals-common';
import type { LlmJudgeConfig } from '../../evaluators/user_defined/types';
import { InvalidJudgeConfigError } from '../../evaluators/user_defined/validate_config';
import { BuiltInEvaluatorNameError } from './built_in_evaluator_name_error';
import { EvaluatorAlreadyExistsError } from './evaluator_already_exists_error';
import { EvaluatorNotFoundError } from './evaluator_not_found_error';
import { InvalidEvaluatorNameError } from './invalid_evaluator_name_error';
import type { EvaluatorsStorageAdapter } from './evaluator_definition_client';
import { EvaluatorDefinitionClient } from './evaluator_definition_client';
import type { EvaluatorStorageProperties } from './evaluators_storage';

type EvaluatorStorageDocument = EvaluatorStorageProperties & { _id?: string };
type MockQuery = Record<string, any>;

interface MockRow {
  _id: string;
  _source: EvaluatorStorageDocument;
}

interface MockBulkDeleteItem {
  delete: {
    result?: string;
    error?: { reason?: string };
  };
}

const JUDGE: LlmJudgeConfig = {
  prompt: 'Rate {{{agent_response}}}',
  system_prompt: 'Judge the response according to the supplied criteria.',
  evidence: ['response'],
  output: { scores: [{ name: 'tone', type: 'number' }] },
};

const noBuiltIns = () => false;

const matchesQuery = (row: MockRow, query: MockQuery | undefined): boolean => {
  if (!query || query.match_all) {
    return true;
  }

  if (query.term) {
    const [[field, value]] = Object.entries(query.term) as Array<[string, string]>;
    if (field === '_id') {
      return row._id === value;
    }
    return (row._source as unknown as Record<string, unknown>)[field] === value;
  }

  if (query.terms) {
    const [[field, values]] = Object.entries(query.terms) as Array<[string, string[]]>;
    const actual = (row._source as unknown as Record<string, unknown>)[field];
    if (Array.isArray(actual)) {
      return actual.some((entry) => typeof entry === 'string' && values.includes(entry));
    }
    return typeof actual === 'string' && values.includes(actual);
  }

  if (query.exists) {
    return (
      (row._source as unknown as Record<string, unknown>)[query.exists.field as string] !==
      undefined
    );
  }

  if (query.bool) {
    const asClauses = (clauses: MockQuery | MockQuery[] | undefined): MockQuery[] =>
      clauses === undefined ? [] : Array.isArray(clauses) ? clauses : [clauses];

    const must = asClauses(query.bool.must);
    const filter = asClauses(query.bool.filter);
    const should = asClauses(query.bool.should);
    const mustNot = asClauses(query.bool.must_not);

    return (
      [...must, ...filter].every((clause) => matchesQuery(row, clause)) &&
      mustNot.every((clause) => !matchesQuery(row, clause)) &&
      (should.length === 0 || should.some((clause) => matchesQuery(row, clause)))
    );
  }

  throw new Error(`Unsupported mock query clause: ${JSON.stringify(query)}`);
};

/**
 * Reproduces the `composite` + `top_hits` shape `listLatest` uses, including its
 * `created_at desc` ordering, so the test exercises the same collapse the real
 * read does rather than a simplification of it.
 */
const buildAggregations = (aggs: MockQuery | undefined, rows: MockRow[]) => {
  if (!aggs?.by_name) {
    return {};
  }

  const byName = new Map<string, MockRow[]>();
  for (const row of rows) {
    byName.set(row._source.name, [...(byName.get(row._source.name) ?? []), row]);
  }

  const topHitsSize = aggs.by_name.aggs.latest.top_hits.size as number;
  const pageSize = aggs.by_name.composite.size as number;
  const afterName = aggs.by_name.composite.after?.name as string | undefined;
  const entries = [...byName.entries()].sort(([left], [right]) => left.localeCompare(right));
  const start = afterName ? entries.findIndex(([name]) => name === afterName) + 1 : 0;
  const page = entries.slice(start, start + pageSize);
  const lastName = page.at(-1)?.[0];
  const hasMore = start + page.length < entries.length;

  return {
    aggregations: {
      by_name: {
        ...(hasMore && lastName ? { after_key: { name: lastName } } : {}),
        buckets: page.map(([name, bucketRows]) => ({
          key: { name },
          doc_count: bucketRows.length,
          latest: {
            hits: {
              hits: [...bucketRows]
                .sort((left, right) =>
                  right._source.created_at.localeCompare(left._source.created_at)
                )
                .slice(0, topHitsSize),
            },
          },
        })),
      },
    },
  };
};

const conflict = () =>
  new errors.ResponseError({
    statusCode: 409,
    body: {},
    headers: {},
    warnings: [],
    meta: {} as any,
  });

const createStorageAdapter = ({
  onSearch,
}: { onSearch?: (params: Record<string, unknown>) => void } = {}) => {
  const docs = new Map<string, EvaluatorStorageDocument>();

  const search = jest.fn(async (params: Record<string, unknown>) => {
    onSearch?.(params);

    const allRows: MockRow[] = [...docs.entries()].map(([id, document]) => ({
      _id: id,
      _source: document,
    }));
    const matchingRows = allRows.filter((row) =>
      matchesQuery(row, params.query as MockQuery | undefined)
    );
    const rows = params.sort
      ? matchingRows.sort((left, right) =>
          right._source.created_at.localeCompare(left._source.created_at)
        )
      : matchingRows;
    const size = (params.size as number | undefined) ?? rows.length;

    return {
      hits: { hits: rows.slice(0, size), total: { value: rows.length } },
      ...buildAggregations(params.aggs as MockQuery | undefined, rows),
    };
  });

  const index = jest.fn(async ({ id, op_type: opType, document }: Record<string, unknown>) => {
    const docId = id as string;
    if (opType === 'create' && docs.has(docId)) {
      throw conflict();
    }
    docs.set(docId, document as EvaluatorStorageDocument);
    return { result: 'created' };
  });

  const bulk = jest.fn(
    async ({
      operations,
    }: {
      operations: Array<{ delete?: { _id: string } }>;
    }): Promise<{ errors: boolean; items: MockBulkDeleteItem[] }> => {
      const items: MockBulkDeleteItem[] = operations.map((operation) => {
        const found = operation.delete ? docs.delete(operation.delete._id) : false;
        return { delete: { result: found ? 'deleted' : 'not_found' } };
      });
      return { errors: false, items };
    }
  );

  const client = {
    search,
    index,
    bulk,
  } as unknown as InternalIStorageClient<EvaluatorStorageDocument>;

  return {
    docs,
    search,
    index,
    bulk,
    adapter: { getClient: () => client } as unknown as EvaluatorsStorageAdapter,
  };
};

const createClient = (
  options: {
    spaceId?: string;
    onSearch?: (params: Record<string, unknown>) => void;
    isBuiltIn?: (name: string) => boolean;
  } = {}
) => {
  const storage = createStorageAdapter({ onSearch: options.onSearch });
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;

  return {
    ...storage,
    client: new EvaluatorDefinitionClient({
      storageAdapter: storage.adapter,
      logger,
      spaceId: options.spaceId ?? DEFAULT_SPACE_ID,
      isBuiltIn: options.isBuiltIn ?? noBuiltIns,
    }),
  };
};

describe('EvaluatorDefinitionClient', () => {
  describe('create', () => {
    it('writes 1.0.0 at the id derived from the space, name, and version', async () => {
      const { client, docs } = createClient();

      const created = await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      expect(created).toEqual(
        expect.objectContaining({
          id: getEvaluatorDefinitionId(DEFAULT_SPACE_ID, 'tone', '1.0.0'),
          name: 'tone',
          version: '1.0.0',
          kind: 'llm',
          description: 'Tone',
          judge: JUDGE,
        })
      );
      expect(docs.get(created.id)).toEqual(
        expect.objectContaining({ name: 'tone', version: '1.0.0', space_ids: [DEFAULT_SPACE_ID] })
      );
    });

    it('assigns the definition to the client space', async () => {
      const { client, docs } = createClient({ spaceId: 'marketing' });

      const created = await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      expect(docs.get(created.id)?.space_ids).toEqual(['marketing']);
    });

    it('records who created the version', async () => {
      const { client } = createClient();

      await expect(
        client.create({ name: 'tone', description: 'Tone', judge: JUDGE, createdBy: 'alice' })
      ).resolves.toEqual(expect.objectContaining({ created_by: 'alice' }));
    });

    it('rejects a second definition of the same name', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      await expect(
        client.create({ name: 'tone', description: 'Tone again', judge: JUDGE })
      ).rejects.toThrow(EvaluatorAlreadyExistsError);
    });

    it('rejects a built-in name before reaching storage', async () => {
      const { client, search, index } = createClient({
        isBuiltIn: (name) => name === 'correctness',
      });

      await expect(
        client.create({ name: 'correctness', description: 'Replacement', judge: JUDGE })
      ).rejects.toThrow(BuiltInEvaluatorNameError);
      expect(search).not.toHaveBeenCalled();
      expect(index).not.toHaveBeenCalled();
    });

    it.each([
      ['a single character', 'a', 'must be at least 2 characters'],
      ['an uppercase letter', 'Tone', 'must be lowercase'],
      ['a leading underscore, which could shadow an action path', '_validate', 'must be lowercase'],
      ['a trailing separator', 'tone-', 'must be lowercase'],
      ['more than 128 characters', 'a'.repeat(129), 'must be at most 128 characters'],
    ])('rejects a name with %s', async (_label, name, reason) => {
      const { client } = createClient();

      const error = await client
        .create({ name, description: 'Tone', judge: JUDGE })
        .catch((thrown) => thrown);

      expect(error).toBeInstanceOf(InvalidEvaluatorNameError);
      expect(error.message).toContain(reason);
    });

    it('accepts a name with inner separators', async () => {
      const { client } = createClient();

      await expect(
        client.create({ name: 'answer_tone-v2', description: 'Tone', judge: JUDGE })
      ).resolves.toEqual(expect.objectContaining({ name: 'answer_tone-v2' }));
    });

    it('rejects an invalid judge before writing', async () => {
      const { client, index } = createClient();

      await expect(
        client.create({
          name: 'tone',
          description: 'Tone',
          judge: { ...JUDGE, prompt: '{{{undeclared}}}' },
        })
      ).rejects.toThrow(InvalidJudgeConfigError);
      expect(index).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('writes a new version at the next minor without touching the old one', async () => {
      const { client, docs } = createClient();
      const created = await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      const updated = await client.update('tone', { description: 'Sharper tone' });

      expect(updated.version).toBe('1.1.0');
      expect(updated.description).toBe('Sharper tone');
      expect(docs.get(created.id)).toEqual(
        expect.objectContaining({ version: '1.0.0', description: 'Tone' })
      );
    });

    it('leaves the history alone when the update changes nothing', async () => {
      const { client, docs } = createClient();
      const created = await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      const sizeAfterCreate = docs.size;

      const unchanged = await client.update('tone', { description: 'Tone', judge: JUDGE });

      expect(unchanged.version).toBe('1.0.0');
      expect(unchanged.id).toBe(created.id);
      expect(docs.size).toBe(sizeAfterCreate);
    });

    it('treats an update that omits every field as a no-op', async () => {
      const { client, docs } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      const sizeAfterCreate = docs.size;

      await expect(client.update('tone', {})).resolves.toEqual(
        expect.objectContaining({ version: '1.0.0' })
      );
      expect(docs.size).toBe(sizeAfterCreate);
    });

    it('treats an omitted reference_data_keys and an empty one as the same judge', async () => {
      const { client, docs } = createClient();
      const { reference_data_keys: _omitted, ...judgeWithoutKeys } = JUDGE;
      await client.create({ name: 'tone', description: 'Tone', judge: judgeWithoutKeys });
      const sizeAfterCreate = docs.size;

      // The form always sends the key, so a definition created through the API would
      // otherwise mint a version the first time anyone opened and saved it unchanged.
      const unchanged = await client.update('tone', {
        judge: { ...judgeWithoutKeys, reference_data_keys: [] },
      });

      expect(unchanged.version).toBe('1.0.0');
      expect(docs.size).toBe(sizeAfterCreate);
    });

    it('ignores the order of evidence, which is a set of requirements', async () => {
      const { client, docs } = createClient();
      await client.create({
        name: 'tone',
        description: 'Tone',
        judge: { ...JUDGE, evidence: ['input', 'response'] },
      });
      const sizeAfterCreate = docs.size;

      const unchanged = await client.update('tone', {
        judge: { ...JUDGE, evidence: ['response', 'input'] },
      });

      expect(unchanged.version).toBe('1.0.0');
      expect(docs.size).toBe(sizeAfterCreate);
    });

    it('treats a blank score description as no description', async () => {
      const { client, docs } = createClient();
      await client.create({
        name: 'tone',
        description: 'Tone',
        judge: {
          ...JUDGE,
          output: { scores: [{ name: 'tone', type: 'number', description: '  ' }] },
        },
      });
      const sizeAfterCreate = docs.size;

      // The form omits a blank description, so it would otherwise read as a change.
      const unchanged = await client.update('tone', {
        judge: { ...JUDGE, output: { scores: [{ name: 'tone', type: 'number' }] } },
      });

      expect(unchanged.version).toBe('1.0.0');
      expect(docs.size).toBe(sizeAfterCreate);
    });

    it('still writes when a score description changes in substance', async () => {
      const { client } = createClient();
      await client.create({
        name: 'tone',
        description: 'Tone',
        judge: { ...JUDGE, output: { scores: [{ name: 'tone', type: 'number' }] } },
      });

      const updated = await client.update('tone', {
        judge: {
          ...JUDGE,
          output: { scores: [{ name: 'tone', type: 'number', description: 'Be strict' }] },
        },
      });

      expect(updated.version).toBe('1.1.0');
    });

    it('still writes when the evidence set itself changes', async () => {
      const { client } = createClient();
      await client.create({
        name: 'tone',
        description: 'Tone',
        judge: { ...JUDGE, evidence: ['response'] },
      });

      const updated = await client.update('tone', {
        judge: { ...JUDGE, evidence: ['response', 'steps'] },
      });

      expect(updated.version).toBe('1.1.0');
    });

    it('still writes when only the judge config changes', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      const updated = await client.update('tone', {
        judge: { ...JUDGE, prompt: 'Rate {{{agent_response}}} strictly.' },
      });

      expect(updated.version).toBe('1.1.0');
    });

    it('carries omitted fields forward from the version it read', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      const updated = await client.update('tone', { description: 'Sharper tone' });

      expect(updated.judge).toEqual(JUDGE);
    });

    it('records who created the new version', async () => {
      const { client } = createClient();
      await client.create({
        name: 'tone',
        description: 'Tone',
        judge: JUDGE,
        createdBy: 'alice',
      });

      await expect(
        client.update('tone', { description: 'Sharper tone', createdBy: 'bob' })
      ).resolves.toEqual(expect.objectContaining({ created_by: 'bob' }));
    });

    it('gives each version a timestamp later than the version it follows', async () => {
      const { client } = createClient();
      const created = await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      const updated = await client.update('tone', { description: 'Sharper tone' });

      expect(updated.created_at > created.created_at).toBe(true);
      expect(updated.updated_at).toBe(updated.created_at);
    });

    it('bumps past a version another writer took first', async () => {
      const { client, docs, index } = createClient();
      const created = await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      const racingJudge: LlmJudgeConfig = { ...JUDGE, prompt: 'Prompt from the racing update' };

      // A racing update lands 1.1.0 between this call's read and its write, so
      // the write conflicts and the retry has to re-read to find 1.2.0 free.
      index.mockImplementationOnce(async () => {
        docs.set(getEvaluatorDefinitionId(DEFAULT_SPACE_ID, 'tone', '1.1.0'), {
          ...docs.get(created.id)!,
          version: '1.1.0',
          judge: racingJudge,
          created_at: '2126-01-01T00:00:00.000Z',
        });
        throw conflict();
      });

      const updated = await client.update('tone', { description: 'Sharper' });

      expect(updated.version).toBe('1.2.0');
      // The retry re-read instead of reusing what it had: the judge it carried
      // forward is the racing update's, not the one it first saw.
      expect(updated.judge).toEqual(racingJudge);
      expect(index).toHaveBeenCalledTimes(3);
    });

    it('gives up rather than retrying forever when every version is taken', async () => {
      const { client, index } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      index.mockImplementation(async () => {
        throw conflict();
      });

      await expect(client.update('tone', { description: 'Sharper' })).rejects.toThrow(
        /after 5 attempts/
      );
    });

    it('rejects an update to a name that was never created', async () => {
      const { client } = createClient();

      await expect(client.update('tone', { description: 'Tone' })).rejects.toThrow(
        EvaluatorNotFoundError
      );
    });

    it('rejects an invalid judge before reading or writing', async () => {
      const { client, search, index } = createClient();

      await expect(
        client.update('tone', { judge: { ...JUDGE, prompt: '{{{undeclared}}}' } })
      ).rejects.toThrow(InvalidJudgeConfigError);
      expect(search).not.toHaveBeenCalled();
      expect(index).not.toHaveBeenCalled();
    });

    it('rejects a built-in name before reading or writing', async () => {
      const { client, search, index } = createClient({ isBuiltIn: () => true });

      await expect(client.update('correctness', { description: 'Changed' })).rejects.toThrow(
        BuiltInEvaluatorNameError
      );
      expect(search).not.toHaveBeenCalled();
      expect(index).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    it('returns the highest semver, not the highest string', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'v1', judge: JUDGE });
      for (let bump = 0; bump < 10; bump++) {
        await client.update('tone', { description: `v${bump + 2}` });
      }

      // `1.10.0` sorts below `1.9.0` as a keyword, so only semver ordering
      // returns the version that was actually written last.
      await expect(client.getLatest('tone')).resolves.toEqual(
        expect.objectContaining({ version: '1.10.0' })
      );
    });

    it('resolves a pinned version', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'v1', judge: JUDGE });
      await client.update('tone', { description: 'v2' });

      await expect(client.getVersion('tone', '1.0.0')).resolves.toEqual(
        expect.objectContaining({ version: '1.0.0', description: 'v1' })
      );
      await expect(client.getVersion('tone', '9.9.9')).resolves.toBeUndefined();
    });

    it('lists one entry per name at its latest version', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      await client.update('tone', { description: 'Tone v2' });
      await client.create({ name: 'brevity', description: 'Brevity', judge: JUDGE });

      await expect(client.listLatest()).resolves.toEqual([
        expect.objectContaining({ name: 'brevity', version: '1.0.0' }),
        expect.objectContaining({ name: 'tone', version: '1.1.0' }),
      ]);
    });

    it('paginates across every evaluator name', async () => {
      const { client, docs, search } = createClient();
      for (let index = 0; index < 501; index++) {
        const name = `evaluator-${index.toString().padStart(3, '0')}`;
        docs.set(getEvaluatorDefinitionId(DEFAULT_SPACE_ID, name, '1.0.0'), {
          name,
          version: '1.0.0',
          kind: 'llm',
          description: name,
          judge: JUDGE,
          space_ids: [DEFAULT_SPACE_ID],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        });
      }

      await expect(client.listLatest()).resolves.toHaveLength(501);
      expect(search).toHaveBeenCalledTimes(2);
    });

    it('lists every version of a name, newest first', async () => {
      const { client, search } = createClient();
      await client.create({ name: 'tone', description: 'v1', judge: JUDGE });
      await client.update('tone', { description: 'v2' });

      await expect(client.listVersions('tone')).resolves.toEqual([
        expect.objectContaining({ version: '1.1.0' }),
        expect.objectContaining({ version: '1.0.0' }),
      ]);
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: [{ created_at: { order: 'desc' } }] })
      );
    });
  });

  describe('space scoping', () => {
    it('hides definitions belonging to another space', async () => {
      const storage = createStorageAdapter();
      const logger = { debug: jest.fn() } as unknown as Logger;
      const marketing = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'marketing',
        isBuiltIn: noBuiltIns,
      });
      const support = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'support',
        isBuiltIn: noBuiltIns,
      });

      await marketing.create({ name: 'tone', description: 'Tone', judge: JUDGE });

      await expect(support.getLatest('tone')).resolves.toBeUndefined();
      await expect(support.listLatest()).resolves.toEqual([]);
      await expect(marketing.getLatest('tone')).resolves.toEqual(
        expect.objectContaining({ name: 'tone' })
      );
    });

    it('lets the same name exist independently in two spaces', async () => {
      const storage = createStorageAdapter();
      const logger = { debug: jest.fn() } as unknown as Logger;
      const marketing = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'marketing',
        isBuiltIn: noBuiltIns,
      });
      const support = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'support',
        isBuiltIn: noBuiltIns,
      });

      await marketing.create({ name: 'tone', description: 'Marketing tone', judge: JUDGE });
      await support.create({ name: 'tone', description: 'Support tone', judge: JUDGE });

      await expect(marketing.getLatest('tone')).resolves.toEqual(
        expect.objectContaining({ description: 'Marketing tone' })
      );
      await expect(support.getLatest('tone')).resolves.toEqual(
        expect.objectContaining({ description: 'Support tone' })
      );
    });

    it('surfaces documents predating the space field in the default space only', async () => {
      const storage = createStorageAdapter();
      const logger = { debug: jest.fn() } as unknown as Logger;
      storage.docs.set('legacy', {
        name: 'tone',
        version: '1.0.0',
        kind: 'llm',
        description: 'Tone',
        judge: JUDGE,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      });

      const defaultSpace = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: DEFAULT_SPACE_ID,
        isBuiltIn: noBuiltIns,
      });
      const otherSpace = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'marketing',
        isBuiltIn: noBuiltIns,
      });

      await expect(defaultSpace.getLatest('tone')).resolves.toBeDefined();
      await expect(otherSpace.getLatest('tone')).resolves.toBeUndefined();
    });
  });

  it('reads persisted definitions through a newly created client', async () => {
    const storage = createStorageAdapter();
    const logger = { debug: jest.fn() } as unknown as Logger;
    const firstClient = new EvaluatorDefinitionClient({
      storageAdapter: storage.adapter,
      logger,
      spaceId: DEFAULT_SPACE_ID,
      isBuiltIn: noBuiltIns,
    });
    await firstClient.create({ name: 'tone', description: 'Persisted tone', judge: JUDGE });

    const recreatedClient = new EvaluatorDefinitionClient({
      storageAdapter: storage.adapter,
      logger,
      spaceId: DEFAULT_SPACE_ID,
      isBuiltIn: noBuiltIns,
    });

    await expect(recreatedClient.getLatest('tone')).resolves.toEqual(
      expect.objectContaining({ name: 'tone', description: 'Persisted tone' })
    );
  });

  describe('delete', () => {
    it('rejects a built-in name before reading or writing', async () => {
      const { client, search, bulk } = createClient({ isBuiltIn: () => true });

      await expect(client.delete('correctness')).rejects.toThrow(BuiltInEvaluatorNameError);
      expect(search).not.toHaveBeenCalled();
      expect(bulk).not.toHaveBeenCalled();
    });

    it('removes every version of a name', async () => {
      const { client, docs } = createClient();
      await client.create({ name: 'tone', description: 'v1', judge: JUDGE });
      await client.update('tone', { description: 'v2' });

      await expect(client.delete('tone')).resolves.toEqual({ deleted: 2 });
      expect(docs.size).toBe(0);
    });

    it('continues deleting when a definition has more versions than one read batch', async () => {
      const { client, docs, bulk } = createClient();
      for (let minor = 0; minor < 501; minor++) {
        const version = `1.${minor}.0`;
        docs.set(getEvaluatorDefinitionId(DEFAULT_SPACE_ID, 'tone', version), {
          name: 'tone',
          version,
          kind: 'llm',
          description: `Tone ${version}`,
          judge: JUDGE,
          space_ids: [DEFAULT_SPACE_ID],
          created_at: new Date(2026, 0, 1, 0, 0, minor).toISOString(),
          updated_at: new Date(2026, 0, 1, 0, 0, minor).toISOString(),
        });
      }

      await expect(client.delete('tone')).resolves.toEqual({ deleted: 501 });
      expect(bulk).toHaveBeenCalledTimes(2);
      expect(docs.size).toBe(0);
    });

    it('stops when concurrent updates keep adding versions', async () => {
      const { client, docs, bulk } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      let minor = 1;

      bulk.mockImplementation(
        async ({ operations }: { operations: Array<{ delete?: { _id: string } }> }) => {
          for (const operation of operations) {
            if (operation.delete) {
              docs.delete(operation.delete._id);
            }
          }

          const version = `1.${minor++}.0`;
          docs.set(getEvaluatorDefinitionId(DEFAULT_SPACE_ID, 'tone', version), {
            name: 'tone',
            version,
            kind: 'llm',
            description: 'Concurrent update',
            judge: JUDGE,
            space_ids: [DEFAULT_SPACE_ID],
            created_at: new Date(2026, 0, 1, 0, 0, minor).toISOString(),
            updated_at: new Date(2026, 0, 1, 0, 0, minor).toISOString(),
          });

          return {
            errors: false,
            items: operations.map(() => ({ delete: { result: 'deleted' } })),
          };
        }
      );

      await expect(client.delete('tone')).rejects.toThrow(
        'Could not finish deleting evaluator "tone" after 100 batches'
      );
      expect(bulk).toHaveBeenCalledTimes(100);
    });

    it('fails when Elasticsearch reports a bulk deletion error', async () => {
      const { client, bulk } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      bulk.mockResolvedValueOnce({
        errors: true,
        items: [{ delete: { error: { reason: 'index is read-only' } } }],
      });

      await expect(client.delete('tone')).rejects.toThrow(
        'Failed to delete evaluator "tone": index is read-only'
      );
    });

    it('removes one version when asked for one', async () => {
      const { client } = createClient();
      await client.create({ name: 'tone', description: 'v1', judge: JUDGE });
      await client.update('tone', { description: 'v2' });

      await expect(client.delete('tone', { version: '1.0.0' })).resolves.toEqual({ deleted: 1 });
      await expect(client.listVersions('tone')).resolves.toEqual([
        expect.objectContaining({ version: '1.1.0' }),
      ]);
    });

    it('does not count a version deleted concurrently', async () => {
      const { client, bulk, docs } = createClient();
      await client.create({ name: 'tone', description: 'Tone', judge: JUDGE });
      bulk.mockImplementationOnce(
        async ({ operations }: { operations: Array<{ delete?: { _id: string } }> }) => {
          for (const operation of operations) {
            if (operation.delete) {
              docs.delete(operation.delete._id);
            }
          }

          return {
            errors: false,
            items: operations.map(() => ({ delete: { result: 'not_found' } })),
          };
        }
      );

      await expect(client.delete('tone', { version: '1.0.0' })).resolves.toEqual({ deleted: 0 });
    });

    it('reports nothing deleted for an unknown name', async () => {
      const { client } = createClient();

      await expect(client.delete('tone')).resolves.toEqual({ deleted: 0 });
    });

    it('leaves another space definition of the same name alone', async () => {
      const storage = createStorageAdapter();
      const logger = { debug: jest.fn() } as unknown as Logger;
      const marketing = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'marketing',
        isBuiltIn: noBuiltIns,
      });
      const support = new EvaluatorDefinitionClient({
        storageAdapter: storage.adapter,
        logger,
        spaceId: 'support',
        isBuiltIn: noBuiltIns,
      });
      await marketing.create({ name: 'tone', description: 'Marketing', judge: JUDGE });
      await support.create({ name: 'tone', description: 'Support', judge: JUDGE });

      await expect(marketing.delete('tone')).resolves.toEqual({ deleted: 1 });
      await expect(support.getLatest('tone')).resolves.toBeDefined();
    });
  });

  it('scopes every read to the space, matching the dataset filter shape', async () => {
    const queries: MockQuery[] = [];
    const { client } = createClient({
      spaceId: 'marketing',
      onSearch: (params) => queries.push(params.query as MockQuery),
    });

    await client.listLatest();
    await client.getLatest('tone');
    await client.getVersion('tone', '1.0.0');

    // A non-default space has no missing-field fallback: a document without
    // `space_ids` predates spaces and belongs to the default space alone.
    for (const query of queries) {
      expect(query.bool.filter).toEqual([
        { bool: { should: [{ terms: { space_ids: ['marketing'] } }], minimum_should_match: 1 } },
      ]);
    }
  });
});
