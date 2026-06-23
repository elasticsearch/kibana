/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppDeepLinkId, NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import { i18n } from '@kbn/i18n';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import {
  ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
  SecurityGroupName,
  SecurityPageName,
} from '@kbn/security-solution-navigation';
import { i18nStrings, securityLink } from '@kbn/security-solution-navigation/links';
import { defaultNavigationTree } from '@kbn/security-solution-navigation/navigation_tree';
import { AGENT_BUILDER_NAV_AT_TOP_FLAG } from '@kbn/navigation-plugin/public';

import { type Services } from '../common/services';
import { createManagementFooterItemsTree } from './management_footer_items';

const SOLUTION_NAME = i18n.translate(
  'xpack.securitySolutionServerless.navLinks.projectType.title',
  { defaultMessage: 'Security' }
);

export const createNavigationTree = async (
  services: Services,
  chatExperience: AIChatExperience = AIChatExperience.Classic
): Promise<NavigationTreeDefinition> => {
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
        link: securityLink(SecurityPageName.landing),
        title: SOLUTION_NAME,
        icon: 'logoSecurity',
        renderAs: 'home',
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
        services.experimentalFeatures.entityAnalyticsNewHomePageEnabled
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
        id: SecurityPageName.onboarding,
        link: 'onboarding' as AppDeepLinkId,
        sideNavStatus: 'hidden',
      },
    ],
    footer: [
      {
        id: SecurityGroupName.launchpad,
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
      createManagementFooterItemsTree(services, chatExperience),
    ],
  };
};
