/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_ESQL_DATA_SOURCE_TYPE } from '@kbn/as-code-data-views-schema';
import { DataGridDensity, DiscoverTabType } from '@kbn/discover-utils';
import { NEW_TAB_ID } from '../../common/constants';
import type {
  DiscoverSessionApiData,
  DiscoverSessionApiTab,
  DiscoverSessionEmbeddableByValueState,
} from '../../server';
import {
  buildDiscoverSessionDashboardSaveState,
  buildDiscoverSessionEmbeddableInput,
  DEFAULT_DISCOVER_SESSION_TIME_RANGE,
  getDiscoverSessionLocatorParams,
  getDiscoverSessionSeedTimeRange,
  isDiscoverSessionByValueState,
} from './discover_session_inline_state';

const esqlTab: DiscoverSessionApiTab = {
  id: 'tab-1',
  label: 'Documents',
  type: DiscoverTabType.Default,
  data_source: {
    type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
    query: 'FROM logs-* | LIMIT 100',
  },
  hide_chart: true,
  hide_table: false,
  time_range: { from: 'now-24h', to: 'now' },
  column_order: ['@timestamp', 'message'],
  sort: [{ name: '@timestamp', direction: 'desc' }],
};

const createSession = (
  overrides: Partial<DiscoverSessionApiData> & Pick<DiscoverSessionApiData, 'title' | 'tabs'>
): DiscoverSessionApiData => ({
  description: '',
  ...overrides,
});

describe('discover session inline state', () => {
  describe('getDiscoverSessionSeedTimeRange', () => {
    it('prefers mapped attachment time over screen context', () => {
      expect(
        getDiscoverSessionSeedTimeRange({
          mappedTimeRange: { from: 'now-1h', to: 'now' },
          screenContextTimeRange: { from: 'now-7d', to: 'now' },
        })
      ).toEqual({ from: 'now-1h', to: 'now' });
    });

    it('uses screen context when the attachment has no time range', () => {
      expect(
        getDiscoverSessionSeedTimeRange({
          screenContextTimeRange: { from: 'now-7d', to: 'now' },
        })
      ).toEqual({ from: 'now-7d', to: 'now' });
    });

    it('falls back to the default range', () => {
      expect(getDiscoverSessionSeedTimeRange({})).toEqual(DEFAULT_DISCOVER_SESSION_TIME_RANGE);
    });
  });

  describe('buildDiscoverSessionEmbeddableInput', () => {
    it('adds overlay document viewer display options and the local time range', () => {
      const data = createSession({ title: 'Nginx errors', tabs: [esqlTab] });
      const originalTab = { ...data.tabs[0] };
      const result = buildDiscoverSessionEmbeddableInput(data, { from: 'now-15m', to: 'now' });

      expect(result.time_range).toEqual({ from: 'now-15m', to: 'now' });
      expect(result.tabs[0]).toEqual(
        expect.objectContaining({
          density: DataGridDensity.COMPACT,
          row_height: 1,
          header_row_height: 1,
        })
      );
      expect(result.nonPersistedDisplayOptions).toEqual({
        enableDocumentViewer: true,
        enableFilters: false,
        documentViewerFlyoutType: 'overlay',
        autoApplyDiscoverColumnDefaults: true,
        wrapToolbar: false,
        showKeyboardShortcuts: false,
        showSortSelector: false,
      });
      expect(result).not.toHaveProperty('attributes');
      expect(data.tabs[0]).toEqual(originalTab);
      expect(data.tabs[0]).not.toHaveProperty('density');
    });

    it('keeps an explicit tab density', () => {
      const data = createSession({
        title: 'Nginx errors',
        tabs: [{ ...esqlTab, density: DataGridDensity.NORMAL }],
      });

      const result = buildDiscoverSessionEmbeddableInput(data, { from: 'now-15m', to: 'now' });

      expect(result.tabs[0]).toEqual(
        expect.objectContaining({
          density: DataGridDensity.NORMAL,
          row_height: 1,
          header_row_height: 1,
        })
      );
    });

    it('keeps explicit row and header heights', () => {
      const data = createSession({
        title: 'Nginx errors',
        tabs: [{ ...esqlTab, row_height: 3, header_row_height: 2 }],
      });

      const result = buildDiscoverSessionEmbeddableInput(data, { from: 'now-15m', to: 'now' });

      expect(result.tabs[0]).toEqual(
        expect.objectContaining({
          row_height: 3,
          header_row_height: 2,
        })
      );
    });
  });

  describe('getDiscoverSessionLocatorParams', () => {
    it('opens ES|QL in a new Discover tab using picker time', () => {
      const data = createSession({ title: 'Nginx errors', tabs: [esqlTab] });
      const result = getDiscoverSessionLocatorParams({
        data,
        timeRange: { from: 'now-15m', to: 'now' },
      });

      expect(result).toEqual({
        query: { esql: 'FROM logs-* | LIMIT 100' },
        columns: ['@timestamp', 'message'],
        sort: [['@timestamp', 'desc']],
        timeRange: { from: 'now-15m', to: 'now' },
        hideChart: true,
        tab: { id: NEW_TAB_ID, label: 'Nginx errors' },
      });
    });
  });

  describe('buildDiscoverSessionDashboardSaveState', () => {
    it('writes visible columns and omits the local time range', () => {
      const liveState: DiscoverSessionEmbeddableByValueState & {
        nonPersistedDisplayOptions: { wrapToolbar: boolean };
      } = {
        title: 'Original',
        description: 'old',
        time_range: { from: 'now-15m', to: 'now' },
        nonPersistedDisplayOptions: { wrapToolbar: false },
        tabs: [
          {
            data_source: { type: AS_CODE_ESQL_DATA_SOURCE_TYPE, query: 'FROM logs-*' },
            column_order: ['@timestamp'],
            density: DataGridDensity.COMPACT,
            sort: [],
          },
        ],
      };

      expect(isDiscoverSessionByValueState(liveState)).toBe(true);

      expect(
        buildDiscoverSessionDashboardSaveState({
          liveState,
          visibleColumns: ['event.action', '@timestamp'],
          title: 'Saved table',
          description: 'From chat',
        })
      ).toEqual({
        title: 'Saved table',
        description: 'From chat',
        tabs: [
          {
            data_source: { type: AS_CODE_ESQL_DATA_SOURCE_TYPE, query: 'FROM logs-*' },
            column_order: ['event.action', '@timestamp'],
            density: DataGridDensity.COMPACT,
            sort: [],
          },
        ],
      });
    });
  });
});
