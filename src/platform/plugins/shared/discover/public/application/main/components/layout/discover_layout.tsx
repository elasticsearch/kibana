/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiProgress,
  EuiDelayRender,
  useEuiBreakpoint,
  useEuiTheme,
  mathWithUnits,
  type UseEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { hasTransformationalCommand } from '@kbn/esql-utils';
import { useDragDropContext } from '@kbn/dom-drag-drop';
import { DataViewType, type DataView, type DataViewField } from '@kbn/data-views-plugin/public';
import {
  ErrorCallout,
  SHOW_FIELD_STATISTICS,
  SORT_DEFAULT_ORDER_SETTING,
} from '@kbn/discover-utils';
import type { UseColumnsProps } from '@kbn/unified-data-table';
import { useColumns } from '@kbn/unified-data-table';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import { BehaviorSubject } from 'rxjs';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { kbnFullBodyHeightCss } from '@kbn/css-utils/public/full_body_height_css';
import { TABS_BAR_HEIGHT } from '@kbn/unified-tabs';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useDiscoverCustomizationContext } from '../../../../customizations';
import { VIEW_MODE } from '../../../../../common/constants';
import { useAppStateSelector } from '../../state_management/redux';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { DiscoverNoResults } from '../no_results';
import { LoadingSpinner } from '../loading_spinner/loading_spinner';
import { DiscoverSidebarResponsive } from '../sidebar';
import type { DiscoverTopNavProps } from '../top_nav/discover_topnav';
import { DiscoverTopNav } from '../top_nav/discover_topnav';
import { getResultState } from '../../utils/get_result_state';
import { DiscoverUninitialized } from '../uninitialized/uninitialized';
import type { DataMainMsg } from '../../state_management/discover_data_state_container';
import type { SidebarToggleState } from '../../../types';
import { FetchStatus } from '../../../types';
import { useDataState } from '../../hooks/use_data_state';
import { SavedSearchURLConflictCallout } from '../../../../components/saved_search_url_conflict_callout/saved_search_url_conflict_callout';
import { addLog } from '../../../../utils/add_log';
import { DiscoverResizableLayout } from './discover_resizable_layout';
import { PanelsToggle } from '../../../../components/panels_toggle';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';
import {
  internalStateActions,
  useCurrentDataView,
  useCurrentTabAction,
  useCurrentTabSelector,
  useCurrentTabDataStateContainer,
  useInternalStateDispatch,
  useInternalStateSelector,
} from '../../state_management/redux';
import { DiscoverHistogramLayout } from './discover_histogram_layout';
import type { DiscoverLayoutRestorableState } from './discover_layout_restorable_state';
import { useScopedServices } from '../../../../components/scoped_services_provider';
import { useIsChromeNextProjectHeader } from '../chrome_app_header';

const queryClient = new QueryClient();
const SidebarMemoized = React.memo(DiscoverSidebarResponsive);

const TopNavMemoized = React.memo((props: DiscoverTopNavProps) => (
  // QueryClientProvider is used to allow querying the authorized rules api hook
  <QueryClientProvider client={queryClient}>
    <DiscoverTopNav {...props} />
  </QueryClientProvider>
));

