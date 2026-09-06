/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '@kbn/content-management-utils';
import { EmbeddablePackageState } from '@kbn/embeddable-plugin/public';
import { BehaviorSubject, debounceTime, merge } from 'rxjs';
import { v4 } from 'uuid';
import { DASHBOARD_APP_ID } from '../../common/constants';
import { getReferencesForControls, getReferencesForPanelId } from '../../common';
import type { DashboardState } from '../../common/types';
import { getDashboardContentManagementService } from '../services/dashboard_content_management_service';
import { LoadDashboardReturn } from '../services/dashboard_content_management_service/types';
import {
  CONTROL_GROUP_EMBEDDABLE_ID,
  initializeControlGroupManager,
} from './control_group_manager';
import { initializeDataLoadingManager } from './data_loading_manager';
import { initializeDataViewsManager } from './data_views_manager';
import { DEFAULT_DASHBOARD_STATE } from './default_dashboard_state';
import { getSerializedState } from './get_serialized_state';
import { initializeLayoutManager } from './layout_manager';
import { openSaveModal } from './save_modal/open_save_modal';
import { initializeSearchSessionManager } from './search_sessions/search_session_manager';
import { initializeSettingsManager } from './settings_manager';
import { initializeTrackContentfulRender } from './track_contentful_render';
import { initializeTrackOverlay } from './track_overlay';
import { initializeTrackPanel } from './track_panel';
import {
  DASHBOARD_API_TYPE,
  DashboardApi,
  DashboardCreationOptions,
  DashboardInternalApi,
} from './types';
import { initializeUnifiedSearchManager } from './unified_search_manager';
import { initializeUnsavedChangesManager } from './unsaved_changes_manager';
import { initializeViewModeManager } from './view_mode_manager';

