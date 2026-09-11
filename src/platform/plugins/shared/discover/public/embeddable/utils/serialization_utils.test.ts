/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_DATA_VIEW_REFERENCE_TYPE } from '@kbn/as-code-data-views-schema';
import { createSearchSourceMock } from '@kbn/data-plugin/public/mocks';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { discoverServiceMock } from '../../__mocks__/services';
import { getPersistedTabMock } from '../../application/main/state_management/redux/__mocks__/internal_state.mocks';
import { deserializeState, serializeState } from './serialization_utils';
import type {
  DiscoverSessionEmbeddableByReferenceState,
  DiscoverSessionEmbeddableByValueState,
} from '../../../server';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import type { DiscoverSessionTab } from '@kbn/saved-search-plugin/common';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import { DataGridDensity } from '@kbn/discover-session-constants';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import type {
  SearchEmbeddableByReferenceState,
  SearchEmbeddableByValueState,
} from '../../../common/embeddable/types';

describe('Serialization utils', () => {
  const uuid = 'mySearchEmbeddable';

  const dataViewId = dataViewMock.id ?? 'test-id';

  const mockedSavedSearchAttributes: SearchEmbeddableByValueState['attributes'] = {
    kibanaSavedObjectMeta: {
      searchSourceJSON: '{"indexRefName":"kibanaSavedObjectMeta.searchSourceJSON.index"}',
    },
    title: 'test1',
    description: 'description',
    sort: [['order_date', 'desc']],
    columns: ['_source'],
    grid: {},
    hideChart: false,
    hideTable: false,
    sampleSize: 100,
    isTextBasedQuery: false,
    tabs: [
      {
        id: 'tab-1',
        label: 'Tab 1',
        attributes: {
          kibanaSavedObjectMeta: {
            searchSourceJSON: '{"indexRefName":"kibanaSavedObjectMeta.searchSourceJSON.index"}',
          },
          sort: [['order_date', 'desc']],
          columns: ['_source'],
          grid: {},
          hideChart: false,
          hideTable: false,
          sampleSize: 100,
          isTextBasedQuery: false,
        },
      },
    ],
  };

  /** Minimal API shape for by-value (DiscoverSessionEmbeddableByValueState) */
  const apiStateByValue: DiscoverSessionEmbeddableByValueState = {
    title: 'test panel title',
    description: 'description',
    tabs: [
      {
        column_order: ['_source'],
        sort: [{ name: 'order_date', direction: 'desc' }],
        view_mode: VIEW_MODE.DOCUMENT_LEVEL,
        density: DataGridDensity.COMPACT,
        header_row_height: 'auto',
        row_height: 'auto',
        query: { language: 'kql', expression: '' },
        filters: [],
        rows_per_page: 100,
        sample_size: 100,
        data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: dataViewId },
      },
    ],
  };

  const mockTab = (
    tabId: string,
    label: string,
    appStateOverrides: Record<string, unknown> = {}
  ): DiscoverSessionTab => ({
    ...getPersistedTabMock({
      tabId,
      dataView: dataViewMock,
      appStateOverrides: {
        columns: ['_source'],
        sort: [['order_date', 'desc']],
        sampleSize: 100,
        ...appStateOverrides,
      },
      services: discoverServiceMock,
    }),
    label,
  });

  const mockDiscoverSession = (sessionTabs: DiscoverSessionTab[]) =>
    createDiscoverSessionMock({
      id: 'savedSearch',
      title: 'test1',
      description: 'description',
      tabs: sessionTabs,
    });

  describe('deserialize state', () => {
    test('by value', async () => {
      const deserializedState = await deserializeState({
        serializedState: apiStateByValue,
        discoverServices: discoverServiceMock,
      });

      expect(discoverServiceMock.savedSearch.byValueToSavedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            title: 'test panel title',
            description: 'description',
            columns: ['_source'],
            sort: [['order_date', 'desc']],
            kibanaSavedObjectMeta: expect.objectContaining({
              searchSourceJSON: expect.any(String),
            }),
          }),
        }),
        true
      );
      const byValueCall = discoverServiceMock.savedSearch.byValueToSavedSearch as jest.Mock;
      const [firstArg] = byValueCall.mock.calls[0];
      expect(firstArg.attributes.references).toBeDefined();
      expect(Array.isArray(firstArg.attributes.references)).toBe(true);

      expect(Object.keys(deserializedState)).toContain('serializedSearchSource');
      expect(deserializedState.title).toEqual('test panel title');
    });

    test('by reference - default tab (no selectedTabId)', async () => {
      const sessionTabs = [
        mockTab('tab-1', 'Tab 1'),
        mockTab('tab-2', 'Tab 2', {
          columns: ['col-a', 'col-b'],
          sort: [['timestamp', 'asc']],
        }),
      ];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const apiStateByRef: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        description: 'My description',
        ref_id: 'savedSearch',
        selected_tab_id: undefined,
        overrides: {},
      };

      const deserializedState = await deserializeState({
        serializedState: apiStateByRef,
        discoverServices: discoverServiceMock,
      });

      expect(Object.keys(deserializedState)).toContain('serializedSearchSource');
      expect(Object.keys(deserializedState)).toContain('savedObjectId');
      expect(deserializedState.savedObjectId).toBe('savedSearch');
      expect(deserializedState.title).toEqual('test panel title');
    });

    test('by reference with panel overwrites', async () => {
      const sessionTabs = [mockTab('tab-1', 'Tab 1')];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const apiStateByRef: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        description: 'My description',
        ref_id: 'savedSearch',
        selected_tab_id: undefined,
        overrides: { sort: [{ name: 'order_date', direction: 'asc' }] },
      };

      const deserializedState = await deserializeState({
        serializedState: apiStateByRef,
        discoverServices: discoverServiceMock,
      });

      expect(deserializedState.title).toEqual('test panel title');
      // For a valid/default tab, dashboard overrides win on top of resolved tab attributes
      expect(deserializedState.sort).toEqual([['order_date', 'asc']]);
      expect(deserializedState.columns).toEqual(['_source']); // from tab-1
      expect(deserializedState.selectedTabId).toEqual('tab-1');
      expect(deserializedState.tabs).toEqual(sessionTabs);
    });

    test('by reference - valid selectedTabId', async () => {
      const sessionTabs = [
        mockTab('tab-1', 'Tab 1'),
        mockTab('tab-2', 'Tab 2', {
          columns: ['col-a', 'col-b'],
          sort: [['timestamp', 'asc']],
          sampleSize: 200,
        }),
      ];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const serializedState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        ref_id: 'savedSearch',
        selected_tab_id: 'tab-2',
        overrides: {},
      };

      const deserializedState = await deserializeState({
        serializedState,
        discoverServices: discoverServiceMock,
      });
      expect(deserializedState.savedObjectId).toEqual('savedSearch');
      expect(deserializedState.selectedTabId).toEqual('tab-2');
      // Attributes should come from tab-2
      expect(deserializedState.columns).toEqual(['col-a', 'col-b']);
      expect(deserializedState.sort).toEqual([['timestamp', 'asc']]);
      expect(deserializedState.sampleSize).toEqual(200);
    });

    test('by reference - deleted selectedTabId discards stale dashboard overrides', async () => {
      const sessionTabs = [
        mockTab('tab-1', 'Tab 1', {
          columns: ['fallback-col'],
          sort: [['fallback_field', 'desc']],
        }),
      ];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const serializedState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        ref_id: 'savedSearch',
        selected_tab_id: 'deleted-tab-id',
        overrides: {
          column_order: ['stale-col-a'],
          sort: [{ name: 'stale_field', direction: 'asc' }],
        },
      };

      const deserializedState = await deserializeState({
        serializedState,
        discoverServices: discoverServiceMock,
      });
      expect(deserializedState.selectedTabId).toEqual('deleted-tab-id');
      // Stale overrides from the deleted tab should not carry over
      expect(deserializedState.columns).toBeUndefined();
      expect(deserializedState.sort).toBeUndefined();
    });

    test('by reference - valid selectedTabId with dashboard overrides', async () => {
      const sessionTabs = [
        mockTab('tab-1', 'Tab 1'),
        mockTab('tab-2', 'Tab 2', {
          columns: ['col-a', 'col-b'],
          sort: [['timestamp', 'asc']],
        }),
      ];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const serializedState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        ref_id: 'savedSearch',
        selected_tab_id: 'tab-2',
        overrides: { column_order: ['custom-col'] },
      };

      const deserializedState = await deserializeState({
        serializedState,
        discoverServices: discoverServiceMock,
      });
      // For a valid tab, dashboard overrides should win on top of tab-2 attributes
      expect(deserializedState.columns).toEqual(['custom-col']);
      expect(deserializedState.sort).toEqual([['timestamp', 'asc']]);
    });

    test('by reference - partial jsonModeSettings override deep-merges with the source', async () => {
      const sessionTabs = [
        mockTab('tab-1', 'Tab 1', { jsonModeSettings: { hideNulls: true, wrapLines: true } }),
      ];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const serializedState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        ref_id: 'savedSearch',
        selected_tab_id: undefined,
        overrides: { json_mode_settings: { wrap_lines: false } },
      };

      const deserializedState = await deserializeState({
        serializedState,
        discoverServices: discoverServiceMock,
      });

      // jsonModeSettings partial-merges: wrap_lines is overridden while hide_nulls is preserved
      // from the source (a shallow replace dropped it).
      expect(deserializedState.jsonModeSettings).toEqual({ hideNulls: true, wrapLines: false });
    });

    test('by reference - grid override replaces wholesale so removed columns are not resurrected', async () => {
      const sessionTabs = [
        mockTab('tab-1', 'Tab 1', {
          grid: { columns: { A: { width: 100 }, B: { width: 200 } } },
        }),
      ];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const serializedState: DiscoverSessionEmbeddableByReferenceState = {
        title: 'test panel title',
        ref_id: 'savedSearch',
        selected_tab_id: undefined,
        // Column B's width was reset, so the stored override only carries A.
        overrides: { column_settings: { A: { width: 100 } } },
      };

      const deserializedState = await deserializeState({
        serializedState,
        discoverServices: discoverServiceMock,
      });

      // Unlike jsonModeSettings, grid must replace wholesale: B stays dropped, not merged back in.
      expect(deserializedState.grid).toEqual({ columns: { A: { width: 100 } } });
    });
  });

  describe('serialize state', () => {
    test('by value', () => {
      const sort: SortOrder[] = [['order_date', 'desc']];
      const searchSource = createSearchSourceMock({
        index: dataViewMock,
      });
      const savedSearch = {
        title: 'test1',
        description: 'description',
        columns: ['_source'],
        sort,
        grid: {},
        hideChart: false,
        sampleSize: 100,
        isTextBasedQuery: false,
        managed: false,
        searchSource,
      };

      const serializedState = serializeState({
        uuid,
        initialState: {
          ...mockedSavedSearchAttributes,
          tabs: [],
          serializedSearchSource: {},
        },
        savedSearch,
        serializeTitles: jest.fn().mockReturnValue({ title: 'test1', description: 'description' }),
        serializeTimeRange: jest.fn(),
        serializeDynamicActions: jest.fn(),
      });

      expect(serializedState).toMatchObject({
        title: 'test1',
        description: 'description',
        tabs: [
          expect.objectContaining({
            column_order: ['_source'],
            sort: [{ name: 'order_date', direction: 'desc' }],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: dataViewId },
          }),
        ],
      });
      expect(serializedState).not.toHaveProperty('attributes');
    });

    describe('by reference', () => {
      const sort: SortOrder[] = [['order_date', 'desc']];
      const searchSource = createSearchSourceMock({
        index: dataViewMock,
      });
      const savedSearch = {
        title: 'test1',
        description: 'description',
        columns: ['_source'],
        sort,
        grid: {},
        hideChart: false,
        sampleSize: 100,
        isTextBasedQuery: false,
        managed: false,
        searchSource,
      };

      test('equal state', () => {
        const serializedState = serializeState({
          uuid,
          initialState: {
            tabs: [mockTab('tab-1', 'Tab 1')],
          },
          savedSearch: savedSearch as Parameters<typeof serializeState>[0]['savedSearch'],
          serializeTitles: jest.fn(),
          serializeTimeRange: jest.fn(),
          serializeDynamicActions: jest.fn(),
          savedObjectId: 'test-id',
        });

        expect(serializedState).toMatchObject({
          ref_id: 'test-id',
        });
        expect(serializedState).not.toHaveProperty('savedObjectId');
      });

      test('overwrite state', () => {
        const sortOverride: SortOrder[] = [['order_date', 'asc']];
        const serializedState = serializeState({
          uuid,
          initialState: {
            tabs: [mockTab('tab-1', 'Tab 1')],
          },
          savedSearch: {
            ...savedSearch,
            grid: { columns: { _source: { width: 250 } } },
            sampleSize: 500,
            sort: sortOverride,
          } as Parameters<typeof serializeState>[0]['savedSearch'],
          serializeTitles: jest.fn(),
          serializeTimeRange: jest.fn(),
          serializeDynamicActions: jest.fn(),
          savedObjectId: 'test-id',
          selectedTabId: 'tab-1',
        });

        // By-reference API shape includes ref_id; panel overrides (sampleSize, sort)
        // are stored in the dashboard document but not part of the simplified by-ref schema
        expect(serializedState).toMatchObject({
          ref_id: 'test-id',
          overrides: {
            column_settings: { _source: { width: 250 } },
            sample_size: 500,
            sort: [{ name: 'order_date', direction: 'asc' }],
          },
        });
      });

      test('includes selectedTabId when provided', () => {
        const serializedState = serializeState({
          uuid,
          initialState: {
            tabs: [mockTab('tab-1', 'Tab 1'), mockTab('tab-2', 'Tab 2')],
          },
          savedSearch: savedSearch as Parameters<typeof serializeState>[0]['savedSearch'],
          serializeTitles: jest.fn(),
          serializeTimeRange: jest.fn(),
          serializeDynamicActions: jest.fn(),
          savedObjectId: 'test-id',
          selectedTabId: 'tab-2',
        });

        expect(serializedState).toMatchObject({
          ref_id: 'test-id',
          selected_tab_id: 'tab-2',
        });
      });

      test('does not include selectedTabId when undefined', () => {
        const serializedState = serializeState({
          uuid,
          initialState: {
            tabs: [mockTab('tab-1', 'Tab 1')],
          },
          savedSearch: savedSearch as Parameters<typeof serializeState>[0]['savedSearch'],
          serializeTitles: jest.fn(),
          serializeTimeRange: jest.fn(),
          serializeDynamicActions: jest.fn(),
          savedObjectId: 'test-id',
          selectedTabId: undefined,
        });

        expect(serializedState).toMatchObject({
          ref_id: 'test-id',
        });
      });
    });
  });

  describe('legacy panel state (BWC)', () => {
    test('deserialize by-ref uses savedObjectId', async () => {
      const sessionTabs = [mockTab('tab-1', 'Tab 1')];
      discoverServiceMock.savedSearch.getDiscoverSession = jest
        .fn()
        .mockResolvedValue(mockDiscoverSession(sessionTabs));

      const legacyByRef: SearchEmbeddableByReferenceState = {
        title: 'Panel title',
        savedObjectId: 'legacy-session-id',
      };

      const deserialized = await deserializeState({
        serializedState: legacyByRef,
        discoverServices: discoverServiceMock,
      });

      expect(deserialized.savedObjectId).toBe('legacy-session-id');
      expect(discoverServiceMock.savedSearch.getDiscoverSession).toHaveBeenCalledWith(
        'legacy-session-id'
      );
    });
  });
});
