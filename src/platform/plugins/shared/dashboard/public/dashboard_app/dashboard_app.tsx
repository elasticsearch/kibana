/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { useExecutionContext } from '@kbn/kibana-react-plugin/public';
import { createKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { History } from 'history';
import React, { useEffect, useMemo, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { debounceTime } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { DashboardApi } from '..';
import { DASHBOARD_APP_ID } from '../../common/page_bundle_constants';
import { DashboardRenderer } from '../dashboard_renderer/dashboard_renderer';
import { DashboardTopNav } from '../dashboard_top_nav';
import {
  coreServices,
  dataService,
  embeddableService,
  shareService,
} from '../services/kibana_services';
import { DASHBOARD_STATE_STORAGE_KEY } from '../utils/urls';
import { useCreationOptions } from './hooks/use_creation_options';
import { useDashboardMountContext } from './hooks/dashboard_mount_context';
import { useDashboardOutcomeValidation } from './hooks/use_dashboard_outcome_validation';
import { useObservabilityAIAssistantContext } from './hooks/use_observability_ai_assistant_context';
import {
  DashboardAppNoDataPage,
  isDashboardAppInNoDataState,
} from './no_data/dashboard_app_no_data';
import { DashboardTabTitleSetter } from './tab_title_setter/dashboard_tab_title_setter';
import type { DashboardRedirect } from './types';
import { type DashboardEmbedSettings } from './types';
import { startSyncingExpandedPanelState } from './url';
import type { DashboardInternalApi } from '../dashboard_api/types';

export interface DashboardAppProps {
  history: History;
  savedDashboardId?: string;
  redirectTo: DashboardRedirect;
  embedSettings?: DashboardEmbedSettings;
  expandedPanelId?: string;
  setDashboardAppApi: (api: DashboardApi | undefined) => void;
}

export function DashboardApp({
  savedDashboardId,
  embedSettings,
  redirectTo,
  history,
  expandedPanelId,
  setDashboardAppApi,
}: DashboardAppProps) {
  const [showNoDataPage, setShowNoDataPage] = useState<boolean>(false);
  const [regenerateId, setRegenerateId] = useState(uuidv4());
  const incomingEmbeddables = useMemo(() => {
    return embeddableService
      .getStateTransfer()
      .getIncomingEmbeddablePackage(DASHBOARD_APP_ID, true);
  }, []);

  useEffect(() => {
    let canceled = false;
    if (savedDashboardId || incomingEmbeddables?.length) {
      return;
    }

    isDashboardAppInNoDataState()
      .then((isInNotDataState) => {
        if (!canceled && isInNotDataState) {
          setShowNoDataPage(true);
        }
      })
      .catch((error) => {
        // show dashboard application if inNoDataState can not be determined
      });

    return () => {
      canceled = true;
    };
  }, [incomingEmbeddables, savedDashboardId]);
  const [dashboardApi, setDashboardApi] = useState<DashboardApi | undefined>(undefined);
  const [dashboardInternalApi, setDashboardInternalApi] = useState<
    DashboardInternalApi | undefined
  >(undefined);
  const showPlainSpinner = useObservable(coreServices.customBranding.hasCustomBranding$, false);
  const { scopedHistory: getScopedHistory } = useDashboardMountContext();
  const isPlaylistPlayback = new URLSearchParams(history.location.search).has('playlistId');

  useObservabilityAIAssistantContext({
    dashboardApi,
  });

  useExecutionContext(coreServices.executionContext, {
    type: 'application',
    page: 'app',
    id: savedDashboardId || 'new',
  });

  const kbnUrlStateStorage = useMemo(
    () =>
      createKbnUrlStateStorage({
        history,
        useHash: coreServices.uiSettings.get('state:storeInSessionStorage'),
      }),
    [history]
  );

  /**
   * Clear search session when leaving dashboard route
   */
  useEffect(() => {
    return () => {
      dataService.search.session.clear();
    };
  }, []);

  /**
   * Handle incoming embeddables from the state transfer service received after the dashboard has already loaded
   * This can happen if a modal or popup makes use of state transfers and redirects to add panels to a dashboard,
   * but it tries to add them to the dashboard the user is already looking at. e.g. the AI agent chat sidebar works this way
   */
  useEffect(() => {
    if (!dashboardApi) return;
    const embeddableStateTransferSubscription = embeddableService
      .getStateTransfer()
      .onTransferEmbeddablePackage$(DASHBOARD_APP_ID, true)
      .subscribe((lateEmbeddables) => {
        if (lateEmbeddables?.length) {
          // If a panel is expanded, minimize it so that the user can see the newly added embeddables
          if (dashboardApi.expandedPanelId$.value) {
            dashboardApi.expandPanel(dashboardApi.expandedPanelId$.value);
          }
          dashboardApi.addIncomingEmbeddables(lateEmbeddables);
          dashboardApi.setViewMode('edit');
        }
      });

    return () => embeddableStateTransferSubscription.unsubscribe();
  }, [dashboardApi, history, savedDashboardId]);

  /**
   * Validate saved object load outcome
   */
  const { validateOutcome, getLegacyConflictWarning } = useDashboardOutcomeValidation();
  const getCreationOptions = useCreationOptions({
    history,
    getScopedHistory,
    kbnUrlStateStorage,
    embedSettings,
    incomingEmbeddables,
    validateOutcome,
    isPlaylistPlayback,
  });

  useEffect(() => {
    if (!dashboardApi) return;
    const { stopWatchingExpandedPanel } = startSyncingExpandedPanelState({ dashboardApi, history });
    return () => stopWatchingExpandedPanel();
  }, [dashboardApi, history]);

  /**
   * When the dashboard container is created, or re-created, start syncing dashboard state with the URL
   */
  useEffect(() => {
    if (!dashboardApi) return;
    const appStateSubscription = kbnUrlStateStorage
      .change$(DASHBOARD_STATE_STORAGE_KEY)
      .pipe(debounceTime(10)) // debounce URL updates so react has time to unsubscribe when changing URLs
      .subscribe(() => {
        const rawAppStateInUrl = kbnUrlStateStorage.get<unknown>(DASHBOARD_STATE_STORAGE_KEY);
        if (rawAppStateInUrl) setRegenerateId(uuidv4());
      });
    return () => appStateSubscription.unsubscribe();
  }, [dashboardApi, kbnUrlStateStorage, savedDashboardId]);

  const locator = useMemo(() => shareService?.url.locators.get(DASHBOARD_APP_LOCATOR), []);

  return showNoDataPage ? (
    <DashboardAppNoDataPage onDataViewCreated={() => setShowNoDataPage(false)} />
  ) : (
    <>
      {dashboardApi && dashboardInternalApi && (
        <>
          <DashboardTabTitleSetter dashboardApi={dashboardApi} />
          <DashboardTopNav
            key={dashboardApi.uuid}
            redirectTo={redirectTo}
            embedSettings={embedSettings}
            dashboardApi={dashboardApi}
            dashboardInternalApi={dashboardInternalApi}
          />
        </>
      )}

      {getLegacyConflictWarning?.()}
      <DashboardRenderer
        key={regenerateId}
        locator={locator}
        onApiAvailable={(dashboard, dashboardInternal) => {
          setDashboardAppApi(dashboard);
          if (dashboard && dashboard.uuid !== dashboardApi?.uuid) {
            setDashboardApi(dashboard);
            setDashboardInternalApi(dashboardInternal);
            if (expandedPanelId) {
              dashboard?.expandPanel(expandedPanelId);
            }
          }
        }}
        onApiCleanup={() => {
          setDashboardAppApi(undefined);
        }}
        dashboardRedirect={redirectTo}
        savedObjectId={savedDashboardId}
        showPlainSpinner={showPlainSpinner}
        getCreationOptions={getCreationOptions}
      />
    </>
  );
}
