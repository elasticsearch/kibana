/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import { ESQL_CONTROL } from '@kbn/controls-constants';
import { METRICS_GRID_SETTINGS_DEFAULTS } from '@kbn/discover-utils';
import { DiscoverTabType } from '@kbn/discover-session-constants';
import type { DiscoverSessionTab } from '@kbn/saved-search-plugin/common';
import { savedSearchMock } from '../../../../__mocks__/saved_search';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { mockControlState } from '../../../../__mocks__/esql_controls';
import { getTabStateMock, getPersistedTabMock } from './__mocks__/internal_state.mocks';
import {
  fromSavedObjectTabToAppState,
  fromSavedObjectTabToSearchSource,
  fromSavedObjectTabToTabState,
  fromSavedObjectTabToSavedSearch,
  fromTabStateToSavedObjectTab,
  fromSavedSearchToSavedObjectTab,
} from './tab_mapping_utils';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import {
  createProfileStateRegistry,
  METRICS_STATE_DEF,
} from '../../../../../common/context_awareness';

const services = createDiscoverServicesMock();
const tab1 = getTabStateMock({
  id: '1',
  label: 'Tab 1',
  duplicatedFromId: '0',
  initialInternalState: {
    serializedSearchSource: { index: 'test-data-view-1' },
  },
  attributes: {
    visContext: { foo: 'bar' },
    controlGroupState: undefined,
  },
  globalState: {
    timeRange: { from: 'now-7d', to: 'now' },
    refreshInterval: { pause: true, value: 500 },
  },
  appState: { columns: ['column1'] },
});
const tab2 = getTabStateMock({
  id: '2',
  label: 'Tab 2',
  initialInternalState: {
    serializedSearchSource: { index: 'test-data-view-2' },
  },
  attributes: {
    visContext: { bar: 'foo' },
    controlGroupState: undefined,
    timeRestore: true,
  },
  globalState: {
    timeRange: { from: 'now-15m', to: 'now' },
    refreshInterval: { pause: false, value: 1000 },
  },
  appState: { columns: ['column2'] },
});

