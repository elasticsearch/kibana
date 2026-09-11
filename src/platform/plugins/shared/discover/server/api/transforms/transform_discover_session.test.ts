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
import { injectReferences, parseSearchSourceJSON } from '@kbn/data-plugin/common';
import { DiscoverTabType, UnifiedHistogramSuggestionType } from '@kbn/discover-session-constants';
import { FILTERS, FilterStateStore } from '@kbn/es-query';
import { type DiscoverSessionTabTypeState, VIEW_MODE } from '@kbn/saved-search-plugin/common';
import { fromStoredTab } from '../../../common/embeddable/transform_utils';
import {
  discoverSessionApiDataSchema,
  type DiscoverSessionApiClassicTab,
  type DiscoverSessionApiEsqlTab,
} from '@kbn/as-code-discover-schema';
import type { DiscoverSessionApiData, DiscoverSessionApiDataInput } from '../schema';
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
    tags: ['tag-1', 'tag-2'],
    tabs: [
      {
        id: 'tab-classic',
        label: 'Classic',
        type: DiscoverTabType.Default,
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
        type: DiscoverTabType.Default,
        data_source: {
          type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
          query: 'FROM logs-* | LIMIT 10',
        },
        sort: [],
        hide_chart: false,
        hide_table: false,
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

  const expectedControlGroup = {
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
  };

  describe('transform out', () => {
    it('maps saved object attributes to API data', () => {
      const { sessionState: transformed } = transformDiscoverSessionOut(discoverSessionAttributes);
      expect(transformed).toEqual(discoverSessionApiData);
    });

    it('omits the inline data view ID from self filters and preserves foreign filter IDs', () => {
      const [classicTab] = discoverSessionAttributes.tabs;
      const searchSource = parseSearchSourceJSON(
        classicTab.attributes.kibanaSavedObjectMeta.searchSourceJSON
      );
      const inlineDataViewId = 'inline-data-view-id';
      searchSource.index = { id: inlineDataViewId, title: 'logs-*' };
      searchSource.filter = [
        {
          meta: { index: inlineDataViewId },
          query: { match_phrase: { 'service.name': 'api' } },
        },
        {
          meta: { index: 'foreign-data-view-id' },
          query: { match_phrase: { 'host.name': 'web-01' } },
        },
      ];

      const { sessionState } = transformDiscoverSessionOut({
        ...discoverSessionAttributes,
        tabs: [
          {
            ...classicTab,
            attributes: {
              ...classicTab.attributes,
              kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify(searchSource) },
            },
          },
        ],
      });
      const [selfFilter, foreignFilter] = (sessionState.tabs[0] as DiscoverSessionApiClassicTab)
        .filters;

      expect(selfFilter).not.toHaveProperty('data_view_id');
      expect(foreignFilter).toHaveProperty('data_view_id', 'foreign-data-view-id');

      const { attributes, references } = transformDiscoverSessionIn(sessionState);
      const roundTrippedSearchSource = injectReferences(
        parseSearchSourceJSON(attributes.tabs[0].attributes.kibanaSavedObjectMeta.searchSourceJSON),
        references
      );

      expect(roundTrippedSearchSource.filter?.[0]).not.toHaveProperty('meta.index');
      expect(roundTrippedSearchSource.filter?.[1]).toHaveProperty(
        'meta.index',
        'foreign-data-view-id'
      );
    });

    it('omits time_range but preserves refresh_interval when time restore is disabled', () => {
      const [classicTab] = discoverSessionAttributes.tabs;
      const { sessionState } = transformDiscoverSessionOut({
        ...discoverSessionAttributes,
        tabs: [
          {
            ...classicTab,
            attributes: {
              ...classicTab.attributes,
              timeRestore: false,
            },
          },
        ],
      });

      expect(sessionState.tabs[0]).not.toHaveProperty('time_range');
      expect(sessionState.tabs[0].refresh_interval).toEqual({
        value: 60000,
        pause: true,
      });
    });

    it('preserves refresh_interval when the stored time range is absent', () => {
      const [classicTab] = discoverSessionAttributes.tabs;
      const { sessionState } = transformDiscoverSessionOut({
        ...discoverSessionAttributes,
        tabs: [
          {
            ...classicTab,
            attributes: {
              ...classicTab.attributes,
              timeRestore: true,
              timeRange: undefined,
            },
          },
        ],
      });

      expect(sessionState.tabs[0]).not.toHaveProperty('time_range');
      expect(sessionState.tabs[0].refresh_interval).toEqual({
        value: 60000,
        pause: true,
      });
    });

    it('extracts tag IDs from saved object references', () => {
      const { sessionState: transformed } = transformDiscoverSessionOut(discoverSessionAttributes, [
        { type: 'tag', id: 'tag-1', name: 'tag-ref-tag-1' },
        { type: 'index-pattern', id: 'data-view-1', name: 'data-view-ref' },
      ]);

      expect(transformed.tags).toEqual(['tag-1']);
    });

    it('maps esqlApproximation to esql_approximation for ES|QL tabs', () => {
      const { sessionState } = transformDiscoverSessionOut({
        ...discoverSessionAttributes,
        tabs: [
          {
            ...discoverSessionAttributes.tabs[1],
            attributes: {
              ...discoverSessionAttributes.tabs[1].attributes,
              esqlApproximation: true,
            },
          },
        ],
      });
      expect((sessionState.tabs[0] as DiscoverSessionApiEsqlTab).esql_approximation).toBe(true);
    });

    it('omits esql_approximation when esqlApproximation is absent from an ES|QL tab', () => {
      const { sessionState } = transformDiscoverSessionOut({
        ...discoverSessionAttributes,
        tabs: [discoverSessionAttributes.tabs[1]],
      });
      expect(sessionState.tabs[0]).not.toHaveProperty('esql_approximation');
    });

    it('converts legacy flat tab sort to API sort objects', () => {
      const attributes = {
        ...discoverSessionAttributes,
        tabs: discoverSessionAttributes.tabs.map((tab, index) =>
          index === 0
            ? {
                ...tab,
                attributes: {
                  ...tab.attributes,
                  sort: ['@timestamp', 'desc'],
                },
              }
            : tab
        ),
      };

      const { sessionState: transformed } = transformDiscoverSessionOut(attributes);
      expect(transformed.tabs[0].sort).toEqual([{ name: '@timestamp', direction: 'desc' }]);
    });
  });

  describe('transform in', () => {
    it('normalizes fixture API data back to stored attributes', () => {
      const { attributes, references } = transformDiscoverSessionIn(discoverSessionApiData);

      expect(attributes).toEqual({
        title: discoverSessionApiData.title,
        description: discoverSessionApiData.description,
        tabs: [
          {
            id: discoverSessionApiData.tabs[0].id,
            label: discoverSessionApiData.tabs[0].label,
            attributes: {
              sort: [
                ['transaction.id', 'asc'],
                ['@timestamp', 'desc'],
              ],
              columns: ['message', 'transaction.id'],
              grid: {
                columns: {
                  message: {
                    width: 418,
                  },
                },
              },
              hideChart: false,
              hideTable: false,
              isTextBasedQuery: false,
              usesAdHocDataView: true,
              kibanaSavedObjectMeta: {
                searchSourceJSON:
                  '{"query":{"query":"","language":"kuery"},"filter":[],"index":{"title":"logs*,-logstash*,filebeat-*","timeFieldName":"@timestamp","allowHidden":false,"name":"logs*,-logstash*,filebeat-*"}}',
              },
              viewMode: VIEW_MODE.DOCUMENT_LEVEL,
              hideAggregatedPreview: false,
              rowHeight: 1,
              headerRowHeight: 1,
              timeRestore: true,
              timeRange: {
                from: 'now/d',
                to: 'now/d',
              },
              refreshInterval: {
                value: 60000,
                pause: true,
              },
              rowsPerPage: 25,
              sampleSize: 100,
              breakdownField: 'transaction.id',
              chartInterval: 'h',
              density: 'compact',
              documentsDisplayMode: 'json',
              jsonModeSettings: {
                hideNulls: true,
                wrapLines: false,
                defaultRenderedNodes: 10,
              },
              controlGroupJson: undefined,
              visContext: undefined,
            },
          },
          {
            id: discoverSessionApiData.tabs[1].id,
            label: discoverSessionApiData.tabs[1].label,
            attributes: {
              sort: [['transaction.id', 'asc']],
              columns: [],
              grid: {},
              hideChart: false,
              hideTable: false,
              isTextBasedQuery: true,
              usesAdHocDataView: false,
              kibanaSavedObjectMeta: {
                searchSourceJSON:
                  '{"query":{"esql":"FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value"}}',
              },
              hideAggregatedPreview: false,
              rowHeight: 1,
              headerRowHeight: 1,
              timeRestore: true,
              timeRange: {
                from: 'now/d',
                to: 'now/d',
              },
              refreshInterval: {
                value: 60000,
                pause: false,
              },
              rowsPerPage: 25,
              sampleSize: 100,
              breakdownField: 'transaction.id',
              chartInterval: 'h',
              density: 'compact',
              documentsDisplayMode: 'json',
              jsonModeSettings: {
                hideNulls: true,
                wrapLines: false,
                defaultRenderedNodes: 10,
              },
              visContext: {
                suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
                requestData: {
                  dataViewId: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                  timeField: '@timestamp',
                  breakdownField: 'transaction.id',
                },
                attributes: (discoverSessionApiData.tabs[1] as DiscoverSessionApiData['tabs'][1])
                  .vis_context!.attributes,
              },
              controlGroupJson: JSON.stringify({
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
              }),
              tabTypeState: {
                type: DiscoverTabType.Metrics,
                dimensions: ['host.name'],
                searchTerm: 'cpu',
                counterAggregation: 'max',
                gaugeAggregation: 'min',
                histogramPercentile: 'p99',
              },
            },
          },
        ],
      });
      expect(references).toEqual([]);
    });

    it('enables time restore when time_range is present', () => {
      const [classicTab] = apiData.tabs;
      const { attributes } = transformDiscoverSessionIn({
        ...apiData,
        tabs: [classicTab],
      });

      expect(attributes.tabs[0].attributes.timeRestore).toBe(true);
    });

    it('persists refresh_interval independently when time_range is absent', () => {
      const [, esqlTab] = apiData.tabs;
      const { attributes } = transformDiscoverSessionIn({
        ...apiData,
        tabs: [
          {
            ...esqlTab,
            refresh_interval: { pause: false, value: 5000 },
          },
        ],
      });

      expect(attributes.tabs[0].attributes.timeRestore).toBe(false);
      expect(attributes.tabs[0].attributes.refreshInterval).toEqual({
        pause: false,
        value: 5000,
      });
    });

    it('maps esql_approximation to esqlApproximation for ES|QL tabs', () => {
      const [, esqlTab] = apiData.tabs;
      const { attributes } = transformDiscoverSessionIn({
        ...apiData,
        tabs: [{ ...esqlTab, esql_approximation: true } as DiscoverSessionApiEsqlTab],
      });
      expect(attributes.tabs[0].attributes.esqlApproximation).toBe(true);
    });

    it('omits esqlApproximation when esql_approximation is absent from an ES|QL tab', () => {
      const [, esqlTab] = apiData.tabs;
      const { attributes } = transformDiscoverSessionIn({ ...apiData, tabs: [esqlTab] });
      expect(attributes.tabs[0].attributes).not.toHaveProperty('esqlApproximation');
    });

    it('does not set esqlApproximation for classic tabs', () => {
      const [classicTab] = apiData.tabs;
      const { attributes } = transformDiscoverSessionIn({ ...apiData, tabs: [classicTab] });
      expect(attributes.tabs[0].attributes).not.toHaveProperty('esqlApproximation');
    });

    it('creates unique saved object references for tags', () => {
      const { references } = transformDiscoverSessionIn({
        ...discoverSessionApiData,
        tags: ['tag-1', 'tag-1', 'tag-2'],
      });

      expect(references).toEqual([
        { type: 'tag', id: 'tag-1', name: 'tag-ref-tag-1' },
        { type: 'tag', id: 'tag-2', name: 'tag-ref-tag-2' },
      ]);
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
      // Order of the control group JSON is not guaranteed, so we need to parse it and compare the objects
      expect(JSON.parse(attributes.tabs[1].attributes.controlGroupJson!)).toEqual(
        expectedControlGroup
      );
      expect(references).toContainEqual({
        name: 'tab_tab-classic.kibanaSavedObjectMeta.searchSourceJSON.index',
        type: 'index-pattern',
        id: 'logs-data-view',
      });
    });
  });

  describe('visContext requestData extraction', () => {
    const [classicTab, esqlTab] = apiData.tabs;

    const buildEsqlVisContext = ({
      layers,
      adHocDataViews,
      suggestionType = UnifiedHistogramSuggestionType.histogramForESQL,
    }: {
      layers: Record<string, Record<string, unknown>>;
      adHocDataViews?: Record<string, Record<string, unknown>>;
      suggestionType?: NonNullable<
        DiscoverSessionApiData['tabs'][number]['vis_context']
      >['suggestion_type'];
    }) => ({
      suggestion_type: suggestionType,
      attributes: {
        visualizationType: 'lnsXY',
        state: {
          datasourceStates: { textBased: { layers } },
          ...(adHocDataViews && { adHocDataViews }),
        },
      },
    });

    const getStoredVisContext = (tab: DiscoverSessionApiData['tabs'][number]) =>
      transformDiscoverSessionIn({ ...apiData, tabs: [tab] }).attributes.tabs[0].attributes
        .visContext;

    it('extracts the fingerprint from the chart blob for ES|QL tabs', () => {
      const layers = { 'layer-1': { index: 'esql-dv' } };
      const adHocDataViews = { 'esql-dv': { type: 'esql', timeFieldName: '@timestamp' } };

      const histogramVisContext = buildEsqlVisContext({ layers, adHocDataViews });
      expect(
        getStoredVisContext({
          ...esqlTab,
          breakdown_field: 'host.name',
          vis_context: histogramVisContext,
        })
      ).toEqual({
        suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
        requestData: {
          dataViewId: 'esql-dv',
          timeField: '@timestamp',
          breakdownField: 'host.name',
        },
        attributes: histogramVisContext.attributes,
      });

      const lensVisContext = buildEsqlVisContext({
        layers,
        adHocDataViews,
        suggestionType: UnifiedHistogramSuggestionType.lensSuggestion,
      });
      expect(getStoredVisContext({ ...esqlTab, vis_context: lensVisContext })).toEqual({
        suggestionType: UnifiedHistogramSuggestionType.lensSuggestion,
        requestData: {
          dataViewId: 'esql-dv',
          timeField: '@timestamp',
        },
        attributes: lensVisContext.attributes,
      });
    });

    it('preserves a dormant ES|QL fingerprint on classic tabs without inheriting timeInterval', () => {
      const visContext = buildEsqlVisContext({
        layers: { 'layer-1': { index: 'esql-dv' } },
        adHocDataViews: { 'esql-dv': { type: 'esql', timeFieldName: '@timestamp' } },
      });

      expect(getStoredVisContext({ ...classicTab, vis_context: visContext })).toEqual({
        suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
        requestData: {
          dataViewId: 'esql-dv',
          timeField: '@timestamp',
          breakdownField: 'host.name',
        },
        attributes: visContext.attributes,
      });
    });

    it('extracts the fingerprint without a time field and omits an empty breakdown field', () => {
      const visContext = buildEsqlVisContext({
        layers: { 'layer-1': { index: 'esql-dv' } },
        adHocDataViews: { 'esql-dv': { type: 'esql' } },
      });

      expect(
        getStoredVisContext({ ...esqlTab, breakdown_field: '', vis_context: visContext })
      ).toStrictEqual({
        suggestionType: visContext.suggestion_type,
        requestData: { dataViewId: 'esql-dv' },
        attributes: visContext.attributes,
      });
    });

    it('falls back when the blob is not a recognizable ES|QL chart', () => {
      const unrecognizable = {
        suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL as const,
        attributes: { visualizationType: 'lnsXY', state: { foo: 'bar' } },
      };

      expect(
        getStoredVisContext({
          ...esqlTab,
          breakdown_field: 'host.name',
          vis_context: unrecognizable,
        })
      ).toEqual(expect.objectContaining({ requestData: { breakdownField: 'host.name' } }));

      const wrongDataViewType = buildEsqlVisContext({
        layers: { 'layer-1': { index: 'a-persisted-dv' } },
        adHocDataViews: { 'a-persisted-dv': { type: 'index-pattern' } },
      });

      expect(
        getStoredVisContext({
          ...esqlTab,
          breakdown_field: '',
          vis_context: wrongDataViewType,
        })
      ).toStrictEqual({
        suggestionType: wrongDataViewType.suggestion_type,
        requestData: {},
        attributes: wrongDataViewType.attributes,
      });
    });

    it('keeps behavior unchanged without a vis_context', () => {
      expect(getStoredVisContext(esqlTab)).toBeUndefined();

      const classicTabWithoutVisContext = { ...classicTab };
      delete classicTabWithoutVisContext.vis_context;

      expect(getStoredVisContext(classicTabWithoutVisContext)).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('round-trips legacy pinned filters as app filters', () => {
      const pinnedFilter = {
        meta: {
          index: 'logs-data-view',
          type: FILTERS.PHRASE,
          key: 'service.name',
          disabled: true,
          negate: true,
          alias: 'Saved condition',
        },
        query: { match_phrase: { 'service.name': 'checkout' } },
        $state: { store: FilterStateStore.GLOBAL_STATE },
      };
      const appFilter = {
        meta: { index: 'foreign-data-view', type: FILTERS.EXISTS, key: 'bytes' },
        query: { exists: { field: 'bytes' } },
        $state: { store: FilterStateStore.APP_STATE },
      };
      const searchSourceJSON = JSON.stringify({
        index: 'logs-data-view',
        query: { language: 'kuery', query: '' },
        filter: [pinnedFilter, appFilter],
      });
      const [classicTab] = discoverSessionAttributes.tabs;
      const storedTab = {
        ...classicTab,
        attributes: { ...classicTab.attributes, kibanaSavedObjectMeta: { searchSourceJSON } },
      };

      // The session API keeps both conditions, without exposing the pin marker.
      const { sessionState, warnings } = transformDiscoverSessionOut({
        ...discoverSessionAttributes,
        tabs: [storedTab],
      });
      const expectedApiFilters = [
        {
          type: 'condition',
          condition: { field: 'service.name', operator: 'is', value: 'checkout', negate: true },
          data_view_id: 'logs-data-view',
          disabled: true,
          negate: true,
          label: 'Saved condition',
        },
        {
          type: 'condition',
          condition: { field: 'bytes', operator: 'exists' },
          data_view_id: 'foreign-data-view',
        },
      ];

      expect(warnings).toEqual([]);
      expect(sessionState.tabs[0]).toMatchObject({ filters: expectedApiFilters });
      expect(discoverSessionApiDataSchema.parse(sessionState)).toEqual(sessionState);

      const { attributes, references } = transformDiscoverSessionIn(sessionState);
      const restoredSearchSource = injectReferences(
        parseSearchSourceJSON(attributes.tabs[0].attributes.kibanaSavedObjectMeta.searchSourceJSON),
        references
      );

      expect(restoredSearchSource.filter).toMatchObject([
        { meta: pinnedFilter.meta, query: pinnedFilter.query },
        { meta: appFilter.meta, query: appFilter.query },
      ]);
      expect(restoredSearchSource.filter?.map((filter) => filter.$state)).toEqual([
        undefined,
        undefined,
      ]);
      expect(transformDiscoverSessionOut(attributes, references).sessionState).toEqual(
        sessionState
      );

      // Reading the session changes neither the source document nor the shared panel conversion.
      expect(storedTab.attributes.kibanaSavedObjectMeta.searchSourceJSON).toBe(searchSourceJSON);
      expect(fromStoredTab(storedTab.attributes)).toMatchObject({
        filters: [expectedApiFilters[1]],
      });
    });

    it('round-trips validated fixture API data through persistence without warnings', () => {
      // Include request validation and defaults, as POST and PUT do before calling the service.
      const request = discoverSessionApiDataSchema.parse(discoverSessionApiData);
      const { attributes, references } = transformDiscoverSessionIn(request);
      const { sessionState, warnings } = transformDiscoverSessionOut(attributes, references);
      const roundTripped = discoverSessionApiDataSchema.parse(sessionState);

      expect(sessionState).toEqual(discoverSessionApiData);
      expect(roundTripped).toStrictEqual(request);
      expect(warnings).toEqual([]);
    });

    it('applies request defaults without changing authored values during persistence', () => {
      const input: DiscoverSessionApiDataInput = {
        title: 'Session with omitted defaults',
        tags: [],
        tabs: [
          {
            id: 'classic',
            label: 'Classic',
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'logs-data-view' },
            column_order: ['message'],
            row_height: 'auto',
            sample_size: 250,
            hide_chart: true,
          },
          {
            id: 'esql',
            label: 'ES|QL',
            data_source: { type: AS_CODE_ESQL_DATA_SOURCE_TYPE, query: 'FROM logs-*' },
            column_order: [],
            control_panels: [
              {
                id: 'service',
                type: ESQL_CONTROL,
                config: {
                  control_type: 'STATIC_VALUES',
                  variable_name: 'service',
                  variable_type: 'values',
                  available_options: ['api', 'web'],
                  selected_options: ['web'],
                  single_select: true,
                },
              },
            ],
          },
        ],
      };
      const request = discoverSessionApiDataSchema.parse(input);
      const { attributes, references } = transformDiscoverSessionIn(request);
      const { sessionState, warnings } = transformDiscoverSessionOut(attributes, references);

      expect(request).toMatchObject({
        description: '',
        tabs: [
          {
            filters: [],
            sort: [],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            hide_chart: true,
            hide_table: false,
          },
          {
            sort: [],
            hide_chart: false,
            hide_table: false,
            control_panels: [{ width: 'medium', grow: false }],
          },
        ],
      });
      expect(sessionState).toStrictEqual(request);
      expect(discoverSessionApiDataSchema.parse(sessionState)).toStrictEqual(request);
      expect(attributes.tabs[0].attributes.rowHeight).toBe(-1);
      expect(warnings).toEqual([]);
    });

    it('round-trips fixture saved object attributes through API', () => {
      const { sessionState: apiDataFromStored } =
        transformDiscoverSessionOut(discoverSessionAttributes);
      const { attributes, references } = transformDiscoverSessionIn(apiDataFromStored);
      const { sessionState: roundTripped } = transformDiscoverSessionOut(attributes, references);

      expect(apiDataFromStored).toEqual(discoverSessionApiData);
      expect(roundTripped).toEqual(discoverSessionApiData);
      expect(references).toEqual([]);
    });

    it('preserves saved metrics tab state through an API read and write', () => {
      const [, esqlTab] = discoverSessionAttributes.tabs;
      // Required keeps this test up to date when we add new saved fields, even optional ones.
      // Give them real values so we catch any fields we forget to map in the transforms.
      const savedTabTypeState: Required<DiscoverSessionTabTypeState> = {
        type: DiscoverTabType.Metrics,
        dimensions: ['host.name', 'service.name'],
        searchTerm: 'cpu',
        counterAggregation: 'max',
        gaugeAggregation: 'min',
        histogramPercentile: 'p99',
      };
      const savedMetricsSession = {
        ...discoverSessionAttributes,
        tabs: [
          {
            ...esqlTab,
            attributes: {
              ...esqlTab.attributes,
              tabTypeState: savedTabTypeState,
            },
          },
        ],
      };

      const { sessionState } = transformDiscoverSessionOut(savedMetricsSession);

      expect(sessionState.tabs[0]).toMatchObject({
        type: DiscoverTabType.Metrics,
        dimensions: ['host.name', 'service.name'],
        search_term: 'cpu',
        counter_aggregation: 'max',
        gauge_aggregation: 'min',
        histogram_percentile: 'p99',
      });

      expect(sessionState.tabs[0]).not.toHaveProperty('tabTypeState');

      const { attributes: writtenBack } = transformDiscoverSessionIn(
        discoverSessionApiDataSchema.parse(sessionState)
      );

      expect(writtenBack.tabs[0].attributes.tabTypeState).toEqual(savedTabTypeState);
    });

    it('rejects saved metrics state on a classic tab instead of dropping it', () => {
      const [classicTab, metricsTab] = discoverSessionAttributes.tabs;

      expect(() =>
        transformDiscoverSessionOut({
          ...discoverSessionAttributes,
          tabs: [
            {
              ...classicTab,
              attributes: {
                ...classicTab.attributes,
                tabTypeState: metricsTab.attributes.tabTypeState,
              },
            },
          ],
        })
      ).toThrow(
        `Metrics tab "${classicTab.label}" with ID "${classicTab.id}" requires an ES|QL data source.`
      );
    });

    it('round-trips fixture saved object attributes preserving API-representable persistence values', () => {
      const reverted = transformDiscoverSessionIn(
        transformDiscoverSessionOut(discoverSessionAttributes).sessionState
      ).attributes;
      const expected = transformDiscoverSessionIn(discoverSessionApiData).attributes;

      // `controlGroupJson` is a serialized string whose key order isn't guaranteed,
      // so ignore it on each tab for the structural comparison.
      const omitTabsControlGroupJson = (attributes: typeof reverted) => ({
        ...attributes,
        tabs: attributes.tabs.map(({ attributes: { controlGroupJson, ...tabAttrs }, ...tab }) => ({
          ...tab,
          attributes: tabAttrs,
        })),
      });

      expect(omitTabsControlGroupJson(reverted)).toEqual(omitTabsControlGroupJson(expected));
      expect(reverted.tabs[0].attributes.controlGroupJson).toBeUndefined();
      // Order of the control group JSON is not guaranteed, so we need to parse it and compare the objects
      expect(JSON.parse(reverted.tabs[1].attributes.controlGroupJson!)).toEqual(
        JSON.parse(expected.tabs[1].attributes.controlGroupJson!)
      );
      expect(reverted.tabs[1].attributes.usesAdHocDataView).toBe(false);
    });
  });

  it('round-trips API data and preserves semantic values', () => {
    const { attributes, references } = transformDiscoverSessionIn(apiData);
    const { sessionState: roundTripped } = transformDiscoverSessionOut(attributes, references);
    const reverted = transformDiscoverSessionIn(roundTripped);

    expect(roundTripped).toMatchObject(apiData);
    expect(roundTripped.tabs[0]).toMatchObject({
      column_order: [],
    });
    expect(roundTripped.tabs[1]).toMatchObject({
      column_order: [],
      control_panels: [
        {
          width: 'medium',
          grow: false,
        },
      ],
    });

    expect(roundTripped.tabs[0].density).toBeUndefined();
    expect(roundTripped.tabs[0].header_row_height).toBeUndefined();
    expect(roundTripped.tabs[1].density).toBeUndefined();
    expect(roundTripped.tabs[1].header_row_height).toBeUndefined();
    expect(reverted.attributes.tabs[0].attributes.density).toBeUndefined();
    expect(reverted.attributes.tabs[0].attributes.headerRowHeight).toBeUndefined();
    expect(reverted.attributes.tabs[1].attributes.density).toBeUndefined();
    expect(reverted.attributes.tabs[1].attributes.headerRowHeight).toBeUndefined();
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
    // Order of the control group JSON is not guaranteed, so we need to parse it and compare the objects
    expect(JSON.parse(reverted.attributes.tabs[1].attributes.controlGroupJson!)).toEqual(
      expectedControlGroup
    );
    expect(reverted.references).toEqual(references);
  });
});
