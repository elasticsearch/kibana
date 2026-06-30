/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { WorkflowRepository } from './workflow_repository';
import { WORKFLOW_INDEX_NAME } from '../constants';

describe('WorkflowRepository.areWorkflowsEnabled', () => {
  let repository: WorkflowRepository;
  let esClient: { search: jest.Mock };

  beforeEach(() => {
    esClient = { search: jest.fn() };
    repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });
  });

  it('returns an empty map without hitting ES when refs is empty', async () => {
    const result = await repository.areWorkflowsEnabled([]);
    expect(result.size).toBe(0);
    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('issues a single search for a single-space batch and returns per-workflow enabled flags', async () => {
    esClient.search.mockResolvedValue({
      hits: {
        hits: [
          { _id: 'wf-a', _source: { enabled: true, spaceId: 'default' } },
          { _id: 'wf-b', _source: { enabled: false, spaceId: 'default' } },
        ],
      },
    });

    const result = await repository.areWorkflowsEnabled([
      { workflowId: 'wf-a', spaceId: 'default' },
      { workflowId: 'wf-b', spaceId: 'default' },
    ]);

    expect(esClient.search).toHaveBeenCalledTimes(1);
    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: WORKFLOW_INDEX_NAME,
        _source: ['enabled', 'spaceId'],
        size: 2,
        query: expect.objectContaining({
          bool: expect.objectContaining({
            should: [
              {
                bool: {
                  must: [{ ids: { values: ['wf-a', 'wf-b'] } }, { term: { spaceId: 'default' } }],
                  must_not: [],
                },
              },
            ],
            minimum_should_match: 1,
            must_not: [{ exists: { field: 'deleted_at' } }],
          }),
        }),
      })
    );

    expect(result.get('default:wf-a')).toBe(true);
    expect(result.get('default:wf-b')).toBe(false);
  });

  it('emits one should clause per space for multi-space batches', async () => {
    esClient.search.mockResolvedValue({
      hits: {
        hits: [
          { _id: 'wf-a', _source: { enabled: true, spaceId: 'space-1' } },
          { _id: 'wf-b', _source: { enabled: true, spaceId: 'space-2' } },
        ],
      },
    });

    const result = await repository.areWorkflowsEnabled([
      { workflowId: 'wf-a', spaceId: 'space-1' },
      { workflowId: 'wf-b', spaceId: 'space-2' },
    ]);

    const callArg = esClient.search.mock.calls[0][0];
    expect(callArg.query.bool.should).toHaveLength(2);
    expect(callArg.query.bool.should).toEqual(
      expect.arrayContaining([
        {
          bool: {
            must: [{ ids: { values: ['wf-a'] } }, { term: { spaceId: 'space-1' } }],
            must_not: [],
          },
        },
        {
          bool: {
            must: [{ ids: { values: ['wf-b'] } }, { term: { spaceId: 'space-2' } }],
            must_not: [],
          },
        },
      ])
    );

    expect(result.get('space-1:wf-a')).toBe(true);
    expect(result.get('space-2:wf-b')).toBe(true);
  });

  it('resolves missing docs to false', async () => {
    esClient.search.mockResolvedValue({
      hits: {
        hits: [{ _id: 'wf-a', _source: { enabled: true, spaceId: 'default' } }],
      },
    });

    const result = await repository.areWorkflowsEnabled([
      { workflowId: 'wf-a', spaceId: 'default' },
      { workflowId: 'wf-missing', spaceId: 'default' },
    ]);

    expect(result.get('default:wf-a')).toBe(true);
    expect(result.get('default:wf-missing')).toBe(false);
  });

  it('applies managed filter when managedFilter is managed', async () => {
    esClient.search.mockResolvedValue({
      hits: {
        hits: [],
      },
    });

    await repository.areWorkflowsEnabled([{ workflowId: 'wf-a', spaceId: 'default' }], {
      managedFilter: 'managed',
    });

    const callArg = esClient.search.mock.calls[0][0];
    expect(callArg.query.bool.should[0].bool.must).toEqual(
      expect.arrayContaining([{ term: { managed: true } }])
    );
  });

  it('applies unmanaged filter when managedFilter is unmanaged', async () => {
    esClient.search.mockResolvedValue({
      hits: {
        hits: [],
      },
    });

    await repository.areWorkflowsEnabled([{ workflowId: 'wf-a', spaceId: 'default' }], {
      managedFilter: 'unmanaged',
    });

    const callArg = esClient.search.mock.calls[0][0];
    expect(callArg.query.bool.should[0].bool.must_not).toEqual(
      expect.arrayContaining([{ term: { managed: true } }])
    );
  });

  it('dedupes repeated refs so one ES search covers them all', async () => {
    esClient.search.mockResolvedValue({
      hits: {
        hits: [{ _id: 'wf-a', _source: { enabled: true, spaceId: 'default' } }],
      },
    });

    const result = await repository.areWorkflowsEnabled([
      { workflowId: 'wf-a', spaceId: 'default' },
      { workflowId: 'wf-a', spaceId: 'default' },
      { workflowId: 'wf-a', spaceId: 'default' },
    ]);

    expect(esClient.search).toHaveBeenCalledTimes(1);
    const callArg = esClient.search.mock.calls[0][0];
    expect(callArg.size).toBe(1);
    expect(callArg.query.bool.should[0].bool.must[0]).toEqual({ ids: { values: ['wf-a'] } });
    expect(result.get('default:wf-a')).toBe(true);
  });

  it('returns the accumulated map (all false) when the index is missing', async () => {
    const err = new Error('no such index') as Error & { statusCode?: number };
    err.statusCode = 404;
    esClient.search.mockRejectedValue(err);

    const result = await repository.areWorkflowsEnabled([
      { workflowId: 'wf-a', spaceId: 'default' },
    ]);

    expect(result.size).toBe(0);
  });
});