describe('tab mapping utils', () => {
  describe('fromSavedObjectTabToAppState', () => {
    it('should map saved object tab to app state', () => {
      const persistedTab = getPersistedTabMock({
        tabId: 'test-tab',
        dataView: dataViewMockWithTimeField,
        services,
        appStateOverrides: {
          columns: ['column1'],
          sort: [],
        },
      });
      expect(fromSavedObjectTabToAppState({ tab: persistedTab })).toMatchInlineSnapshot(`
        Object {
          "breakdownField": "",
          "columns": Array [
            "column1",
          ],
          "dataSource": Object {
            "dataViewId": "the-data-view-id",
            "type": "dataView",
          },
          "filters": Array [],
          "grid": Object {},
          "hideChart": false,
          "hideTable": false,
          "interval": "auto",
          "query": Object {
            "language": "kuery",
            "query": "",
          },
          "sort": Array [],
        }
      `);
    });
  });

  describe('fromSavedObjectTabToTabState', () => {
    it('should map saved object tab to tab state', () => {
      let tabState = fromSavedObjectTabToTabState({
        tab: fromTabStateToSavedObjectTab({
          tab: tab2,
          overridenTimeRestore: false,
          services,
          currentDataView: undefined,
          tabType: undefined,
        }),
        existingTab: tab1,
        profileStateRegistry: services.profileStateRegistry,
      });
      expect(tabState).toMatchInlineSnapshot(`
        Object {
          "appState": Object {
            "breakdownField": "",
            "columns": Array [
              "column2",
            ],
            "dataSource": Object {
              "dataViewId": "test-data-view-2",
              "type": "dataView",
            },
            "grid": Object {},
            "hideChart": false,
            "hideTable": false,
            "sort": Array [],
          },
          "attributes": Object {
            "controlGroupState": undefined,
            "timeRestore": false,
            "visContext": Object {
              "bar": "foo",
            },
          },
          "cascadedDocumentsState": Object {
            "availableCascadeGroups": Array [],
            "cascadedDocumentsMap": Object {},
            "columnsMeta": Object {},
            "selectedCascadeGroups": Array [],
          },
          "dataRequestParams": Object {
            "isSearchSessionRestored": false,
            "searchSessionId": undefined,
            "timeRangeAbsolute": undefined,
            "timeRangeRelative": undefined,
          },
          "duplicatedFromId": "0",
          "esqlVariables": Array [],
          "expandedDoc": undefined,
          "expandedDocOwner": undefined,
          "forceFetchOnSelect": false,
          "globalState": Object {
            "refreshInterval": Object {
              "pause": true,
              "value": 500,
            },
            "timeRange": Object {
              "from": "now-7d",
              "to": "now",
            },
          },
          "id": "2",
          "initialInternalState": Object {
            "serializedSearchSource": Object {
              "index": "test-data-view-2",
            },
            "tabType": undefined,
          },
          "initializationState": Object {
            "initializationStatus": "NotStarted",
          },
          "isDataViewLoading": false,
          "isWarningCalloutDismissed": false,
          "label": "Tab 2",
          "overriddenVisContextAfterInvalidation": undefined,
          "previousAppState": Object {
            "columns": Array [
              "column1",
            ],
          },
          "profileAppStateDefaults": Object {
            "fieldsToReset": "none",
            "resetId": "",
            "snapshotsByProfileId": Object {},
          },
          "profileState": Object {},
          "renderDocumentViewMeta": undefined,
          "uiState": Object {},
        }
      `);
      tabState = fromSavedObjectTabToTabState({
        tab: fromTabStateToSavedObjectTab({
          tab: tab2,
          overridenTimeRestore: true,
          services,
          currentDataView: undefined,
          tabType: undefined,
        }),
        existingTab: tab1,
        profileStateRegistry: services.profileStateRegistry,
      });
      expect(tabState).toMatchInlineSnapshot(`
        Object {
          "appState": Object {
            "breakdownField": "",
            "columns": Array [
              "column2",
            ],
            "dataSource": Object {
              "dataViewId": "test-data-view-2",
              "type": "dataView",
            },
            "grid": Object {},
            "hideChart": false,
            "hideTable": false,
            "sort": Array [],
          },
          "attributes": Object {
            "controlGroupState": undefined,
            "timeRestore": true,
            "visContext": Object {
              "bar": "foo",
            },
          },
          "cascadedDocumentsState": Object {
            "availableCascadeGroups": Array [],
            "cascadedDocumentsMap": Object {},
            "columnsMeta": Object {},
            "selectedCascadeGroups": Array [],
          },
          "dataRequestParams": Object {
            "isSearchSessionRestored": false,
            "searchSessionId": undefined,
            "timeRangeAbsolute": undefined,
            "timeRangeRelative": undefined,
          },
          "duplicatedFromId": "0",
          "esqlVariables": Array [],
          "expandedDoc": undefined,
          "expandedDocOwner": undefined,
          "forceFetchOnSelect": false,
          "globalState": Object {
            "refreshInterval": Object {
              "pause": false,
              "value": 1000,
            },
            "timeRange": Object {
              "from": "now-15m",
              "to": "now",
            },
          },
          "id": "2",
          "initialInternalState": Object {
            "serializedSearchSource": Object {
              "index": "test-data-view-2",
            },
            "tabType": undefined,
          },
          "initializationState": Object {
            "initializationStatus": "NotStarted",
          },
          "isDataViewLoading": false,
          "isWarningCalloutDismissed": false,
          "label": "Tab 2",
          "overriddenVisContextAfterInvalidation": undefined,
          "previousAppState": Object {
            "columns": Array [
              "column1",
            ],
          },
          "profileAppStateDefaults": Object {
            "fieldsToReset": "none",
            "resetId": "",
            "snapshotsByProfileId": Object {},
          },
          "profileState": Object {},
          "renderDocumentViewMeta": undefined,
          "uiState": Object {},
        }
      `);
    });

    it('should normalize legacy controlGroupJson when loading saved object tabs', () => {
      const legacyControlsTab = getTabStateMock({
        id: 'legacy-controls-tab',
        label: 'Legacy controls tab',
        initialInternalState: {
          serializedSearchSource: { index: 'test-data-view-legacy' },
        },
        attributes: {
          controlGroupState: mockControlState,
          visContext: undefined,
        },
      });

      const tabState = fromSavedObjectTabToTabState({
        tab: fromTabStateToSavedObjectTab({
          tab: legacyControlsTab,
          services,
          currentDataView: undefined,
          tabType: undefined,
        }),
        existingTab: tab1,
        profileStateRegistry: services.profileStateRegistry,
      });

      expect(tabState.attributes.controlGroupState).toEqual({
        ...mockControlState,
        panel1: {
          ...mockControlState.panel1,
          type: ESQL_CONTROL,
        },
      });
    });
  });

  describe('fromSavedObjectTabToSearchSource', () => {
    it('should create a search source from a saved object tab', async () => {
      const toolkit = getDiscoverInternalStateMock({
        services,
        persistedDataViews: [dataViewMockWithTimeField],
      });
      const persistedTab = getPersistedTabMock({
        tabId: 'test-tab',
        dataView: dataViewMockWithTimeField,
        services: toolkit.services,
        appStateOverrides: tab1.appState,
        globalStateOverrides: tab1.globalState,
      });
      await toolkit.initializeTabs({
        persistedDiscoverSession: createDiscoverSessionMock({
          id: 'test-session',
          tabs: [persistedTab],
        }),
      });

      const searchSource = await fromSavedObjectTabToSearchSource({
        tab: persistedTab,
        services: toolkit.services,
      });

      expect(searchSource.getSerializedFields()).toEqual({
        filter: [],
        index: 'the-data-view-id',
        query: {
          language: 'kuery',
          query: '',
        },
      });
    });
  });

  describe('fromSavedObjectTabToSavedSearch', () => {
    it('should map saved object tab to saved search', async () => {
      const toolkit = getDiscoverInternalStateMock({
        services,
        persistedDataViews: [dataViewMockWithTimeField],
      });
      const persistedTab = getPersistedTabMock({
        tabId: 'test-tab',
        dataView: dataViewMockWithTimeField,
        services: toolkit.services,
        appStateOverrides: tab1.appState,
        globalStateOverrides: tab1.globalState,
        attributesOverrides: {
          ...tab1.attributes,
          timeRestore: true,
        },
      });
      const persistedDiscoverSession = createDiscoverSessionMock({
        id: 'the-saved-search-id-with-timefield',
        title: 'title',
        description: 'description',
        tabs: [persistedTab],
        managed: true,
        tags: ['tag1', 'tag2'],
      });
      await toolkit.initializeTabs({ persistedDiscoverSession });

      const savedSearch = await fromSavedObjectTabToSavedSearch({
        tab: persistedTab,
        discoverSession: toolkit.internalState.getState().persistedDiscoverSession,
        services: toolkit.services,
      });
      expect(omit(savedSearch, 'searchSource')).toMatchInlineSnapshot(`
        Object {
          "breakdownField": "",
          "chartInterval": "auto",
          "columns": Array [
            "column1",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "description": "description",
          "documentsDisplayMode": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "the-saved-search-id-with-timefield",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "managed": true,
          "references": undefined,
          "refreshInterval": Object {
            "pause": true,
            "value": 500,
          },
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "sharingSavedObjectProps": undefined,
          "sort": Array [
            Array [
              "@timestamp",
              "desc",
            ],
          ],
          "tags": Array [
            "tag1",
            "tag2",
          ],
          "timeRange": Object {
            "from": "now-7d",
            "to": "now",
          },
          "timeRestore": true,
          "title": "title",
          "usesAdHocDataView": false,
          "viewMode": undefined,
          "visContext": Object {
            "foo": "bar",
          },
        }
      `);
      expect(savedSearch.searchSource.getSerializedFields()).toMatchInlineSnapshot(`
        Object {
          "filter": Array [],
          "index": "the-data-view-id",
          "query": Object {
            "language": "kuery",
            "query": "",
          },
        }
      `);
    });
  });

  describe('fromTabStateToSavedObjectTab', () => {
    it('should map tab state to saved object tab when currentDataView is undefined', () => {
      let savedObjectTab = fromTabStateToSavedObjectTab({
        tab: tab1,
        services,
        currentDataView: undefined,
        tabType: undefined,
      });
      expect(savedObjectTab).toMatchInlineSnapshot(`
        Object {
          "breakdownField": "",
          "chartInterval": undefined,
          "columns": Array [
            "column1",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "documentsDisplayMode": undefined,
          "esqlApproximation": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "1",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "label": "Tab 1",
          "refreshInterval": undefined,
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "serializedSearchSource": Object {
            "index": "test-data-view-1",
          },
          "sort": Array [],
          "tabTypeState": undefined,
          "timeRange": undefined,
          "timeRestore": false,
          "usesAdHocDataView": false,
          "viewMode": undefined,
          "visContext": Object {
            "foo": "bar",
          },
        }
      `);
      savedObjectTab = fromTabStateToSavedObjectTab({
        tab: tab1,
        overridenTimeRestore: true,
        services,
        currentDataView: undefined,
        tabType: undefined,
      });
      expect(savedObjectTab).toMatchInlineSnapshot(`
        Object {
          "breakdownField": "",
          "chartInterval": undefined,
          "columns": Array [
            "column1",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "documentsDisplayMode": undefined,
          "esqlApproximation": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "1",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "label": "Tab 1",
          "refreshInterval": Object {
            "pause": true,
            "value": 500,
          },
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "serializedSearchSource": Object {
            "index": "test-data-view-1",
          },
          "sort": Array [],
          "tabTypeState": undefined,
          "timeRange": Object {
            "from": "now-7d",
            "to": "now",
          },
          "timeRestore": true,
          "usesAdHocDataView": false,
          "viewMode": undefined,
          "visContext": Object {
            "foo": "bar",
          },
        }
      `);
    });

    it('should use currentDataView when provided', () => {
      const tabWithAppState = getTabStateMock({
        id: 'initialized-tab',
        label: 'Initialized Tab',
        initialInternalState: {
          // This should NOT be used when dataView is provided
          serializedSearchSource: { index: 'stale-data-view-id' },
        },
        appState: {
          columns: ['@timestamp', 'message'],
          query: { query: 'test query', language: 'kuery' },
          filters: [{ meta: { alias: 'test filter' }, query: { match_all: {} } }],
        },
        globalState: {
          timeRange: { from: 'now-24h', to: 'now' },
        },
      });

      const savedObjectTab = fromTabStateToSavedObjectTab({
        tab: tabWithAppState,
        services,
        currentDataView: dataViewMockWithTimeField,
        tabType: undefined,
      });

      // The serializedSearchSource should be created from the provided dataView,
      // NOT from the stale initialInternalState.serializedSearchSource
      // Note: The index is serialized as the dataView ID, not the full dataView object
      expect(savedObjectTab.serializedSearchSource.index).toBe(dataViewMockWithTimeField.id);
      expect(savedObjectTab.serializedSearchSource.query).toEqual({
        query: 'test query',
        language: 'kuery',
      });
      expect(savedObjectTab.serializedSearchSource.filter).toEqual([
        { meta: { alias: 'test filter' }, query: { match_all: {} } },
      ]);
      expect(savedObjectTab.columns).toEqual(['@timestamp', 'message']);
      expect(savedObjectTab.id).toBe('initialized-tab');
      expect(savedObjectTab.label).toBe('Initialized Tab');
      // Verify we're not using the stale data from initialInternalState
      expect(savedObjectTab.serializedSearchSource.index).not.toBe('stale-data-view-id');
    });

    it('should fall back to initialInternalState when currentDataView is undefined', () => {
      const tabWithAppState = getTabStateMock({
        id: 'uninitialized-tab',
        label: 'Uninitialized Tab',
        initialInternalState: {
          serializedSearchSource: { index: 'initial-data-view-id', query: { esql: 'FROM test' } },
        },
      });

      const savedObjectTab = fromTabStateToSavedObjectTab({
        tab: tabWithAppState,
        services,
        currentDataView: undefined,
        tabType: undefined,
      });

      // Should use initialInternalState since dataView is not provided
      expect(savedObjectTab.serializedSearchSource).toEqual({
        index: 'initial-data-view-id',
        query: { esql: 'FROM test' },
      });
    });
  });

  describe('fromSavedSearchToSavedObjectTab', () => {
    it('should map saved search to saved object tab considering tab attributes', () => {
      const savedObjectTab = fromSavedSearchToSavedObjectTab({
        tab: tab1,
        savedSearch: { ...savedSearchMock, visContext: { foo: 'bar' } },
        services,
      });
      expect(savedObjectTab).toMatchInlineSnapshot(`
        Object {
          "breakdownField": undefined,
          "chartInterval": undefined,
          "columns": Array [
            "default_column",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "documentsDisplayMode": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "1",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "label": "Tab 1",
          "refreshInterval": undefined,
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "serializedSearchSource": Object {
            "index": "the-data-view-id",
            "query": Object {
              "language": "kuery",
              "query": "",
            },
          },
          "sort": Array [],
          "timeRange": undefined,
          "timeRestore": false,
          "usesAdHocDataView": undefined,
          "viewMode": undefined,
          "visContext": Object {
            "foo": "bar",
          },
        }
      `);

      const savedObjectTab2 = fromSavedSearchToSavedObjectTab({
        tab: tab2,
        savedSearch: savedSearchMock,
        services,
      });
      expect(savedObjectTab2).toMatchInlineSnapshot(`
        Object {
          "breakdownField": undefined,
          "chartInterval": undefined,
          "columns": Array [
            "default_column",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "documentsDisplayMode": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "2",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "label": "Tab 2",
          "refreshInterval": Object {
            "pause": false,
            "value": 1000,
          },
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "serializedSearchSource": Object {
            "index": "the-data-view-id",
            "query": Object {
              "language": "kuery",
              "query": "",
            },
          },
          "sort": Array [],
          "timeRange": Object {
            "from": "now-15m",
            "to": "now",
          },
          "timeRestore": true,
          "usesAdHocDataView": undefined,
          "viewMode": undefined,
          "visContext": Object {
            "bar": "foo",
          },
        }
      `);
    });

    it('should map saved search to saved object tab without tab attributes', () => {
      const savedSearch = {
        ...savedSearchMock,
        timeRange: { from: 'now-15m', to: 'now' },
        refreshInterval: { pause: false, value: 1000 },
      };
      const savedObjectTab = fromSavedSearchToSavedObjectTab({
        tab: omit(tab1, 'attributes'),
        savedSearch: { ...savedSearch, timeRestore: false },
        services,
      });
      expect(savedObjectTab).toMatchInlineSnapshot(`
        Object {
          "breakdownField": undefined,
          "chartInterval": undefined,
          "columns": Array [
            "default_column",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "documentsDisplayMode": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "1",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "label": "Tab 1",
          "refreshInterval": Object {
            "pause": false,
            "value": 1000,
          },
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "serializedSearchSource": Object {
            "index": "the-data-view-id",
            "query": Object {
              "language": "kuery",
              "query": "",
            },
          },
          "sort": Array [],
          "timeRange": Object {
            "from": "now-15m",
            "to": "now",
          },
          "timeRestore": false,
          "usesAdHocDataView": undefined,
          "viewMode": undefined,
          "visContext": undefined,
        }
      `);

      const savedObjectTab2 = fromSavedSearchToSavedObjectTab({
        tab: omit(tab2, 'attributes'),
        savedSearch: { ...savedSearch, timeRestore: true },
        services,
      });
      expect(savedObjectTab2).toMatchInlineSnapshot(`
        Object {
          "breakdownField": undefined,
          "chartInterval": undefined,
          "columns": Array [
            "default_column",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "documentsDisplayMode": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": "2",
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "label": "Tab 2",
          "refreshInterval": Object {
            "pause": false,
            "value": 1000,
          },
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "serializedSearchSource": Object {
            "index": "the-data-view-id",
            "query": Object {
              "language": "kuery",
              "query": "",
            },
          },
          "sort": Array [],
          "timeRange": Object {
            "from": "now-15m",
            "to": "now",
          },
          "timeRestore": true,
          "usesAdHocDataView": undefined,
          "viewMode": undefined,
          "visContext": undefined,
        }
      `);
    });
  });

  describe('tab type persistence', () => {
    const profileStateRegistry = createProfileStateRegistry();
    const tabTypeServices = { ...services, profileStateRegistry };
    const createMetricsTabTypeState = (
      dimensions: string[]
    ): NonNullable<DiscoverSessionTab['tabTypeState']> => ({
      type: DiscoverTabType.Metrics,
      ...METRICS_GRID_SETTINGS_DEFAULTS,
      dimensions,
    });

    it('hydrates and round-trips an unopened tab type', () => {
      const persistedTab: DiscoverSessionTab = {
        ...getPersistedTabMock({
          tabId: 'metrics-tab',
          dataView: dataViewMockWithTimeField,
          services: tabTypeServices,
        }),
        tabTypeState: createMetricsTabTypeState(['host.name']),
      };
      const tabState = fromSavedObjectTabToTabState({
        tab: persistedTab,
        profileStateRegistry,
      });

      expect(tabState.initialInternalState?.tabType).toBe(DiscoverTabType.Metrics);
      expect(tabState.profileState).toEqual({
        metricsState: {
          ...METRICS_GRID_SETTINGS_DEFAULTS,
          dimensions: ['host.name'],
        },
      });

      const resavedTab = fromTabStateToSavedObjectTab({
        tab: tabState,
        services: tabTypeServices,
        currentDataView: undefined,
        tabType: tabState.initialInternalState?.tabType,
      });

      expect(resavedTab.tabTypeState).toEqual(persistedTab.tabTypeState);
    });

    it('restores saved profile fields while preserving fields absent from the saved payload', () => {
      const tabState = fromSavedObjectTabToTabState({
        tab: {
          ...getPersistedTabMock({
            tabId: 'metrics-tab',
            dataView: dataViewMockWithTimeField,
            services: tabTypeServices,
          }),
          tabTypeState: createMetricsTabTypeState(['saved-dimension']),
        },
        existingTab: getTabStateMock({
          id: 'metrics-tab',
          profileState: {
            metricsState: {
              ...METRICS_STATE_DEF.defaultState,
              dimensions: ['live-dimension'],
            },
          },
        }),
        profileStateRegistry,
      });

      expect(tabState.profileState).toEqual({
        metricsState: {
          ...METRICS_STATE_DEF.defaultState,
          dimensions: ['saved-dimension'],
        },
      });
    });

    it('drops the saved tab type when the resolved tab type is undefined', () => {
      const tabState = getTabStateMock({
        id: 'metrics-tab',
        profileState: { metricsState: { dimensions: ['host.name'] } },
      });

      const savedObjectTab = fromTabStateToSavedObjectTab({
        tab: tabState,
        services: tabTypeServices,
        currentDataView: undefined,
        tabType: undefined,
      });

      expect(savedObjectTab.tabTypeState).toBeUndefined();
    });

    it('expands defaults when the tab gains a type', () => {
      const tabState = getTabStateMock({ id: 'newly-metrics-tab' });

      const savedObjectTab = fromTabStateToSavedObjectTab({
        tab: tabState,
        services: tabTypeServices,
        currentDataView: undefined,
        tabType: DiscoverTabType.Metrics,
      });

      expect(savedObjectTab.tabTypeState).toEqual({
        ...createMetricsTabTypeState([]),
      });
    });
  });
});
