/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { CoreStart } from '@kbn/core/public';
import { firstValueFrom } from 'rxjs';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';

import type { ExperimentalFeatures } from '../../../common';
import {
  ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
  USE_NEW_ENTITY_ANALYTICS_HOME_PAGE_FLAG,
} from '../../../common/constants';
import { aiValueLinks } from '../../reports/links';
import { configurationsLinks, getConfigurationsLinks } from '../../configurations/links';
import { links as attackDiscoveryLinks } from '../../attack_discovery/links';
import { links as assetInventoryLinks } from '../../asset_inventory/links';
import { siemReadinessLinks } from '../../siem_readiness/links';
import type { AppLinkItems } from '../../common/links/types';
import { indicatorsLinks } from '../../threat_intelligence/links';
import { alertDetectionsLinks, alertsLink, alertSummaryLink } from '../../detections/links';
import { links as rulesLinks } from '../../rules/links';
import { links as siemMigrationsLinks } from '../../siem_migrations/links';
import { links as timelinesLinks } from '../../timelines/links';
import { links as casesLinks } from '../../cases/links';
import { getManagementFilteredLinks, links as managementLinks } from '../../management/links';
import { exploreLinks } from '../../explore/links';
import { launchPadLinks, onboardingLinks } from '../../onboarding/links';
import { findingsLinks } from '../../cloud_security_posture/links';
import type { StartPlugins } from '../../types';
import { dashboardsLinks } from '../../dashboards/links';
import {
  entityAnalyticsLinks,
  entityAnalyticsV2Links,
  entityAnalyticsHomeLink,
} from '../../entity_analytics/links';

export const appLinks: AppLinkItems = Object.freeze([
  dashboardsLinks,
  alertsLink,
  alertSummaryLink,
  attackDiscoveryLinks,
  findingsLinks,
  casesLinks,
  configurationsLinks,
  timelinesLinks,
  indicatorsLinks,
  exploreLinks,
  entityAnalyticsLinks,
  assetInventoryLinks,
  rulesLinks,
  siemMigrationsLinks,
  onboardingLinks,
  managementLinks,
  siemReadinessLinks,
  aiValueLinks,
]);

export const getFilteredLinks = async (
  core: CoreStart,
  plugins: StartPlugins,
  experimentalFeatures: ExperimentalFeatures
): Promise<AppLinkItems> => {
  const managementFilteredLinks = await getManagementFilteredLinks(
    core,
    plugins,
    experimentalFeatures
  );

  const chatExperience$ = core.uiSettings.get$<AIChatExperience>(
    AI_CHAT_EXPERIENCE_TYPE,
    AIChatExperience.Agent
  );
  const chatExperience: AIChatExperience = await firstValueFrom(chatExperience$);
  const filteredConfigurationsLinks = getConfigurationsLinks(chatExperience);
  const enableAlertsAndAttacksAlignment = core.uiSettings.get(
    ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
    experimentalFeatures.enableAlertsAndAttacksAlignment
  );

  return Object.freeze([
    dashboardsLinks,
    enableAlertsAndAttacksAlignment ? alertDetectionsLinks : alertsLink,
    alertSummaryLink,
    // Attack Discovery remains a permanent top-level page and stays visible in the side
    // navigation, global navigation, and global search regardless of the alerts-and-attacks
    // alignment setting.
    attackDiscoveryLinks,
    findingsLinks,
    casesLinks,
    filteredConfigurationsLinks,
    timelinesLinks,
    indicatorsLinks,
    exploreLinks,
    experimentalFeatures.entityAnalyticsNewHomePageEnabled
      ? entityAnalyticsV2Links
      : entityAnalyticsLinks,
    ...(core.featureFlags.getBooleanValue(USE_NEW_ENTITY_ANALYTICS_HOME_PAGE_FLAG, false)
      ? [entityAnalyticsHomeLink]
      : []),
    assetInventoryLinks,
    rulesLinks,
    siemMigrationsLinks,
    launchPadLinks,
    managementFilteredLinks,
  ]);
};
