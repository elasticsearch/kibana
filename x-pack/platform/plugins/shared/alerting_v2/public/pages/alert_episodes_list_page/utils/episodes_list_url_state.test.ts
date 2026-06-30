/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_EPISODES_LIST_TIME_RANGE,
  EPISODES_LIST_APP_STATE_KEY,
  EPISODES_LIST_STATUS_URL_ALL,
  readEpisodesListAppStateFromUrlStorage,
  writeEpisodesListAppStateToUrlStorage,
} from './episodes_list_url_state';

async function createKbnTestUrlStorage(
  episodesListPayload?: unknown
): Promise<IKbnUrlStateStorage> {
  const storage = createKbnUrlStateStorage({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    useHash: false,
    useHashQuery: false,
  });
  if (episodesListPayload !== undefined) {
    await storage.set(
      '_a',
      { [EPISODES_LIST_APP_STATE_KEY]: episodesListPayload },
      { replace: true }
    );
  }
  return storage;
}

describe('episodes_list_url_state', () => {
  describe('readEpisodesListAppStateFromUrlStorage', () => {
    it('reads filter + time fields as expected from _a.episodesList', async () => {
      const storage = await createKbnTestUrlStorage({
        status: 'active',
        ruleId: 'r1',
        queryString: '  host  ',
        tags: ['a', 'b'],
        severity: ['high', '__no_severity__'],
        assigneeUid: 'u1',
        extra: 'ignored',
        timeFrom: 'now-7d',
        timeTo: 'now',
      });
      expect(readEpisodesListAppStateFromUrlStorage(storage)).toEqual({
        filterState: {
          status: 'active',
          ruleId: 'r1',
          queryString: 'host',
          tags: ['a', 'b'],
          severity: ['high', '__no_severity__'],
          assigneeUid: 'u1',
        },
        timeRange: { from: 'now-7d', to: 'now' },
      });
    });

    it('treats empty filter strings as absent', async () => {
      const storage = await createKbnTestUrlStorage({
        status: '',
        ruleId: '   ',
        queryString: '',
        tags: [],
        assigneeUid: '',
      });
      expect(readEpisodesListAppStateFromUrlStorage(storage).filterState).toEqual({
        status: 'active',
      });
    });

    it('maps "all" status to undefined', async () => {
      const storage = await createKbnTestUrlStorage({
        status: EPISODES_LIST_STATUS_URL_ALL,
      });
      expect(readEpisodesListAppStateFromUrlStorage(storage).filterState.status).toBeUndefined();
    });

    it('defaults status to active when _a is missing', async () => {
      const storage = await createKbnTestUrlStorage();
      expect(readEpisodesListAppStateFromUrlStorage(storage)).toEqual({
        filterState: { status: 'active' },
      });
    });

    it('reads groupHash and groupingValues from the URL blob', async () => {
      const storage = await createKbnTestUrlStorage({
        groupHash: 'abc123',
        groupingValues: { 'host.name': 'web-01', region: null },
      });
      expect(readEpisodesListAppStateFromUrlStorage(storage).filterState).toMatchObject({
        groupHash: 'abc123',
        groupingValues: { 'host.name': 'web-01', region: null },
      });
    });

    it('reads legacy severities URL key as severity', async () => {
      const storage = await createKbnTestUrlStorage({
        severities: ['high', '__no_severity__'],
      });
      expect(readEpisodesListAppStateFromUrlStorage(storage).filterState.severity).toEqual([
        'high',
        '__no_severity__',
      ]);
    });

    it('ignores groupingValues when it is not a plain object', async () => {
      const storage = await createKbnTestUrlStorage({
        groupingValues: 'not-an-object',
      });
      expect(
        readEpisodesListAppStateFromUrlStorage(storage).filterState.groupingValues
      ).toBeUndefined();
    });
  });

  describe('writeEpisodesListAppStateToUrlStorage', () => {
    it('omits episodesList when values are defaults', async () => {
      const storage = await createKbnTestUrlStorage({
        queryString: 'host',
      });

      await writeEpisodesListAppStateToUrlStorage(
        storage,
        { status: 'active' },
        DEFAULT_EPISODES_LIST_TIME_RANGE
      );

      expect(storage.get('_a')).toEqual({});
    });

    it('writes episodesList when there are non-default values', async () => {
      const storage = await createKbnTestUrlStorage();

      await writeEpisodesListAppStateToUrlStorage(
        storage,
        { status: undefined, queryString: ' host ' },
        { from: 'now-7d', to: 'now' }
      );

      expect(storage.get('_a')).toEqual({
        [EPISODES_LIST_APP_STATE_KEY]: {
          status: EPISODES_LIST_STATUS_URL_ALL,
          queryString: 'host',
          timeFrom: 'now-7d',
          timeTo: 'now',
        },
      });
    });

    it('round-trips severity', async () => {
      const storage = await createKbnTestUrlStorage();

      await writeEpisodesListAppStateToUrlStorage(
        storage,
        {
          status: 'active',
          severity: ['high', '__no_severity__'],
        },
        DEFAULT_EPISODES_LIST_TIME_RANGE
      );

      expect(storage.get('_a')).toEqual({
        [EPISODES_LIST_APP_STATE_KEY]: {
          severity: ['high', '__no_severity__'],
        },
      });
      expect(readEpisodesListAppStateFromUrlStorage(storage).filterState.severity).toEqual([
        'high',
        '__no_severity__',
      ]);
    });

    it('round-trips groupHash and groupingValues', async () => {
      const storage = await createKbnTestUrlStorage();

      await writeEpisodesListAppStateToUrlStorage(
        storage,
        {
          status: 'active',
          groupHash: 'xyz',
          groupingValues: { 'host.name': 'web-01', region: null },
        },
        DEFAULT_EPISODES_LIST_TIME_RANGE
      );

      expect(storage.get('_a')).toEqual({
        [EPISODES_LIST_APP_STATE_KEY]: {
          groupHash: 'xyz',
          groupingValues: { 'host.name': 'web-01', region: null },
        },
      });
    });
  });
});
