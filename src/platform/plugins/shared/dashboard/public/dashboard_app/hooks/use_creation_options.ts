/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScopedHistory } from '@kbn/core-application-browser';
import type { EmbeddablePackageState } from '@kbn/embeddable-plugin/public';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { History } from 'history';
import { useCallback } from 'react';

import type { DashboardState } from '../../../common/types';
import { DASHBOARD_APP_ID } from '../../../common/page_bundle_constants';
import type { DashboardCreationOptions } from '../..';
import { coreServices, screenshotModeService } from '../../services/kibana_services';
import { DASHBOARD_STATE_STORAGE_KEY, createDashboardEditUrl } from '../../utils/urls';
import { DASHBOARD_AS_CODE_FILTERS_FEATURE_FLAG } from '../../dashboard_constants';
import type { DashboardEmbedSettings } from '../types';
import {
  createSessionRestorationDataProvider,
  getSearchSessionIdFromURL,
  getSessionURLObservable,
  removeSearchSessionIdFromURL,
} from '../url/search_sessions_integration';
import { extractDashboardState, loadAndRemoveDashboardState } from '../url';

type IncomingEmbeddables = EmbeddablePackageState[] | undefined;

interface UseCreationOptionsProps {
  history: History;
  getScopedHistory: () => ScopedHistory;
  kbnUrlStateStorage: IKbnUrlStateStorage;
  embedSettings?: DashboardEmbedSettings;
  incomingEmbeddables: IncomingEmbeddables;
  validateOutcome: DashboardCreationOptions['validateLoadedSavedObject'];
}

export const useCreationOptions = ({
  history,
  getScopedHistory,
  kbnUrlStateStorage,
  embedSettings,
  incomingEmbeddables,
  validateOutcome,
}: UseCreationOptionsProps) => {
  return useCallback((): Promise<DashboardCreationOptions> => {
    const searchSessionIdFromURL = getSearchSessionIdFromURL(history);

    const getInitialInput = () => {
      const scopedHistory = getScopedHistory();
      const rawLocationState = scopedHistory.location.state;

      let stateFromLocator: Partial<DashboardState> = {};
      try {
        stateFromLocator = extractDashboardState(rawLocationState);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Unable to extract dashboard state from locator. Error: ', e);
      }

      let initialUrlState: Partial<DashboardState> = {};
      try {
        initialUrlState = loadAndRemoveDashboardState(kbnUrlStateStorage);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Unable to extract dashboard state from URL. Error: ', e);
      }

      // Locator / navigateToApp store dashboard fields on `history.state`, which survives a full
      // reload. After merging them into the initial input, clear `location.state` so a refresh
      // does not re-apply stale overrides.
      if (Object.keys(stateFromLocator).length > 0) {
        try {
          scopedHistory.replace({
            ...scopedHistory.location,
            state: undefined,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Unable to strip consumed locator state from history. Error: ', e);
        }
      }

      return {
        // State loaded from the dashboard app URL and from the locator overrides all other dashboard state.
        ...initialUrlState,
        ...stateFromLocator,

        // if print mode is active, force viewMode.PRINT
        ...(screenshotModeService.isScreenshotMode() &&
        screenshotModeService.getScreenshotContext('layout') === 'print'
          ? { viewMode: 'print' as ViewMode }
          : {}),
      };
    };

    const useAsCodeFilters = coreServices.featureFlags.getBooleanValue(
      DASHBOARD_AS_CODE_FILTERS_FEATURE_FLAG,
      false
    );

    return Promise.resolve<DashboardCreationOptions>({
      getIncomingEmbeddables: () => incomingEmbeddables,

      // integrations
      useSessionStorageIntegration: true,
      useUnifiedSearchIntegration: true,
      // Hide the control group from the dashboard renderer; the dashboard app handles displaying
      // pinned controls in the top nav instead
      useControlsIntegration: false,
      unifiedSearchSettings: {
        kbnUrlStateStorage,
        useAsCodeFilters,
      },
      useSearchSessionsIntegration: true,
      searchSessionSettings: {
        createSessionRestorationDataProvider,
        sessionIdToRestore: searchSessionIdFromURL,
        sessionIdUrlChangeObservable: getSessionURLObservable(history),
        getSearchSessionIdFromURL: () => getSearchSessionIdFromURL(history),
        removeSessionIdFromUrl: () => removeSearchSessionIdFromURL(kbnUrlStateStorage),
      },
      getInitialInput,
      validateLoadedSavedObject: validateOutcome,
      fullScreenMode:
        kbnUrlStateStorage.get<{ fullScreenMode?: boolean }>(DASHBOARD_STATE_STORAGE_KEY)
          ?.fullScreenMode ?? false,
      isEmbeddedExternally: Boolean(embedSettings),
      getEmbeddableAppContext: (dashboardId) => ({
        currentAppId: DASHBOARD_APP_ID,
        getCurrentPath: () => `#${createDashboardEditUrl(dashboardId)}`,
      }),
    });
  }, [
    history,
    embedSettings,
    validateOutcome,
    getScopedHistory,
    kbnUrlStateStorage,
    incomingEmbeddables,
  ]);
};
