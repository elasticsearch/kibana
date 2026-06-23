/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ControlGroupRenderer, type ControlGroupRendererApi } from '@kbn/control-group-renderer';
import { DataViewType, type DataView, type DataViewSpec } from '@kbn/data-views-plugin/public';
import {
  DiscoverFlyouts,
  dismissAllFlyoutsExceptFor,
  prepareDataViewForEditing,
} from '@kbn/discover-utils';
import type { ESQLEditorRestorableState } from '@kbn/esql-editor';
import { useESQLQueryStats } from '@kbn/esql/public';
import { type Query, type TimeRange, type AggregateQuery } from '@kbn/es-query';
import type { DataViewPickerProps, UnifiedSearchDraft } from '@kbn/unified-search-plugin/public';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESQL_TRANSITION_MODAL_KEY } from '../../../../../common/constants';
import {
  useDiscoverCustomization,
  useDiscoverCustomizationContext,
} from '../../../../customizations';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';
import {
  internalStateActions,
  selectTab,
  selectTabCombinedFilters,
  useAppStateSelector,
  useCurrentDataView,
  useCurrentTabAction,
  useCurrentTabSelector,
  useCurrentTabDataStateContainer,
  useDataViewsForPicker,
  useInternalStateDispatch,
  useInternalStateGetState,
  useInternalStateSelector,
} from '../../state_management/redux';
import { DiscoverTopNavMenu } from './discover_topnav_menu';
import { ESQLToDataViewTransitionModal } from './esql_dataview_transition';
import { DiscoverSessionSaveModalContainer } from './save_discover_session';
import { useDiscoverTopNav } from './use_discover_topnav';
import { useESQLVariables } from './use_esql_variables';
import type { UpdateESQLQueryFn } from '../../../../context_awareness/types';

export interface DiscoverTopNavProps {
  savedQuery?: string;
  esqlModeErrors?: Error;
  esqlModeWarning?: string;
  onFieldEdited: (options: {
    editedDataView: DataView;
    removedFieldName?: string;
  }) => Promise<void>;
  isLoading?: boolean;
  onCancelClick?: () => void;
}

