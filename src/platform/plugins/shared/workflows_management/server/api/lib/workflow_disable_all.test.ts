/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggerMock } from '@kbn/logging-mocks';

import { disableAllWorkflows } from './workflow_disable_all';
import type { WorkflowProperties } from '../../storage/workflow_storage';

const logger = loggerMock.create();

const makeHit = (
  id: string,
  enabled = true,
  seqNo = 1,
  sourceOverrides: Partial<WorkflowProperties> = {}
) => ({
  _id: id,
  _seq_no: seqNo,
  _primary_term: 1,
  _source: {
    name: `Workflow ${id}`,
    description: '',
    enabled,
    tags: [],
    triggerTypes: [],
    yaml: `name: Workflow ${id}\nenabled: ${enabled}`,
    definition: null,
    createdBy: 'user1',
    lastUpdatedBy: 'user1',
    spaceId: 'default',
    valid: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...sourceOverrides,
  } satisfies WorkflowProperties,
  sort: [id],
});

const makeStorageClient = (pages: Array<Array<ReturnType<typeof makeHit>>>) => {
  const searchMock = jest.fn();
  pages.forEach((hits) => {
    searchMock.mockResolvedValueOnce({ hits: { hits } });
  });
  searchMock.mockResolvedValue({ hits: { hits: [] } });

  const bulkMock = jest.fn().mockImplementation(({ operations }) => {
    const items = operations
      .filter((op: Record<string, unknown>) => 'index' in op)
      .map((op: { index: { _id: string } }) => ({
        index: { _id: op.index._id, status: 200 },
      }));
    return Promise.resolve({ items });
  });

  const mockClient = { search: searchMock, bulk: bulkMock };
  return {
    client: mockClient,
    storage: { getClient: () => mockClient } as any,
  };
};

const disableAllParams = (overrides: Partial<Parameters<typeof disableAllWorkflows>[0]> = {}) => ({
  taskScheduler: null,
  logger,
  versioningEnabled: false,
  ...overrides,
});