export function DiscoverLayout() {
  const {
    core,
    docLinks,
    trackUiMetric,
    capabilities,
    dataViews,
    data,
    uiSettings,
    filterManager,
    history,
    spaces,
    observabilityAIAssistant,
    dataVisualizer: dataVisualizerService,
    fieldsMetadata,
  } = useDiscoverServices();
  const customizationContext = useDiscoverCustomizationContext();
  const { scopedEBTManager } = useScopedServices();
  const dispatch = useInternalStateDispatch();
  const updateAppState = useCurrentTabAction(internalStateActions.updateAppState);
  const styles = useMemoCss(componentStyles);
  const { euiTheme } = useEuiTheme();
  const globalQueryState = data.query.getState();
  const dataStateContainer = useCurrentTabDataStateContainer();
  const isChromeNextProjectHeader = useIsChromeNextProjectHeader();

  const { main$ } = dataStateContainer.data$;
  const [query, savedQuery, columns, sort, grid] = useAppStateSelector((state) => [
    state.query,
    state.savedQuery,
    state.columns,
    state.sort,
    state.grid,
  ]);
  const isEsqlMode = useIsEsqlMode();
  const viewMode: VIEW_MODE = useAppStateSelector((state) => {
    const fieldStatsNotAvailable =
      !uiSettings.get(SHOW_FIELD_STATISTICS) && !!dataVisualizerService;
    if (state.viewMode === VIEW_MODE.AGGREGATED_LEVEL && fieldStatsNotAvailable) {
      return VIEW_MODE.DOCUMENT_LEVEL;
    }
    return state.viewMode ?? VIEW_MODE.DOCUMENT_LEVEL;
  });
  const dataView = useCurrentDataView();
  const dataViewLoading = useCurrentTabSelector((state) => state.isDataViewLoading);
  const dataState: DataMainMsg = useDataState(main$);
  const discoverSession = useInternalStateSelector((state) => state.persistedDiscoverSession);

  const fetchCounter = useRef<number>(0);

  useEffect(() => {
    if (dataState.fetchStatus === FetchStatus.LOADING) {
      fetchCounter.current++;
    }
  }, [dataState.fetchStatus]);

  // We treat rollup v1 data views as non time based in Discover, since we query them
  // in a non time based way using the regular _search API, since the internal
  // representation of those documents does not have the time field that _field_caps
  // reports us.
  const isTimeBased = useMemo(() => {
    return dataView.type !== DataViewType.ROLLUP && dataView.isTimeBased();
  }, [dataView]);

  const resultState = useMemo(
    () => getResultState(dataState.fetchStatus, dataState.foundDocuments ?? false),
    [dataState.fetchStatus, dataState.foundDocuments]
  );

  const setAppState = useCallback<UseColumnsProps['setAppState']>(
    ({ settings, ...rest }) => {
      dispatch(updateAppState({ appState: { ...rest, grid: settings as DiscoverGridSettings } }));
    },
    [dispatch, updateAppState]
  );

  const {
    columns: currentColumns,
    onAddColumn,
    onRemoveColumn,
  } = useColumns({
    capabilities,
    defaultOrder: uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
    dataView,
    dataViews,
    setAppState,
    columns,
    sort,
    settings: grid,
  });

  const onAddColumnWithTracking = useCallback(
    (columnName: string) => {
      onAddColumn(columnName);
      void scopedEBTManager.trackDataTableSelection({ fieldName: columnName, fieldsMetadata });
    },
    [onAddColumn, scopedEBTManager, fieldsMetadata]
  );

  const onRemoveColumnWithTracking = useCallback(
    (columnName: string) => {
      onRemoveColumn(columnName);
      void scopedEBTManager.trackDataTableRemoval({ fieldName: columnName, fieldsMetadata });
    },
    [onRemoveColumn, scopedEBTManager, fieldsMetadata]
  );

  // The assistant is getting the state from the url correctly
  // expect from the index pattern where we have only the dataview id
  useEffect(() => {
    return observabilityAIAssistant?.service.setScreenContext({
      screenDescription: `The user is looking at the Discover view on the ${
        isEsqlMode ? 'ES|QL' : 'dataView'
      } mode. The index pattern is the ${dataView.getIndexPattern()}`,
    });
  }, [dataView, isEsqlMode, observabilityAIAssistant?.service]);

  const addFilter = useCurrentTabAction(internalStateActions.addFilter);
  const onAddFilter = useCallback<DocViewFilterFn>(
    (field, values, operation) => {
      dispatch(addFilter({ field, value: values, mode: operation }));
    },
    [addFilter, dispatch]
  );

  const canSetBreakdownField = useMemo(
    () =>
      isOfAggregateQueryType(query)
        ? dataView?.isTimeBased() && !hasTransformationalCommand(query.esql)
        : true,
    [dataView, query]
  );

  const onAddBreakdownField = useCallback(
    (field: DataViewField | undefined) => {
      dispatch(updateAppState({ appState: { breakdownField: field?.name } }));
    },
    [dispatch, updateAppState]
  );

  const updateAdHocDataViewId = useCurrentTabAction(internalStateActions.updateAdHocDataViewId);
  const onFieldEdited: (options: {
    editedDataView: DataView;
    removedFieldName?: string;
  }) => Promise<void> = useCallback(
    async (options) => {
      const { editedDataView, removedFieldName } = options || {
        editedDataView: dataView,
      };
      if (removedFieldName && currentColumns.includes(removedFieldName)) {
        onRemoveColumn(removedFieldName);
      }
      if (!editedDataView.isPersisted()) {
        await dispatch(
          updateAdHocDataViewId({
            editedDataView,
          })
        );
      }
      if (editedDataView?.id) {
        // `tab.uiState.fieldListExistingFieldsInfo` needs to be reset when user edits fields,
        // otherwise the edited field would be shown under "Empty" section in the sidebar
        // when switching to a tab with the same data view id.
        dispatch(
          internalStateActions.resetAffectedFieldListExistingFieldsInfoUiState({
            dataViewId: editedDataView.id,
          })
        );
      }
      dataStateContainer.refetch$.next('reset');
    },
    [dataView, dataStateContainer, currentColumns, onRemoveColumn, dispatch, updateAdHocDataViewId]
  );

  const onDisableFilters = useCallback(() => {
    const disabledFilters = filterManager
      .getFilters()
      .map((filter) => ({ ...filter, meta: { ...filter.meta, disabled: true } }));
    filterManager.setFilters(disabledFilters);
  }, [filterManager]);

  const contentCentered = resultState === 'uninitialized' || resultState === 'none';
  const documentState = useDataState(dataStateContainer.data$.documents$);

  const esqlModeWarning = useMemo(() => {
    if (isEsqlMode) {
      return documentState.esqlHeaderWarning;
    }
  }, [documentState.esqlHeaderWarning, isEsqlMode]);

  const esqlModeErrors = useMemo(() => {
    if (isEsqlMode) {
      return dataState.error;
    }
  }, [dataState.error, isEsqlMode]);

  const [{ dragging }] = useDragDropContext();
  const draggingFieldName = dragging?.id;

  const onDropFieldToTable = useMemo(() => {
    if (!draggingFieldName || currentColumns.includes(draggingFieldName)) {
      return undefined;
    }

    return () => onAddColumnWithTracking(draggingFieldName);
  }, [onAddColumnWithTracking, draggingFieldName, currentColumns]);

  const [sidebarToggleState$] = useState<BehaviorSubject<SidebarToggleState>>(
    () => new BehaviorSubject<SidebarToggleState>({ isCollapsed: false, toggle: () => {} })
  );

  const mainDisplay = useMemo(() => {
    if (resultState === 'uninitialized') {
      addLog('[DiscoverLayout] uninitialized triggers data fetching');
      return <DiscoverUninitialized onRefresh={() => dataStateContainer.fetch()} />;
    }

    return (
      <>
        <DiscoverHistogramLayout
          dataView={dataView}
          columns={currentColumns}
          viewMode={viewMode}
          onAddFilter={onAddFilter}
          onFieldEdited={onFieldEdited}
          onDropFieldToTable={onDropFieldToTable}
          sidebarToggleState$={sidebarToggleState$}
        />
        {resultState === 'loading' && <LoadingSpinner />}
      </>
    );
  }, [
    resultState,
    dataView,
    currentColumns,
    viewMode,
    onAddFilter,
    onFieldEdited,
    onDropFieldToTable,
    sidebarToggleState$,
    dataStateContainer,
  ]);

  const isLoading =
    documentState.fetchStatus === FetchStatus.LOADING ||
    documentState.fetchStatus === FetchStatus.PARTIAL;

  const onCancelClick = useCallback(() => {
    dataStateContainer.cancel();
  }, [dataStateContainer]);

  const layoutUiState = useCurrentTabSelector((state) => state.uiState.layout);
  const setLayoutUiState = useCurrentTabAction(internalStateActions.setLayoutUiState);
  const onInitialStateChange = useCallback(
    (newLayoutUiState: Partial<DiscoverLayoutRestorableState>) => {
      dispatch(
        setLayoutUiState({
          layoutUiState: newLayoutUiState,
        })
      );
    },
    [dispatch, setLayoutUiState]
  );

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

  const fullBodyHeightOffset = useMemo(() => {
    const isStandalone = customizationContext.displayMode === 'standalone';
    if (isChromeNextProjectHeader && isStandalone) {
      return mathWithUnits(euiTheme.size.xxl, (x) => x * 3);
    }

    return `${TABS_BAR_HEIGHT + 1}px`;
  }, [customizationContext.displayMode, euiTheme.size.xxl, isChromeNextProjectHeader]);

  return (
    <EuiPage
      className="dscPage" // class is used in tests and other styles
      data-test-subj="dscPage"
      data-fetch-counter={fetchCounter.current}
      direction="column"
      css={[
        styles.dscPage,
        css`
          ${useEuiBreakpoint(['m', 'l', 'xl'])} {
            ${kbnFullBodyHeightCss(fullBodyHeightOffset)}
          }
        `,
      ]}
    >
      <TopNavMemoized
        savedQuery={savedQuery}
        esqlModeErrors={esqlModeErrors}
        esqlModeWarning={esqlModeWarning}
        onFieldEdited={onFieldEdited}
        isLoading={isLoading}
        onCancelClick={onCancelClick}
      />
      <EuiPageBody css={styles.pageBody}>
        <div css={styles.sidebarContainer}>
          {dataViewLoading && (
            <EuiDelayRender delay={300}>
              <EuiProgress size="xs" color="accent" position="absolute" />
            </EuiDelayRender>
          )}
          <SavedSearchURLConflictCallout
            discoverSession={discoverSession}
            spaces={spaces}
            history={history}
          />
          <DiscoverResizableLayout
            sidebarToggleState$={sidebarToggleState$}
            sidebarPanel={
              <SidebarMemoized
                columns={currentColumns}
                documents$={dataStateContainer.data$.documents$}
                onAddBreakdownField={canSetBreakdownField ? onAddBreakdownField : undefined}
                onAddField={onAddColumnWithTracking}
                onAddFilter={onAddFilter}
                onChangeDataView={onChangeDataView}
                onDataViewCreated={onDataViewCreated}
                onFieldEdited={onFieldEdited}
                onRemoveField={onRemoveColumnWithTracking}
                selectedDataView={dataView}
                sidebarToggleState$={sidebarToggleState$}
                trackUiMetric={trackUiMetric}
              />
            }
            mainPanel={
              <div css={styles.dscPageContentWrapper}>
                {resultState === 'none' ? (
                  <>
                    <div css={styles.mainPanel}>
                      <PanelsToggle
                        sidebarToggleState$={sidebarToggleState$}
                        omitChartButton
                        omitTableButton
                        dataTestSubjSuffix="InPage"
                      />
                    </div>
                    {dataState.error ? (
                      <ErrorCallout
                        title={i18n.translate(
                          'discover.noResults.searchExamples.noResultsErrorTitle',
                          {
                            defaultMessage: 'Unable to retrieve search results',
                          }
                        )}
                        error={dataState.error}
                        isEsqlMode={isEsqlMode}
                        showErrorDialog={({ title, error }) =>
                          core.notifications.showErrorDialog({ title, error })
                        }
                        esqlReferenceHref={docLinks.links.query.queryESQL}
                      />
                    ) : (
                      <DiscoverNoResults
                        isTimeBased={isTimeBased}
                        query={globalQueryState.query}
                        filters={globalQueryState.filters}
                        dataView={dataView}
                        onDisableFilters={onDisableFilters}
                      />
                    )}
                  </>
                ) : (
                  <EuiPanel
                    role="main"
                    paddingSize="none"
                    borderRadius="none"
                    hasShadow={false}
                    hasBorder={false}
                    color="transparent"
                    css={[styles.dscPageContent, contentCentered && styles.dscPageContentCentered]}
                  >
                    {mainDisplay}
                  </EuiPanel>
                )}
              </div>
            }
            initialState={layoutUiState}
            onInitialStateChange={onInitialStateChange}
          />
        </div>
      </EuiPageBody>
    </EuiPage>
  );
}

const componentStyles = {
  dscPage: ({ euiTheme }: UseEuiTheme) =>
    css({
      overflow: 'visible',
      padding: 0,
      backgroundColor: euiTheme.colors.backgroundBasePlain,
    }),
  pageBody: css({
    overflow: 'hidden',
  }),
  sidebarContainer: css({
    width: '100%',
    height: '100%',
    display: 'flex',
    flex: '1 1 auto',
  }),
  mainPanel: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: euiTheme.size.s,
    }),
  dscPageContentWrapper: css({
    overflow: 'hidden', // Ensures horizontal scroll of table
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  }),
  dscPageContent: css({
    position: 'relative',
    overflow: 'hidden',
    height: '100%',
  }),
  dscPageContentCentered: css({
    width: 'auto',
    height: 'auto',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    flexGrow: 0,
  }),
};
