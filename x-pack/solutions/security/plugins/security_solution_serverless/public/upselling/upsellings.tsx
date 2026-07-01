/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ProductFeatureKeyType } from '@kbn/security-solution-features';
import { ProductFeatureKey } from '@kbn/security-solution-features/keys';
import { SecurityPageName } from '@kbn/security-solution-plugin/common';
import {
  UPGRADE_INVESTIGATION_GUIDE,
  UPGRADE_INVESTIGATION_GUIDE_INTERACTIONS,
  PREBUILT_RULE_CUSTOMIZATION,
  PREBUILT_RULE_CUSTOMIZATION_DESCRIPTION,
} from '@kbn/security-solution-upselling/messages';
import type {
  UpsellingMessageId,
  UpsellingSectionId,
} from '@kbn/security-solution-upselling/service/types';
import React from 'react';
import { CloudSecurityPostureIntegrationPliBlockLazy } from './sections/cloud_security_posture';
import {
  EndpointAgentTamperProtectionLazy,
  EndpointCustomNotificationLazy,
  EndpointPolicyProtectionsLazy,
  EndpointProtectionUpdatesLazy,
  EndpointDeviceControlLazy,
  RuleDetailsEndpointExceptionsLazy,
} from './sections/endpoint_management';
import { getProductTypeByPLI } from './hooks/use_product_type_by_pli';
import {
  AIValueReportUpsellPageLazy,
  AttackDiscoveryUpsellingPageLazy,
  EntityAnalyticsUpsellingPageLazy,
  EntityAnalyticsUpsellingSectionLazy,
  OsqueryResponseActionsUpsellingSectionLazy,
  SiemMigrationsStartUpsellSectionLazy,
  SiemMigrationsTranslatedRulesUpsellPageLazy,
  ThreatIntelligencePaywallLazy,
} from './lazy_upselling';
import * as i18n from './translations';
import { AutomaticImportLazy } from './sections/automatic_import';

interface UpsellingsConfig {
  pli: ProductFeatureKeyType;
  component: React.ComponentType;
}

interface UpsellingsMessageConfig {
  pli: ProductFeatureKeyType;
  message: string;
  id: UpsellingMessageId;
}

type UpsellingPages = Array<UpsellingsConfig & { pageName: SecurityPageName }>;
type UpsellingSections = Array<UpsellingsConfig & { id: UpsellingSectionId }>;
type UpsellingMessages = UpsellingsMessageConfig[];

// Upselling for entire pages, linked to a SecurityPageName
export const upsellingPages: UpsellingPages = [
  // It is highly advisable to make use of lazy loaded components to minimize bundle size.
  {
    pageName: SecurityPageName.entityAnalytics,
    pli: ProductFeatureKey.advancedInsights,
    component: () => (
      <EntityAnalyticsUpsellingPageLazy
        upgradeToLabel={entityAnalyticsProductType}
        upgradeMessage={i18n.UPGRADE_PRODUCT_MESSAGE(entityAnalyticsProductType)}
      />
    ),
  },
  {
    pageName: SecurityPageName.threatIntelligence,
    pli: ProductFeatureKey.threatIntelligence,
    component: () => (
      <ThreatIntelligencePaywallLazy requiredPLI={ProductFeatureKey.threatIntelligence} />
    ),
  },
  {
    pageName: SecurityPageName.attackDiscovery,
    pli: ProductFeatureKey.attackDiscovery,
    component: () => <AttackDiscoveryUpsellingPageLazy />,
  },
  {
    pageName: SecurityPageName.siemMigrationsRules,
    pli: ProductFeatureKey.siemMigrations,
    component: () => <SiemMigrationsTranslatedRulesUpsellPageLazy />,
  },
  {
    pageName: SecurityPageName.aiValue,
    pli: ProductFeatureKey.aiValueReport,
    component: () => <AIValueReportUpsellPageLazy />,
  },
];

const entityAnalyticsProductType = getProductTypeByPLI(ProductFeatureKey.advancedInsights) ?? '';

