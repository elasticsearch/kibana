/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryListItem } from '../types/change_history_list_item';
import {
  buildChangeHistoryRestoreTelemetryParams,
  findCurrentChangeHistoryListItem,
} from './build_change_history_restore_telemetry';

const listItem = (overrides: Partial<ChangeHistoryListItem> = {}): ChangeHistoryListItem => ({
  id: 'evt-1',
  timestamp: '2026-01-01T00:00:00Z',
  actor: { name: 'Alice' },
  action: 'Updated',
  ...overrides,
});

describe('buildChangeHistoryRestoreTelemetryParams', () => {
  it('computes rollbackDistance when both sequences are present', () => {
    expect(
      buildChangeHistoryRestoreTelemetryParams(
        listItem({ metadata: { version: 3 } }),
        listItem({ id: 'evt-7', metadata: { version: 7 } })
      )
    ).toEqual({
      restoredFromSequence: 3,
      currentSequence: 7,
      rollbackDistance: 4,
    });
  });

  it('omits rollbackDistance when sequences are missing', () => {
    expect(buildChangeHistoryRestoreTelemetryParams(listItem())).toEqual({});
    expect(
      buildChangeHistoryRestoreTelemetryParams(listItem({ metadata: { version: 3 } }))
    ).toEqual({
      restoredFromSequence: 3,
    });
  });
});

describe('findCurrentChangeHistoryListItem', () => {
  it('prefers the row marked isCurrent', () => {
    const items = [
      listItem({ id: 'evt-7', isCurrent: true, metadata: { version: 7 } }),
      listItem({ id: 'evt-3', metadata: { version: 3 } }),
    ];

    expect(findCurrentChangeHistoryListItem(items)?.id).toBe('evt-7');
  });

  it('falls back to the first row when no current marker exists', () => {
    const items = [
      listItem({ id: 'evt-7', metadata: { version: 7 } }),
      listItem({ id: 'evt-3', metadata: { version: 3 } }),
    ];

    expect(findCurrentChangeHistoryListItem(items)?.id).toBe('evt-7');
  });
});