export const DiscoverTopNav = ({
  savedQuery,
  esqlModeErrors,
  esqlModeWarning,
  onFieldEdited,
  isLoading,
  onCancelClick,
}: DiscoverTopNavProps) => {
  const dispatch = useInternalStateDispatch();
  const getState = useInternalStateGetState();
  const currentTabId = useCurrentTabSelector((tab) => tab.id);
  const services = useDiscoverServices();
  const { dataViewEditor, navigation, dataViewFieldEditor, data } = services;
  const customizationContext = useDiscoverCustomizationContext();
  const [controlGroupApi, setControlGroupApi] = useState<ControlGroupRendererApi | undefined>();
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [initialCopyOnSave, setInitialCopyOnSave] = useState(false);

  const onSaveCbRef = useRef<(() => void) | undefined>(undefined);

  const query = useAppStateSelector((state) => state.query);
  const esqlVariables = useCurrentTabSelector((tab) => tab.esqlVariables);
  const { timeRangeAbsolute } = useCurrentTabSelector((tab) => tab.dataRequestParams);
  const refreshInterval = useCurrentTabSelector((state) => state.globalState.refreshInterval);
  const timeRangeRelative = useCurrentTabSelector((state) => state.globalState.timeRange);
  const filters = useCurrentTabSelector(selectTabCombinedFilters);

  const { savedDataViews, adHocDataViews } = useDataViewsForPicker();
  const dataView = useCurrentDataView();
  const isESQLToDataViewTransitionModalVisible = useInternalStateSelector(
    (state) => state.isESQLToDataViewTransitionModalVisible
  );
  const persistedDiscoverSession = useInternalStateSelector(
    (state) => state.persistedDiscoverSession
  );
  const isEsqlMode = useIsEsqlMode();
  const showDatePicker = useMemo(() => {
    // always show the timepicker for ES|QL mode
    return (
      isEsqlMode || (!isEsqlMode && dataView.isTimeBased() && dataView.type !== DataViewType.ROLLUP)
    );
  }, [dataView, isEsqlMode]);

  const closeFieldEditor = useRef<() => void | undefined>();

  const onQuerySubmitAction = useCurrentTabAction(internalStateActions.onQuerySubmit);
  const onQuerySubmit = useCallback(
    (payload: { dateRange: TimeRange; query?: AggregateQuery | Query }, isUpdate?: boolean) => {
      dispatch(onQuerySubmitAction({ payload, isUpdate }));
    },
    [dispatch, onQuerySubmitAction]
  );

  // ES|QL controls logic
  const updateESQLQuery = useCurrentTabAction(internalStateActions.updateESQLQuery);
  const onUpdateESQLQuery: UpdateESQLQueryFn = useCallback(
    (queryOrUpdater) => {
      dispatch(updateESQLQuery({ queryOrUpdater }));
    },
    [dispatch, updateESQLQuery]
  );
  const { onSaveControl, getActivePanels } = useESQLVariables({
    isEsqlMode,
    currentEsqlVariables: esqlVariables,
    controlGroupApi,
    onUpdateESQLQuery,
  });

  const onOpenQueryInNewTab = useCallback(
    async (tabName: string, esqlQuery: string) => {
      await dispatch(
        internalStateActions.openInNewTab({
          tabLabel: tabName,
          appState: { query: { esql: esqlQuery } },
        })
      );
    },
    [dispatch]
  );

  useEffect(() => {
    return () => {
      // Make sure to close the editors when unmounting
      if (closeFieldEditor.current) {
        closeFieldEditor.current();
      }
    };
  }, []);

  const canEditDataView =
    Boolean(dataViewEditor?.userPermissions.editDataView()) || !dataView.isPersisted();

  const editField = useMemo(
    () =>
      canEditDataView
        ? async (fieldName?: string) => {
            if (dataView?.id) {
              const dataViewInstance = await data.dataViews.get(dataView.id);
              const editedDataView = await prepareDataViewForEditing(
                dataViewInstance,
                data.dataViews
              );

              closeFieldEditor.current = await dataViewFieldEditor.openEditor({
                ctx: {
                  dataView: editedDataView,
                },
                fieldName,
                onSave: async () => {
                  await onFieldEdited({ editedDataView });
                },
              });
            }
          }
        : undefined,
    [canEditDataView, dataView?.id, data.dataViews, dataViewFieldEditor, onFieldEdited]
  );

  const addField = useMemo(
    () => (canEditDataView && editField ? () => editField() : undefined),
    [editField, canEditDataView]
  );

  const updateAppState = useCurrentTabAction(internalStateActions.updateAppState);
  const setAppState = useCurrentTabAction(internalStateActions.setAppState);

  const updateSavedQueryId = useCallback(
    (newSavedQueryId: string | undefined) => {
      if (newSavedQueryId) {
        dispatch(updateAppState({ appState: { savedQuery: newSavedQueryId } }));
      } else {
        // remove savedQueryId from state
        const { appState } = selectTab(getState(), currentTabId);
        const newState = { ...appState };
        delete newState.savedQuery;
        dispatch(setAppState({ appState: newState }));
      }
    },
    [dispatch, setAppState, getState, currentTabId, updateAppState]
  );

  const dataStateContainer = useCurrentTabDataStateContainer();
  const esqlQueryStats = useESQLQueryStats(
    isEsqlMode,
    dataStateContainer.inspectorAdapters.requests
  );

  const transitionFromESQLToDataView = useCurrentTabAction(
    internalStateActions.transitionFromESQLToDataView
  );
  const onESQLToDataViewTransitionModalClose = useCallback(
    (shouldDismissModal?: boolean, needsSave?: boolean) => {
      if (shouldDismissModal) {
        services.storage.set(ESQL_TRANSITION_MODAL_KEY, true);
      }
      dispatch(internalStateActions.setIsESQLToDataViewTransitionModalVisible(false));
      if (needsSave == null) {
        return;
      }
      if (needsSave) {
        setInitialCopyOnSave(false);
        onSaveCbRef.current = () => {
          dispatch(transitionFromESQLToDataView({ dataViewId: dataView.id ?? '' }));
        };
        setIsSaveModalVisible(true);
        return;
      }
      dispatch(transitionFromESQLToDataView({ dataViewId: dataView.id ?? '' }));
    },
    [dataView.id, dispatch, services, transitionFromESQLToDataView]
  );

  const onOpenSaveModal = useCallback(() => {
    setInitialCopyOnSave(false);
    onSaveCbRef.current = undefined;
    setIsSaveModalVisible(true);
  }, []);

  const onOpenSaveAsModal = useCallback(() => {
    setInitialCopyOnSave(true);
    onSaveCbRef.current = undefined;
    setIsSaveModalVisible(true);
  }, []);

  const onCloseSaveModal = useCallback(() => {
    setIsSaveModalVisible(false);
    onSaveCbRef.current = undefined;
  }, []);
  const changeDataView = useCurrentTabAction(internalStateActions.changeDataView);
  const onChangeDataView = useCallback(
    (dataViewOrDataViewId: string | DataView) => {
      dispatch(changeDataView({ dataViewOrDataViewId }));
    },
    [dispatch, changeDataView]
  );
  const onDataViewCreatedAction = useCurrentTabAction(internalStateActions.onDataViewCreated);
  const onDataViewCreated = useCallback(
    (nextDataView: DataView) => {
      dispatch(onDataViewCreatedAction({ nextDataView }));
    },
    [dispatch, onDataViewCreatedAction]
  );
  const onDataViewEditedAction = useCurrentTabAction(internalStateActions.onDataViewEdited);
  const onDataViewEdited = useCallback(
    (editedDataView: DataView) => {
      dispatch(onDataViewEditedAction({ editedDataView }));
    },
    [dispatch, onDataViewEditedAction]
  );
  const createAndAppendAdHocDataView = useCurrentTabAction(
    internalStateActions.createAndAppendAdHocDataView
  );
  const onCreateDefaultAdHocDataView = useCallback(
    (dataViewSpec: DataViewSpec) => {
      dispatch(createAndAppendAdHocDataView({ dataViewSpec }));
    },
    [dispatch, createAndAppendAdHocDataView]
  );
  const dataViewPickerProps: DataViewPickerProps = useMemo(() => {
    return {
      trigger: {
        label: dataView?.getName() || '',
        'data-test-subj': 'discover-dataView-switch-link',
        title: dataView?.getIndexPattern() || '',
      },
      currentDataViewId: dataView?.id,
      onAddField: addField,
      onDataViewCreated,
      onCreateDefaultAdHocDataView,
      onChangeDataView,
      adHocDataViews,
      savedDataViews,
      onEditDataView: onDataViewEdited,
    };
  }, [
    adHocDataViews,
    addField,
    dataView,
    savedDataViews,
    onChangeDataView,
    onDataViewCreated,
    onDataViewEdited,
    onCreateDefaultAdHocDataView,
  ]);

  const onESQLDocsFlyoutVisibilityChanged = useCallback((isOpen: boolean) => {
    if (isOpen) {
      dismissAllFlyoutsExceptFor(DiscoverFlyouts.esqlDocs);
    }
  }, []);

  const searchBarCustomization = useDiscoverCustomization('search_bar');

  const SearchBar = useMemo(
    () => searchBarCustomization?.CustomSearchBar ?? navigation.ui.AggregateQueryTopNavMenu,
    [searchBarCustomization?.CustomSearchBar, navigation.ui.AggregateQueryTopNavMenu]
  );

  const searchDraftUiState = useCurrentTabSelector((state) => state.uiState.searchDraft);
  const setSearchDraftUiState = useCurrentTabAction(internalStateActions.setSearchDraftUiState);
  const onSearchDraftChange = useCallback(
    (newSearchDraftUiState: UnifiedSearchDraft | undefined) => {
      dispatch(
        setSearchDraftUiState({
          searchDraftUiState: newSearchDraftUiState,
        })
      );
    },
    [dispatch, setSearchDraftUiState]
  );

  const esqlEditorUiState = useCurrentTabSelector((state) => state.uiState.esqlEditor);
  const setEsqlEditorUiState = useCurrentTabAction(internalStateActions.setESQLEditorUiState);
  const onEsqlEditorInitialStateChange = useCallback(
    (newEsqlEditorUiState: Partial<ESQLEditorRestorableState>) => {
      dispatch(
        setEsqlEditorUiState({
          esqlEditorUiState: newEsqlEditorUiState,
        })
      );
    },
    [dispatch, setEsqlEditorUiState]
  );

  const textBasedLanguageModeErrors = useMemo(
    () => (esqlModeErrors ? [esqlModeErrors] : undefined),
    [esqlModeErrors]
  );

  const { topNavBadges, topNavMenu } = useDiscoverTopNav({
    onOpenSaveModal,
    onOpenSaveAsModal,
    persistedDiscoverSession,
  });

  const shouldHideDefaultDataviewPicker =
    !!searchBarCustomization?.CustomDataViewPicker || !!searchBarCustomization?.hideDataViewPicker;

  return (
    <span>
      <DiscoverTopNavMenu topNavBadges={topNavBadges} topNavMenu={topNavMenu} />
      <SearchBar
        useBackgroundSearchButton={
          customizationContext.displayMode !== 'embedded' &&
          services.data.search.isBackgroundSearchEnabled &&
          !!services.capabilities.discover_v2.storeSearchSession
        }
        appName="discover"
        indexPatterns={[dataView]}
        onQuerySubmit={onQuerySubmit}
        onCancel={onCancelClick}
        isLoading={isLoading}
        onSavedQueryIdChange={updateSavedQueryId}
        disableSubscribingToGlobalDataServices={true}
        query={query}
        filters={filters}
        dateRangeFrom={timeRangeRelative?.from}
        dateRangeTo={timeRangeRelative?.to}
        refreshInterval={refreshInterval?.value}
        isRefreshPaused={refreshInterval?.pause}
        savedQueryId={savedQuery}
        screenTitle={persistedDiscoverSession?.title}
        showDatePicker={showDatePicker}
        enableDateRangePicker
        allowSavingQueries
        showSearchBar={true}
        useDefaultBehaviors={true}
        dataViewPickerOverride={
          searchBarCustomization?.CustomDataViewPicker ? (
            <searchBarCustomization.CustomDataViewPicker />
          ) : undefined
        }
        dataViewPickerComponentProps={
          shouldHideDefaultDataviewPicker ? undefined : dataViewPickerProps
        }
        displayStyle="detached"
        textBasedLanguageModeErrors={textBasedLanguageModeErrors}
        textBasedLanguageModeWarning={esqlModeWarning}
        enableResourceBrowser={isEsqlMode}
        prependFilterBar={
          searchBarCustomization?.PrependFilterBar ? (
            <searchBarCustomization.PrependFilterBar />
          ) : undefined
        }
        onESQLDocsFlyoutVisibilityChanged={onESQLDocsFlyoutVisibilityChanged}
        draft={searchDraftUiState}
        onDraftChange={onSearchDraftChange}
        esqlEditorInitialState={esqlEditorUiState}
        onEsqlEditorInitialStateChange={onEsqlEditorInitialStateChange}
        esqlVariablesConfig={
          isEsqlMode
            ? {
                esqlVariables: esqlVariables ?? [],
                onSaveControl,
                controlsWrapper: (
                  <ControlGroupRenderer
                    query={query}
                    onApiAvailable={setControlGroupApi}
                    timeRange={timeRangeAbsolute}
                    getCreationOptions={async (initialState) => {
                      const initialChildControlState =
                        getActivePanels() ?? initialState.initialChildControlState ?? {};
                      return {
                        initialState: {
                          ...initialState,
                          initialChildControlState,
                        },
                      };
                    }}
                    viewMode="edit"
                  />
                ),
              }
            : undefined
        }
        esqlQueryStats={esqlQueryStats}
        onOpenQueryInNewTab={onOpenQueryInNewTab}
      />
      {isESQLToDataViewTransitionModalVisible && (
        <ESQLToDataViewTransitionModal onClose={onESQLToDataViewTransitionModalClose} />
      )}
      {isSaveModalVisible && (
        <DiscoverSessionSaveModalContainer
          initialCopyOnSave={initialCopyOnSave}
          onClose={onCloseSaveModal}
          onSaveCb={onSaveCbRef.current}
          services={services}
        />
      )}
    </span>
  );
};
