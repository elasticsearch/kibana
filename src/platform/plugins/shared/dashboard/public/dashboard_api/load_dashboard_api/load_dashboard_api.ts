/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiFlyoutProps } from '@elastic/eui';
import { ContentInsightsClient } from '@kbn/content-management-content-insights-public';
import { asyncForEach } from '@kbn/std';

import { getLastSavedState } from '../../../common/default_dashboard_state';
import { dashboardClient } from '../../dashboard_client';
import { getPlacementHints } from '../../panel_placement/get_placement_hints';
import { getAccessControlClient } from '../../services/access_control_service';
import {
  getDashboardBackupService,
  initializeDashboardApiServices,
} from '../../services/dashboard_api_services';
import { coreServices } from '../../services/kibana_services';
import { logger } from '../../services/logger';
import { getDashboardUserActivityService } from '../../services/user_activity_service';
import { getDashboardApi } from '../get_dashboard_api';
import { DASHBOARD_DURATION_START_MARK } from '../telemetry/dashboard_duration_start_mark';
import { startTrackingDashboardLoadTelemetry } from '../telemetry/dashboard_load_telemetry';
import type { DashboardCreationOptions } from '../types';
import { getUserAccessControlData } from './get_user_access_control_data';
import { showWarningToast } from './show_warning_toast';
import { transformPanels } from './transform_panels';

export async function loadDashboardApi({
  getCreationOptions,
  onApiCleanup,
  savedObjectId,
  panelFlyoutType,
}: {
  getCreationOptions?: () => Promise<DashboardCreationOptions>;
  onApiCleanup?: () => void;
  savedObjectId?: string;
  panelFlyoutType?: EuiFlyoutProps['type'];
}) {
  const creationOptions = await getCreationOptions?.();

  // --------------------------------------------------------------------------------------
  // Determine sizes of incoming embeddables. Done here due to async fetching.
  // --------------------------------------------------------------------------------------
  const incomingEmbeddables = creationOptions?.getIncomingEmbeddables?.();
  await asyncForEach(incomingEmbeddables ?? [], async (embeddable) => {
    if (!embeddable.size) {
      embeddable.size = await getPlacementHints(embeddable.type, embeddable.serializedState);
    }
  });

  const [readResult, user, isAccessControlEnabled] = savedObjectId
    ? await Promise.all([
        dashboardClient.get(savedObjectId),
        getUserAccessControlData(),
        getAccessControlClient().isAccessControlEnabled(),
      ])
    : [undefined, undefined, undefined];

  const validationResult = readResult && creationOptions?.validateLoadedSavedObject?.(readResult);
  if (validationResult === 'invalid') {
    // throw error to stop the rest of Dashboard loading and make the factory throw an Error
    throw new Error('Dashboard failed saved object result validation');
  } else if (validationResult === 'redirected') {
    return;
  }

  if (readResult?.warnings?.length) {
    showWarningToast({ warnings: readResult.warnings });
  }

  await initializeDashboardApiServices();
  const unsavedChanges = creationOptions?.useSessionStorageIntegration
    ? getDashboardBackupService().getState(savedObjectId)
    : undefined;

  const { viewMode, ...overrideState } = creationOptions?.getInitialInput?.() ?? {};
  if (overrideState.panels) {
    overrideState.panels = await transformPanels(overrideState.panels, overrideState.references);
  }

  // Back up view mode passed in explicitly; do not back up preview mode because it should never be restored
  if (viewMode) {
    // && viewMode !== 'preview'
    getDashboardBackupService().storeViewMode(viewMode);
  }

  const { api, cleanup, internalApi } = getDashboardApi({
    creationOptions,
    panelFlyoutType,
    incomingEmbeddables,
    initialState: {
      ...getLastSavedState(readResult),
      ...unsavedChanges,
      ...overrideState,
    },
    readResult,
    savedObjectId,
    user,
    isAccessControlEnabled,
  });
  const userActivityService = getDashboardUserActivityService(api);

  const telemetrySubscription = startTrackingDashboardLoadTelemetry(api, {
    firstLoad: true,
    creationStartTime: performance.getEntriesByName(DASHBOARD_DURATION_START_MARK, 'mark')[0]
      ?.startTime,
  });

  if (savedObjectId && !incomingEmbeddables?.length) {
    // We count a new view every time a user opens a dashboard, both in view or edit mode
    // We don't count views when a user is editing a dashboard and is returning from an editor after saving
    // however, there is an edge case that we now count a new view when a user is editing a dashboard and is returning from an editor by canceling
    // TODO: this should be revisited by making embeddable transfer support canceling logic https://github.com/elastic/kibana/issues/190485
    api.userActivity$.next({ type: 'view', start: Date.now() });
    const contentInsightsClient = new ContentInsightsClient(
      { http: coreServices.http, logger },
      { domainId: 'dashboard' }
    );
    contentInsightsClient.track(savedObjectId, 'viewed');
  }

  return {
    api,
    cleanup: () => {
      cleanup();
      if (savedObjectId) {
        api.userActivity$.next({ type: 'view', end: Date.now() });
      }
      userActivityService.cleanup();
      if (onApiCleanup) {
        onApiCleanup();
      }
      telemetrySubscription.unsubscribe();
    },
    internalApi,
    useControlsIntegration: creationOptions?.useControlsIntegration,
  };
}
