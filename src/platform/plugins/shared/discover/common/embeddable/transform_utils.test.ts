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
  AS_CODE_DATA_VIEW_SPEC_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import type { SavedObjectReference } from '@kbn/core-saved-objects-common/src/server_types';
import {
  fromStoredSearchEmbeddable,
  fromStoredSearchEmbeddableByRef,
  fromStoredSearchEmbeddableByValue,
  fromStoredGrid,
  fromStoredRowHeight,
  toDiscoverSessionPanelOverrides,
  fromStoredSort,
  fromStoredTab,
  toStoredSearchEmbeddable,
  toStoredSearchEmbeddableByRef,
  toStoredSearchEmbeddableByValue,
  toStoredGrid,
  toStoredHeight,
  fromDiscoverSessionPanelOverrides,
  toStoredSort,
  toStoredTab,
} from './transform_utils';
import type {
  SearchEmbeddableByReferenceState,
  StoredSearchEmbeddableByReferenceState,
  StoredSearchEmbeddableByValueState,
  StoredSearchEmbeddableState,
} from './types';
import {
  DISCOVER_SESSION_EMBEDDABLE_SYNTHETIC_TAB_ID,
  DISCOVER_SESSION_EMBEDDABLE_SYNTHETIC_TAB_LABEL,
  SAVED_SEARCH_SAVED_OBJECT_REF_NAME,
} from './constants';
import { SavedSearchType, VIEW_MODE } from '@kbn/saved-search-plugin/common';
import type {
  DiscoverSessionEmbeddableByReferenceState,
  DiscoverSessionEmbeddableByValueState,
} from '../../server';
import { DataGridDensity } from '@kbn/discover-session-constants';
import { ASCODE_FILTER_OPERATOR, ASCODE_FILTER_TYPE } from '@kbn/as-code-filters-constants';

