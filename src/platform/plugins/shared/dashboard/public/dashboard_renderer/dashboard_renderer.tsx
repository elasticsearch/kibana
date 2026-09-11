/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import classNames from 'classnames';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EuiFlyoutProps } from '@elastic/eui';
import {
  EuiEmptyPrompt,
  EuiLoadingElastic,
  EuiLoadingSpinner,
  useEuiPaddingSize,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { apm } from '@elastic/apm-rum';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/common';
import { useStateFromPublishingSubject } from '@kbn/presentation-publishing';
import type { LocatorPublic } from '@kbn/share-plugin/common';
import { ExitFullScreenButtonKibanaProvider } from '@kbn/shared-ux-button-exit-full-screen';

import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { DashboardLocatorParams } from '../../common';
import type { DashboardApi, DashboardInternalApi } from '../dashboard_api/types';
import type { DashboardCreationOptions } from '..';
import { loadDashboardApi } from '../dashboard_api/load_dashboard_api';
import { DashboardContext } from '../dashboard_api/use_dashboard_api';
import { DashboardInternalContext } from '../dashboard_api/use_dashboard_internal_api';
import type { DashboardRedirect } from '../dashboard_app/types';
import { getDashboardRecentlyAccessedService } from '../services/dashboard_recently_accessed_service';
import { coreServices, uiActionsService } from '../services/kibana_services';

import { Dashboard404Page } from './dashboard_404';
import { DashboardViewport } from './viewport/dashboard_viewport';
import { GlobalPrintStyles } from './print_styles';
import { DashboardControlsRenderer } from '../dashboard_controls_renderer';

/**
 * Props for the {@link DashboardRenderer} component.
 */
export interface DashboardRendererProps {
  /** Optional locator for dashboard navigation and URL generation. */
  locator?: Pick<LocatorPublic<DashboardLocatorParams>, 'navigate' | 'getRedirectUrl'>;
  /** The ID of the saved dashboard to load. If not provided, creates a new dashboard. */
  savedObjectId?: string;
  /** Whether to show a plain spinner instead of the Elastic loading animation. */
  showPlainSpinner?: boolean;
  /**
   * Flyout type for panel flyouts (Settings, Lens config, etc.) opened from this dashboard.
   * Use `overlay` when the dashboard is embedded in a host that already uses a push flyout
   * (e.g. Agent Builder canvas).
   */
  panelFlyoutType?: EuiFlyoutProps['type'];
  /** Callback for redirecting within the dashboard application. */
  dashboardRedirect?: DashboardRedirect;
  /** Function that returns the creation options for the dashboard. */
  getCreationOptions?: () => Promise<DashboardCreationOptions>;
  /**
   * Callback invoked when the dashboard API becomes available.
   *
   * @param api - The {@link DashboardApi} instance.
   * @param internalApi - The {@link DashboardInternalApi} instance.
   */
  onApiAvailable?: (api: DashboardApi, internalApi: DashboardInternalApi) => void;
  /**
   * Callback invoked when the dashboard API is destroyed.
   */
  onApiCleanup?: () => void;
}

export function DashboardRenderer({
  locator,
  savedObjectId,
  showPlainSpinner,
  panelFlyoutType,
  dashboardRedirect,
  getCreationOptions,
  onApiAvailable,
  onApiCleanup,
}: DashboardRendererProps) {
  const dashboardViewport = useRef(null);
  const dashboardContainerRef = useRef<HTMLElement | null>(null);
  const [dashboard, setDashboard] = useState<
    | {
        api: DashboardApi;
        internalApi: DashboardInternalApi;
        showControlGroup: boolean;
      }
    | undefined
  >();
  const [error, setError] = useState<Error | undefined>();

  const euiPaddingS = useEuiPaddingSize('s');
  const styles = useMemo(
    () => ({
      renderer: css({
        display: 'flex',
        flex: 'auto',
        width: '100%',
        flexDirection: 'column',
        '&.dashboardViewport--loading': {
          justifyContent: 'center',
          alignItems: 'center',
        },
        '& .controlGroup': {
          padding: `0 ${euiPaddingS}`,
        },
      }),
    }),
    [euiPaddingS]
  );

  useEffect(() => {
    /* In case the locator prop changes, we need to reassign the value in the container */
    if (dashboard?.api) dashboard.api.locator = locator;
  }, [dashboard?.api, locator]);

  useEffect(() => {
    if (
      dashboard &&
      dashboard?.internalApi.dashboardContainerRef$.value !== dashboardContainerRef.current
    ) {
      dashboard.internalApi.setDashboardContainerRef(dashboardContainerRef.current);
    }
  }, [dashboard]);

  useEffect(() => {
    if (error) setError(undefined);
    if (dashboard) setDashboard(undefined);

    let canceled = false;
    let cleanupDashboardApi: (() => void) | undefined;
    loadDashboardApi({ getCreationOptions, onApiCleanup, savedObjectId, panelFlyoutType })
      .then((results) => {
        if (!results) return;
        if (canceled) {
          results.cleanup();
          return;
        }

        cleanupDashboardApi = results.cleanup;
        setDashboard({
          api: results.api,
          internalApi: results.internalApi,
          showControlGroup: results.useControlsIntegration ?? true,
        });
        onApiAvailable?.(results.api, results.internalApi);
      })
      .catch((err) => {
        if (err instanceof SavedObjectNotFound && savedObjectId) {
          getDashboardRecentlyAccessedService().remove(savedObjectId);
          coreServices.chrome.recentlyAccessed.remove(savedObjectId);
        }
        if (!canceled) {
          apm.captureError(err, {
            labels: {
              error_type: 'LoadDashboardFailure',
            },
          });
          setError(err);
        }
      });

    return () => {
      cleanupDashboardApi?.();
      canceled = true;
    };
    // Disabling exhaustive deps because embeddable should only be created on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedObjectId]);

  const isDashboardViewportLoading = !dashboard && !error;

  const viewportClasses = classNames('dashboardViewport', {
    'dashboardViewport--loading': isDashboardViewportLoading,
  });

  const loadingSpinner = showPlainSpinner ? (
    <EuiLoadingSpinner size="xxl" className="kbnLoadingIndicator" />
  ) : (
    <EuiLoadingElastic size="xxl" className="kbnLoadingIndicator" />
  );

  const renderDashboardContents = () => {
    if (error) {
      return error instanceof SavedObjectNotFound ? (
        <Dashboard404Page dashboardRedirect={dashboardRedirect} />
      ) : (
        <EuiEmptyPrompt
          iconType="error"
          iconColor="danger"
          title={
            <h2>
              {i18n.translate('dashboard.dashboardRenderer.loadDashboardErrorTitle', {
                defaultMessage: 'Unable to load dashboard',
              })}
            </h2>
          }
          body={<p>{error.message}</p>}
        />
      );
    }

    return dashboard ? (
      <div
        data-test-subj="dashboardContainer"
        css={styles.renderer}
        ref={(e) => {
          if (dashboard.internalApi.dashboardContainerRef$.value !== e) {
            dashboard.internalApi.setDashboardContainerRef(e);
          }
          dashboardContainerRef.current = e;
        }}
      >
        <GlobalPrintStyles />
        <ExitFullScreenButtonKibanaProvider
          coreStart={{ chrome: coreServices.chrome, customBranding: coreServices.customBranding }}
        >
          <KibanaContextProvider services={{ uiActions: uiActionsService }}>
            <DashboardContext.Provider value={dashboard.api}>
              <DashboardInternalContext.Provider value={dashboard.internalApi}>
                {dashboard.showControlGroup && <DashboardControlsRenderer />}
                <DashboardViewport />
              </DashboardInternalContext.Provider>
            </DashboardContext.Provider>
          </KibanaContextProvider>
        </ExitFullScreenButtonKibanaProvider>
      </div>
    ) : (
      loadingSpinner
    );
  };

  return (
    <div ref={dashboardViewport} className={viewportClasses} css={styles.renderer}>
      {dashboardViewport?.current && dashboard && (
        <ParentClassController
          viewportRef={dashboardViewport.current}
          dashboardApi={dashboard.api}
        />
      )}
      {renderDashboardContents()}
    </div>
  );
}

/**
 * Maximizing a panel in Dashboard only works if the parent div has a certain class. This
 * small component listens to the Dashboard's expandedPanelId state and adds and removes
 * the class to whichever element renders the Dashboard.
 */
const ParentClassController = ({
  dashboardApi,
  viewportRef,
}: {
  dashboardApi: DashboardApi;
  viewportRef: HTMLDivElement;
}) => {
  const maximizedPanelId = useStateFromPublishingSubject(dashboardApi.expandedPanelId$);

  useLayoutEffect(() => {
    const parentDiv = viewportRef.parentElement;
    if (!parentDiv) return;

    if (maximizedPanelId) {
      parentDiv.classList.add('dshDashboardViewportWrapper');
    } else {
      parentDiv.classList.remove('dshDashboardViewportWrapper');
    }
  }, [maximizedPanelId, viewportRef.parentElement]);
  return null;
};
