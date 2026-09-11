/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { DiscoverTabType } from '@kbn/discover-utils';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import type { DiscoverSessionApiData, DiscoverSessionApiTab } from '../../server';
import { toStoredSearchEmbeddableByValue } from '../embeddable/transform_utils';
import { toSearchEmbeddableByValueState } from './to_search_embeddable_by_value_state';

const esqlTab: DiscoverSessionApiTab = {
  id: 'tab-1',
  label: 'Documents',
  type: DiscoverTabType.Default,
  data_source: {
    type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
    query: 'FROM logs-* | WHERE status >= 500 | LIMIT 100',
  },
  hide_chart: true,
  hide_table: false,
  time_range: { from: 'now-24h', to: 'now' },
  column_order: ['@timestamp', 'status', 'message'],
  sort: [{ name: '@timestamp', direction: 'desc' }],
};

const classicTab: DiscoverSessionApiTab = {
  id: 'tab-classic',
  label: 'Logs',
  type: DiscoverTabType.Default,
  data_source: {
    type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
    ref_id: 'logs-data-view',
  },
  filters: [],
  sort: [],
  view_mode: VIEW_MODE.DOCUMENT_LEVEL,
  hide_chart: false,
  hide_table: false,
};

const createSession = (
  overrides: Partial<DiscoverSessionApiData> & Pick<DiscoverSessionApiData, 'title' | 'tabs'>
): DiscoverSessionApiData => ({
  description: '',
  ...overrides,
});

describe('toSearchEmbeddableByValueState', () => {
  it('maps a one-tab ES|QL session to as-code by-value embeddable state', () => {
    const result = toSearchEmbeddableByValueState(
      createSession({
        title: 'Nginx errors',
        description: '5xx from nginx',
        tabs: [esqlTab],
      })
    );

    expect(result).toEqual({
      title: 'Nginx errors',
      description: '5xx from nginx',
      time_range: { from: 'now-24h', to: 'now' },
      tabs: [
        {
          data_source: esqlTab.data_source,
          column_order: ['@timestamp', 'status', 'message'],
          sort: [{ name: '@timestamp', direction: 'desc' }],
        },
      ],
    });
    expect(result).not.toHaveProperty('attributes');
    expect(result).not.toHaveProperty('ref_id');
    expect(result.tabs[0]).not.toHaveProperty('id');
    expect(result.tabs[0]).not.toHaveProperty('label');
    expect(result.tabs[0]).not.toHaveProperty('hide_chart');
    expect(JSON.stringify(result)).not.toContain('vis_context');
  });

  it('copies tab time_range onto the panel', () => {
    const result = toSearchEmbeddableByValueState(
      createSession({
        title: 'Timed session',
        tabs: [esqlTab],
      })
    );

    expect(result.time_range).toEqual({
      from: 'now-24h',
      to: 'now',
    });
  });

  it('omits panel time_range when the tab has none', () => {
    const { time_range: _timeRange, ...tabWithoutTime } = esqlTab;
    const result = toSearchEmbeddableByValueState(
      createSession({
        title: 'ES|QL only',
        tabs: [tabWithoutTime],
      })
    );

    expect(result).not.toHaveProperty('time_range');
  });

  it('omits an empty description', () => {
    const data = createSession({
      title: 'No description',
      tabs: [esqlTab],
    });

    expect(data.description).toBe('');
    expect(toSearchEmbeddableByValueState(data)).not.toHaveProperty('description');
  });

  it('uses only the first tab when the session has multiple tabs', () => {
    const result = toSearchEmbeddableByValueState(
      createSession({
        title: 'Two tabs',
        tabs: [
          esqlTab,
          {
            ...esqlTab,
            id: 'tab-2',
            label: 'Other',
            data_source: {
              type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
              query: 'FROM metrics-* | LIMIT 10',
            },
          },
        ],
      })
    );

    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].data_source).toEqual(esqlTab.data_source);
  });

  it('maps a classic data view tab', () => {
    const result = toSearchEmbeddableByValueState(
      createSession({
        title: 'Classic only',
        tabs: [classicTab],
      })
    );

    expect(result.tabs[0]).toMatchObject({
      data_source: {
        type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
        ref_id: 'logs-data-view',
      },
      filters: [],
      sort: [],
      view_mode: VIEW_MODE.DOCUMENT_LEVEL,
    });
  });

  it('produces state that toStoredSearchEmbeddableByValue can consume', () => {
    expect(() =>
      toStoredSearchEmbeddableByValue(
        toSearchEmbeddableByValueState(
          createSession({
            title: 'Nginx errors',
            tabs: [esqlTab],
          })
        )
      )
    ).not.toThrow();
  });
});
