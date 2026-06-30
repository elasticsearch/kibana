/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { BehaviorSubject, firstValueFrom, map, merge, skip } from 'rxjs';
import { CellActionsProvider } from '@kbn/cell-actions';
import { generateFilters } from '@kbn/data-plugin/public';
import { SEARCH_EMBEDDABLE_TYPE } from '@kbn/discover-utils';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import { FilterStateStore } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { FetchContext } from '@kbn/presentation-publishing';
import {
  initializeTimeRangeManager,
  initializeTitleManager,
  initializeStateApi,
  timeRangeComparators,
  titleComparators,
  useBatchedPublishingSubjects,
} from '@kbn/presentation-publishing';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import type { SearchResponseIncompleteWarning } from '@kbn/search-response-warnings/src/types';
import useObservable from 'react-use/lib/useObservable';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DocViewerApi } from '@kbn/unified-doc-viewer';
import { ON_APPLY_FILTER, ON_OPEN_PANEL_MENU } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { getSearchEmbeddableDefaults } from './get_search_embeddable_defaults';
import {
  getDiscoverSessionEmbeddableComparators,
  getSearchEmbeddableComparators,
} from './utils/get_search_embeddable_comparators';
import type { DiscoverServices } from '../build_services';
import { SearchEmbeddablFieldStatsTableComponent } from './components/search_embeddable_field_stats_table_component';
import { SearchEmbeddableGridComponent } from './components/search_embeddable_grid_component';
import { SearchEmbeddableInlineEditHoverActions } from './components/search_embeddable_inline_edit_hover_actions';
import { SearchEmbeddableDeletedTabPrompt } from './components/search_embeddable_deleted_tab_prompt';
import { SearchEmbeddableMissingDataViewPrompt } from './components/search_embeddable_missing_data_view_prompt';
import { initializeEditApi } from './initialize_edit_api';
import { initializeFetch, isEsqlMode } from './initialize_fetch';
import { initializeInlineEditingApi } from './initialize_inline_editing_api';
import { initializeSearchEmbeddableApi } from './initialize_search_embeddable_api';
import type { SearchEmbeddableApi, SearchEmbeddablePanelApiState } from './types';
import { deserializeState, serializeState } from './utils/serialization_utils';
import { createInMemoryContextAwarenessToolkit } from '../context_awareness';
import { ScopedServicesProvider } from '../components/scoped_services_provider';
import { isFieldStatsMode } from './utils/is_field_stats_mode';
import { isTabDeleted } from './utils/is_tab_deleted';

