/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, {
  type PropsWithChildren,
  type ReactElement,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { createHtmlPortalNode, type HtmlPortalNode, InPortal } from 'react-reverse-portal';
import type { UnifiedHistogramPartialLayoutProps } from '@kbn/unified-histogram';
import { UnifiedHistogramChart, useUnifiedHistogram } from '@kbn/unified-histogram';
import { useChartStyles } from '@kbn/unified-histogram/components/chart/hooks/use_chart_styles';
import { useServicesBootstrap } from '@kbn/unified-histogram/hooks/use_services_bootstrap';
import type { UnifiedMetricsGridRestorableState } from '@kbn/unified-chart-section-viewer';
import { KibanaSectionErrorBoundary } from '@kbn/shared-ux-error-boundary';
import { i18n } from '@kbn/i18n';
import { useProfileAccessor } from '../../../../context_awareness';
import { DiscoverCustomizationProvider } from '../../../../customizations';
import {
  CurrentTabProvider,
  type RuntimeStateManager,
  RuntimeStateProvider,
  selectTabRuntimeState,
  internalStateActions,
  useInternalStateSelector,
  useInternalStateDispatch,
  useRuntimeState,
  useCurrentTabSelector,
  useCurrentTabAction,
  useRuntimeStateManager,
} from '../../state_management/redux';
import { ScopedServicesProvider } from '../../../../components/scoped_services_provider';
import { useUnifiedHistogramRuntimeState } from './use_unified_histogram_runtime_state';
import { useUnifiedHistogramCommon } from './use_unified_histogram_common';
import type { ChartSectionConfiguration } from '../../../../context_awareness/types';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';

export type ChartPortalNode = HtmlPortalNode;
export type ChartPortalNodes = Record<string, ChartPortalNode>;

export const ChartPortalsRenderer = ({
  runtimeStateManager,
  children,
}: PropsWithChildren<{
  runtimeStateManager: RuntimeStateManager;
}>) => {
  const allTabIds = useInternalStateSelector((state) => state.tabs.allIds);
  const currentTabId = useInternalStateSelector((state) => state.tabs.unsafeCurrentId);
  const chartPortalNodes = useRef<ChartPortalNodes>({});

  chartPortalNodes.current = updatePortals(chartPortalNodes.current, allTabIds);

  return (
    <>
      {Object.keys(chartPortalNodes.current).map((tabId) => {
        return (
          <InPortal key={tabId} node={chartPortalNodes.current[tabId]}>
            <UnifiedHistogramGuard tabId={tabId} runtimeStateManager={runtimeStateManager} />
          </InPortal>
        );
      })}
      <CurrentTabProvider
        currentTabId={currentTabId}
        currentChartPortalNode={chartPortalNodes.current[currentTabId]}
      >
        {children}
      </CurrentTabProvider>
    </>
  );
};

const updatePortals = (portals: ChartPortalNodes, tabsIds: string[]) =>
  tabsIds.reduce<ChartPortalNodes>(
    (acc, tabId) => ({
      ...acc,
      [tabId]: portals[tabId] || createHtmlPortalNode({ attributes: { class: 'eui-fullHeight' } }),
    }),
    {}
  );

interface UnifiedHistogramGuardProps {
  tabId: string;
  runtimeStateManager: RuntimeStateManager;
  panelsToggle?: ReactElement;
}

const UnifiedHistogramGuard = ({
  tabId,
  runtimeStateManager,
  panelsToggle,
}: UnifiedHistogramGuardProps) => {
  const isSelected = useInternalStateSelector((state) => state.tabs.unsafeCurrentId === tabId);
  const currentTabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
  const currentCustomizationService = useRuntimeState(currentTabRuntimeState.customizationService$);
  const currentDataStateContainer = useRuntimeState(currentTabRuntimeState.dataStateContainer$);
  const currentScopedProfilesManager = useRuntimeState(
    currentTabRuntimeState.scopedProfilesManager$
  );
  const currentScopedEbtManager = useRuntimeState(currentTabRuntimeState.scopedEbtManager$);
  const currentDataSource = useRuntimeState(currentTabRuntimeState.currentDataSource$);
  const adHocDataViews = useRuntimeState(runtimeStateManager.adHocDataViews$);
  const isInitialized = useRef(false);

  if (
    (!isSelected && !isInitialized.current) ||
    !currentCustomizationService ||
    !currentDataStateContainer ||
    !currentDataSource
  ) {
    return null;
  }

  isInitialized.current = true;

  return (
    <CurrentTabProvider currentTabId={tabId}>
      <DiscoverCustomizationProvider value={currentCustomizationService}>
        <RuntimeStateProvider currentDataSource={currentDataSource} adHocDataViews={adHocDataViews}>
          <ScopedServicesProvider
            scopedProfilesManager={currentScopedProfilesManager}
            scopedEBTManager={currentScopedEbtManager}
          >
            <ChartsWrapper panelsToggle={panelsToggle} />
          </ScopedServicesProvider>
        </RuntimeStateProvider>
      </DiscoverCustomizationProvider>
    </CurrentTabProvider>
  );
};

type UnifiedHistogramChartProps = Pick<UnifiedHistogramGuardProps, 'panelsToggle'>;

const ChartsWrapper = ({ panelsToggle }: UnifiedHistogramChartProps) => {
  const runtimeStateManager = useRuntimeStateManager();
  const currentTabId = useCurrentTabSelector((tab) => tab.id);
  const getChartConfigAccessor = useProfileAccessor('getChartSectionConfiguration');

  const isEsqlMode = useIsEsqlMode();
  const chartSectionConfig = useMemo<ChartSectionConfiguration>(() => {
    if (!isEsqlMode) {
      return {
        replaceDefaultChart: false,
      };
    }

    return getChartConfigAccessor(() => ({
      replaceDefaultChart: false,
    }))();
  }, [getChartConfigAccessor, isEsqlMode]);

  useEffect(() => {
    const histogramConfig$ = selectTabRuntimeState(
      runtimeStateManager,
      currentTabId
    ).unifiedHistogramConfig$;

    histogramConfig$.next({
      ...histogramConfig$.getValue(),
      localStorageKeyPrefix: chartSectionConfig.replaceDefaultChart
        ? chartSectionConfig.localStorageKeyPrefix
        : undefined,
    });
  }, [chartSectionConfig, runtimeStateManager, currentTabId]);

  return chartSectionConfig.replaceDefaultChart ? (
    <CustomChartSectionWrapper
      panelsToggle={panelsToggle}
      chartSectionConfig={chartSectionConfig}
    />
  ) : (
    <UnifiedHistogramWrapper panelsToggle={panelsToggle} />
  );
};

const UnifiedHistogramWrapper = ({ panelsToggle }: UnifiedHistogramChartProps) => {
  const { currentTabId, unifiedHistogramProps } = useUnifiedHistogramRuntimeState();

  const { setUnifiedHistogramApi } = unifiedHistogramProps;
  const unifiedHistogram = useUnifiedHistogram(unifiedHistogramProps);

  useEffect(() => {
    setUnifiedHistogramApi(unifiedHistogram.api);
  }, [setUnifiedHistogramApi, unifiedHistogram.api]);

  const { renderToggleActions } = useUnifiedHistogramCommon({
    currentTabId,
    layoutProps: unifiedHistogram.layoutProps,
    panelsToggle,
  });

  if (!unifiedHistogram.isInitialized) {
    return null;
  }

  return (
    <UnifiedHistogramChart
      {...unifiedHistogram.chartProps}
      renderToggleActions={renderToggleActions}
    />
  );
};

const CustomChartSectionWrapper = ({
  panelsToggle,
  chartSectionConfig,
}: UnifiedHistogramChartProps & {
  chartSectionConfig: Extract<ChartSectionConfiguration, { replaceDefaultChart: true }>;
}) => {
  const dispatch = useInternalStateDispatch();
  const { currentTabId, unifiedHistogramProps } = useUnifiedHistogramRuntimeState(
    chartSectionConfig.localStorageKeyPrefix
  );
  const localStorageKeyPrefix =
    chartSectionConfig.localStorageKeyPrefix ?? unifiedHistogramProps.localStorageKeyPrefix;

  const { setUnifiedHistogramApi, ...restProps } = unifiedHistogramProps;
  const { api, stateProps, fetch$, fetchParams, hasValidFetchParams } = useServicesBootstrap({
    ...restProps,
    initialState: unifiedHistogramProps.initialState,
    localStorageKeyPrefix,
  });

  const metricsGridState = useCurrentTabSelector((state) => state.uiState.metricsGrid);
  const isTabSelected = useInternalStateSelector(
    (state) => state.tabs.unsafeCurrentId === currentTabId
  );
  const setMetricsGridState = useCurrentTabAction(internalStateActions.setMetricsGridState);
  const onInitialStateChange = useCallback(
    (newMetricsGridState: Partial<UnifiedMetricsGridRestorableState>) => {
      dispatch(setMetricsGridState({ metricsGridState: newMetricsGridState }));
    },
    [setMetricsGridState, dispatch]
  );

  useEffect(() => {
    setUnifiedHistogramApi(api);
  }, [setUnifiedHistogramApi, api]);

  const layoutProps = useMemo<UnifiedHistogramPartialLayoutProps>(
    () => ({
      onTopPanelHeightChange: stateProps.onTopPanelHeightChange,
      isChartAvailable: true,
      chart: stateProps.chart,
      topPanelHeight: stateProps.topPanelHeight,
      defaultTopPanelHeight: chartSectionConfig.defaultTopPanelHeight,
    }),
    [
      chartSectionConfig.defaultTopPanelHeight,
      stateProps.chart,
      stateProps.onTopPanelHeightChange,
      stateProps.topPanelHeight,
    ]
  );

  const { renderToggleActions } = useUnifiedHistogramCommon({
    currentTabId,
    layoutProps,
    panelsToggle,
    localStorageKeyPrefix,
  });

  const { chartToolbarCss, histogramCss } = useChartStyles(
    !!layoutProps.chart && !layoutProps.chart.hidden
  );

  if (!fetchParams || !hasValidFetchParams) {
    return null;
  }

  const isComponentVisible = !!layoutProps.chart && !layoutProps.chart.hidden;

  return (
    <KibanaSectionErrorBoundary
      sectionName={i18n.translate('discover.chart.errorBoundarySectionName', {
        defaultMessage: 'Discover chart section',
      })}
    >
      {chartSectionConfig.renderChartSection({
        histogramCss,
        chartToolbarCss,
        renderToggleActions,
        fetch$,
        fetchParams,
        isComponentVisible,
        isTabSelected,
        ...unifiedHistogramProps,
        setLensRequestAdapter: api.setLensRequestAdapter,
        initialState: metricsGridState,
        onInitialStateChange,
      })}
    </KibanaSectionErrorBoundary>
  );
};
