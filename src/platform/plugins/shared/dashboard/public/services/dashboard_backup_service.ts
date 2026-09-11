/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Storage } from '@kbn/kibana-utils-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';
import { set } from '@kbn/safer-lodash-set';
import type { SpacesApi } from '@kbn/spaces-plugin/public';
import { isEqual } from 'lodash';
import { firstValueFrom } from 'rxjs';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

export const DASHBOARD_PANELS_UNSAVED_ID = 'unsavedDashboard';
const DASHBOARD_VIEWMODE_LOCAL_KEY = 'dashboardViewMode';
const DASHBOARD_STATE_SESSION_KEY = 'dashboardStateManagerPanels';

export type DashboardBackupState = Partial<DashboardState> & {
  viewMode?: ViewMode;
};

export interface DashboardBackupService {
  clearState: (id?: string) => void;
  getState: (id: string | undefined) => DashboardBackupState | undefined;
  setState: (id: string | undefined, backupState: DashboardBackupState) => void;
  getViewMode: () => ViewMode;
  storeViewMode: (viewMode: ViewMode) => void;
  getDashboardIdsWithUnsavedChanges: () => string[];
  dashboardHasUnsavedEdits: (id?: string) => boolean;
}

function hasUnsavedEdits(backupState?: DashboardBackupState) {
  return backupState
    ? backupState.viewMode === 'edit' &&
        Object.keys(backupState).some(
          (stateKey) => stateKey !== 'viewMode' && stateKey !== 'references'
        )
    : false;
}

export const createDashboardBackupService = async (
  spacesService?: SpacesApi
): Promise<DashboardBackupService> => {
  const sessionStore = new Storage(sessionStorage);
  const localStore = new Storage(localStorage);

  const activeSpaceId = await (async () => {
    if (spacesService) return (await firstValueFrom(spacesService.getActiveSpace$())).id;
    return 'default';
  })();

  let dashboardIDsWithUnsavedChanges: string[] = [];
  const getUnsavedDashboardChanges = (): { [key: string]: DashboardBackupState } =>
    sessionStore.get(DASHBOARD_STATE_SESSION_KEY)?.[activeSpaceId] ?? {};

  /**
   * The backup service is a non path-critical service that interacts with browser capabilities.
   * There is potential for errors, and when an error is encountered we want to swallow the error
   * semi-silently and log a warning instead.
   */
  const warnOnErrors = <ReturnType extends unknown>(
    attemptFunction: () => ReturnType
  ): ReturnType | undefined => {
    try {
      return attemptFunction();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Error encountered in Dashboard backup service', e);
    }
  };

  return {
    getViewMode: () => localStore.get(DASHBOARD_VIEWMODE_LOCAL_KEY) ?? 'view',
    storeViewMode: (viewMode: ViewMode) => {
      warnOnErrors(() => localStore.set(DASHBOARD_VIEWMODE_LOCAL_KEY, viewMode));
    },
    clearState: (dashboardId = DASHBOARD_PANELS_UNSAVED_ID) => {
      warnOnErrors(() => {
        const allSpaces = sessionStore.get(DASHBOARD_STATE_SESSION_KEY) ?? {};
        const dashboards = getUnsavedDashboardChanges();
        if (dashboards[dashboardId]) {
          delete dashboards[dashboardId];
          sessionStore.set(DASHBOARD_STATE_SESSION_KEY, {
            ...allSpaces,
            [activeSpaceId]: dashboards,
          });
        }
      });
    },
    getState: (dashboardId = DASHBOARD_PANELS_UNSAVED_ID) => {
      return warnOnErrors(() => getUnsavedDashboardChanges()[dashboardId]);
    },
    setState: (dashboardId = DASHBOARD_PANELS_UNSAVED_ID, backupState: DashboardBackupState) => {
      return warnOnErrors(() => {
        const allSpaces = sessionStore.get(DASHBOARD_STATE_SESSION_KEY) ?? {};
        set(allSpaces, [activeSpaceId, dashboardId], backupState);
        sessionStore.set(DASHBOARD_STATE_SESSION_KEY, allSpaces);
      });
    },
    getDashboardIdsWithUnsavedChanges: () => {
      return (
        warnOnErrors(() => {
          const unsavedDashboards = getUnsavedDashboardChanges();
          const nextDashboardIdsWithUnsavedChanges = Object.keys(unsavedDashboards).filter((id) =>
            hasUnsavedEdits(unsavedDashboards[id])
          );
          if (!isEqual(nextDashboardIdsWithUnsavedChanges, dashboardIDsWithUnsavedChanges)) {
            dashboardIDsWithUnsavedChanges = nextDashboardIdsWithUnsavedChanges;
          }
          return dashboardIDsWithUnsavedChanges;
        }) ?? []
      );
    },
    dashboardHasUnsavedEdits: (id = DASHBOARD_PANELS_UNSAVED_ID) =>
      warnOnErrors(() => hasUnsavedEdits(getUnsavedDashboardChanges()[id])) ?? false,
  };
};
