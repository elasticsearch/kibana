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
import { ESQL_CONTROL } from '@kbn/controls-constants';
import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import type { DiscoverSessionApiData } from '../schema';
import { transformDiscoverSessionIn } from './transform_discover_session_in';
import { transformDiscoverSessionOut } from './transform_discover_session_out';
import {
  discoverSessionApiData,
  discoverSessionAttributes,
} from './transform_discover_session.fixtures';

describe('discover session API transforms', () => {
  const apiData: DiscoverSessionApiData = {
    title: 'Session',
    description: 'Session description',
    tabs: [
      {
        id: 'tab-classic',
        label: 'Classic',
        data_source: {
          type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
          ref_id: 'logs-data-view',
        },
        query: { language: 'kql', expression: 'service.name : "api"' },
        filters: [],
        sort: [{ name: '@timestamp', direction: 'desc' }],
        view_mode: VIEW_MODE.DOCUMENT_LEVEL,
        hide_chart: false,
        hide_table: false,
        hide_aggregated_preview: true,
        breakdown_field: 'host.name',
        chart_interval: 'h',
        time_restore: true,
        time_range: { from: 'now-15m', to: 'now' },
        refresh_interval: { pause: true, value: 0 },
        vis_context: {
          suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
          attributes: {
            visualizationType: 'lnsXY',
            state: { foo: 'bar' },
          },
        },
      },
      {
        id: 'tab-esql',
        label: 'ES|QL',
        data_source: {
          type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
          query: 'FROM logs-* | LIMIT 10',
        },
        sort: [],
        hide_chart: false,
        hide_table: false,
        time_restore: false,
        control_panels: [
          {
            id: 'control-1',
            type: ESQL_CONTROL,
            width: 'medium',
            grow: false,
            config: {
              control_type: 'STATIC_VALUES',
              variable_name: 'foo',
              variable_type: 'values',
              available_options: ['bar'],
              selected_options: ['bar'],
              single_select: true,
            },
          },
        ],
      },
    ],
  };

  const expectedControlGroupJson = JSON.stringify({
    'control-1': {
      order: 0,
      type: ESQL_CONTROL,
      width: 'medium',
      grow: false,
      control_type: 'STATIC_VALUES',
      variable_name: 'foo',
      variable_type: 'values',
      available_options: ['bar'],
      selected_options: ['bar'],
      single_select: true,
    },
  });

  describe('transform out', () => {
    it('maps saved object attributes to API data', () => {
      const transformed = transformDiscoverSessionOut(discoverSessionAttributes);
      expect(transformed).toEqual(discoverSessionApiData);
    });
  });

  describe('transform in', () => {
    it('normalizes fixture API data back to stored attributes', () => {
      const { attributes, references } = transformDiscoverSessionIn(discoverSessionApiData);

      expect(attributes.tabs[0].attributes.controlGroupJson).toBeUndefined();
      expect(attributes.tabs[0].attributes.kibanaSavedObjectMeta.searchSourceJSON).toBe(
        '{"query":{"query":"","language":"kuery"},"filter":[],"index":{"title":"logs*,-logstash*,filebeat-*","timeFieldName":"@timestamp"}}'
      );
      expect(attributes.tabs[1].attributes.usesAdHocDataView).toBe(false);
      expect(attributes.tabs[1].attributes.viewMode).toBeUndefined();
      expect(attributes.tabs[1].attributes.controlGroupJson).toBe(
        JSON.stringify({
          'e2be5bb5-87d2-4226-8950-2614f0522209': {
            order: 0,
            type: ESQL_CONTROL,
            width: 'medium',
            grow: false,
            selected_options: ['event.dataset'],
            variable_name: 'field_name',
            single_select: true,
            variable_type: 'fields',
            control_type: 'STATIC_VALUES',
            available_options: ['event.dataset', 'event.module', 'event.type'],
            title: 'field_name',
          },
          'c8106b8e-e13a-4dc4-9fc6-1a8c48e70464': {
            order: 1,
            type: ESQL_CONTROL,
            width: 'medium',
            grow: false,
            selected_options: ['kibana.log'],
            variable_name: 'field_value',
            single_select: true,
            variable_type: 'values',
            control_type: 'VALUES_FROM_QUERY',
            esql_query:
              'FROM logs*,-logstash*,filebeat-* | WHERE @timestamp <= ?_tend and @timestamp > ?_tstart | STATS BY ??field_name',
            title: 'field_value',
          },
        })
      );
      expect(attributes.tabs[1].attributes.visContext).toMatchObject({
        requestData: {
          breakdownField: 'transaction.id',
          timeInterval: 'h',
        },
      });
      expect(references).toEqual([]);
    });
    it('adds tab-prefixed references for data view reference tabs', () => {
      const { attributes, references } = transformDiscoverSessionIn(apiData);

      expect(attributes.tabs[0].attributes.visContext).toEqual({
        suggestionType: UnifiedHistogramSuggestionType.histogramForDataView,
        requestData: {
          dataViewId: 'logs-data-view',
          timeInterval: 'h',
          breakdownField: 'host.name',
        },
        attributes: {
          visualizationType: 'lnsXY',
          state: { foo: 'bar' },
        },
      });
      expect(attributes.tabs[1].attributes.controlGroupJson).toBe(expectedControlGroupJson);
      expect(references).toContainEqual({
        name: 'tab_tab-classic.kibanaSavedObjectMeta.searchSourceJSON.index',
        type: 'index-pattern',
        id: 'logs-data-view',
      });
    });
  });

  it('round-trips API data and preserves semantic values', () => {
    const { attributes, references } = transformDiscoverSessionIn(apiData);
    const roundTripped = transformDiscoverSessionOut(attributes, references);
    const reverted = transformDiscoverSessionIn(roundTripped);

    expect(roundTripped).toMatchObject(apiData);
    expect(roundTripped.tabs[0]).toMatchObject({
      column_order: [],
      density: 'compact',
      header_row_height: 3,
    });
    expect(roundTripped.tabs[1]).toMatchObject({
      column_order: [],
      density: 'compact',
      header_row_height: 3,
      control_panels: [
        {
          width: 'medium',
          grow: false,
        },
      ],
    });
    expect(reverted.attributes.tabs[0].attributes.visContext).toEqual({
      suggestionType: UnifiedHistogramSuggestionType.histogramForDataView,
      requestData: {
        dataViewId: 'logs-data-view',
        timeInterval: 'h',
        breakdownField: 'host.name',
      },
      attributes: {
        visualizationType: 'lnsXY',
        state: { foo: 'bar' },
      },
    });
    expect(reverted.attributes.tabs[1].attributes.controlGroupJson).toBe(expectedControlGroupJson);
    expect(reverted.references).toEqual(references);
  });
});
