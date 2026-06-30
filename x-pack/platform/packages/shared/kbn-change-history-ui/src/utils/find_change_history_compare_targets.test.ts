/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryListItem } from '../types/change_history_list_item';
import { findCurrentChangeId, findPreviousChangeId } from './find_change_history_compare_targets';

const items: ChangeHistoryListItem[] = [
  {
    id: 'evt-7',
    timestamp: '2026-06-16T12:00:00.000Z',
    actor: { name: 'Alice' },
    action: 'Updated',
    isCurrent: true,
  },
  {
    id: 'evt-3',
    timestamp: '2026-06-15T12:00:00.000Z',
    actor: { name: 'Alice' },
    action: 'Updated',
  },
  {
    id: 'evt-1',
    timestamp: '2026-06-14T12:00:00.000Z',
    actor: { name: 'Bob' },
    action: 'Created',
  },
];

describe('find_change_history_compare_targets', () => {
  it('finds the current change id from isCurrent or the first row', () => {
    expect(findCurrentChangeId(items)).toBe('evt-7');
    expect(
      findCurrentChangeId([
        {
          id: 'evt-2',
          timestamp: '2026-06-16T12:00:00.000Z',
          actor: { name: 'Alice' },
          action: 'Updated',
        },
      ])
    ).toBe('evt-2');
  });

  it('finds the chronologically previous change id for a selection', () => {
    expect(findPreviousChangeId(items, 'evt-7')).toBe('evt-3');
    expect(findPreviousChangeId(items, 'evt-3')).toBe('evt-1');
    expect(findPreviousChangeId(items, 'evt-1')).toBeUndefined();
    expect(findPreviousChangeId(items, 'missing')).toBeUndefined();
  });
});
