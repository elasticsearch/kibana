/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { ExperimentalFeatures } from '../../../common/experimental_features';
import type { EndpointAppContextService } from '../../endpoint/endpoint_app_context_services';
import { createAutomaticTroubleshootingSkill } from './automatic_troubleshooting';
import { getDetectionRuleEditSkill } from './detection_rule_edit';
import { getEntityAnalyticsSkill } from './entity_analytics';
import { pciComplianceSkill } from './pci_compliance';
import { threatHuntingSkill } from './threat_hunting';
import { alertAnalysisSkill } from './alert_analysis';
import type { EntityAnalyticsRoutesDeps } from '../../lib/entity_analytics/types';
import { createEndpointResponseActionsSkill } from './endpoint_response_actions';
import { findSecurityMlJobsSkill } from './find_security_ml_jobs';
import { createFindRulesSkill } from './find_rules';
import { siemReadinessSkill } from './siem_readiness';
import { createRecommendPrebuiltRulesSkill } from './recommend_prebuilt_rules';

interface RegisterSkillsOpts {
  agentBuilder: AgentBuilderPluginSetup;
  experimentalFeatures: ExperimentalFeatures;
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'];
  kibanaVersion: string;
  logger: Logger;
  ml: EntityAnalyticsRoutesDeps['ml'];
  options: {
    endpointAppContextService: EndpointAppContextService;
  };
}

/**
 * Registers all security agent builder skills with the agentBuilder plugin
 */
export const registerSkills = async ({
  agentBuilder,
  experimentalFeatures,
  getStartServices,
  kibanaVersion,
  logger,
  ml,
  options,
}: RegisterSkillsOpts): Promise<void> => {
  if (experimentalFeatures.automaticTroubleshootingSkill) {
    agentBuilder.skills.register(
      createAutomaticTroubleshootingSkill(options.endpointAppContextService)
    );
  }

  const isEntityStoreV2Enabled = experimentalFeatures.entityAnalyticsEntityStoreV2;
  await agentBuilder.skills.register(
    getEntityAnalyticsSkill({ getStartServices, isEntityStoreV2Enabled, kibanaVersion, logger })
  );

  agentBuilder.skills.register(getDetectionRuleEditSkill());
  if (experimentalFeatures.dexAiSkillRecommendPrebuiltRules) {
    await agentBuilder.skills.register(
      createRecommendPrebuiltRulesSkill({ getStartServices, logger, ml })
    );
  }

  await agentBuilder.skills.register(
    findSecurityMlJobsSkill({ getStartServices, isEntityStoreV2Enabled, logger, ml })
  );

  await agentBuilder.skills.register(threatHuntingSkill);
  await agentBuilder.skills.register(alertAnalysisSkill);
  if (experimentalFeatures.dexAiSkillFindRules) {
    await agentBuilder.skills.register(createFindRulesSkill({ getStartServices, logger }));
  }
  await agentBuilder.skills.register(siemReadinessSkill);

  if (experimentalFeatures.pciComplianceAgentBuilder) {
    agentBuilder.skills.register(pciComplianceSkill);
  }

  if (experimentalFeatures.endpointResponseActionsSkill) {
    agentBuilder.skills.register(
      createEndpointResponseActionsSkill(options.endpointAppContextService)
    );
  }
};
