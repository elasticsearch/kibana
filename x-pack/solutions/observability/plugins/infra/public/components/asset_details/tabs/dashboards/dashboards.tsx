/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';

import { i18n } from '@kbn/i18n';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiSpacer,
  EuiEmptyPrompt,
  EuiLoadingLogo,
} from '@elastic/eui';

import type { DashboardApi, DashboardCreationOptions } from '@kbn/dashboard-plugin/public';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';

import type { DashboardSearchResponseBody } from '@kbn/dashboard-plugin/server';
import type { SerializableRecord } from '@kbn/utility-types';
import {
  ASSET_DETAILS_FLYOUT_LOCATOR_ID,
  ASSET_DETAILS_LOCATOR_ID,
} from '@kbn/observability-shared-plugin/common';
import { useLocation } from 'react-router-dom';
import { decode } from '@kbn/rison';
import { isEqual } from 'lodash';
import { isPending } from '../../../../hooks/use_fetcher';
import type { AssetDashboardLoadedParams } from '../../../../services/telemetry/types';
import { useKibanaContextForPlugin } from '../../../../hooks/use_kibana';
import { buildAssetIdFilter } from '../../../../utils/filters/build';
import type {
  InfraSavedCustomDashboard,
  DashboardItemWithTitle,
} from '../../../../../common/custom_dashboards';

import { EmptyDashboards } from './empty_dashboards';
import { EditDashboard, GotoDashboardLink, LinkDashboard, UnlinkDashboard } from './actions';
import { useFetchCustomDashboards } from '../../hooks/use_fetch_custom_dashboards';
import { useDatePickerContext } from '../../hooks/use_date_picker';
import { useAssetDetailsRenderPropsContext } from '../../hooks/use_asset_details_render_props';
import { useDashboardFetcher } from '../../hooks/use_dashboards_fetcher';
import { useDataViewsContext } from '../../hooks/use_data_views';
import { DashboardSelector } from './dashboard_selector';
import { ContextMenu } from './context_menu';
import { useAssetDetailsUrlState } from '../../hooks/use_asset_details_url_state';
import { FilterExplanationCallout } from './filter_explanation_callout';