describe('disableAllWorkflows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zero counts when no enabled workflows exist', async () => {
    const { storage } = makeStorageClient([[]]);

    const result = await disableAllWorkflows({
      storage,
      taskScheduler: null,
      logger,
    });

    expect(result).toEqual({ total: 0, disabled: 0, failures: [], disabledWorkflows: [] });
  });

  it('disables workflows in a single page', async () => {
    const { storage, client } = makeStorageClient([[makeHit('wf-1'), makeHit('wf-2')]]);

    const result = await disableAllWorkflows({
      storage,
      taskScheduler: null,
      logger,
    });

    expect(result.total).toBe(2);
    expect(result.disabled).toBe(2);
    expect(result.failures).toEqual([]);
    expect(client.bulk).toHaveBeenCalledTimes(1);
  });

  it('requests seq_no_primary_term when searching', async () => {
    const { storage, client } = makeStorageClient([[makeHit('wf-1')]]);

    await disableAllWorkflows({ storage, taskScheduler: null, logger });

    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({ seq_no_primary_term: true })
    );
  });

  it('bulk indexes with if_seq_no and if_primary_term', async () => {
    const { storage, client } = makeStorageClient([[makeHit('wf-1', true, 5)]]);

    await disableAllWorkflows({ storage, taskScheduler: null, logger });

    const bulkOps = client.bulk.mock.calls[0][0].operations;
    expect(bulkOps[0].index).toEqual(
      expect.objectContaining({
        _id: 'wf-1',
        if_seq_no: 5,
        if_primary_term: 1,
      })
    );
  });

  it('patches YAML to set enabled: false', async () => {
    const { storage, client } = makeStorageClient([[makeHit('wf-1')]]);

    await disableAllWorkflows({ storage, taskScheduler: null, logger });

    const bulkOps = client.bulk.mock.calls[0][0].operations;
    const doc = bulkOps[0].index.document;
    expect(doc.enabled).toBe(false);
    expect(doc.yaml).toContain('enabled: false');
  });

  it('retries bulk conflicts after refreshing OCC metadata', async () => {
    const hit = makeHit('wf-1');
    const { storage, client } = makeStorageClient([[hit]]);
    client.search
      .mockReset()
      .mockResolvedValueOnce({ hits: { hits: [hit] } })
      .mockResolvedValueOnce({
        hits: {
          hits: [
            {
              ...hit,
              _seq_no: 2,
            },
          ],
        },
      });
    client.bulk
      .mockResolvedValueOnce({
        items: [{ index: { _id: 'wf-1', status: 409, error: { reason: 'conflict' } } }],
      })
      .mockResolvedValueOnce({
        items: [{ index: { _id: 'wf-1', status: 200 } }],
      });

    const result = await disableAllWorkflows({ storage, taskScheduler: null, logger });

    expect(result.disabled).toBe(1);
    expect(result.failures).toEqual([]);
    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { ids: { values: ['wf-1'] } },
        seq_no_primary_term: true,
      })
    );
    expect(client.bulk).toHaveBeenCalledTimes(2);
    expect(client.bulk.mock.calls[1][0].operations[0].index).toEqual(
      expect.objectContaining({ if_seq_no: 2, if_primary_term: 1 })
    );
  });

  it('collects failures from partial bulk errors', async () => {
    const { storage, client } = makeStorageClient([[makeHit('wf-1'), makeHit('wf-2')]]);
    client.bulk.mockResolvedValueOnce({
      items: [
        { index: { _id: 'wf-1', status: 200 } },
        { index: { _id: 'wf-2', status: 400, error: { type: 'err', reason: 'bulk fail' } } },
      ],
    });

    const result = await disableAllWorkflows({ storage, taskScheduler: null, logger });

    expect(result.disabled).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe('wf-2');
  });

  it('logs info message with counts', async () => {
    const { storage } = makeStorageClient([[makeHit('wf-1')]]);

    await disableAllWorkflows({ storage, taskScheduler: null, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Disabled 1 workflows'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('across all spaces'));
  });

  it('omits the spaceId filter from the query when no spaceId is provided', async () => {
    const { storage, client } = makeStorageClient([[]]);

    await disableAllWorkflows({ storage, taskScheduler: null, logger });

    const searchQuery = client.search.mock.calls[0][0].query;
    expect(searchQuery.bool.must).toEqual([{ term: { enabled: true } }]);
  });

  it('scopes the query to the provided spaceId and reports it in the log message', async () => {
    const { storage, client } = makeStorageClient([[makeHit('wf-1')]]);

    await disableAllWorkflows({ storage, taskScheduler: null, logger, spaceId: 'my-space' });

    const searchQuery = client.search.mock.calls[0][0].query;
    expect(searchQuery.bool.must).toEqual([
      { term: { enabled: true } },
      { term: { spaceId: 'my-space' } },
    ]);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('in space my-space'));
  });

  it('does not bump version for global disable by default', async () => {
    const hit = makeHit('wf-1', true, 1, { version: 4 });
    const { storage, client } = makeStorageClient([[hit]]);

    await disableAllWorkflows({ ...disableAllParams(), storage });

    const doc = client.bulk.mock.calls[0][0].operations[0].index.document;
    expect(doc.version).toBe(4);
  });

  it('bumps version on space-scoped disable when versioningEnabled is true', async () => {
    const hit = makeHit('wf-1', true, 1, { version: 4 });
    const { storage, client } = makeStorageClient([[hit]]);

    await disableAllWorkflows({
      ...disableAllParams(),
      storage,
      spaceId: 'my-space',
      versioningEnabled: true,
    });

    const doc = client.bulk.mock.calls[0][0].operations[0].index.document;
    expect(doc.version).toBe(5);
  });
});
