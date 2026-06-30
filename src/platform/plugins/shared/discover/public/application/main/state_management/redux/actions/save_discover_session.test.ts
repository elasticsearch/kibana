/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createDiscoverServicesMock } from '../../../../../__mocks__/services';
import { getDiscoverInternalStateMock } from '../../../../../__mocks__/discover_state.mock';
import type { DiscoverSessionTab } from '@kbn/saved-search-plugin/common';
import { fromTabStateToSavedObjectTab } from '../tab_mapping_utils';
import { getTabStateMock } from '../__mocks__/internal_state.mocks';
import { dataViewMock, dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import type { DiscoverServices } from '../../../../../build_services';
import type { SaveDiscoverSessionParams } from '@kbn/saved-search-plugin/public';
import { internalStateActions } from '..';
import { ESQL_TYPE } from '@kbn/data-view-utils';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import { internalStateSlice } from '../internal_state';
import type { SaveDiscoverSessionThunkParams } from './save_discover_session';
import * as tabStateDataViewActions from './tab_state_data_view';
import { createSearchSourceMock } from '@kbn/data-plugin/public/mocks';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { getPersistedTabMock } from '../__mocks__/internal_state.mocks';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

const getSaveDiscoverSessionParams = (
  overrides: Partial<SaveDiscoverSessionThunkParams> = {}
): SaveDiscoverSessionThunkParams => ({
  newTitle: 'new title',
  newCopyOnSave: false,
  newTimeRestore: false,
  newDescription: 'new description',
  newTags: [],
  ...overrides,
});

const setup = async ({
  additionalPersistedTabs,
  initializeTab = false,
}: {
  additionalPersistedTabs?: (services: DiscoverServices) => DiscoverSessionTab[];
  initializeTab?: boolean;
} = {}) => {
  const services = createDiscoverServicesMock();
  const saveDiscoverSessionSpy = jest
    .spyOn(services.savedSearch, 'saveDiscoverSession')
    .mockImplementation((discoverSession) =>
      Promise.resolve({
        ...discoverSession,
        id: discoverSession.id ?? 'new-session',
        managed: false,
      })
    );
  const dataViewCreateSpy = jest.spyOn(services.dataViews, 'create');
  const dataViewsClearCacheSpy = jest.spyOn(services.dataViews, 'clearInstanceCache');

  const toolkit = getDiscoverInternalStateMock({
    services,
    persistedDataViews: [dataViewMock, dataViewMockWithTimeField],
  });

  const defaultTab = getPersistedTabMock({
    tabId: 'default-tab',
    dataView: dataViewMock,
    services,
  });

  const tabs = [defaultTab, ...(additionalPersistedTabs?.(services) ?? [])];

  await toolkit.initializeTabs({
    persistedDiscoverSession: createDiscoverSessionMock({
      id: 'test-session',
      title: 'Test Session',
      description: 'Test Description',
      tabs,
    }),
  });

  if (initializeTab) {
    await toolkit.initializeSingleTab({ tabId: toolkit.getCurrentTab().id });
  }

  return {
    toolkit,
    services,
    saveDiscoverSessionSpy,
    dataViewCreateSpy,
    dataViewsClearCacheSpy,
  };
};

describe('saveDiscoverSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call saveDiscoverSession with the expected params', async () => {
    const { toolkit, saveDiscoverSessionSpy } = await setup({
      additionalPersistedTabs: (services) => [
        getPersistedTabMock({
          tabId: 'test-tab',
          dataView: dataViewMock,
          services,
        }),
      ],
    });
    const discoverSession = toolkit.internalState.getState().persistedDiscoverSession;

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(
        getSaveDiscoverSessionParams({ newTags: ['tag1', 'tag2'] })
      )
    );

    const updatedDiscoverSession: SaveDiscoverSessionParams = {
      id: discoverSession?.id,
      title: 'new title',
      description: 'new description',
      tabs: discoverSession?.tabs ?? [],
      tags: ['tag1', 'tag2'],
    };

    expect(saveDiscoverSessionSpy).toHaveBeenCalledWith(updatedDiscoverSession, {
      copyOnSave: false,
    });

    expect(toolkit.internalState.getState().persistedDiscoverSession).toEqual({
      ...updatedDiscoverSession,
      managed: false,
    });
  });

  it('should update runtime state for applicable tabs', async () => {
    const { toolkit, services, saveDiscoverSessionSpy } = await setup({ initializeTab: true });

    const currentTabId = toolkit.getCurrentTab().id;
    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: currentTabId,
        appState: {
          breakdownField: 'breakdown-test',
        },
      })
    );

    const resetOnSavedSearchChangeSpy = jest.spyOn(
      internalStateSlice.actions,
      'resetOnSavedSearchChange'
    );
    const setDataViewSpy = jest.spyOn(tabStateDataViewActions, 'setDataView');

    jest
      .spyOn(services.data.search.searchSource, 'create')
      .mockResolvedValue(createSearchSourceMock({ index: dataViewMockWithTimeField }));

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(getSaveDiscoverSessionParams())
    );

    expect(saveDiscoverSessionSpy).toHaveBeenCalled();
    expect(resetOnSavedSearchChangeSpy).toHaveBeenCalledWith({ tabId: currentTabId });
    expect(setDataViewSpy).toHaveBeenCalledWith({
      tabId: currentTabId,
      dataView: dataViewMockWithTimeField,
    });
    expect(toolkit.getCurrentTab().appState.breakdownField).toBe('breakdown-test');
  });

  it('should preserve current sidebar state for initialized tabs', async () => {
    const { toolkit, saveDiscoverSessionSpy } = await setup({ initializeTab: true });
    const currentTabId = toolkit.getCurrentTab().id;

    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: currentTabId,
        appState: {
          hideSidebar: true,
        },
      })
    );

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(getSaveDiscoverSessionParams())
    );

    expect(saveDiscoverSessionSpy).toHaveBeenCalled();

    const savedTab = saveDiscoverSessionSpy.mock.calls[0][0].tabs.find(
      (tab) => tab.id === currentTabId
    );

    expect(savedTab).not.toHaveProperty('hideSidebar');
    expect(toolkit.getCurrentTab().appState.hideSidebar).toBe(true);
  });

  it('should not update local state if saveDiscoverSession returns undefined', async () => {
    const resetOnSavedSearchChangeSpy = jest.spyOn(
      internalStateSlice.actions,
      'resetOnSavedSearchChange'
    );
    const { toolkit, saveDiscoverSessionSpy } = await setup();
    const initialPersisted = toolkit.internalState.getState().persistedDiscoverSession;

    saveDiscoverSessionSpy.mockResolvedValueOnce(undefined);

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(getSaveDiscoverSessionParams())
    );

    expect(toolkit.internalState.getState().persistedDiscoverSession).toBe(initialPersisted);
    expect(resetOnSavedSearchChangeSpy).not.toHaveBeenCalled();
  });

  it('should allow errors thrown at the persistence layer to bubble up and not modify local state', async () => {
    const resetOnSavedSearchChangeSpy = jest.spyOn(
      internalStateSlice.actions,
      'resetOnSavedSearchChange'
    );
    const { toolkit, saveDiscoverSessionSpy } = await setup();
    const initialPersisted = toolkit.internalState.getState().persistedDiscoverSession;

    saveDiscoverSessionSpy.mockRejectedValueOnce(new Error('boom'));

    await expect(
      toolkit.internalState
        .dispatch(internalStateActions.saveDiscoverSession(getSaveDiscoverSessionParams()))
        .unwrap()
    ).rejects.toHaveProperty('message', 'boom');

    expect(toolkit.internalState.getState().persistedDiscoverSession).toBe(initialPersisted);
    expect(resetOnSavedSearchChangeSpy).not.toHaveBeenCalled();
  });

  describe('timeRestore, timeRange, and refreshInterval handling', () => {
    const TIME_RANGE_30M = { from: 'now-30m', to: 'now' };
    const REFRESH_INTERVAL_5S = { value: 5000, pause: true };
    const TIME_RANGE_15M = { from: 'now-15m', to: 'now' };
    const REFRESH_INTERVAL_10S = { value: 10000, pause: false };
    const TIME_RANGE_1H = { from: 'now-1h', to: 'now' };
    const REFRESH_INTERVAL_20S = { value: 20000, pause: false };
    const TIME_RANGE_7D = { from: 'now-7d', to: 'now' };
    const REFRESH_INTERVAL_30S = { value: 30000, pause: true };

    const findSavedTab = (
      saveDiscoverSessionSpy: jest.SpyInstance,
      tabId: string
    ): { timeRestore?: boolean; timeRange?: unknown; refreshInterval?: unknown } | undefined =>
      saveDiscoverSessionSpy.mock.calls[0][0].tabs.find((t: { id: string }) => t.id === tabId);

    describe('when an initialized tab', () => {
      it.each([
        {
          scenario: 'newTimeRestore is true',
          newTimeRestore: true,
          expectedTimeRestore: true,
          expectedTimeRange: TIME_RANGE_30M,
          expectedRefreshInterval: REFRESH_INTERVAL_5S,
        },
        {
          scenario: 'newTimeRestore is false',
          newTimeRestore: false,
          expectedTimeRestore: false,
          expectedTimeRange: undefined,
          expectedRefreshInterval: undefined,
        },
      ])(
        'should save time settings correctly when $scenario',
        async ({
          newTimeRestore,
          expectedTimeRestore,
          expectedTimeRange,
          expectedRefreshInterval,
        }) => {
          const { toolkit, saveDiscoverSessionSpy } = await setup({ initializeTab: true });

          toolkit.internalState.dispatch(
            internalStateSlice.actions.setGlobalState({
              tabId: toolkit.getCurrentTab().id,
              globalState: { timeRange: TIME_RANGE_30M, refreshInterval: REFRESH_INTERVAL_5S },
            })
          );

          await toolkit.internalState.dispatch(
            internalStateActions.saveDiscoverSession(
              getSaveDiscoverSessionParams({ newTimeRestore })
            )
          );

          expect(saveDiscoverSessionSpy).toHaveBeenCalled();
          const savedTab = findSavedTab(saveDiscoverSessionSpy, toolkit.getCurrentTab().id);
          expect(savedTab?.timeRestore).toBe(expectedTimeRestore);
          expect(savedTab?.timeRange).toEqual(expectedTimeRange);
          expect(savedTab?.refreshInterval).toEqual(expectedRefreshInterval);
        }
      );
    });

    describe('when an uninitialized tab', () => {
      it.each([
        {
          scenario: 'newTimeRestore is true',
          newTimeRestore: true,
          expectedTimeRestore: true,
          expectedTimeRange: TIME_RANGE_15M,
          expectedRefreshInterval: REFRESH_INTERVAL_10S,
        },
        {
          scenario: 'newTimeRestore is false',
          newTimeRestore: false,
          expectedTimeRestore: false,
          expectedTimeRange: undefined,
          expectedRefreshInterval: undefined,
        },
      ])(
        'should save time settings correctly when $scenario',
        async ({
          newTimeRestore,
          expectedTimeRestore,
          expectedTimeRange,
          expectedRefreshInterval,
        }) => {
          const { toolkit, saveDiscoverSessionSpy } = await setup({
            additionalPersistedTabs: (services) => [
              getPersistedTabMock({
                tabId: 'time-tab',
                dataView: dataViewMock,
                globalStateOverrides: {
                  timeRange: TIME_RANGE_15M,
                  refreshInterval: REFRESH_INTERVAL_10S,
                },
                overridenTimeRestore: true,
                services,
              }),
            ],
          });

          await toolkit.internalState.dispatch(
            internalStateActions.saveDiscoverSession(
              getSaveDiscoverSessionParams({ newTimeRestore })
            )
          );

          expect(saveDiscoverSessionSpy).toHaveBeenCalled();
          const savedTab = findSavedTab(saveDiscoverSessionSpy, 'time-tab');
          expect(savedTab?.timeRestore).toBe(expectedTimeRestore);
          expect(savedTab?.timeRange).toEqual(expectedTimeRange);
          expect(savedTab?.refreshInterval).toEqual(expectedRefreshInterval);
        }
      );

      it('should use the selected tab time range for uninitialized tabs without their own time range when newTimeRestore is true', async () => {
        const { toolkit, saveDiscoverSessionSpy } = await setup({
          initializeTab: true,
          additionalPersistedTabs: (services) => [
            getPersistedTabMock({
              tabId: 'uninitialized-tab',
              dataView: dataViewMock,
              services,
            }),
          ],
        });

        toolkit.internalState.dispatch(
          internalStateSlice.actions.setGlobalState({
            tabId: toolkit.getCurrentTab().id,
            globalState: { timeRange: TIME_RANGE_1H, refreshInterval: REFRESH_INTERVAL_20S },
          })
        );

        await toolkit.internalState.dispatch(
          internalStateActions.saveDiscoverSession(
            getSaveDiscoverSessionParams({ newTimeRestore: true })
          )
        );

        expect(saveDiscoverSessionSpy).toHaveBeenCalled();
        const savedTab = findSavedTab(saveDiscoverSessionSpy, 'uninitialized-tab');
        expect(savedTab?.timeRestore).toBe(true);
        expect(savedTab?.timeRange).toEqual(TIME_RANGE_1H);
        expect(savedTab?.refreshInterval).toEqual(REFRESH_INTERVAL_20S);
      });

      it('should not use the selected tab time range for uninitialized tabs if they have their own time range', async () => {
        const { toolkit, saveDiscoverSessionSpy } = await setup({
          initializeTab: true,
          additionalPersistedTabs: (services) => [
            getPersistedTabMock({
              tabId: 'uninitialized-tab-with-time',
              dataView: dataViewMock,
              globalStateOverrides: {
                timeRange: TIME_RANGE_7D,
                refreshInterval: REFRESH_INTERVAL_30S,
              },
              overridenTimeRestore: true,
              services,
            }),
          ],
        });

        toolkit.internalState.dispatch(
          internalStateSlice.actions.setGlobalState({
            tabId: toolkit.getCurrentTab().id,
            globalState: { timeRange: TIME_RANGE_1H, refreshInterval: REFRESH_INTERVAL_20S },
          })
        );

        await toolkit.internalState.dispatch(
          internalStateActions.saveDiscoverSession(
            getSaveDiscoverSessionParams({ newTimeRestore: true })
          )
        );

        expect(saveDiscoverSessionSpy).toHaveBeenCalled();
        const savedTab = findSavedTab(saveDiscoverSessionSpy, 'uninitialized-tab-with-time');
        expect(savedTab?.timeRestore).toBe(true);
        expect(savedTab?.timeRange).toEqual(TIME_RANGE_7D);
        expect(savedTab?.refreshInterval).toEqual(REFRESH_INTERVAL_30S);
      });
    });
  });

  it('should replace custom ad hoc data view when copying on save', async () => {
    const oldId = 'adhoc-id';
    const filters = [
      { meta: { index: oldId, alias: null, disabled: false }, query: { match_all: {} } },
    ];
    const { toolkit, saveDiscoverSessionSpy, dataViewCreateSpy, dataViewsClearCacheSpy } =
      await setup({
        additionalPersistedTabs: (services) => [
          fromTabStateToSavedObjectTab({
            tab: getTabStateMock({
              id: 'adhoc-replace-tab',
              initialInternalState: {
                serializedSearchSource: {
                  index: { id: oldId, title: 'Adhoc', name: 'Adhoc Name' },
                  filter: filters,
                },
              },
            }),
            services,
            currentDataView: undefined,
          }),
        ],
      });

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(
        getSaveDiscoverSessionParams({ newCopyOnSave: true })
      )
    );

    expect(saveDiscoverSessionSpy).toHaveBeenCalled();
    expect(dataViewCreateSpy).toHaveBeenCalled();
    expect(dataViewsClearCacheSpy).toHaveBeenCalledWith(oldId);

    const createdSpec = dataViewCreateSpy.mock.calls[0][0];
    expect(createdSpec.id).toBe('test-uuid');
    expect(createdSpec.name).toBe('Adhoc Name');

    const tabs = saveDiscoverSessionSpy.mock.calls[0][0].tabs;
    expect(tabs).toHaveLength(2);
    const savedTab = tabs[1];
    expect(savedTab?.id).toBe('test-uuid');
    expect((savedTab?.serializedSearchSource?.index as DataViewSpec).id).toBe('test-uuid');
    expect(savedTab?.serializedSearchSource?.filter?.[0].meta.index).toBe('test-uuid');
  });

  it('should copy default profile ad hoc data view on save', async () => {
    const defaultProfileId = 'default-profile-id';
    const filters = [
      { meta: { index: defaultProfileId, alias: null, disabled: false }, query: { match_all: {} } },
    ];
    const { toolkit, saveDiscoverSessionSpy, dataViewCreateSpy, dataViewsClearCacheSpy } =
      await setup({
        additionalPersistedTabs: (services) => [
          fromTabStateToSavedObjectTab({
            tab: getTabStateMock({
              id: 'adhoc-copy-tab',
              initialInternalState: {
                serializedSearchSource: {
                  index: { id: defaultProfileId, title: 'Adhoc', name: 'Adhoc Name' },
                  filter: filters,
                },
              },
            }),
            services,
            currentDataView: undefined,
          }),
        ],
      });

    toolkit.internalState.dispatch(
      internalStateSlice.actions.setDefaultProfileAdHocDataViewIds([defaultProfileId])
    );

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(getSaveDiscoverSessionParams())
    );

    expect(saveDiscoverSessionSpy).toHaveBeenCalled();
    expect(dataViewCreateSpy).toHaveBeenCalled();
    expect(dataViewsClearCacheSpy).not.toHaveBeenCalled();

    const createdSpec = dataViewCreateSpy.mock.calls[0][0];
    expect(createdSpec.id).toBe('test-uuid');
    expect(createdSpec.name).toBe('Adhoc Name (new title)');

    const tabs = saveDiscoverSessionSpy.mock.calls[0][0].tabs;
    const savedTab = tabs.find((t) => t.id === 'adhoc-copy-tab');

    expect((savedTab?.serializedSearchSource?.index as DataViewSpec).id).toBe('test-uuid');
    expect(savedTab?.serializedSearchSource?.filter?.[0].meta.index).toBe('test-uuid');
  });

  it('should not clone ad hoc ES|QL data views', async () => {
    const esqlId = 'adhoc-esql-id';
    const { toolkit, saveDiscoverSessionSpy, dataViewCreateSpy, dataViewsClearCacheSpy } =
      await setup({
        additionalPersistedTabs: (services) => [
          fromTabStateToSavedObjectTab({
            tab: getTabStateMock({
              id: 'esql-tab',
              initialInternalState: {
                serializedSearchSource: {
                  index: { id: esqlId, title: 'ES|QL Adhoc', type: ESQL_TYPE },
                },
              },
            }),
            services,
            currentDataView: undefined,
          }),
        ],
      });

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(
        getSaveDiscoverSessionParams({ newCopyOnSave: true })
      )
    );

    expect(saveDiscoverSessionSpy).toHaveBeenCalled();
    expect(dataViewCreateSpy).not.toHaveBeenCalled();
    expect(dataViewsClearCacheSpy).not.toHaveBeenCalled();

    const tabs = saveDiscoverSessionSpy.mock.calls[0][0].tabs;
    expect(tabs).toHaveLength(2);

    const savedTab = tabs[1];
    expect(savedTab?.id).toBe('test-uuid');
    expect((savedTab?.serializedSearchSource.index as DataViewSpec).id).toBe(esqlId);
  });

  it('should apply overriddenVisContextAfterInvalidation to the saved tab', async () => {
    const { toolkit, saveDiscoverSessionSpy } = await setup({
      additionalPersistedTabs: (services) => [
        getPersistedTabMock({
          tabId: 'vis-context-tab',
          dataView: dataViewMock,
          services,
        }),
      ],
    });
    const visContext = { foo: 'bar' };

    toolkit.internalState.dispatch(
      internalStateActions.setOverriddenVisContextAfterInvalidation({
        tabId: 'vis-context-tab',
        overriddenVisContextAfterInvalidation: visContext,
      })
    );

    await toolkit.internalState.dispatch(
      internalStateActions.saveDiscoverSession(getSaveDiscoverSessionParams())
    );

    expect(saveDiscoverSessionSpy).toHaveBeenCalled();

    const tabs = saveDiscoverSessionSpy.mock.calls[0][0].tabs;
    const savedTab = tabs.find((t) => t.id === 'vis-context-tab');

    expect(savedTab?.visContext).toEqual(visContext);
  });
});
