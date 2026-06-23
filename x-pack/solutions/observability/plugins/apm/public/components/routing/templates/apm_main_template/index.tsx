/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import type { EuiPageHeaderProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ObservabilityPageTemplateProps } from '@kbn/observability-shared-plugin/public';
import type { KibanaPageTemplateProps } from '@kbn/shared-ux-page-kibana-template';
import { useLocation } from 'react-router-dom';
import type { ObservabilityOnboardingLocatorParams } from '@kbn/deeplinks-observability';
import { OBSERVABILITY_ONBOARDING_LOCATOR } from '@kbn/deeplinks-observability';
import { useDefaultAiAssistantStarterPromptsForAPM } from '../../../../hooks/use_default_ai_assistant_starter_prompts_for_apm';
import { EnvironmentsContextProvider } from '../../../../context/environments_context/environments_context';
import { FETCH_STATUS, useFetcher } from '../../../../hooks/use_fetcher';
import type { ApmPluginStartDeps } from '../../../../plugin';
import { ServiceGroupSaveButton } from '../../../app/service_groups';
import { ActionsMenu } from './actions_menu';
import { getNoDataConfig } from '../no_data_config';

// Paths that must skip the no data screen
const bypassNoDataScreenPaths = ['/settings', '/diagnostics'];

// Garantee's responsiveness of the header content
const headerContentStyles = css`
  contain: inline-size;
`;

/*
 * This template contains:
 *  - The Shared Observability Nav (https://github.com/elastic/kibana/blob/f7698bd8aa8787d683c728300ba4ca52b202369c/x-pack/plugins/observability/public/components/shared/page_template/README.md)
 *  - The APM Header Action Menu
 *  - Page title
 *
 *  Optionally:
 *   - ServiceGroupSaveButton
 */
export function ApmMainTemplate({
  pageTitle,
  pageHeader,
  children,
  searchBar,
  showActionsMenu = false,
  showServiceGroupSaveButton = false,
  ...pageTemplateProps
}: {
  pageTitle?: React.ReactNode;
  pageHeader?: EuiPageHeaderProps;
  children: React.ReactNode;
  searchBar?: React.ReactNode;
  showActionsMenu?: boolean;
  showServiceGroupSaveButton?: boolean;
} & KibanaPageTemplateProps &
  Pick<ObservabilityPageTemplateProps, 'pageSectionProps'>) {
  const location = useLocation();

  const { services } = useKibana<ApmPluginStartDeps>();
  const { docLinks, observabilityShared, application, share } = services;
  const onboardingLocator = share?.url.locators.get<ObservabilityOnboardingLocatorParams>(
    OBSERVABILITY_ONBOARDING_LOCATOR
  );
  const addDataUrl = onboardingLocator?.useUrl({ category: 'application' }) ?? '';
  const ObservabilityPageTemplate = observabilityShared.navigation.PageTemplate;

  const { data, status } = useFetcher((callApmApi) => {
    return callApmApi('GET /internal/apm/has_data');
  }, []);

  // create static data view on initial load
  useFetcher(
    (callApmApi) => {
      const canCreateDataView = application?.capabilities.savedObjectsManagement.edit;

      if (canCreateDataView) {
        return callApmApi('POST /internal/apm/data_view/static');
      }
    },
    [application?.capabilities.savedObjectsManagement.edit]
  );

  const shouldBypassNoDataScreen = bypassNoDataScreenPaths.some((path) =>
    location.pathname.includes(path)
  );

  const { data: fleetApmPoliciesData, status: fleetApmPoliciesStatus } = useFetcher(
    (callApmApi) => {
      if (!data?.hasData && !shouldBypassNoDataScreen) {
        return callApmApi('GET /internal/apm/fleet/has_apm_policies');
      }
    },
    [shouldBypassNoDataScreen, data?.hasData]
  );

  const isLoading =
    status === FETCH_STATUS.LOADING || fleetApmPoliciesStatus === FETCH_STATUS.LOADING;

  const hasApmData = !!data?.hasData;
  const hasApmIntegrations = !!fleetApmPoliciesData?.hasApmPolicies;

  const noDataConfig = getNoDataConfig({
    docsLink: docLinks!.links.observability.guide,
    hasApmData,
    shouldBypassNoDataScreen,
    loading: isLoading,
    addDataUrl,
  });

  useDefaultAiAssistantStarterPromptsForAPM({
    hasApmData,
    hasApmIntegrations,
    noDataConfig,
  });

  const rightSideItems = [
    ...(pageHeader?.rightSideItems ?? []),
    ...(showServiceGroupSaveButton ? [<ServiceGroupSaveButton />] : []),
    ...(showActionsMenu ? [<ActionsMenu />] : []),
  ];

  const resolvedPageTitle = pageHeader?.pageTitle ?? pageTitle;
  const titleWithActions =
    rightSideItems.length > 0 ? (
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>{resolvedPageTitle}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" responsive={false}>
            {rightSideItems.map((item, i) => (
              <EuiFlexItem key={i} grow={false}>
                {item}
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    ) : (
      resolvedPageTitle
    );

  const callerChildren = pageHeader?.children;
  const callerTabs = pageHeader?.tabs;
  const headerChildren = (
    <div css={headerContentStyles}>
      {callerChildren}
      {callerTabs && callerTabs.length > 0 && (
        <EuiTabs bottomBorder={false} size="m">
          {callerTabs.map(({ label, ...tabRest }, index) => (
            <EuiTab key={index} {...tabRest}>
              {label}
            </EuiTab>
          ))}
        </EuiTabs>
      )}
      {searchBar && (
        <>
          <EuiSpacer size="s" />
          {searchBar}
        </>
      )}
    </div>
  );

  return (
    <EnvironmentsContextProvider>
      <ObservabilityPageTemplate
        noDataConfig={shouldBypassNoDataScreen ? undefined : noDataConfig}
        isPageDataLoaded={isLoading === false}
        pageHeader={{
          ...pageHeader,
          color: 'subdued' as unknown as EuiPageHeaderProps['color'],
          tabs: undefined,
          rightSideItems: [],
          pageTitle: titleWithActions,
          children: headerChildren,
        }}
        {...pageTemplateProps}
      >
        {children}
      </ObservabilityPageTemplate>
    </EnvironmentsContextProvider>
  );
}