export const getSearchEmbeddableFactory = ({
  startServices,
  discoverServices,
}: {
  startServices: {
    executeTriggerActions: (triggerId: string, context: object) => Promise<void>;
    isEditable: () => boolean;
  };
  discoverServices: DiscoverServices;
}) => {
  const { save, hasLibraryItemWithTitle } = discoverServices.savedSearch;

  const savedSearchEmbeddableFactory: EmbeddablePublicDefinition<
    SearchEmbeddablePanelApiState,
    SearchEmbeddableApi
  > = {
    type: SEARCH_EMBEDDABLE_TYPE,
    buildEmbeddable: async ({
      initializeDrilldownsManager,
      initialState,
      finalizeApi,
      parentApi,
      uuid,
    }) => {
      const embeddableTransformsEnabled =
        discoverServices.discoverFeatureFlags.getEmbeddableTransformsEnabled();

      const runtimeState = await deserializeState({
        serializedState: initialState,
        discoverServices,
      });

      /** One Discover context awareness */
      const solutionNavId =
        runtimeState.nonPersistedDisplayOptions?.solutionNavIdOverride ??
        (await firstValueFrom(discoverServices.core.chrome.getActiveSolutionNavId$()));

      await discoverServices.profilesManager.resolveRootProfile({
        solutionNavId,
      });

      /** Specific by-reference state */
      const savedObjectId$ = new BehaviorSubject<string | undefined>(runtimeState?.savedObjectId);
      const defaultTitle$ = new BehaviorSubject<string | undefined>(runtimeState?.savedObjectTitle);
      const defaultDescription$ = new BehaviorSubject<string | undefined>(
        runtimeState?.savedObjectDescription
      );
      const selectedTabId$ = new BehaviorSubject<string | undefined>(runtimeState.selectedTabId);

      const tabs = runtimeState.tabs ?? [];

      const defaultState = embeddableTransformsEnabled
        ? { selected_tab_id: tabs[0]?.id }
        : {
            selectedTabId: tabs[0]?.id,
            sort: [],
            grid: {},
            ...getSearchEmbeddableDefaults(discoverServices.uiSettings),
          };

      /** All other state */
      const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);
      const dataLoading$ = new BehaviorSubject<boolean | undefined>(true);
      const fetchContext$ = new BehaviorSubject<FetchContext | undefined>(undefined);
      const fetchWarnings$ = new BehaviorSubject<SearchResponseIncompleteWarning[]>([]);
      const refreshTrigger$ = new BehaviorSubject<void>(undefined);

      /** Build API */
      const titleManager = initializeTitleManager(runtimeState);
      const timeRangeManager = initializeTimeRangeManager(runtimeState);
      const drilldownsManager = initializeDrilldownsManager(uuid, runtimeState);
      const searchEmbeddable = await initializeSearchEmbeddableApi({
        initialState: runtimeState,
        dataLoading$,
        discoverServices,
      });

      const serialize = (savedObjectId?: string) =>
        serializeState({
          uuid,
          initialState: runtimeState,
          savedSearch: searchEmbeddable.api.savedSearch$.getValue(),
          serializeTitles: titleManager.getLatestState,
          serializeTimeRange: timeRangeManager.getLatestState,
          serializeDynamicActions: drilldownsManager.getLatestState,
          savedObjectId,
          selectedTabId: selectedTabId$.getValue(),
          embeddableTransformsEnabled,
        });

      const inlineEditingApi = initializeInlineEditingApi({
        uuid,
        parentApi,
        tabs,
        analytics: discoverServices.analytics,
        selectedTabId$,
        savedObjectId$,
        searchEmbeddable,
        blockingError$,
        dataLoading$,
      });

      const stateApi = initializeStateApi<SearchEmbeddablePanelApiState>({
        uuid,
        parentApi,
        defaultState,
        serializeState: () => serialize(savedObjectId$.getValue()),
        anyStateChange$: merge(
          drilldownsManager.anyStateChange$,
          searchEmbeddable.anyStateChange$,
          titleManager.anyStateChange$,
          timeRangeManager.anyStateChange$,
          selectedTabId$.pipe(
            skip(1),
            map(() => undefined)
          ),
          inlineEditingApi.anyStateChange$
        ),
        getComparators: () => {
          const isByValue = !savedObjectId$.getValue();
          const shouldSkipTabComparators =
            isTabDeleted(selectedTabId$.getValue(), tabs) || inlineEditingApi.isEditing();

          return {
            ...drilldownsManager.comparators,
            ...titleComparators,
            ...timeRangeComparators,
            ...(embeddableTransformsEnabled
              ? getDiscoverSessionEmbeddableComparators(isByValue, shouldSkipTabComparators)
              : getSearchEmbeddableComparators(isByValue, shouldSkipTabComparators)),
            nonPersistedDisplayOptions: 'skip',
          };
        },
        applySerializedState: async (nextState) => {
          drilldownsManager.reinitializeState(nextState);
          timeRangeManager.reinitializeState(nextState);
          titleManager.reinitializeState(nextState);

          const nextRuntimeState = await deserializeState({
            serializedState: nextState,
            discoverServices,
          });

          selectedTabId$.next(nextRuntimeState.selectedTabId);
          await searchEmbeddable.reinitializeState(nextRuntimeState);
          inlineEditingApi.stopInlineEditing();
        },
      });

      const getSelectedTabId = () =>
        inlineEditingApi.draftSelectedTabId$.getValue() ?? selectedTabId$.getValue();

      const editApi = initializeEditApi({
        uuid,
        parentApi,
        partialApi: { ...searchEmbeddable.api, fetchContext$, savedObjectId$, getSelectedTabId },
        discoverServices,
        isEditable: startServices.isEditable,
        getTitle: () => titleManager.api.title$.getValue(),
      });

      const api: SearchEmbeddableApi = finalizeApi({
        ...stateApi,
        ...titleManager.api,
        ...searchEmbeddable.api,
        ...timeRangeManager.api,
        ...drilldownsManager.api,
        ...editApi,
        ...(editApi && savedObjectId$.getValue()
          ? {
              onEdit: inlineEditingApi.startInlineEditing,
              overrideHoverActions$: inlineEditingApi.overrideHoverActions$,
              OverriddenHoverActionsComponent: () => (
                <SearchEmbeddableInlineEditHoverActions
                  draftSelectedTabId$={inlineEditingApi.draftSelectedTabId$}
                  tabs={tabs}
                  onEditInDiscover={editApi.onEdit}
                  onSelectTab={inlineEditingApi.previewInlineTabSelection}
                />
              ),
            }
          : {}),
        dataLoading$,
        blockingError$,
        savedObjectId$,
        getSelectedTabId,
        defaultTitle$,
        defaultDescription$,
        hasTimeRange: () => {
          const fetchContext = fetchContext$.getValue();
          return fetchContext?.timeslice !== undefined || fetchContext?.timeRange !== undefined;
        },
        getTypeDisplayName: () =>
          i18n.translate('discover.embeddable.search.displayName', {
            defaultMessage: 'Discover session',
          }),
        canLinkToLibrary: async () => {
          return (
            discoverServices.capabilities.discover_v2.save && !Boolean(savedObjectId$.getValue())
          );
        },
        canUnlinkFromLibrary: async () => Boolean(savedObjectId$.getValue()),
        saveToLibrary: async (title: string) => {
          const description = titleManager.api.description$.getValue();
          const savedObjectId = await save({
            ...api.savedSearch$.getValue(),
            title,
            ...(description && { description }),
          });
          defaultTitle$.next(title);
          defaultDescription$.next(description);
          return savedObjectId!;
        },
        hasLibraryItemWithTitle,
        getSerializedStateByValue: () => serialize(undefined),
        getSerializedStateByReference: (newId: string) => serialize(newId),
        getInspectorAdapters: () => searchEmbeddable.stateManager.inspectorAdapters.getValue(),
        supportedTriggers: () => {
          return [ON_OPEN_PANEL_MENU];
        },
      });

      const addFilter: DocViewFilterFn = async (mapping, values, operation) => {
        const dataView = api.dataViews$.getValue()?.[0];
        if (!dataView || !mapping) {
          return;
        }

        let newFilters = generateFilters(
          discoverServices.filterManager,
          mapping,
          values,
          operation,
          dataView
        );
        newFilters = newFilters.map((filter) => ({
          ...filter,
          $state: { store: FilterStateStore.APP_STATE },
        }));

        await startServices.executeTriggerActions(ON_APPLY_FILTER, {
          embeddable: api,
          filters: newFilters,
        });
      };

      const enableFilters = runtimeState.nonPersistedDisplayOptions?.enableFilters !== false;
      const enableDocumentViewer =
        runtimeState.nonPersistedDisplayOptions?.enableDocumentViewer !== false;

      const expandedDoc$ = new BehaviorSubject<DataTableRecord | undefined>(undefined);
      const initialDocViewerTabId$ = new BehaviorSubject<string | undefined>(undefined);

      const setExpandedDoc = (
        doc: DataTableRecord | undefined,
        options?: { initialTabId?: string }
      ) => {
        expandedDoc$.next(doc);
        initialDocViewerTabId$.next(options?.initialTabId);
      };

      const toolkit = createInMemoryContextAwarenessToolkit({
        profileStateRegistry: discoverServices.profileStateRegistry,
        actions: {
          addFilter: enableFilters ? addFilter : undefined,
          refreshData: () => refreshTrigger$.next(undefined),
          setExpandedDoc: enableDocumentViewer ? setExpandedDoc : undefined,
        },
      });

      const scopedEbtManager = discoverServices.ebtManager.createScopedEBTManager();
      const scopedProfilesManager = discoverServices.profilesManager.createScopedProfilesManager({
        scopedEbtManager,
        toolkit,
      });

      const unsubscribeFromFetch = initializeFetch({
        api: {
          ...api,
          parentApi,
          ...titleManager.api,
          ...timeRangeManager.api,
          defaultTitle$,
          savedSearch$: searchEmbeddable.api.savedSearch$,
          dataViews$: searchEmbeddable.api.dataViews$,
          savedObjectId$,
          dataLoading$,
          blockingError$,
          fetchContext$,
          fetchWarnings$,
        },
        discoverServices,
        stateManager: searchEmbeddable.stateManager,
        scopedProfilesManager,
        refreshTrigger$,
        setDataLoading: (dataLoading: boolean | undefined) => dataLoading$.next(dataLoading),
        setBlockingError: (error: Error | undefined) => blockingError$.next(error),
      });

      return {
        api,
        Component: () => {
          const [
            savedSearch,
            dataViews,
            isInlineEditing,
            draftSelectedTabId,
            selectedTabId,
            isInlineEditDirty,
          ] = useBatchedPublishingSubjects(
            api.savedSearch$,
            api.dataViews$,
            inlineEditingApi.isInlineEditing$,
            inlineEditingApi.draftSelectedTabId$,
            selectedTabId$,
            inlineEditingApi.inlineEditDirty$
          );

          const expandedDoc = useObservable(expandedDoc$, expandedDoc$.getValue());
          const initialDocViewerTabId = useObservable(
            initialDocViewerTabId$,
            initialDocViewerTabId$.getValue()
          );
          const docViewerRef = useRef<DocViewerApi>(null);

          useEffect(() => {
            if (initialDocViewerTabId) {
              docViewerRef.current?.setSelectedTabId(initialDocViewerTabId);
            }
          }, [initialDocViewerTabId]);

          useEffect(() => {
            return () => {
              drilldownsManager.cleanup();
              searchEmbeddable.cleanup();
              unsubscribeFromFetch();
            };
          }, []);

          const selectedTabIdForDisplay = isInlineEditing
            ? draftSelectedTabId ?? selectedTabId
            : selectedTabId;
          const isSelectedTabDeletedForDisplay = isTabDeleted(selectedTabIdForDisplay, tabs);
          const hasPendingInlineTabChanges = isInlineEditing && isInlineEditDirty;

          const dataView = useMemo(() => dataViews?.[0], [dataViews]);

          const renderAsFieldStatsTable = useMemo(
            () => isFieldStatsMode(savedSearch, dataView, discoverServices.uiSettings),
            [savedSearch, dataView]
          );

          if (isSelectedTabDeletedForDisplay) {
            return (
              <SearchEmbeddableDeletedTabPrompt
                api={api}
                canShowDashboardWriteControls={Boolean(
                  discoverServices.capabilities.dashboard_v2?.showWriteControls
                )}
                inlineEditing={{
                  hasPendingChanges: hasPendingInlineTabChanges,
                  isActive: isInlineEditing,
                  onApply: inlineEditingApi.applyInlineTabSelection,
                  onCancel: inlineEditingApi.cancelInlineTabSelection,
                }}
              />
            );
          }

          if (!dataView) {
            return (
              <SearchEmbeddableMissingDataViewPrompt
                api={api}
                canShowDashboardWriteControls={Boolean(
                  discoverServices.capabilities.dashboard_v2?.showWriteControls
                )}
                inlineEditing={{
                  hasPendingChanges: hasPendingInlineTabChanges,
                  isActive: isInlineEditing,
                  onApply: inlineEditingApi.applyInlineTabSelection,
                  onCancel: inlineEditingApi.cancelInlineTabSelection,
                }}
                isByReference={Boolean(savedObjectId$.getValue())}
                onEditInDiscover={editApi?.onEdit}
              />
            );
          }

          return (
            <KibanaRenderContextProvider {...discoverServices.core}>
              <KibanaContextProvider services={discoverServices}>
                <ScopedServicesProvider
                  scopedProfilesManager={scopedProfilesManager}
                  scopedEBTManager={scopedEbtManager}
                >
                  {renderAsFieldStatsTable ? (
                    <SearchEmbeddablFieldStatsTableComponent
                      api={{
                        ...api,
                        fetchContext$,
                      }}
                      dataView={dataView!}
                      onAddFilter={
                        isEsqlMode(savedSearch) || !enableFilters ? undefined : addFilter
                      }
                      stateManager={searchEmbeddable.stateManager}
                    />
                  ) : (
                    <CellActionsProvider
                      getTriggerCompatibleActions={
                        discoverServices.uiActions.getTriggerCompatibleActions
                      }
                    >
                      <SearchEmbeddableGridComponent
                        api={{ ...api, fetchWarnings$, fetchContext$ }}
                        dataView={dataView!}
                        onAddFilter={enableFilters ? addFilter : undefined}
                        enableDocumentViewer={enableDocumentViewer}
                        expandedDoc={enableDocumentViewer ? expandedDoc : undefined}
                        initialDocViewerTabId={
                          enableDocumentViewer ? initialDocViewerTabId : undefined
                        }
                        docViewerRef={docViewerRef}
                        setExpandedDoc={enableDocumentViewer ? setExpandedDoc : undefined}
                        inlineEditing={{
                          isActive: isInlineEditing,
                          hasPendingChanges: hasPendingInlineTabChanges,
                          onApply: inlineEditingApi.applyInlineTabSelection,
                          onCancel: inlineEditingApi.cancelInlineTabSelection,
                        }}
                        stateManager={searchEmbeddable.stateManager}
                      />
                    </CellActionsProvider>
                  )}
                </ScopedServicesProvider>
              </KibanaContextProvider>
            </KibanaRenderContextProvider>
          );
        },
      };
    },
  };

  return savedSearchEmbeddableFactory;
};
