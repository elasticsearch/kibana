/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { getTimelineEventsDetailsFromRecord } from './get_timeline_events_details_from_record';

const createMockHit = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id', _index: 'test-index' },
    flattened,
    isAnchor: false,
  } as DataTableRecord);

describe('getTimelineEventsDetailsFromRecord', () => {
  it('converts flattened record fields to timeline event details items', () => {
    expect(
      getTimelineEventsDetailsFromRecord(
        createMockHit({
          'host.name': 'test-host',
          'event.category': ['process', 'network'],
          'user.name': null,
          'process.args': [{ value: 'test' }],
        })
      )
    ).toEqual([
      {
        category: 'host',
        field: 'host.name',
        isObjectArray: false,
        originalValue: 'test-host',
        values: ['test-host'],
      },
      {
        category: 'event',
        field: 'event.category',
        isObjectArray: false,
        originalValue: ['process', 'network'],
        values: ['process', 'network'],
      },
      {
        category: 'user',
        field: 'user.name',
        isObjectArray: false,
        originalValue: null,
        values: undefined,
      },
      {
        category: 'process',
        field: 'process.args',
        isObjectArray: true,
        originalValue: [{ value: 'test' }],
        values: ['[object Object]'],
      },
    ]);
  });
});
