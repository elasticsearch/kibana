/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppDeepLinkId, NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import {
  ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
  SecurityPageName,
} from '@kbn/security-solution-navigation';
import { i18nStrings, securityLink } from '@kbn/security-solution-navigation/links';
import { defaultNavigationTree } from '@kbn/security-solution-navigation/navigation_tree';
import { STACK_MANAGEMENT_NAV_ID, DATA_MANAGEMENT_NAV_ID } from '@kbn/deeplinks-management';
import { AGENT_BUILDER_NAV_AT_TOP_FLAG } from '@kbn/navigation-plugin/public';
import { getAlertingV2ManagementNavPanel } from '@kbn/alerting-v2-utils';
import { type Services } from '../common/services';
import { SOLUTION_NAME } from './translations';

export const createNavigationTree = (
  services: Services,
  chatExperience: AIChatExperience = AIChatExperience.Classic
): NavigationTreeDefinition => {
  const showAgentBuilder = chatExperience === AIChatExperience.Agent;
  const agentBuilderNavAtTop = services.featureFlags.getBooleanValue(
    AGENT_BUILDER_NAV_AT_TOP_FLAG,
    false
  );

  const agentBuilderLink = {
    icon: 'productAgent',
    link: 'agent_builder' as AppDeepLinkId,
  };

  return {
    body: [
      {
        id: 'security_solution_home',
        icon: 'logoSecurity',
        link: securityLink(SecurityPageName.landing),
        renderAs: 'home',
        title: SOLUTION_NAME,
      },
      ...(showAgentBuilder && agentBuilderNavAtTop ? [agentBuilderLink] : []),
      {
        link: 'inbox' as AppDeepLinkId,
        icon: 'email',
      },
      {
        link: 'discover',
        icon: 'productDiscover',
      },
      defaultNavigationTree.dashboards(),
      defaultNavigationTree.rules(),
      services.uiSettings.get(ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING, false)
        ? defaultNavigationTree.alertDetections()
        : {
            id: SecurityPageName.alerts,
            icon: 'warning',
            link: securityLink(SecurityPageName.alerts),
          },
      {
        link: 'workflows',
      },
      // TODO: remove this item when agentBuilderNavAtTop is enabled by default and the Agent Builder link is always at the top of the nav
      ...(showAgentBuilder && !agentBuilderNavAtTop ? [agentBuilderLink] : []),
      {
        id: SecurityPageName.attackDiscovery,
        icon: 'bolt',
        link: securityLink(SecurityPageName.attackDiscovery),
      },
      {
        id: SecurityPageName.cloudSecurityPostureFindings,
        icon: 'bullseye',
        link: securityLink(SecurityPageName.cloudSecurityPostureFindings),
      },
      defaultNavigationTree.cases(),
      defaultNavigationTree.entityAnalytics(
        services.experimentalFeatures?.entityAnalyticsNewHomePageEnabled
      ),
      defaultNavigationTree.explore(),
      defaultNavigationTree.investigations(),
      {
        id: SecurityPageName.threatIntelligence,
        icon: 'processor',
        link: securityLink(SecurityPageName.threatIntelligence),
      },
      {
        id: SecurityPageName.assetInventory,
        icon: 'listCheck',
        link: securityLink(SecurityPageName.assetInventory),
      },
      defaultNavigationTree.assets(services),
      defaultNavigationTree.ml(),
      {
        link: 'onboarding' as AppDeepLinkId,
        sideNavStatus: 'hidden',
      },
    ],
    footer: [
      {
        id: 'launchpad',
        title: i18nStrings.launchPad.title,
        renderAs: 'panelOpener',
        icon: 'rocket',
        children: [
          {
            children: [
              {
                id: SecurityPageName.landing,
                link: securityLink(SecurityPageName.landing),
              },
              {
                id: SecurityPageName.siemReadiness,
                link: securityLink(SecurityPageName.siemReadiness),
                badgeType: 'new',
              },
              {
                // value report
                id: SecurityPageName.aiValue,
                link: securityLink(SecurityPageName.aiValue),
              },
            ],
          },
          {
            title: i18nStrings.launchPad.migrations.title,
            children: [
              {
                id: SecurityPageName.siemMigrationsManage,
                link: securityLink(SecurityPageName.siemMigrationsManage),
              },
              {
                id: SecurityPageName.siemMigrationsRules,
                link: securityLink(SecurityPageName.siemMigrationsRules),
              },
              {
                id: SecurityPageName.siemMigrationsDashboards,
                link: securityLink(SecurityPageName.siemMigrationsDashboards),
              },
            ],
          },
        ],
      },
      {
        link: 'dev_tools',
        title: i18nStrings.devTools,
        icon: 'code',
      },
      {
        id: DATA_MANAGEMENT_NAV_ID,
        title: i18nStrings.ingestAndManageData.title,
        icon: 'database',
        breadcrumbStatus: 'hidden',
        renderAs: 'panelOpener',
        children: [
          {
            title: i18nStrings.ingestAndManageData.ingestAndIntegrations.title,
            children: [
              { link: 'integrations' },
              // TODO: Add fleet back when it is possible to not jump to  fleet sub menu under assets
              // { link: 'fleet' },
              { link: 'management:ingest_pipelines' },
              // logstash pipeline
              { link: 'management:pipelines' },
              { link: 'management:content_connectors' },
            ],
          },
          {
            title: i18nStrings.ingestAndManageData.indicesAndDataStreams.title,
            children: [
              { link: 'streams' },
              { link: 'management:index_management' },
              { link: 'management:index_lifecycle_management' },
              { link: 'management:snapshot_restore' },
              { link: 'management:transform' },
              { link: 'management:rollup_jobs' },
              { link: 'management:data_federation' },
              { link: 'management:data_quality' },
            ],
          },
        ],
      },
      {
        id: STACK_MANAGEMENT_NAV_ID,
        title: i18nStrings.stackManagementV2.title,
        icon: 'gear',
        breadcrumbStatus: 'hidden',
        renderAs: 'panelOpener',
        children: [
          {
            id: 'stack_management_home',
            breadcrumbStatus: 'hidden',
            children: [
              {
                // We include this link here to ensure that the settings icon does not land on Stack Monitoring by default
                // https://github.com/elastic/kibana/issues/241518
                // And that the sidenav panel opens when user lands to legacy management landing page
                // https://github.com/elastic/kibana/issues/240275
                link: 'management',
                title: i18nStrings.stackManagementV2.home.title,
                breadcrumbStatus: 'hidden',
              },
              // Only show Cloud Connect in on-prem deployments (not cloud)
              ...(services.cloud?.isCloudEnabled
                ? []
                : [
                    {
                      id: 'cloud_connect' as const,
                      link: 'cloud_connect' as const,
                    },
                  ]),
              { link: 'monitoring' },
            ],
          },
          ...getAlertingV2ManagementNavPanel(services),
          {
            title: i18nStrings.stackManagementV2.alertsAndInsights.title,
            children: [
              { id: 'stackRules', link: 'management:triggersActions' },
              { link: 'management:cases' },
              { link: 'management:triggersActionsConnectors' },
              { link: 'management:reporting' },
              { link: 'management:jobsListLink' },
              { link: 'management:watcher' },
              { link: 'management:maintenanceWindows' },
              {
                id: SecurityPageName.entityAnalyticsManagement,
                link: securityLink(SecurityPageName.entityAnalyticsManagement),
              },
            ],
          },
          {
            title: i18nStrings.clusterPerformance.title,
            children: [
              { link: 'monitoring' },
              { link: 'management:queryActivity', badgeType: 'new' },
            ],
          },
          {
            title: i18nStrings.ml.title,
            children: [
              { link: 'management:overview' },
              { link: 'management:anomaly_detection' },
              { link: 'management:analytics' },
              { link: 'management:trained_models' },
              { link: 'management:supplied_configurations' },
            ],
          },
          {
            title: i18nStrings.modelManagement.title,
            children: [
              { link: 'management:elastic_inference_service' },
              { link: 'management:inference_endpoints' },
              { link: 'management:model_settings' },
            ],
          },
          {
            title: i18nStrings.stackManagement.ai.title,
            children: [
              { link: 'management:genAiSettings' },
              { link: 'management:evals' },
              { link: 'management:aiAssistantManagementSelection' },
            ],
          },
          {
            title: i18nStrings.stackManagementV2.security.title,
            children: [
              { link: 'management:users' },
              { link: 'management:roles' },
              { link: 'management:api_keys' },
              { link: 'management:role_mappings' },
            ],
          },
          {
            title: i18nStrings.stackManagementV2.data.title,
            children: [
              { link: 'management:cross_cluster_replication' },
              { link: 'management:remote_clusters' },
              { link: 'management:migrate_data' },
            ],
          },
          {
            title: i18nStrings.stackManagementV2.kibana.title,
            children: [
              { link: 'management:dataViews' },
              { link: 'management:filesManagement' },
              { link: 'management:objects' },
              { link: 'management:tags' },
              { link: 'management:search_sessions' },
              { link: 'management:spaces' },
              { link: 'maps' },
              { link: 'graph' },
              { link: 'canvas' },
              { link: 'management:settings' },
            ],
          },
          {
            title: i18nStrings.stackManagement.stack.title,
            children: [
              { link: 'management:license_management' },
              { link: 'management:upgrade_assistant' },
            ],
          },
        ],
      },
    ],
  };
};
