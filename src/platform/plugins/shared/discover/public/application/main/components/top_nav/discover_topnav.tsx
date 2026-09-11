/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { ControlGroupRenderer, type ControlGroupRendererApi } from '@kbn/control-group-renderer';
import { DataViewType, type DataView, type DataViewSpec } from '@kbn/data-views-plugin/public';
import {
  DiscoverFlyouts,
  dismissAllFlyoutsExceptFor,
  prepareDataViewForEditing,
} from '@kbn/discover-utils';
import type { ESQLEditorRestorableState } from '@kbn/esql-editor';
import { useESQLQueryStats } from '@kbn/esql/public';
import { type Query, type TimeRange, type AggregateQuery, isEmptyEsqlQuery } from '@kbn/es-query';
import type { DataViewPickerProps, UnifiedSearchDraft } from '@kbn/unified-search-plugin/public';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DiscoverSessionSaveModalContainer } from './save_discover_session';
import { useDiscoverTopNav } from './use_discover_topnav';
import { useESQLVariables } from './use_esql_variables';
import type { UpdateESQLQueryFn } from '../../../../context_awareness/types';
import { FetchStatus } from '../../../types';
import { useDataState } from '../../hooks/use_data_state';

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
  const esqlApproximation = useAppStateSelector((state) => state.esqlApproximation ?? false);
  const esqlVariables = useCurrentTabSelector((tab) => tab.esqlVariables);
  const { timeRangeAbsolute } = useCurrentTabSelector((tab) => tab.dataRequestParams);
  const refreshInterval = useCurrentTabSelector((state) => state.globalState.refreshInterval);
  const timeRangeRelative = useCurrentTabSelector((state) => state.globalState.timeRange);
  const filters = useCurrentTabSelector(selectTabCombinedFilters);

  const { savedDataViews, adHocDataViews } = useDataViewsForPicker();
  const dataView = useCurrentDataView();
  const persistedDiscoverSession = useInternalStateSelector(
    (state) => state.persistedDiscoverSession
  );
  const isEsqlMode = useIsEsqlMode();
  const showDatePicker = useMemo(() => {
    if (dataView.type === DataViewType.ROLLUP) {
      return false;
    }
    return { disabled: !dataView.isTimeBased() };
  }, [dataView]);

  const closeFieldEditor = useRef<() => void | undefined>();

  const onQuerySubmitAction = useCurrentTabAction(internalStateActions.onQuerySubmit);

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

  const onUseApproximationChange = useCallback(
    (nextValue: boolean) => {
      dispatch(updateAppState({ appState: { esqlApproximation: nextValue } }));
    },
    [dispatch, updateAppState]
  );

  const dataStateContainer = useCurrentTabDataStateContainer();
  const esqlQueryStats = useESQLQueryStats(
    isEsqlMode,
    dataStateContainer.inspectorAdapters.requests
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
  const mainDataState = useDataState(dataStateContainer.data$.main$);
  const isUninitializedEsqlTab =
    isEsqlMode && mainDataState.fetchStatus === FetchStatus.UNINITIALIZED;
  const [isLiveEsqlEmpty, setIsLiveEsqlEmpty] = useState(() => isEmptyEsqlQuery(query));

  useEffect(() => {
    setIsLiveEsqlEmpty(isEmptyEsqlQuery(query));
  }, [currentTabId, query]);

  const onQueryChange = useCallback(({ query: nextQuery }: { query?: Query | AggregateQuery }) => {
    setIsLiveEsqlEmpty(isEmptyEsqlQuery(nextQuery));
  }, []);

  const disableEmptyEsqlControls = isUninitializedEsqlTab && isLiveEsqlEmpty;
  const emptyEsqlQueryDisabledTooltip = disableEmptyEsqlControls
    ? i18n.translate('discover.topNav.emptyEsqlQueryDisabledTooltip', {
        defaultMessage: 'Enter an ES|QL query to enable this.',
      })
    : undefined;
  const datePicker =
    typeof showDatePicker === 'object'
      ? {
          disabled: showDatePicker.disabled || disableEmptyEsqlControls,
          disabledTooltip: emptyEsqlQueryDisabledTooltip,
        }
      : showDatePicker;
  const esqlEditorInitialState = useMemo(
    () =>
      isUninitializedEsqlTab
        ? {
            ...esqlEditorUiState,
            isHistoryOpen: esqlEditorUiState?.isHistoryOpen ?? true,
          }
        : esqlEditorUiState,
    [esqlEditorUiState, isUninitializedEsqlTab]
  );
  const onQuerySubmit = useCallback(
    (payload: { dateRange: TimeRange; query?: AggregateQuery | Query }, isUpdate?: boolean) => {
      if (isEmptyEsqlQuery(payload.query)) {
        return;
      }
      if (isUninitializedEsqlTab) {
        onEsqlEditorInitialStateChange({
          ...esqlEditorUiState,
          isHistoryOpen: false,
        });
      }
      dispatch(onQuerySubmitAction({ payload, isUpdate }));
    },
    [
      dispatch,
      esqlEditorUiState,
      isUninitializedEsqlTab,
      onEsqlEditorInitialStateChange,
      onQuerySubmitAction,
    ]
  );

  const textBasedLanguageModeErrors = useMemo(
    () => (esqlModeErrors ? [esqlModeErrors] : undefined),
    [esqlModeErrors]
  );

  const { topNavBadges, topNavMenu, shareAction } = useDiscoverTopNav({
    onOpenSaveModal,
    onOpenSaveAsModal,
    persistedDiscoverSession,
  });

  const shouldHideDefaultDataviewPicker =
    !!searchBarCustomization?.CustomDataViewPicker || !!searchBarCustomization?.hideDataViewPicker;

  return (
    <span>
      <DiscoverTopNavMenu
        topNavBadges={topNavBadges}
        topNavMenu={topNavMenu}
        shareAction={shareAction}
      />
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
        disableSubmitAction={disableEmptyEsqlControls}
        disableSubmitActionTooltip={emptyEsqlQueryDisabledTooltip}
        onQueryChange={onQueryChange}
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
        showDatePicker={datePicker}
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
        esqlEditorInitialState={esqlEditorInitialState}
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
        esqlApproximation={
          isEsqlMode
            ? {
                isApproximate: esqlApproximation,
                onChange: onUseApproximationChange,
                additionalText: i18n.translate('discover.esqlApproximationToggle.additionalText', {
                  defaultMessage: 'Only applies to queries that use one STATS command.',
                }),
                disabled: disableEmptyEsqlControls,
                disabledTooltip: emptyEsqlQueryDisabledTooltip,
              }
            : undefined
        }
      />
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
