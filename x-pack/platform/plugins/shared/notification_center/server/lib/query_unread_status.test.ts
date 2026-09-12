/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dataStreamServiceMock } from '@kbn/core-data-streams-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { queryUnreadStatus } from './query_unread_status';

const setup = (documents: Array<{ notification_id: string; '@timestamp': string }>) => {
  const search = jest.fn().mockResolvedValue({
    hits: { hits: documents.map((source, index) => ({ _id: `doc-${index}`, _source: source })) },
  });
  const dataStreams = dataStreamServiceMock.createStartContract();
  dataStreams.initializeClient.mockResolvedValue({ search } as never);

  return {
    deps: { dataStreams, logger: loggingSystemMock.createLogger() },
    search,
  };
};

describe('queryUnreadStatus', () => {
  it('reports unread for a representative newer than the read horizon', async () => {
    const { deps } = setup([{ notification_id: 'new', '@timestamp': '2026-07-20T00:00:00.000Z' }]);

    const result = await queryUnreadStatus(deps, {
      overrides: {},
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(result).toEqual({ hasUnread: true });
  });

  it('reports no unread when the horizon covers everything returned', async () => {
    const { deps } = setup([]);

    const result = await queryUnreadStatus(deps, {
      overrides: {},
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(result).toEqual({ hasUnread: false });
  });

  it('prunes to the read horizon and asks for one group beyond the overrides', async () => {
    const { deps, search } = setup([]);

    await queryUnreadStatus(deps, {
      overrides: {
        a: { read: true, markedAt: '2026-07-16T00:00:00.000Z' },
        b: { read: true, markedAt: '2026-07-16T00:00:00.000Z' },
      },
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(search).toHaveBeenCalledWith({
      query: {
        bool: { filter: [{ range: { '@timestamp': { gt: '2026-07-15T00:00:00.000Z' } } }] },
      },
      _source: ['notification_id', '@timestamp'],
      collapse: { field: 'notification_id' },
      sort: [{ '@timestamp': 'desc' }, { notification_id: 'asc' }],
      size: 3,
      track_total_hits: false,
    });
  });

  it('asks for a single group when the user has no overrides', async () => {
    const { deps, search } = setup([]);

    await queryUnreadStatus(deps, {
      overrides: {},
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ size: 1 }));
  });

  it('looks past the newest representatives when overrides suppress them', async () => {
    const { deps } = setup([
      { notification_id: 'acknowledged', '@timestamp': '2026-07-18T00:00:00.000Z' },
      { notification_id: 'still-unread', '@timestamp': '2026-07-16T00:00:00.000Z' },
    ]);

    const result = await queryUnreadStatus(deps, {
      overrides: { acknowledged: { read: true, markedAt: '2026-07-19T00:00:00.000Z' } },
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(result).toEqual({ hasUnread: true });
  });

  it('treats a re-push after its override as unread again', async () => {
    const { deps } = setup([
      { notification_id: 're-pushed', '@timestamp': '2026-07-20T00:00:00.000Z' },
    ]);

    const result = await queryUnreadStatus(deps, {
      overrides: { 're-pushed': { read: true, markedAt: '2026-07-17T00:00:00.000Z' } },
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(result).toEqual({ hasUnread: true });
  });

  it('reports no unread when every returned representative is overridden as read', async () => {
    const { deps } = setup([
      { notification_id: 'acknowledged', '@timestamp': '2026-07-16T00:00:00.000Z' },
    ]);

    const result = await queryUnreadStatus(deps, {
      overrides: { acknowledged: { read: true, markedAt: '2026-07-17T00:00:00.000Z' } },
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(result).toEqual({ hasUnread: false });
  });

  it('treats a malformed document as unread rather than hiding the badge', async () => {
    const { deps } = setup([{ '@timestamp': '2026-07-20T00:00:00.000Z' } as never]);

    const result = await queryUnreadStatus(deps, {
      overrides: {},
      readAllBefore: '2026-07-15T00:00:00.000Z',
    });

    expect(result).toEqual({ hasUnread: true });
  });
});
