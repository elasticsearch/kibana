/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildAlertEventsTimeRangeFilter } from './build_alert_events_time_range_filter';

describe('buildAlertEventsTimeRangeFilter', () => {
  it('applies the range to the alert events only and keeps every action document', () => {
    const filter = buildAlertEventsTimeRangeFilter({
      from: '2026-09-10T10:00:00.000Z',
      to: '2026-09-10T12:00:00.000Z',
    });

    expect(filter).toEqual({
      meta: { alias: null, disabled: false, negate: false },
      query: {
        bool: {
          should: [
            {
              bool: {
                filter: [
                  { term: { type: 'alert' } },
                  {
                    range: {
                      '@timestamp': {
                        format: 'strict_date_optional_time',
                        gte: '2026-09-10T10:00:00.000Z',
                        lte: '2026-09-10T12:00:00.000Z',
                      },
                    },
                  },
                ],
              },
            },
            { exists: { field: 'action_type' } },
          ],
          minimum_should_match: 1,
        },
      },
    });
  });

  it('resolves relative ranges to absolute bounds', () => {
    const filter = buildAlertEventsTimeRangeFilter({ from: 'now-15m', to: 'now' });
    const range = (filter?.query as any).bool.should[0].bool.filter[1].range['@timestamp'];

    // `to: now` is rounded up, so the span can exceed 15 minutes by a few milliseconds
    const span = new Date(range.lte).getTime() - new Date(range.gte).getTime();
    expect(span).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(span).toBeLessThan(15 * 60 * 1000 + 1000);
  });

  it('returns nothing without a time range', () => {
    expect(buildAlertEventsTimeRangeFilter(undefined)).toBeUndefined();
    expect(buildAlertEventsTimeRangeFilter(null)).toBeUndefined();
  });
});
