/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { dashboardContextWrapper } from '../../../mocks';
import { useShareOptions } from './use_share_options';
import type { TimeRange } from '@kbn/es-query';

describe('useShareOptions', () => {
  it('should re-build shareOptions when time range changes', async () => {
    const timeRange$ = new BehaviorSubject<TimeRange | undefined>(undefined);
    const { result } = renderHook(() => useShareOptions(), {
      wrapper: dashboardContextWrapper({ apiOverrides: { timeRange$ } }),
    });

    const initialLocatorParams = result.current.sharingData.locatorParams.params;
    expect(initialLocatorParams.time_range).toBeUndefined();

    const nextTimeRange = {
      to: 'now',
      from: 'now-15m',
    };
    timeRange$.next(nextTimeRange);

    await waitFor(() => {
      const nextLocatorParams = result.current.sharingData.locatorParams.params;
      expect(nextLocatorParams.time_range).toStrictEqual(nextTimeRange);
    });
  });

  it('should propagate unsaved state to locator', () => {
    const unsavedDashboardState: Partial<DashboardState> = {
      panels: [
        {
          type: 'panel_type',
          grid: { w: 0, h: 0, x: 0, y: 0 },
          config: {
            id: 'superPanel',
          },
        },
      ],
      filters: [
        {
          type: 'condition',
          condition: {
            field: 'status',
            operator: 'is',
            value: 'active',
          },
        },
      ],
      query: { expression: 'bye', language: 'kql' },
    };
    const unsavedChanges$ = new BehaviorSubject<Partial<DashboardState>>(unsavedDashboardState);
    const { result } = renderHook(() => useShareOptions(), {
      wrapper: dashboardContextWrapper({ internalApiOverrides: { unsavedChanges$ } }),
    });

    const shareLocatorParams = result.current.sharingData.locatorParams.params;
    expect(shareLocatorParams.panels).toStrictEqual(unsavedDashboardState.panels);
    // Query in the locator params is in the storedQuery format
    expect(shareLocatorParams.query).toMatchInlineSnapshot(`
      Object {
        "language": "kuery",
        "query": "bye",
      }
    `);
    // Filters in the locator params are in the storedFilter format
    expect(shareLocatorParams.filters).toMatchInlineSnapshot(`
      Array [
        Object {
          "meta": Object {
            "field": "status",
            "key": "status",
            "params": Object {
              "query": "active",
            },
            "type": "phrase",
          },
          "query": Object {
            "match_phrase": Object {
              "status": "active",
            },
          },
        },
      ]
    `);
  });
});