describe('search embeddable transform utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fromStoredSearchEmbeddable', () => {
    it('dispatches to by-reference transform when state has no attributes', () => {
      const storedState: StoredSearchEmbeddableByReferenceState = {
        title: 'My Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
      };
      const references: SavedObjectReference[] = [
        { name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME, type: SavedSearchType, id: 'session-123' },
      ];
      const result = fromStoredSearchEmbeddable(storedState, references);
      expect(result).toMatchObject({
        title: 'My Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        ref_id: 'session-123',
        selected_tab_id: undefined,
        overrides: {},
      });
    });

    it('dispatches to by-value transform when state has attributes', () => {
      const storedState = {
        title: 'My Search',
        description: 'My description',
        attributes: {
          title: '',
          sort: [['@timestamp', 'desc']],
          columns: ['message'],
          grid: {},
          hideChart: false,
          viewMode: VIEW_MODE.DOCUMENT_LEVEL,
          isTextBasedQuery: false,
          timeRestore: false,
          kibanaSavedObjectMeta: {
            searchSourceJSON:
              '{"query":{"language":"kuery","query":""},"index":"dv-1","filter":[]}',
          },
          tabs: [
            {
              id: 'tab-1',
              label: 'Tab 1',
              attributes: {
                sort: [['@timestamp', 'desc']],
                columns: ['message'],
                grid: {},
                hideChart: false,
                viewMode: VIEW_MODE.DOCUMENT_LEVEL,
                isTextBasedQuery: false,
                timeRestore: false,
                kibanaSavedObjectMeta: {
                  searchSourceJSON:
                    '{"query":{"language":"kuery","query":""},"index":"dv-1","filter":[]}',
                },
              },
            },
          ],
        },
      } as StoredSearchEmbeddableByValueState;
      const references: SavedObjectReference[] = [
        { name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: 'dv-1' },
      ];
      const result = fromStoredSearchEmbeddable(storedState, references);
      expect('tabs' in result && result.tabs).toBeDefined();
      expect('tabs' in result && Array.isArray(result.tabs)).toBe(true);
      expect('tabs' in result && result.tabs.length).toBe(1);
    });

    it('merges attributes.references when converting by-value legacy state (embedded save and return)', () => {
      const dataViewId = 'dv-from-embedded-editor';
      const indexRefName = 'kibanaSavedObjectMeta.searchSourceJSON.index';
      const searchSourceWithRef = JSON.stringify({
        query: { language: 'kuery', query: '' },
        filter: [],
        indexRefName,
      });
      const storedState = {
        title: 'Panel from Discover',
        description: '',
        attributes: {
          title: '',
          sort: [['@timestamp', 'desc']],
          columns: ['message'],
          grid: {},
          hideChart: false,
          viewMode: VIEW_MODE.DOCUMENT_LEVEL,
          isTextBasedQuery: false,
          timeRestore: false,
          kibanaSavedObjectMeta: {
            searchSourceJSON: searchSourceWithRef,
          },
          references: [{ name: indexRefName, type: 'index-pattern', id: dataViewId }],
          tabs: [
            {
              id: 'tab-1',
              label: 'Tab 1',
              attributes: {
                sort: [['@timestamp', 'desc']],
                columns: ['message'],
                grid: {},
                hideChart: false,
                viewMode: VIEW_MODE.DOCUMENT_LEVEL,
                isTextBasedQuery: false,
                timeRestore: false,
                kibanaSavedObjectMeta: {
                  searchSourceJSON: searchSourceWithRef,
                },
              },
            },
          ],
        },
      } as StoredSearchEmbeddableByValueState;

      const result = fromStoredSearchEmbeddable(storedState);

      expect('tabs' in result && result.tabs).toBeDefined();
      expect('tabs' in result && result.tabs?.[0]).toMatchObject({
        data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: dataViewId },
      });
    });
  });

  describe('toStoredSearchEmbeddable', () => {
    it('dispatches to by-reference transform when state has ref_id', () => {
      const apiState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'My Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        ref_id: 'session-456',
        selected_tab_id: undefined,
        overrides: {},
      };
      const { state, references } = toStoredSearchEmbeddable(apiState);
      expect(references).toContainEqual({
        name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME,
        type: SavedSearchType,
        id: 'session-456',
      });
      expect(state).toMatchObject({
        title: 'My Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
      });
    });

    it('dispatches to by-value transform when state has tabs', () => {
      const apiState: DiscoverSessionEmbeddableByValueState = {
        title: 'Panel Title',
        description: 'Panel description',
        tabs: [
          {
            column_order: ['message'],
            sort: [],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            density: DataGridDensity.COMPACT,
            header_row_height: 'auto',
            row_height: 'auto',
            query: { language: 'kql', expression: '' },
            filters: [],
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'data-view-1' },
          },
        ],
      };
      const { state, references } = toStoredSearchEmbeddable(apiState);
      expect(state).toHaveProperty('attributes');
      expect((state as StoredSearchEmbeddableByValueState).attributes.tabs).toHaveLength(1);
      expect(references).toContainEqual({
        id: 'data-view-1',
        name: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        type: 'index-pattern',
      });
    });
  });

  describe('fromStoredSearchEmbeddableByValue', () => {
    it('converts stored by-value SearchEmbeddable state to panel API shape', () => {
      const storedState: StoredSearchEmbeddableByValueState = {
        title: '[filebeat-*] elasticsearch logs',
        description: 'my description',
        // type: 'search',
        attributes: {
          kibanaSavedObjectMeta: {
            searchSourceJSON:
              '{"query":{"language":"kuery","query":"service.type: \\"elasticsearch\\""},"highlightAll":true,"fields":[{"field":"*","include_unmapped":true}],"sort":[{"@timestamp":{"order":"desc","format":"strict_date_optional_time"}},{"_doc":"desc"}],"filter":[{"meta":{"disabled":false,"negate":false,"alias":null,"key":"service.type","field":"service.type","params":{"query":"elasticsearch"},"type":"phrase","index":"c7d7a1f5-19da-4ba9-af15-5919e8cd2528"},"query":{"match_phrase":{"service.type":"elasticsearch"}},"$state":{"store":"appState"}}],"index":"c7d7a1f5-19da-4ba9-af15-5919e8cd2528"}',
          },
          title: '',
          sort: [['@timestamp', 'desc']],
          columns: ['message'],
          description: '',
          grid: {},
          hideChart: false,
          hideTable: false,
          viewMode: VIEW_MODE.DOCUMENT_LEVEL,
          isTextBasedQuery: false,
          timeRestore: false,
          tabs: [
            {
              id: 'e0ae3a4e-67b9-4383-a8c1-ce463000b4bd',
              label: 'Untitled',
              attributes: {
                kibanaSavedObjectMeta: {
                  searchSourceJSON:
                    '{"query":{"language":"kuery","query":"service.type: \\"elasticsearch\\""},"highlightAll":true,"fields":[{"field":"*","include_unmapped":true}],"sort":[{"@timestamp":{"order":"desc","format":"strict_date_optional_time"}},{"_doc":"desc"}],"filter":[{"meta":{"disabled":false,"negate":false,"alias":null,"key":"service.type","field":"service.type","params":{"query":"elasticsearch"},"type":"phrase","index":"c7d7a1f5-19da-4ba9-af15-5919e8cd2528"},"query":{"match_phrase":{"service.type":"elasticsearch"}},"$state":{"store":"appState"}}],"index":"c7d7a1f5-19da-4ba9-af15-5919e8cd2528"}',
                },
                sort: [['@timestamp', 'desc']],
                columns: ['message'],
                grid: {},
                hideChart: false,
                hideTable: false,
                viewMode: VIEW_MODE.DOCUMENT_LEVEL,
                isTextBasedQuery: false,
                timeRestore: false,
              },
            },
          ],
        },
      };

      const expected: DiscoverSessionEmbeddableByValueState = {
        title: '[filebeat-*] elasticsearch logs',
        description: 'my description',
        tabs: [
          {
            query: { language: 'kql', expression: 'service.type: "elasticsearch"' },
            filters: [
              {
                type: ASCODE_FILTER_TYPE.CONDITION,
                condition: {
                  field: 'service.type',
                  operator: ASCODE_FILTER_OPERATOR.IS,
                  value: 'elasticsearch',
                },
                data_view_id: 'c7d7a1f5-19da-4ba9-af15-5919e8cd2528',
                disabled: false,
              },
            ],
            sort: [{ name: '@timestamp', direction: 'desc' }],
            column_order: ['message'],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            data_source: {
              type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
              ref_id: 'c7d7a1f5-19da-4ba9-af15-5919e8cd2528',
            },
          },
        ],
      };

      const result = fromStoredSearchEmbeddableByValue(storedState);

      expect(result).toEqual(expected);
      const { state: roundTripped } = toStoredSearchEmbeddableByValue(result);
      const [roundTrippedTab] = roundTripped.attributes.tabs ?? [];

      if (!roundTrippedTab) {
        throw new Error('Expected a round-tripped tab');
      }

      expect(roundTrippedTab.attributes.density).toBeUndefined();
      expect(roundTrippedTab.attributes.headerRowHeight).toBeUndefined();
    });
  });

  describe('fromStoredSearchEmbeddableByRef', () => {
    it('converts stored by-reference SearchEmbeddable state to panel API shape', () => {
      const storedSearch: StoredSearchEmbeddableByReferenceState = {
        title: 'My Saved Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
      };
      const references: SavedObjectReference[] = [
        { name: 'savedObjectRef', type: SavedSearchType, id: 'session-123' },
      ];
      const result = fromStoredSearchEmbeddableByRef(storedSearch, references);
      expect(result).toEqual({
        title: 'My Saved Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        ref_id: 'session-123',
        selected_tab_id: undefined,
        overrides: {},
      });
    });

    it('puts editable panel fields in overrides (not top-level) and maps selectedTabId to selected_tab_id', () => {
      const storedSearch: StoredSearchEmbeddableByReferenceState = {
        title: 'My Saved Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        selectedTabId: 'tab-active',
        sort: [['@timestamp', 'desc']],
        columns: ['message'],
        rowHeight: -1,
        sampleSize: 500,
        rowsPerPage: 100,
        headerRowHeight: 3,
        density: DataGridDensity.COMPACT,
        documentsDisplayMode: 'json',
        jsonModeSettings: { hideNulls: true, wrapLines: false, defaultRenderedNodes: 2 },
        grid: {
          columns: {
            message: { width: 100 },
          },
        },
      };
      const references: SavedObjectReference[] = [
        { name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME, type: SavedSearchType, id: 'session-xyz' },
      ];
      const result = fromStoredSearchEmbeddableByRef(storedSearch, references);
      expect(result).toEqual({
        title: 'My Saved Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        ref_id: 'session-xyz',
        selected_tab_id: 'tab-active',
        overrides: {
          sort: [{ name: '@timestamp', direction: 'desc' }],
          column_order: ['message'],
          column_settings: { message: { width: 100 } },
          row_height: 'auto',
          sample_size: 500,
          rows_per_page: 100,
          header_row_height: 3,
          density: DataGridDensity.COMPACT,
          documents_display_mode: 'json',
          json_mode_settings: {
            hide_nulls: true,
            wrap_lines: false,
            default_rendered_nodes: 2,
          },
        },
      });
      expect(result).not.toHaveProperty('sort');
      expect(result).not.toHaveProperty('columns');
      expect(result).not.toHaveProperty('selectedTabId');
      expect(result).not.toHaveProperty('documentsDisplayMode');
      expect(result).not.toHaveProperty('jsonModeSettings');
    });

    it('throws when no saved search reference matches type and name', () => {
      const storedSearch: StoredSearchEmbeddableByReferenceState = {
        title: 'My Saved Search',
      };
      expect(() => fromStoredSearchEmbeddableByRef(storedSearch, [])).toThrow(
        `Missing reference of type "${SavedSearchType}"`
      );
      expect(() =>
        fromStoredSearchEmbeddableByRef(storedSearch, [
          { name: 'wrongRefName', type: SavedSearchType, id: 'id-1' },
        ])
      ).toThrow(`Missing reference of type "${SavedSearchType}"`);
    });

    it('uses the reference that matches SavedSearchType and SAVED_SEARCH_SAVED_OBJECT_REF_NAME', () => {
      const storedSearch: StoredSearchEmbeddableByReferenceState = {
        title: 'Panel',
      };
      const references: SavedObjectReference[] = [
        { name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: 'dv-1' },
        { name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME, type: SavedSearchType, id: 'session-picked' },
      ];
      const result = fromStoredSearchEmbeddableByRef(storedSearch, references);
      expect(result.ref_id).toBe('session-picked');
    });

    it('uses savedObjectId on state when present so a saved search reference is not required', () => {
      const storedSearch: SearchEmbeddableByReferenceState = {
        title: 'Runtime / API state',
        savedObjectId: 'session-without-ref-array',
      };
      const result = fromStoredSearchEmbeddableByRef(storedSearch, []);
      expect(result.ref_id).toBe('session-without-ref-array');
    });

    it('prefers the saved search reference over a stale savedObjectId on state', () => {
      const storedSearch: SearchEmbeddableByReferenceState = {
        title: 'Panel',
        savedObjectId: 'stale-id-from-source-space',
      };
      const references: SavedObjectReference[] = [
        {
          name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME,
          type: SavedSearchType,
          id: 'id-from-reference',
        },
      ];
      const result = fromStoredSearchEmbeddableByRef(storedSearch, references);
      expect(result.ref_id).toBe('id-from-reference');
    });
  });

  describe('toStoredSearchEmbeddableByRef', () => {
    it('converts panel API by-reference state to stored SearchEmbeddable state with references', () => {
      const apiState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'My Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        ref_id: 'session-456',
        selected_tab_id: 'tab-1',
        overrides: {},
      };
      const result = toStoredSearchEmbeddableByRef(apiState);
      expect(result.references).toEqual([
        {
          name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME,
          type: SavedSearchType,
          id: 'session-456',
        },
      ]);
      expect(result.state).toEqual({
        title: 'My Search',
        description: 'My description',
        time_range: { from: 'now-15m', to: 'now' },
        selectedTabId: 'tab-1',
      });
    });
  });

  describe('toStoredSearchEmbeddableByValue', () => {
    it('converts panel API by-value state to stored SearchEmbeddable state with references', () => {
      const apiState: DiscoverSessionEmbeddableByValueState = {
        title: 'Panel Title',
        description: 'Panel description',
        time_range: { from: 'now-1h', to: 'now' },
        tabs: [
          {
            column_order: ['message', '@timestamp'],
            column_settings: { '@timestamp': { width: 200 } },
            sort: [{ name: '@timestamp', direction: 'desc' }],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            density: DataGridDensity.COMPACT,
            header_row_height: 'auto',
            row_height: 'auto',
            query: { language: 'kql', expression: '' },
            filters: [],
            rows_per_page: 100,
            sample_size: 1000,
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'data-view-1' },
          },
        ],
      };
      const result = toStoredSearchEmbeddableByValue(apiState);
      expect(result.references).toEqual([
        {
          id: 'data-view-1',
          name: 'kibanaSavedObjectMeta.searchSourceJSON.index',
          type: 'index-pattern',
        },
      ]);
      expect(result.state.title).toBe('Panel Title');
      expect(result.state.description).toBe('Panel description');
      expect(result.state.attributes.tabs).toHaveLength(1);
      expect(result.state.attributes.tabs[0].id).toBe(DISCOVER_SESSION_EMBEDDABLE_SYNTHETIC_TAB_ID);
      expect(result.state.attributes.tabs[0].label).toBe(
        DISCOVER_SESSION_EMBEDDABLE_SYNTHETIC_TAB_LABEL
      );
      expect(result.state.attributes.tabs[0].attributes.columns).toEqual(['message', '@timestamp']);
      expect(result.state.attributes.tabs[0].attributes.sort).toEqual([['@timestamp', 'desc']]);
      expect(result.state.attributes.tabs[0].attributes.grid).toEqual({
        columns: { '@timestamp': { width: 200 } },
      });
      expect(result.state.attributes.tabs[0].attributes.rowHeight).toBe(-1);
      expect(result.state.attributes.tabs[0].attributes.headerRowHeight).toBe(-1);
      const searchSource = JSON.parse(
        result.state.attributes.tabs[0].attributes.kibanaSavedObjectMeta.searchSourceJSON
      );
      expect(searchSource.indexRefName).toBe('kibanaSavedObjectMeta.searchSourceJSON.index');
      expect(searchSource.index).toBeUndefined();
      expect(searchSource.query).toEqual({ language: 'kuery', query: '' });
      expect(searchSource.filter).toEqual([]);
    });

    it('converts index-pattern tab with runtime fields to stored state', () => {
      const apiState: DiscoverSessionEmbeddableByValueState = {
        title: 'Adhoc',
        time_range: { from: 'now-1h', to: 'now' },
        tabs: [
          {
            column_order: ['foo'],
            sort: [],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            density: DataGridDensity.COMPACT,
            header_row_height: 50,
            row_height: 30,
            query: { language: 'kql', expression: '' },
            filters: [],
            rows_per_page: 25,
            sample_size: 500,
            data_source: {
              type: AS_CODE_DATA_VIEW_SPEC_TYPE,
              index_pattern: 'my-*',
              time_field: '@timestamp',
              field_settings: {
                rt: {
                  type: 'keyword',
                  script: 'emit("x")',
                  format: { type: 'string' },
                },
              },
            },
          },
        ],
      };
      const result = toStoredSearchEmbeddableByValue(apiState);
      const searchSource = JSON.parse(
        result.state.attributes.tabs[0].attributes.kibanaSavedObjectMeta.searchSourceJSON
      );
      expect(searchSource.index).toEqual({
        title: 'my-*',
        timeFieldName: '@timestamp',
        fieldFormats: {
          rt: { id: 'string' },
        },
        runtimeFieldMap: {
          rt: {
            type: 'keyword',
            script: { source: 'emit("x")' },
          },
        },
      });
    });
  });

  describe('transform then reversion (1:1 validation)', () => {
    it('by-value: SavedSearch → API → SavedSearch yields semantically identical state', () => {
      const storedState: StoredSearchEmbeddableByValueState = {
        title: 'My Discover Session',
        description: 'Session description',
        attributes: {
          title: '',
          description: '',
          sort: [['@timestamp', 'desc']],
          columns: ['message', '@timestamp'],
          grid: { columns: { '@timestamp': { width: 200 } } },
          hideChart: false,
          hideTable: false,
          viewMode: VIEW_MODE.DOCUMENT_LEVEL,
          isTextBasedQuery: false,
          timeRestore: false,
          kibanaSavedObjectMeta: {
            searchSourceJSON:
              '{"query":{"language":"kuery","query":""},"filter":[],"indexRefName":"kibanaSavedObjectMeta.searchSourceJSON.index"}',
          },
          tabs: [
            {
              id: 'tab-1',
              label: 'Tab 1',
              attributes: {
                sort: [['@timestamp', 'desc']],
                columns: ['message', '@timestamp'],
                grid: { columns: { '@timestamp': { width: 200 } } },
                hideChart: false,
                hideTable: false,
                viewMode: VIEW_MODE.DOCUMENT_LEVEL,
                isTextBasedQuery: false,
                timeRestore: false,
                rowHeight: -1,
                headerRowHeight: -1,
                kibanaSavedObjectMeta: {
                  searchSourceJSON:
                    '{"query":{"language":"kuery","query":""},"filter":[],"indexRefName":"kibanaSavedObjectMeta.searchSourceJSON.index"}',
                },
              },
            },
          ],
        },
      };
      const references: SavedObjectReference[] = [
        {
          name: 'kibanaSavedObjectMeta.searchSourceJSON.index',
          type: 'index-pattern',
          id: 'data-view-123',
        },
      ];

      const apiState = fromStoredSearchEmbeddableByValue(storedState, references);
      const { state: reverted, references: revertedRefs } = toStoredSearchEmbeddableByValue(
        apiState,
        []
      );

      expect(reverted.attributes.title).toBe(storedState.title);
      expect(reverted.attributes.description).toBe(storedState.description);
      expect(reverted.attributes.tabs).toHaveLength(storedState.attributes.tabs!.length);
      expect(reverted.attributes.tabs[0].id).toBe(DISCOVER_SESSION_EMBEDDABLE_SYNTHETIC_TAB_ID);
      expect(reverted.attributes.tabs[0].label).toBe(
        DISCOVER_SESSION_EMBEDDABLE_SYNTHETIC_TAB_LABEL
      );

      const initialTabAttrs = storedState.attributes.tabs![0].attributes;
      const revertedTabAttrs = reverted.attributes.tabs[0].attributes;
      expect(revertedTabAttrs.sort).toEqual(initialTabAttrs.sort);
      expect(revertedTabAttrs.columns).toEqual(initialTabAttrs.columns);
      expect(revertedTabAttrs.grid).toEqual(initialTabAttrs.grid);
      expect(revertedTabAttrs.hideChart).toBe(initialTabAttrs.hideChart);
      expect(revertedTabAttrs.viewMode).toBe(initialTabAttrs.viewMode);
      expect(revertedTabAttrs.isTextBasedQuery).toBe(initialTabAttrs.isTextBasedQuery);
      // timeRestore/timeRange are intentionally dropped at the simplified API level
      expect(revertedTabAttrs.rowHeight).toBe(initialTabAttrs.rowHeight);
      expect(revertedTabAttrs.headerRowHeight).toBe(initialTabAttrs.headerRowHeight);
      expect(JSON.parse(revertedTabAttrs.kibanaSavedObjectMeta.searchSourceJSON)).toEqual(
        JSON.parse(initialTabAttrs.kibanaSavedObjectMeta.searchSourceJSON)
      );

      expect(revertedRefs).toEqual(references);
    });

    it('by-reference: SavedSearch → API → SavedSearch yields semantically identical state', () => {
      const storedState: StoredSearchEmbeddableByReferenceState = {
        title: 'By-Ref Session',
        description: 'Ref description',
        time_range: { from: 'now-15m', to: 'now' },
        selectedTabId: 'tab-2',
        sort: [['_score', 'desc']],
        columns: ['message'],
      };
      const references: SavedObjectReference[] = [
        { name: SAVED_SEARCH_SAVED_OBJECT_REF_NAME, type: SavedSearchType, id: 'session-ref-1' },
      ];

      const apiState = fromStoredSearchEmbeddableByRef(storedState, references);
      const { state: reverted, references: revertedRefs } = toStoredSearchEmbeddableByRef(
        apiState,
        []
      );

      expect(reverted.title).toBe(storedState.title);
      expect(reverted.description).toBe(storedState.description);
      expect(reverted.time_range).toEqual(storedState.time_range);
      expect(reverted.selectedTabId).toBe(storedState.selectedTabId);
      expect(reverted.sort).toEqual(storedState.sort);
      expect(reverted.columns).toEqual(storedState.columns);
      expect(revertedRefs).toEqual(references);
    });
  });

  describe('fromStoredGrid', () => {
    it('maps saved grid.columns to column_settings', () => {
      expect(
        fromStoredGrid({
          columns: {
            message: { width: 100 },
            '@timestamp': { width: 200 },
          },
        })
      ).toEqual({
        message: { width: 100 },
        '@timestamp': { width: 200 },
      });
    });

    it('returns empty object when grid has no column entries', () => {
      expect(fromStoredGrid({ columns: {} })).toEqual({});
      expect(fromStoredGrid({})).toEqual({});
    });
  });

  describe('toStoredGrid', () => {
    it('builds saved grid from non-empty column_settings', () => {
      expect(
        toStoredGrid({
          message: { width: 100 },
          '@timestamp': { width: 200 },
        })
      ).toEqual({
        columns: {
          message: { width: 100 },
          '@timestamp': { width: 200 },
        },
      });
    });

    it('returns empty object when column_settings is empty', () => {
      expect(toStoredGrid({})).toEqual({});
    });

    it('returns empty object when column_settings is undefined (default)', () => {
      expect(toStoredGrid()).toEqual({});
    });
  });

  describe('fromStoredPanelOverrides', () => {
    it('converts stored state with all fields to panel overrides', () => {
      const storedState: StoredSearchEmbeddableState = {
        sort: [['@timestamp', 'desc']],
        columns: ['message', '@timestamp'],
        rowHeight: -1,
        sampleSize: 500,
        rowsPerPage: 100,
        headerRowHeight: 3,
        density: DataGridDensity.COMPACT,
        jsonModeSettings: { hideNulls: true, wrapLines: false, defaultRenderedNodes: 2 },
        documentsDisplayMode: 'json',
        grid: {
          columns: {
            message: { width: 100 },
            '@timestamp': { width: 200 },
          },
        },
      };
      const result = toDiscoverSessionPanelOverrides(storedState);
      expect(result).toEqual({
        sort: [{ name: '@timestamp', direction: 'desc' }],
        column_order: ['message', '@timestamp'],
        column_settings: {
          message: { width: 100 },
          '@timestamp': { width: 200 },
        },
        row_height: 'auto',
        sample_size: 500,
        rows_per_page: 100,
        header_row_height: 3,
        density: DataGridDensity.COMPACT,
        json_mode_settings: { hide_nulls: true, wrap_lines: false, default_rendered_nodes: 2 },
        documents_display_mode: 'json',
      });
    });

    it('omits undefined/falsy stored fields from result', () => {
      const storedState: StoredSearchEmbeddableState = {
        sort: [['@timestamp', 'desc']],
        columns: ['message'],
        grid: { columns: {} },
      };
      const result = toDiscoverSessionPanelOverrides(storedState);
      expect(result).toEqual({
        sort: [{ name: '@timestamp', direction: 'desc' }],
        column_order: ['message'],
      });
      expect(result.row_height).toBeUndefined();
      expect(result.sample_size).toBeUndefined();
      expect(result.rows_per_page).toBeUndefined();
      expect(result.header_row_height).toBeUndefined();
      expect(result.density).toBeUndefined();
      expect(result.documents_display_mode).toBeUndefined();
      expect(result.json_mode_settings).toBeUndefined();
    });

    it('converts numeric row heights to API form', () => {
      const storedState = {
        rowHeight: 5,
        headerRowHeight: 2,
      };
      const result = toDiscoverSessionPanelOverrides(storedState);
      expect(result.row_height).toBe(5);
      expect(result.header_row_height).toBe(2);
    });

    it('converts -1 height to "auto"', () => {
      const storedState = {
        rowHeight: -1,
        headerRowHeight: -1,
      };
      const result = toDiscoverSessionPanelOverrides(storedState);
      expect(result.row_height).toBe('auto');
      expect(result.header_row_height).toBe('auto');
    });
  });

  describe('toStoredPanelOverrides', () => {
    it('converts panel overrides with all fields to stored state', () => {
      const apiState = {
        sort: [{ name: '@timestamp', direction: 'desc' as const }],
        column_order: ['message', '@timestamp'],
        column_settings: { '@timestamp': { width: 200 } },
        row_height: 'auto' as const,
        sample_size: 500,
        rows_per_page: 100 as const,
        header_row_height: 3,
        density: DataGridDensity.COMPACT,
        json_mode_settings: { hide_nulls: true, wrap_lines: false, default_rendered_nodes: 2 },
      };
      const result = fromDiscoverSessionPanelOverrides(apiState);
      expect(result).toEqual({
        sort: [['@timestamp', 'desc']],
        columns: ['message', '@timestamp'],
        rowHeight: -1,
        sampleSize: 500,
        rowsPerPage: 100,
        headerRowHeight: 3,
        density: DataGridDensity.COMPACT,
        jsonModeSettings: { hideNulls: true, wrapLines: false, defaultRenderedNodes: 2 },
        grid: {
          columns: {
            '@timestamp': { width: 200 },
          },
        },
      });
    });

    it('omits undefined/falsy API fields from result', () => {
      const apiState = {
        sort: [{ name: '@timestamp', direction: 'desc' as const }],
        column_order: ['message'],
      };
      const result = fromDiscoverSessionPanelOverrides(apiState);
      expect(result).toEqual({
        sort: [['@timestamp', 'desc']],
        columns: ['message'],
      });
      expect(result.rowHeight).toBeUndefined();
      expect(result.sampleSize).toBeUndefined();
      expect(result.rowsPerPage).toBeUndefined();
      expect(result.headerRowHeight).toBeUndefined();
      expect(result.density).toBeUndefined();
    });

    it('converts "auto" height to -1 in stored form', () => {
      const apiState = {
        row_height: 'auto' as const,
        header_row_height: 'auto' as const,
      };
      const result = fromDiscoverSessionPanelOverrides(apiState);
      expect(result.rowHeight).toBe(-1);
      expect(result.headerRowHeight).toBe(-1);
    });

    it('preserves numeric heights in stored form', () => {
      const apiState = {
        row_height: 5,
        header_row_height: 2,
      };
      const result = fromDiscoverSessionPanelOverrides(apiState);
      expect(result.rowHeight).toBe(5);
      expect(result.headerRowHeight).toBe(2);
    });

    it('round-trips with fromStoredPanelOverrides', () => {
      const storedState: StoredSearchEmbeddableState = {
        sort: [
          ['@timestamp', 'desc'],
          ['message', 'asc'],
        ],
        columns: ['message', '@timestamp'],
        rowHeight: -1,
        sampleSize: 1000,
        rowsPerPage: 50,
        headerRowHeight: 3,
        density: DataGridDensity.NORMAL,
        grid: {
          columns: {
            '@timestamp': { width: 150 },
          },
        },
      };
      const overrides = toDiscoverSessionPanelOverrides(storedState);
      const back = fromDiscoverSessionPanelOverrides(overrides);
      expect(back.sort).toEqual(storedState.sort);
      expect(back.columns).toEqual(storedState.columns);
      expect(back.rowHeight).toBe(storedState.rowHeight);
      expect(back.sampleSize).toBe(storedState.sampleSize);
      expect(back.rowsPerPage).toBe(storedState.rowsPerPage);
      expect(back.headerRowHeight).toBe(storedState.headerRowHeight);
      expect(back.density).toBe(storedState.density);
      expect(back.grid).toEqual(storedState.grid);
    });
  });

  describe('fromStoredSort', () => {
    it('converts array of [field, direction] to sort objects', () => {
      const sort = [
        ['@timestamp', 'desc'],
        ['message', 'asc'],
      ];
      const result = fromStoredSort(sort);
      expect(result).toEqual([
        { name: '@timestamp', direction: 'desc' },
        { name: 'message', direction: 'asc' },
      ]);
    });

    it('defaults direction to desc when not asc or desc', () => {
      const sort = [['field', 'other' as 'desc']];
      const result = fromStoredSort(sort);
      expect(result).toEqual([{ name: 'field', direction: 'desc' }]);
    });

    it('converts legacy flat sort [field, direction] to a single sort entry', () => {
      const result = fromStoredSort(['@timestamp', 'desc']);
      expect(result).toEqual([{ name: '@timestamp', direction: 'desc' }]);
    });
  });

  describe('toStoredSort', () => {
    it('converts sort objects to array of [name, direction]', () => {
      const sort = [
        { name: '@timestamp', direction: 'desc' as const },
        { name: 'message', direction: 'asc' as const },
      ];
      const result = toStoredSort(sort);
      expect(result).toEqual([
        ['@timestamp', 'desc'],
        ['message', 'asc'],
      ]);
    });

    it('returns empty array when sort is undefined (default)', () => {
      expect(toStoredSort()).toEqual([]);
    });

    it('returns empty array when sort is empty', () => {
      expect(toStoredSort([])).toEqual([]);
    });
  });

  describe('fromStoredRowHeight', () => {
    it('returns numeric height as-is', () => {
      expect(fromStoredRowHeight(3)).toBe(3);
      expect(fromStoredRowHeight(5)).toBe(5);
    });

    it('returns "auto" when height is -1', () => {
      expect(fromStoredRowHeight(-1)).toBe('auto');
    });
  });

  describe('toStoredHeight', () => {
    it('returns numeric height as-is', () => {
      expect(toStoredHeight(3)).toBe(3);
      expect(toStoredHeight(5)).toBe(5);
    });

    it('returns -1 when height is "auto"', () => {
      expect(toStoredHeight('auto')).toBe(-1);
    });
  });

  describe('fromStoredTab', () => {
    it('converts stored tab with dataView id to API tab', () => {
      const storedTab = {
        sort: [['@timestamp', 'desc']],
        columns: ['message', '@timestamp'],
        grid: { columns: { '@timestamp': { width: 200 } } },
        rowHeight: -1,
        headerRowHeight: -1,
        sampleSize: 500,
        rowsPerPage: 100,
        density: DataGridDensity.COMPACT,
        viewMode: VIEW_MODE.DOCUMENT_LEVEL,
        hideChart: false,
        isTextBasedQuery: false,
        kibanaSavedObjectMeta: {
          searchSourceJSON: JSON.stringify({
            query: { language: 'kuery', query: '' },
            index: 'data-view-1',
            filter: [
              {
                meta: { index: 'data-view-1', alias: null, negate: false, disabled: false },
                query: { match_phrase: { 'log.level': 'error' } },
              },
            ],
          }),
        },
      };
      const references: SavedObjectReference[] = [
        {
          name: 'kibanaSavedObjectMeta.searchSourceJSON.index',
          type: 'index-pattern',
          id: 'data-view-1',
        },
      ];
      const result = fromStoredTab(
        storedTab as unknown as Parameters<typeof fromStoredTab>[0],
        references
      );
      expect(result.sort).toEqual([{ name: '@timestamp', direction: 'desc' }]);
      expect(result.column_order).toEqual(['message', '@timestamp']);
      expect(result.column_settings).toEqual({ '@timestamp': { width: 200 } });
      expect(result.row_height).toBe('auto');
      expect(result.header_row_height).toBe('auto');
      expect(result.density).toBe(DataGridDensity.COMPACT);
      expect('data_source' in result && result.data_source).toEqual({
        type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
        ref_id: 'data-view-1',
      });
      expect('view_mode' in result && result.view_mode).toBe(VIEW_MODE.DOCUMENT_LEVEL);
      expect('filters' in result && result.filters).toHaveLength(1);
      expect('query' in result && result.query).toEqual({ language: 'kql', expression: '' });
    });

    it('converts stored ES|QL tab to API tab with data_source.type esql', () => {
      const esql = 'FROM logs-* | LIMIT 100';
      const storedTab = {
        sort: [],
        columns: ['@timestamp'],
        grid: {},
        rowHeight: 3,
        headerRowHeight: 3,
        density: DataGridDensity.COMPACT,
        hideChart: false,
        hideTable: false,
        isTextBasedQuery: true,
        kibanaSavedObjectMeta: {
          searchSourceJSON: JSON.stringify({
            query: { esql },
          }),
        },
      };
      const result = fromStoredTab(storedTab, []);
      expect(result.data_source).toEqual({
        type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
        query: esql,
      });
      expect('query' in result).toBe(false);
    });
  });

  describe('toStoredTab', () => {
    it('converts API classic tab to stored tab with references', () => {
      const apiTab: DiscoverSessionEmbeddableByValueState['tabs'][0] = {
        column_order: ['message', '@timestamp'],
        column_settings: { '@timestamp': { width: 200 } },
        sort: [{ name: '@timestamp', direction: 'desc' }],
        view_mode: VIEW_MODE.DOCUMENT_LEVEL,
        density: DataGridDensity.COMPACT,
        header_row_height: 'auto',
        row_height: 'auto',
        filters: [
          {
            type: ASCODE_FILTER_TYPE.CONDITION,
            condition: {
              field: 'log.level',
              operator: ASCODE_FILTER_OPERATOR.IS,
              value: 'error',
            },
            disabled: false,
            negate: false,
          },
        ],
        query: { language: 'kql', expression: '' },
        rows_per_page: 100,
        sample_size: 500,
        data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'data-view-1' },
      };
      const { state, references } = toStoredTab(apiTab);
      expect(references).toContainEqual({
        name: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        type: 'index-pattern',
        id: 'data-view-1',
      });
      expect(state.sort).toEqual([['@timestamp', 'desc']]);
      expect(state.columns).toEqual(['message', '@timestamp']);
      expect(state.rowHeight).toBe(-1);
      expect(state.headerRowHeight).toBe(-1);
      expect(state.density).toBe(DataGridDensity.COMPACT);
      expect(state.hideChart).toBe(false);
      expect(state.isTextBasedQuery).toBe(false);
      const searchSource = JSON.parse(state.kibanaSavedObjectMeta.searchSourceJSON);
      expect(searchSource.indexRefName).toBe('kibanaSavedObjectMeta.searchSourceJSON.index');
      expect(searchSource.index).toBeUndefined();
      expect(searchSource.query).toEqual({ language: 'kuery', query: '' });
      expect(searchSource.filter).toHaveLength(1);
    });

    it('round-trips all fields through toStoredTab → fromStoredTab', () => {
      const references: SavedObjectReference[] = [
        { name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: 'dv-1' },
      ];
      const apiTab: DiscoverSessionEmbeddableByValueState['tabs'][0] = {
        column_order: [],
        sort: [],
        view_mode: VIEW_MODE.DOCUMENT_LEVEL,
        density: DataGridDensity.COMPACT,
        header_row_height: 3,
        row_height: 3,
        query: { language: 'kql', expression: '' },
        filters: [
          {
            type: ASCODE_FILTER_TYPE.CONDITION,
            condition: { field: 'log.level', operator: ASCODE_FILTER_OPERATOR.IS, value: 'error' },
            disabled: false,
            negate: false,
          },
        ],
        data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'dv-1' },
      };

      const { state } = toStoredTab(apiTab);
      const result = fromStoredTab(state, references);

      expect('data_source' in result && result.data_source).toEqual({
        type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
        ref_id: 'dv-1',
      });
      expect('view_mode' in result && result.view_mode).toBe(VIEW_MODE.DOCUMENT_LEVEL);
      expect('query' in result && result.query).toEqual({ language: 'kql', expression: '' });
      expect('filters' in result && result.filters).toHaveLength(1);
    });

    it('converts API tab with index-pattern data_source (no refs) when inline', () => {
      const apiTab: DiscoverSessionEmbeddableByValueState['tabs'][0] = {
        column_order: ['foo'],
        sort: [],
        view_mode: VIEW_MODE.DOCUMENT_LEVEL,
        density: DataGridDensity.COMPACT,
        header_row_height: 3,
        row_height: 3,
        query: { language: 'kql', expression: '' },
        filters: [],
        data_source: {
          type: AS_CODE_DATA_VIEW_SPEC_TYPE,
          index_pattern: 'my-*',
          time_field: '@timestamp',
        },
      };
      const { state, references } = toStoredTab(apiTab);
      expect(references).toEqual([]);
      const searchSource = JSON.parse(state.kibanaSavedObjectMeta.searchSourceJSON);
      expect(searchSource.index).toEqual({
        title: 'my-*',
        timeFieldName: '@timestamp',
      });
    });

    it('converts API ES|QL tab to stored tab without index', () => {
      const esql = 'FROM logs-* | LIMIT 50';
      const apiTab: DiscoverSessionEmbeddableByValueState['tabs'][0] = {
        column_order: ['@timestamp'],
        sort: [],
        density: DataGridDensity.COMPACT,
        header_row_height: 3,
        row_height: 3,
        data_source: { type: AS_CODE_ESQL_DATA_SOURCE_TYPE, query: esql },
      };
      const { state, references } = toStoredTab(apiTab);
      expect(references).toEqual([]);
      expect(state.isTextBasedQuery).toBe(true);
      const searchSource = JSON.parse(state.kibanaSavedObjectMeta.searchSourceJSON);
      expect(searchSource.query).toEqual({ esql });
      expect(searchSource.index).toBeUndefined();
      expect(searchSource.filter).toBeUndefined();
    });
  });
});