export function Dashboards() {
  const { dateRange } = useDatePickerContext();
  const { entity, renderMode } = useAssetDetailsRenderPropsContext();
  const location = useLocation();
  const {
    services: { share, telemetry },
  } = useKibanaContextForPlugin();
  const [dashboard, setDashboard] = useState<DashboardApi | undefined>();
  const [customDashboards, setCustomDashboards] = useState<DashboardItemWithTitle[]>([]);
  const [currentDashboard, setCurrentDashboard] = useState<DashboardItemWithTitle>();
  const [trackingEventProperties, setTrackingEventProperties] = useState({});
  const { data: allAvailableDashboards, status } = useDashboardFetcher();
  const { metrics } = useDataViewsContext();
  const [urlState, setUrlState] = useAssetDetailsUrlState();
  const trackOnlyOnceTheSameDashboardFilters = React.useRef(false);

  const { dashboards, loading, reload } = useFetchCustomDashboards({ assetType: entity.type });

  useEffect(() => {
    trackOnlyOnceTheSameDashboardFilters.current = false;
    if (currentDashboard) {
      const currentEventTrackingProperties: AssetDashboardLoadedParams = {
        assetType: entity.type,
        state: currentDashboard.dashboardFilterAssetIdEnabled,
        filtered_by: currentDashboard.dashboardFilterAssetIdEnabled ? ['assetId'] : [],
      };
      if (isEqual(trackingEventProperties, currentEventTrackingProperties)) {
        trackOnlyOnceTheSameDashboardFilters.current = true;
        return;
      }

      setTrackingEventProperties(currentEventTrackingProperties);
      if (!trackOnlyOnceTheSameDashboardFilters.current) {
        telemetry.reportAssetDashboardLoaded(currentEventTrackingProperties);
      }
    }
  }, [entity.type, currentDashboard, telemetry, trackingEventProperties]);

  useEffect(() => {
    const allAvailableDashboardsMap = new Map<
      string,
      DashboardSearchResponseBody['data'][number]
    >();
    allAvailableDashboards.forEach((availableDashboard) => {
      allAvailableDashboardsMap.set(availableDashboard.id, availableDashboard);
    });
    const filteredCustomDashboards =
      dashboards?.reduce<DashboardItemWithTitle[]>(
        (result: DashboardItemWithTitle[], customDashboard: InfraSavedCustomDashboard) => {
          const matchedDashboard = allAvailableDashboardsMap.get(
            customDashboard.dashboardSavedObjectId
          );
          if (matchedDashboard) {
            result.push({
              title: matchedDashboard.data.title,
              ...customDashboard,
            });
          }
          return result;
        },
        []
      ) ?? [];
    setCustomDashboards(filteredCustomDashboards);
    // set a default dashboard if there is no selected dashboard
    if (!urlState?.dashboardId) {
      setUrlState({
        dashboardId:
          currentDashboard?.dashboardSavedObjectId ??
          filteredCustomDashboards[0]?.dashboardSavedObjectId,
      });
    }
  }, [
    allAvailableDashboards,
    currentDashboard?.dashboardSavedObjectId,
    dashboards,
    setUrlState,
    urlState?.dashboardId,
  ]);

  const getCreationOptions = useCallback((): Promise<DashboardCreationOptions> => {
    const getInitialInput = () => ({
      viewMode: 'view' as ViewMode,
      timeRange: { from: dateRange.from, to: dateRange.to },
    });
    return Promise.resolve<DashboardCreationOptions>({
      getInitialInput,
    });
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!dashboard) return;
    dashboard.setFilters(
      metrics.dataView && currentDashboard?.dashboardFilterAssetIdEnabled
        ? buildAssetIdFilter(entity.name, entity.type, metrics.dataView)
        : []
    );
    dashboard.setTimeRange({ from: dateRange.from, to: dateRange.to });
    dashboard.forceRefresh();
  }, [
    metrics.dataView,
    entity.name,
    dashboard,
    dateRange.from,
    dateRange.to,
    currentDashboard,
    entity.type,
  ]);

  const getLocatorParams = useCallback(
    (params: any, isFlyoutView: any) => {
      const searchParams = new URLSearchParams(location.search);
      const tableProperties = searchParams.get('tableProperties');
      const flyoutParams =
        isFlyoutView && tableProperties ? { tableProperties: decode(tableProperties) } : {};

      return {
        assetDetails: { ...urlState, dashboardId: params.dashboardId },
        entityType: entity.type,
        entityId: entity.id,
        ...flyoutParams,
      };
    },
    [entity.id, entity.type, location.search, urlState]
  );

  const locator = useMemo(() => {
    const isFlyoutView = renderMode.mode === 'flyout';

    const baseLocator = share.url.locators.get(
      isFlyoutView ? ASSET_DETAILS_FLYOUT_LOCATOR_ID : ASSET_DETAILS_LOCATOR_ID
    );

    if (!baseLocator) return;

    return {
      ...baseLocator,
      getRedirectUrl: (params: SerializableRecord) =>
        baseLocator.getRedirectUrl(getLocatorParams(params, isFlyoutView)),
      navigate: (params: SerializableRecord) =>
        baseLocator.navigate(getLocatorParams(params, isFlyoutView)),
    };
  }, [renderMode.mode, share.url.locators, getLocatorParams]);

  if ((loading || isPending(status)) && !dashboards?.length) {
    return (
      <EuiPanel hasBorder>
        <EuiEmptyPrompt
          icon={<EuiLoadingLogo logo="logoObservability" size="xl" />}
          title={
            <h4>
              {i18n.translate('xpack.infra.customDashboards.loadingCustomDashboards', {
                defaultMessage: 'Loading dashboard',
              })}
            </h4>
          }
        />
      </EuiPanel>
    );
  }

  return (
    <EuiPanel hasBorder>
      {!!dashboards?.length ? (
        <>
          <EuiFlexGroup justifyContent="spaceBetween" gutterSize="xs" alignItems="center">
            <EuiFlexItem grow>
              <EuiTitle size="s">
                <h3>{currentDashboard?.title}</h3>
              </EuiTitle>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <DashboardSelector
                currentDashboardId={urlState?.dashboardId}
                customDashboards={customDashboards}
                setCurrentDashboard={setCurrentDashboard}
                onRefresh={reload}
              />
            </EuiFlexItem>

            {currentDashboard && (
              <EuiFlexItem grow={false}>
                <ContextMenu
                  items={[
                    <LinkDashboard
                      newDashboardButton
                      onRefresh={reload}
                      customDashboards={customDashboards}
                      assetType={entity.type}
                    />,
                    <GotoDashboardLink currentDashboard={currentDashboard} />,
                    <EditDashboard
                      currentDashboard={currentDashboard}
                      onRefresh={reload}
                      assetType={entity.type}
                    />,
                    <UnlinkDashboard
                      currentDashboard={currentDashboard}
                      onRefresh={reload}
                      assetType={entity.type}
                    />,
                  ]}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
          {currentDashboard && (
            <>
              <EuiSpacer size="s" />
              <FilterExplanationCallout
                dashboardFilterAssetIdEnabled={currentDashboard.dashboardFilterAssetIdEnabled}
              />
            </>
          )}
          <EuiFlexItem grow>
            <EuiSpacer size="l" />
            {urlState?.dashboardId && (
              <DashboardRenderer
                savedObjectId={urlState?.dashboardId}
                getCreationOptions={getCreationOptions}
                onApiAvailable={setDashboard}
                locator={locator}
              />
            )}
          </EuiFlexItem>
        </>
      ) : (
        <EmptyDashboards
          actions={
            <LinkDashboard
              onRefresh={reload}
              customDashboards={customDashboards}
              assetType={entity.type}
            />
          }
        />
      )}
    </EuiPanel>
  );
}
