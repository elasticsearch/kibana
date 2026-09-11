/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  type EuiBreadcrumbsProps,
  type EuiPageHeaderProps,
} from '@elastic/eui';
import type { AppHeaderTab } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import { enableInfrastructureAssetCustomDashboards } from '@kbn/observability-plugin/common';
import type { RouteState } from '@kbn/metrics-data-access-plugin/public';
import { capitalize, isEmpty } from 'lodash';
import React, { useCallback, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useInfraMLCapabilitiesContext } from '../../../containers/ml/infra_ml_capabilities';
import { usePluginConfig } from '../../../containers/plugin_config_context';
import { useKibanaContextForPlugin } from '../../../hooks/use_kibana';
import { useProfilingPluginSetting } from '../../../hooks/use_profiling_integration_setting';
import { CreateAlertRuleButton } from '../../shared/alerts/links/create_alert_rule_button';
import { LinkToNodeDetails } from '../links';
import { ContentTabIds, type LinkOptions, type Tab, type TabIds } from '../types';
import { useAssetDetailsRenderPropsContext } from './use_asset_details_render_props';
import { useTabSwitcherContext } from './use_tab_switcher';

type TabItem = NonNullable<Pick<EuiPageHeaderProps, 'tabs'>['tabs']>[number];

export const usePageHeader = (tabs: Tab[] = [], links: LinkOptions[] = []) => {
  const { rightSideItems } = useRightSideItems(links);
  const { tabEntries, appHeaderTabs } = useTabs(tabs);
  const { breadcrumbs } = useTemplateHeaderBreadcrumbs();

  return { rightSideItems, tabEntries, appHeaderTabs, breadcrumbs };
};

export const useTemplateHeaderBreadcrumbs = () => {
  const history = useHistory();
  const location = useLocation<RouteState>();
  const {
    services: {
      application: { navigateToApp },
      chrome,
    },
  } = useKibanaContextForPlugin();

  const onClick = (e: React.MouseEvent) => {
    if (location.state) {
      navigateToApp(location.state.originAppId, {
        replace: true,
        path: `${location.state.originPathname}${location.state.originSearch}`,
      });
    } else {
      history.goBack();
    }
    e.preventDefault();
  };

  // The compatibility Back only renders when Chrome Next is active in the project layout.
  if (chrome.getChromeStyle() === 'project') {
    return { breadcrumbs: [] satisfies EuiBreadcrumbsProps['breadcrumbs'] };
  }

  const breadcrumbs: EuiBreadcrumbsProps['breadcrumbs'] =
    // If there is a state object in location, it's persisted in case the page is opened in a new tab or after page refresh
    // With that, we can show the return button. Otherwise, it will be hidden (ex: the user opened a shared URL or opened the page from their bookmarks)
    !isEmpty(location.state) || history.length > 1
      ? [
          {
            text: (
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon size="s" type="chevronSingleLeft" aria-hidden={true} />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <FormattedMessage
                    id="xpack.infra.assetDetails.header.return"
                    defaultMessage="Return"
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            ),
            'aria-label': i18n.translate('xpack.infra.assetDetails.header.returnAriaLabel', {
              defaultMessage: 'Return',
            }),
            color: 'primary',
            'aria-current': false,
            'data-test-subj': 'infraAssetDetailsReturnButton',
            onClick,
          },
        ]
      : [];

  return { breadcrumbs };
};

const useRightSideItems = (links?: LinkOptions[]) => {
  const { entity } = useAssetDetailsRenderPropsContext();

  const topCornerLinkComponents: Record<LinkOptions, JSX.Element> = useMemo(
    () => ({
      nodeDetails: (
        <LinkToNodeDetails entityId={entity.id} entityName={entity.name} entityType={entity.type} />
      ),
      alertRule: (
        <CreateAlertRuleButton data-test-subj="infraAssetDetailsPageHeaderCreateAlertsRuleButton" />
      ),
    }),
    [entity.id, entity.name, entity.type]
  );

  const rightSideItems = useMemo(
    () => links?.map((link) => topCornerLinkComponents[link]),
    [links, topCornerLinkComponents]
  );

  return { rightSideItems };
};

const useConditionalTabs = () => {
  const { isTopbarMenuVisible } = useInfraMLCapabilitiesContext();
  const { featureFlags } = usePluginConfig();
  const isProfilingPluginEnabled = useProfilingPluginSetting();
  const isInfrastructureAssetCustomDashboardsEnabled = useUiSetting<boolean>(
    enableInfrastructureAssetCustomDashboards
  );
  const { schema } = useAssetDetailsRenderPropsContext();

  const featureFlagControlledTabs: Partial<Record<ContentTabIds, boolean>> = useMemo(
    () => ({
      [ContentTabIds.OSQUERY]: Boolean(featureFlags.osqueryEnabled) && schema === 'ecs',
      [ContentTabIds.PROFILING]: Boolean(isProfilingPluginEnabled),
      [ContentTabIds.ANOMALIES]: isTopbarMenuVisible,
      [ContentTabIds.DASHBOARDS]: isInfrastructureAssetCustomDashboardsEnabled,
    }),
    [
      featureFlags.osqueryEnabled,
      isProfilingPluginEnabled,
      isTopbarMenuVisible,
      schema,
      isInfrastructureAssetCustomDashboardsEnabled,
    ]
  );

  const isTabEnabled = useCallback(
    (tabItem: Tab) => {
      return featureFlagControlledTabs[tabItem.id] ?? true;
    },
    [featureFlagControlledTabs]
  );

  return {
    isTabEnabled,
  };
};

const useTabs = (tabs: Tab[]) => {
  const { showTab, activeTabId } = useTabSwitcherContext();
  const { isTabEnabled } = useConditionalTabs();

  const onTabClick = useCallback(
    (tabId: TabIds) => {
      showTab(tabId);
    },
    [showTab]
  );

  const tabEntries: TabItem[] = useMemo(
    () =>
      tabs.filter(isTabEnabled).map(({ name, ...tab }) => {
        return {
          ...tab,
          'data-test-subj': `infraAssetDetails${capitalize(tab.id)}Tab`,
          onClick: () => onTabClick(tab.id),
          isSelected: tab.id === activeTabId,
          label: name,
        };
      }),
    [activeTabId, isTabEnabled, onTabClick, tabs]
  );

  const appHeaderTabs: AppHeaderTab[] = useMemo(
    () =>
      tabs.filter(isTabEnabled).map(({ name, id }) => ({
        id,
        label: name,
        isSelected: id === activeTabId,
        onClick: () => onTabClick(id),
        'data-test-subj': `infraAssetDetails${capitalize(id)}Tab`,
      })),
    [activeTabId, isTabEnabled, onTabClick, tabs]
  );

  return { tabEntries, appHeaderTabs };
};
