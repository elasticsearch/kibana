/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LinkCategoryType, type SeparatorLinkCategory } from '@kbn/security-solution-navigation';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { SecurityPageName } from '../../../../../common';

export const getNavCategories = (
  chatExperience: AIChatExperience,
  enableAlertsAndAttacksAlignment?: boolean,
  isNewEAHomePageEnabled?: boolean,
  securityClassicNavExternalLinks?: boolean,
  isAgentBuilderNavAtTop?: boolean
): SeparatorLinkCategory[] => {
  const categories: SeparatorLinkCategory[] = [
    {
      type: LinkCategoryType.separator,
      linkIds: securityClassicNavExternalLinks
        ? // Agent builder for AI agent chat and at the top
          chatExperience === AIChatExperience.Agent && isAgentBuilderNavAtTop
          ? [
              SecurityPageName.externalLinkAgentBuilder,
              SecurityPageName.externalLinkDiscover,
              SecurityPageName.dashboards,
            ]
          : [SecurityPageName.externalLinkDiscover, SecurityPageName.dashboards]
        : [SecurityPageName.dashboards],
    },
    {
      type: LinkCategoryType.separator,
      linkIds: [
        SecurityPageName.rulesLanding,
        enableAlertsAndAttacksAlignment
          ? SecurityPageName.alertDetections
          : SecurityPageName.alerts,
        SecurityPageName.alertsV2,
        SecurityPageName.rulesV2,
        ...(securityClassicNavExternalLinks
          ? [
              // Agent builder for AI agent chat and not classic AI experience
              ...(chatExperience === AIChatExperience.Agent && !isAgentBuilderNavAtTop
                ? [SecurityPageName.externalLinkAgentBuilder]
                : []),
              SecurityPageName.externalLinkWorkflows,
            ]
          : []),
        SecurityPageName.attackDiscovery,
        SecurityPageName.cloudSecurityPostureFindings,
        SecurityPageName.case,
      ],
    },
    {
      type: LinkCategoryType.separator,
      linkIds: [
        isNewEAHomePageEnabled
          ? SecurityPageName.entityAnalyticsHomePage
          : SecurityPageName.entityAnalyticsLanding,
        SecurityPageName.exploreLanding,
        SecurityPageName.timelines,
        SecurityPageName.threatIntelligence,
        SecurityPageName.assetInventory,
      ],
    },
  ];

  return categories;
};
