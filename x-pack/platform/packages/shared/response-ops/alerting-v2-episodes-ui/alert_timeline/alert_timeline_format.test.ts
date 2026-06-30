/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import { describeSegmentSpan, formatDuration } from './alert_timeline_format';

const HOUR = 60 * 60 * 1000;
const WINDOW_END = Date.UTC(2026, 5, 11, 0, 0, 0);

describe('describeSegmentSpan', () => {
  it('flags a span running to the window edge with a non-inactive status as ongoing', () => {
    expect(
      describeSegmentSpan({
        x1Ms: WINDOW_END,
        status: ALERT_EPISODE_STATUS.ACTIVE,
        windowEndMs: WINDOW_END,
      }).isOngoing
    ).toBe(true);
  });

  it('does not treat a recovered (inactive) span at the window edge as ongoing', () => {
    expect(
      describeSegmentSpan({
        x1Ms: WINDOW_END,
        status: ALERT_EPISODE_STATUS.INACTIVE,
        windowEndMs: WINDOW_END,
      }).isOngoing
    ).toBe(false);
  });

  it('does not flag a span that ends inside the window as ongoing', () => {
    expect(
      describeSegmentSpan({
        x1Ms: WINDOW_END - HOUR,
        status: ALERT_EPISODE_STATUS.ACTIVE,
        windowEndMs: WINDOW_END,
      }).isOngoing
    ).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes and falls back for non-positive input', () => {
    expect(formatDuration(2 * HOUR + 15 * 60 * 1000)).toBe('2h 15m');
    expect(formatDuration(45 * 60 * 1000)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });
});