describe('WorkflowRepository.getWorkflow', () => {
  const baseSource = {
    name: 'My workflow',
    enabled: true,
    valid: true,
    createdBy: 'user',
    lastUpdatedBy: 'user',
    yaml: 'name: My workflow',
    tags: ['a'],
  };

  it('maps snake_case timestamps from the workflow index to EsWorkflow dates', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: {
                ...baseSource,
                created_at: '2024-01-02T03:04:05.000Z',
                updated_at: '2024-06-07T08:09:10.000Z',
              },
            },
          ],
        },
      }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    const wf = await repository.getWorkflow('wf-1', 'default');
    expect(wf).not.toBeNull();
    expect(wf!.createdAt.toISOString()).toBe('2024-01-02T03:04:05.000Z');
    expect(wf!.lastUpdatedAt.toISOString()).toBe('2024-06-07T08:09:10.000Z');
  });

  it('maps managed workflow metadata when present', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'system-workflow',
              _source: {
                ...baseSource,
                managed: true,
                managedBy: 'workflowsExtensionsExample',
                billable: true,
                originManagedWorkflowId: 'system-parent',
                managedVersion: 4,
                created_at: '2024-01-02T03:04:05.000Z',
                updated_at: '2024-06-07T08:09:10.000Z',
              },
            },
          ],
        },
      }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    const wf = await repository.getWorkflow('system-workflow', 'default');
    expect(wf).not.toBeNull();
    expect(wf).toMatchObject({
      managed: true,
      managedBy: 'workflowsExtensionsExample',
      billable: true,
      originManagedWorkflowId: 'system-parent',
      managedVersion: 4,
    });
  });

  it('applies managed filter in getWorkflow when managedFilter is managed', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: {
                ...baseSource,
                created_at: '2024-01-02T03:04:05.000Z',
                updated_at: '2024-06-07T08:09:10.000Z',
              },
            },
          ],
        },
      }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    await repository.getWorkflow('wf-1', 'default', { managedFilter: 'managed' });

    const callArg = esClient.search.mock.calls[0][0];
    expect(callArg.query.bool.must).toEqual(expect.arrayContaining([{ term: { managed: true } }]));
  });

  it('applies unmanaged filter in getWorkflow when managedFilter is unmanaged', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'wf-1',
              _source: {
                ...baseSource,
                created_at: '2024-01-02T03:04:05.000Z',
                updated_at: '2024-06-07T08:09:10.000Z',
              },
            },
          ],
        },
      }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    await repository.getWorkflow('wf-1', 'default', { managedFilter: 'unmanaged' });

    const callArg = esClient.search.mock.calls[0][0];
    expect(callArg.query.bool.must_not).toEqual(
      expect.arrayContaining([{ term: { managed: true } }])
    );
  });
});

describe('WorkflowRepository.isWorkflowEnabled', () => {
  it('delegates to areWorkflowsEnabled and reads the keyed flag', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [{ _id: 'wf-a', _source: { enabled: true, spaceId: 'default' } }],
        },
      }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    await expect(repository.isWorkflowEnabled('wf-a', 'default')).resolves.toBe(true);
    expect(esClient.search).toHaveBeenCalledTimes(1);
  });

  it('returns false when the workflow is missing', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    await expect(repository.isWorkflowEnabled('wf-a', 'default')).resolves.toBe(false);
  });

  it('returns true for global workflow when includeGlobal is true', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [{ _id: 'wf-a', _source: { enabled: true, spaceId: '*' } }],
        },
      }),
    };
    const repository = new WorkflowRepository({
      esClient: esClient as any,
      logger: loggingSystemMock.create().get(),
    });

    await expect(
      repository.isWorkflowEnabled('wf-a', 'default', { includeGlobal: true })
    ).resolves.toBe(true);
  });
});