export function getDashboardApi({
  creationOptions,
  incomingEmbeddable,
  initialState,
  savedObjectResult,
  savedObjectId,
}: {
  creationOptions?: DashboardCreationOptions;
  incomingEmbeddable?: EmbeddablePackageState | undefined;
  initialState: DashboardState;
  savedObjectResult?: LoadDashboardReturn;
  savedObjectId?: string;
}) {
  const fullScreenMode$ = new BehaviorSubject(creationOptions?.fullScreenMode ?? false);
  const isManaged = savedObjectResult?.managed ?? false;
  const savedObjectId$ = new BehaviorSubject<string | undefined>(savedObjectId);

  const viewModeManager = initializeViewModeManager(incomingEmbeddable, savedObjectResult);
  const trackPanel = initializeTrackPanel(async (id: string) => {
    await layoutManager.api.getChildApi(id);
  });

  const references$ = new BehaviorSubject<Reference[] | undefined>(initialState.references);
  const getReferences = (id: string) => {
    if (id === CONTROL_GROUP_EMBEDDABLE_ID) {
      return getReferencesForControls(references$.value ?? []);
    }
    return getReferencesForPanelId(id, references$.value ?? []);
  };

  const layoutManager = initializeLayoutManager(
    incomingEmbeddable,
    initialState.panels,
    trackPanel,
    getReferences
  );
  const controlGroupManager = initializeControlGroupManager(
    initialState.controlGroupInput,
    getReferences
  );
  const dataLoadingManager = initializeDataLoadingManager(layoutManager.api.children$);
  const dataViewsManager = initializeDataViewsManager(
    controlGroupManager.api.controlGroupApi$,
    layoutManager.api.children$
  );
  const settingsManager = initializeSettingsManager(initialState);
  const unifiedSearchManager = initializeUnifiedSearchManager(
    initialState,
    controlGroupManager.api.controlGroupApi$,
    settingsManager.api.timeRestore$,
    dataLoadingManager.internalApi.waitForPanelsToLoad$,
    () => unsavedChangesManager.internalApi.getLastSavedState(),
    creationOptions
  );
  const unsavedChangesManager = initializeUnsavedChangesManager({
    viewMode$: viewModeManager.api.viewMode$,
    storeUnsavedChanges: creationOptions?.useSessionStorageIntegration,
    controlGroupManager,
    lastSavedState: savedObjectResult?.dashboardInput ?? DEFAULT_DASHBOARD_STATE,
    layoutManager,
    savedObjectId$,
    settingsManager,
    unifiedSearchManager,
    getReferences,
  });

  function getState() {
    const { panels, references: panelReferences } = layoutManager.internalApi.serializeLayout();
    const { state: unifiedSearchState, references: searchSourceReferences } =
      unifiedSearchManager.internalApi.getState();
    const dashboardState: DashboardState = {
      ...settingsManager.api.getSettings(),
      ...unifiedSearchState,
      panels,
      viewMode: viewModeManager.api.viewMode$.value,
    };

    const { controlGroupInput, controlGroupReferences } =
      controlGroupManager.internalApi.serializeControlGroup();
    dashboardState.controlGroupInput = controlGroupInput;

    return {
      dashboardState,
      controlGroupReferences,
      panelReferences: panelReferences ?? [],
      searchSourceReferences,
    };
  }

  const trackOverlayApi = initializeTrackOverlay(trackPanel.setFocusedPanelId);

  const dashboardApi = {
    ...viewModeManager.api,
    ...dataLoadingManager.api,
    ...dataViewsManager.api,
    ...layoutManager.api,
    ...settingsManager.api,
    ...trackPanel,
    ...unifiedSearchManager.api,
    ...unsavedChangesManager.api,
    ...trackOverlayApi,
    ...initializeTrackContentfulRender(),
    ...controlGroupManager.api,
    executionContext: {
      type: 'dashboard',
      description: settingsManager.api.title$.value,
    },
    fullScreenMode$,
    getAppContext: () => {
      const embeddableAppContext = creationOptions?.getEmbeddableAppContext?.(savedObjectId$.value);
      return {
        ...embeddableAppContext,
        currentAppId: embeddableAppContext?.currentAppId ?? DASHBOARD_APP_ID,
      };
    },
    isEmbeddedExternally: Boolean(creationOptions?.isEmbeddedExternally),
    isManaged,
    reload$: merge(
      unifiedSearchManager.internalApi.controlGroupReload$,
      unifiedSearchManager.internalApi.panelsReload$
    ).pipe(debounceTime(0)),
    getSerializedState: () => getSerializedState(getState()),
    runInteractiveSave: async () => {
      trackOverlayApi.clearOverlays();
      const saveResult = await openSaveModal({
        isManaged,
        lastSavedId: savedObjectId$.value,
        viewMode: viewModeManager.api.viewMode$.value,
        ...getState(),
      });

      if (!saveResult || saveResult.error) {
        return;
      }

      if (saveResult) {
        references$.next(saveResult.references);
        unsavedChangesManager.internalApi.onSave(
          saveResult.savedState,
          saveResult.references ?? []
        );
        const settings = settingsManager.api.getSettings();
        settingsManager.api.setSettings({
          ...settings,
          hidePanelTitles: settings.hidePanelTitles ?? false,
          description: saveResult.savedState.description,
          tags: saveResult.savedState.tags,
          timeRestore: saveResult.savedState.timeRestore,
          title: saveResult.savedState.title,
        });
        savedObjectId$.next(saveResult.id);
      }

      return saveResult;
    },
    runQuickSave: async () => {
      if (isManaged) return;
      const { controlGroupReferences, dashboardState, panelReferences, searchSourceReferences } =
        getState();
      const saveResult = await getDashboardContentManagementService().saveDashboardState({
        controlGroupReferences,
        dashboardState,
        panelReferences,
        searchSourceReferences,
        saveOptions: {},
        lastSavedId: savedObjectId$.value,
      });

      if (saveResult?.error) return;
      references$.next(saveResult.references);
      unsavedChangesManager.internalApi.onSave(dashboardState, searchSourceReferences);

      return;
    },
    savedObjectId$,
    setFullScreenMode: (fullScreenMode: boolean) => fullScreenMode$.next(fullScreenMode),
    getSerializedStateForChild: (childId: string) => {
      return childId === CONTROL_GROUP_EMBEDDABLE_ID
        ? controlGroupManager.internalApi.getStateForControlGroup()
        : layoutManager.internalApi.getSerializedStateForPanel(childId);
    },
    setSavedObjectId: (id: string | undefined) => savedObjectId$.next(id),
    type: DASHBOARD_API_TYPE as 'dashboard',
    uuid: v4(),
  } as Omit<DashboardApi, 'searchSessionId$'>;

  const internalApi: DashboardInternalApi = {
    ...layoutManager.internalApi,
    ...unifiedSearchManager.internalApi,
    setControlGroupApi: controlGroupManager.internalApi.setControlGroupApi,
    untilControlsInitialized: controlGroupManager.internalApi.untilControlsInitialized,
  };

  const searchSessionManager = initializeSearchSessionManager(
    creationOptions?.searchSessionSettings,
    incomingEmbeddable,
    dashboardApi,
    internalApi
  );

  return {
    api: {
      ...dashboardApi,
      ...searchSessionManager.api,
    },
    internalApi,
    cleanup: () => {
      dataLoadingManager.cleanup();
      dataViewsManager.cleanup();
      searchSessionManager.cleanup();
      unifiedSearchManager.cleanup();
      unsavedChangesManager.cleanup();
    },
  };
}
