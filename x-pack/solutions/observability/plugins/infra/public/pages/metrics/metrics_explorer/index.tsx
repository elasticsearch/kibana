/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useEffect, useState, useRef } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPageSection, useEuiTheme } from '@elastic/eui';
import { useTrackPageview } from '@kbn/observability-shared-plugin/public';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { APP_WRAPPER_CLASS } from '@kbn/core/public';
import { AppHeader } from '@kbn/app-header';
import { css } from '@emotion/react';
import { InfraPageTemplate } from '../../../components/shared/templates/infra_page_template';
import { InfraOnboardingPage } from '../../../components/shared/templates/infra_onboarding_page';
import { WithMetricsExplorerOptionsUrlState } from '../../../containers/metrics_explorer/with_metrics_explorer_options_url_state';
import { useMetricsExplorerViews } from '../../../hooks/use_metrics_explorer_views';
import { useMetricsBreadcrumbs } from '../../../hooks/use_metrics_breadcrumbs';
import { useInfraHasData } from '../../../hooks/use_infra_has_data';
import { NoData } from '../../../components/empty_states';
import { MetricsExplorerCharts } from './components/charts';
import { MetricsExplorerToolbar } from './components/toolbar';
import { useMetricsExplorerState } from './hooks/use_metric_explorer_state';
import { metricsExplorerTitle } from '../../../translations';
import { MetricsExplorerOptionsContainer } from './hooks/use_metrics_explorer_options';
import { MetricsInDiscoverCallout } from './components/metrics_in_discover_callout';
import { useMetricsAppHeaderMenu } from '../header/use_metrics_app_header_menu';

export const MetricsExplorerPage = (): React.ReactElement => {
  useTrackPageview({ app: 'infra_metrics', path: 'metrics_explorer' });
  useTrackPageview({ app: 'infra_metrics', path: 'metrics_explorer', delay: 15000 });

  useMetricsBreadcrumbs(
    [
      {
        text: metricsExplorerTitle,
      },
    ],
    { parent: 'app' }
  );

  const { menu, flyouts } = useMetricsAppHeaderMenu();
  const { showOnboarding } = useInfraHasData();

  // Template noDataConfig ignores children; Explorer renders onboarding as body instead.
  return (
    <div className={APP_WRAPPER_CLASS}>
      <MetricsExplorerOptionsContainer>
        <WithMetricsExplorerOptionsUrlState />
        <InfraPageTemplate
          hasDataOverride={!showOnboarding}
          header={
            <>
              <AppHeader title={metricsExplorerTitle} menu={menu} spacing="standard" />
              {flyouts}
            </>
          }
          pageSectionProps={{
            paddingSize: 'none',
            contentProps: {
              css: css`
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                min-height: 0;
                height: 100%;
                width: 100%;
                padding-bottom: 0;
              `,
            },
          }}
        >
          {showOnboarding ? <InfraOnboardingPage /> : <MetricsExplorerContent />}
        </InfraPageTemplate>
      </MetricsExplorerOptionsContainer>
    </div>
  );
};

const MetricsExplorerContent = () => {
  const { euiTheme } = useEuiTheme();
  const [enabled, setEnabled] = useState(false);
  const {
    isLoading,
    error,
    data,
    timeRange,
    options,
    chartOptions,
    setChartOptions,
    handleAggregationChange,
    handleMetricsChange,
    handleFilterQuerySubmit,
    handleGroupByChange,
    handleTimeChange,
    handleLoadMore,
    onViewStateChange,
    refresh,
  } = useMetricsExplorerState({ enabled });
  const { currentView } = useMetricsExplorerViews();

  const prevDataRef = useRef(data);
  const { onPageReady } = usePerformanceContext();

  useTrackPageview({ app: 'infra_metrics', path: 'metrics_explorer' });
  useTrackPageview({ app: 'infra_metrics', path: 'metrics_explorer', delay: 15000 });

  useEffect(() => {
    if (currentView) {
      onViewStateChange(currentView);
    }
  }, [currentView, onViewStateChange]);

  useEffect(() => {
    if (currentView != null) {
      // load metrics explorer data after default view loaded, unless we're not isLoading a view
      setEnabled(true);
    }
  }, [currentView]);

  const viewState = {
    options,
    chartOptions,
    currentTimerange: timeRange,
  };

  useEffect(() => {
    if (!isLoading && data && prevDataRef.current !== data) {
      onPageReady({
        meta: {
          rangeFrom: timeRange.from,
          rangeTo: timeRange.to,
        },
      });

      prevDataRef.current = data;
    }
  }, [isLoading, data, timeRange.from, timeRange.to, onPageReady]);

  const onFilter = (query: string) => {
    handleFilterQuerySubmit({ query: { query, language: 'kuery' } });
  };

  return (
    <EuiPageSection
      paddingSize="m"
      grow
      restrictWidth={false}
      contentProps={{
        css: css`
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
          width: 100%;
          padding-top: ${euiTheme.size.base};
          padding-bottom: 0;
        `,
      }}
    >
      <EuiFlexGroup
        direction="column"
        gutterSize="m"
        css={css`
          flex: 1;
          min-height: 0;
        `}
      >
        <EuiFlexItem grow={false}>
          <MetricsExplorerToolbar
            timeRange={timeRange}
            options={options}
            chartOptions={chartOptions}
            viewState={viewState}
            onRefresh={refresh}
            onTimeChange={handleTimeChange}
            onGroupByChange={handleGroupByChange}
            onFilterQuerySubmit={handleFilterQuerySubmit}
            onMetricsChange={handleMetricsChange}
            onAggregationChange={handleAggregationChange}
            onChartOptionsChange={setChartOptions}
          />
        </EuiFlexItem>
        <EuiFlexItem
          css={css`
            min-height: 0;
            overflow-y: auto;
          `}
        >
          <MetricsInDiscoverCallout timeRange={timeRange} />
          {error ? (
            <NoData
              titleText="Whoops!"
              bodyText={i18n.translate('xpack.infra.metricsExplorer.errorMessage', {
                defaultMessage: 'It looks like the request failed with "{message}"',
                values: { message: error.message },
              })}
              onRefetch={refresh}
              refetchText="Try Again"
            />
          ) : (
            <MetricsExplorerCharts
              timeRange={timeRange}
              isLoading={isLoading}
              data={data}
              options={options}
              chartOptions={chartOptions}
              onLoadMore={handleLoadMore}
              onFilter={onFilter}
              onRefetch={refresh}
              onTimeChange={handleTimeChange}
            />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPageSection>
  );
};