// Upselling for sections, linked by arbitrary ids
export const upsellingSections: UpsellingSections = [
  // It is highly advisable to make use of lazy loaded components to minimize bundle size.
  {
    id: 'osquery_automated_response_actions',
    pli: ProductFeatureKey.osqueryAutomatedResponseActions,
    component: () => (
      <OsqueryResponseActionsUpsellingSectionLazy
        requiredPLI={ProductFeatureKey.osqueryAutomatedResponseActions}
      />
    ),
  },
  {
    id: 'endpoint_agent_tamper_protection',
    pli: ProductFeatureKey.endpointAgentTamperProtection,
    component: EndpointAgentTamperProtectionLazy,
  },
  {
    id: 'endpointPolicyProtections',
    pli: ProductFeatureKey.endpointPolicyProtections,
    component: EndpointPolicyProtectionsLazy,
  },
  {
    id: 'endpoint_custom_notification',
    pli: ProductFeatureKey.endpointCustomNotification,
    component: EndpointCustomNotificationLazy,
  },
  {
    id: 'ruleDetailsEndpointExceptions',
    pli: ProductFeatureKey.endpointExceptions,
    component: RuleDetailsEndpointExceptionsLazy,
  },
  {
    id: 'endpoint_device_control',
    pli: ProductFeatureKey.endpointTrustedDevices,
    component: EndpointDeviceControlLazy,
  },
  {
    id: 'endpoint_protection_updates',
    pli: ProductFeatureKey.endpointProtectionUpdates,
    component: EndpointProtectionUpdatesLazy,
  },
  {
    id: 'cloud_security_posture_integration_installation',
    pli: ProductFeatureKey.cloudSecurityPosture,
    component: CloudSecurityPostureIntegrationPliBlockLazy,
  },
  {
    id: 'entity_analytics_panel',
    pli: ProductFeatureKey.advancedInsights,
    component: () => (
      <EntityAnalyticsUpsellingSectionLazy
        upgradeToLabel={entityAnalyticsProductType}
        upgradeMessage={i18n.UPGRADE_PRODUCT_MESSAGE(entityAnalyticsProductType)}
      />
    ),
  },
  {
    id: 'siem_migrations_start',
    pli: ProductFeatureKey.siemMigrations,
    component: SiemMigrationsStartUpsellSectionLazy,
  },
  {
    id: 'automatic_import',
    pli: ProductFeatureKey.automaticImport,
    component: () => <AutomaticImportLazy requiredPLI={ProductFeatureKey.automaticImport} />,
  },
];

// Upselling for sections, linked by arbitrary ids
export const upsellingMessages: UpsellingMessages = [
  {
    id: 'investigation_guide',
    pli: ProductFeatureKey.investigationGuide,
    message: UPGRADE_INVESTIGATION_GUIDE(
      getProductTypeByPLI(ProductFeatureKey.investigationGuide) ?? ''
    ),
  },
  {
    id: 'investigation_guide_interactions',
    pli: ProductFeatureKey.investigationGuideInteractions,
    message: UPGRADE_INVESTIGATION_GUIDE_INTERACTIONS(
      getProductTypeByPLI(ProductFeatureKey.investigationGuideInteractions) ?? ''
    ),
  },
  {
    id: 'prebuilt_rule_customization',
    pli: ProductFeatureKey.prebuiltRuleCustomization,
    message: PREBUILT_RULE_CUSTOMIZATION(
      getProductTypeByPLI(ProductFeatureKey.prebuiltRuleCustomization) ?? '',
      'feature tier'
    ),
  },
  {
    id: 'prebuilt_rule_customization_description',
    pli: ProductFeatureKey.prebuiltRuleCustomization,
    message: PREBUILT_RULE_CUSTOMIZATION_DESCRIPTION(
      getProductTypeByPLI(ProductFeatureKey.prebuiltRuleCustomization) ?? '',
      'feature tier'
    ),
  },
];
