/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiLoadingLogo, EuiSpacer, EuiTitle } from '@elastic/eui';
import React, { useCallback, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import type { AgentName } from '@kbn/elastic-agent-utils';
import { i18n } from '@kbn/i18n';
import { OBSERVABILITY_SERVICE_ATTACHMENT_TYPE_ID } from '@kbn/observability-agent-builder-plugin/public';
import { useShouldShowAnomalyUi } from '../../../../hooks/use_should_show_anomaly_ui';
import { isMobileAgentName } from '../../../../../common/agent_name';
import { ApmIndexSettingsContextProvider } from '../../../../context/apm_index_settings/apm_index_settings_context';
import { ApmServiceContextProvider } from '../../../../context/apm_service/apm_service_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { ServiceSloContextProvider } from '../../../../context/service_slo/service_slo_context';
import { useBreadcrumb } from '../../../../context/breadcrumbs/use_breadcrumb';
import { ServiceAnomalyTimeseriesContextProvider } from '../../../../context/service_anomaly_timeseries/service_anomaly_timeseries_context';
import { useApmParams } from '../../../../hooks/use_apm_params';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import { isPending } from '../../../../hooks/use_fetcher';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { replace } from '../../../shared/links/url_helpers';
import { SearchBar } from '../../../shared/search_bar/search_bar';
import { ServiceIcons } from '../../../shared/service_icons';
import { SloOverviewFlyout, useSloOverviewFlyout } from '../../../shared/slo_overview_flyout';
import { ApmMainTemplate } from '../apm_main_template';
import { AnalyzeDataButton } from './analyze_data_button';
import { ServiceHeaderBadges } from './service_header_badges';
import type { Tab } from './use_tabs';
import { useTabs } from './use_tabs';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';

interface Props {
  title: string;
  children: React.ReactChild;
  selectedTab: Tab['key'];
  searchBarOptions?: React.ComponentProps<typeof SearchBar>;
  customSearchBar?: React.ReactNode;
  bottomHeaderContent?: React.ComponentType;
  contentWrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

export function ApmServiceTemplate(props: Props) {
  return (
    <ApmIndexSettingsContextProvider>
      <ApmServiceContextProvider>
        <TemplateWithContext {...props} />
      </ApmServiceContextProvider>
    </ApmIndexSettingsContextProvider>
  );
}

function TemplateWithContext({
  title,
  children,
  selectedTab,
  searchBarOptions,
  customSearchBar,
  bottomHeaderContent: BottomHeaderContent,
  contentWrapper: ContentWrapper = React.Fragment,
}: Props) {
  const {
    path: { serviceName },
    query,
    query: { rangeFrom, rangeTo, environment },
  } = useApmParams('/services/{serviceName}/*');
  const history = useHistory();
  const location = useLocation();
  const { agentBuilder } = useApmPluginContext();

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const router = useApmRouter();

  const tabs = useTabs({ selectedTab });

  const { agentName, serviceAgentStatus } = useApmServiceContext();

  const isPendingServiceAgent = !agentName && isPending(serviceAgentStatus);

  const shouldShowAnomalyUi = useShouldShowAnomalyUi();

  const { sloOverviewFlyout, openSloOverviewFlyout, closeSloOverviewFlyout } =
    useSloOverviewFlyout();

  const onSloClick = useCallback(() => {
    openSloOverviewFlyout(serviceName, agentName as AgentName);
  }, [serviceName, agentName, openSloOverviewFlyout]);

  const alertsTabHref = router.link('/services/{serviceName}/alerts' as const, {
    path: { serviceName },
    query,
  });

  useBreadcrumb(
    () => ({
      title,
      href: router.link(`/services/{serviceName}/${selectedTab}` as const, {
        path: { serviceName },
        query,
      }),
    }),
    [query, router, selectedTab, serviceName, title]
  );

  // Configure agent builder global flyout with the service attachment
  useEffect(() => {
    if (!agentBuilder || !serviceName) {
      return;
    }

    agentBuilder.setChatConfig({
      attachments: [
        {
          type: OBSERVABILITY_SERVICE_ATTACHMENT_TYPE_ID,
          data: {
            serviceName,
            environment,
            start,
            end,
            attachmentLabel: i18n.translate('xpack.apm.serviceDetails.serviceAttachmentLabel', {
              defaultMessage: '{serviceName} service',
              values: { serviceName },
            }),
          },
        },
      ],
    });

    return () => {
      agentBuilder.clearChatConfig();
    };
  }, [agentBuilder, serviceName, environment, start, end]);

  if (isMobileAgentName(agentName)) {
    replace(history, {
      pathname: location.pathname.replace('/services/', '/mobile-services/'),
    });
  }

  return (
    <ServiceSloContextProvider serviceName={serviceName} environment={environment}>
      <ContentWrapper>
        <ApmMainTemplate
          showActionsMenu
          searchBar={
            <>
              {BottomHeaderContent && <BottomHeaderContent />}
              {customSearchBar ?? (
                <SearchBar
                  {...searchBarOptions}
                  showEnvironmentFilter
                  showAnomalyThresholdSelector={shouldShowAnomalyUi}
                />
              )}
            </>
          }
          pageHeader={{
            tabs,
            rightSideItems: [<AnalyzeDataButton />],
            pageTitle: (
              <EuiFlexGroup alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiTitle size="l">
                    <h1 data-test-subj="apmMainTemplateHeaderServiceName">{serviceName}</h1>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <ServiceIcons
                    serviceName={serviceName}
                    environment={environment}
                    start={start}
                    end={end}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            ),
            children: (
              <ServiceHeaderBadges
                serviceName={serviceName}
                environment={environment}
                start={start}
                end={end}
                onSloClick={onSloClick}
                alertsTabHref={alertsTabHref}
              />
            ),
          }}
        >
          {isPendingServiceAgent ? (
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiSpacer size="l" />
                <EuiLoadingLogo
                  logo="logoObservability"
                  size="l"
                  data-test-subj="apmMainTemplateServiceAgentLoader"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <ServiceAnomalyTimeseriesContextProvider>
              {children}
            </ServiceAnomalyTimeseriesContextProvider>
          )}
          {sloOverviewFlyout && (
            <SloOverviewFlyout
              serviceName={sloOverviewFlyout.serviceName}
              agentName={sloOverviewFlyout.agentName as AgentName | undefined}
              onClose={closeSloOverviewFlyout}
            />
          )}
        </ApmMainTemplate>
      </ContentWrapper>
    </ServiceSloContextProvider>
  );
}
