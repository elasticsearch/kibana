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
import { manageWatchlistsSkill } from './manage_watchlists';
import { pciComplianceSkill } from './pci_compliance';
import { threatHuntingSkill } from './threat_hunting';
import { alertAnalysisSkill } from './alert_analysis';
import { alertTriageSkill } from './alert_triage';
import type { EntityAnalyticsRoutesDeps } from '../../lib/entity_analytics/types';
import { findSecurityMlJobsSkill } from './find_security_ml_jobs';
import { createInvestigateRuleSkill } from './investigate_rule';
import { createFindRulesSkill } from './find_rules';
import { siemReadinessSkill } from './siem_readiness';
import {
  automaticMigrationRulesStartMigrationSkill,
  automaticMigrationRulesSummarizeSkill,
  automaticMigrationRulesStopMigrationSkill,
  automaticMigrationRulesUpdateMigrationSkill,
  automaticMigrationRulesDeleteMigrationSkill,
} from './siem_migration';
import { entityAnalyticsLeadsSkill } from './entity_analytics_leads';
import { createRecommendPrebuiltRulesSkill } from './recommend_prebuilt_rules';
import { createDetectionCoverageSkill } from './detection_coverage';
import { endpointForensicAnalysisSkill } from './endpoint_forensic_analysis';
import { autonomousForensicInvestigatorSkill } from './autonomous_forensic_investigator';
import { SIEM_READINESS_AGENT_BUILDER_ENABLED } from '../siem_readiness_feature_flag';

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

  if (experimentalFeatures.entityAnalyticsWatchlistEnabled) {
    agentBuilder.skills.register(manageWatchlistsSkill);
  }

  agentBuilder.skills.register(
    getDetectionRuleEditSkill({
      rulePreviewEnabled: experimentalFeatures.rulePreviewAttachmentEnabled,
    })
  );
  if (experimentalFeatures.dexAiSkillRecommendPrebuiltRules) {
    await agentBuilder.skills.register(
      createRecommendPrebuiltRulesSkill({ getStartServices, logger, ml })
    );
  }

  if (experimentalFeatures.dexAiSkillDetectionCoverage) {
    await agentBuilder.skills.register(createDetectionCoverageSkill());
  }

  await agentBuilder.skills.register(
    findSecurityMlJobsSkill({ getStartServices, isEntityStoreV2Enabled, logger, ml })
  );

  await agentBuilder.skills.register(threatHuntingSkill);
  await agentBuilder.skills.register(alertAnalysisSkill);
  await agentBuilder.skills.register(alertTriageSkill);
  if (experimentalFeatures.dexAiSkillFindRules) {
    await agentBuilder.skills.register(createFindRulesSkill({ getStartServices, logger }));
  }
  if (SIEM_READINESS_AGENT_BUILDER_ENABLED) {
    await agentBuilder.skills.register(siemReadinessSkill);
  }

  // Automatic Migration sibling skills: gated by the Automatic Migration feature flag and the
  // dedicated agent-builder experimental flag, so skills ship in lockstep with their tools.
  if (
    !experimentalFeatures.siemMigrationsDisabled &&
    experimentalFeatures.siemRuleMigrationsAgentBuilderEnabled
  ) {
    await agentBuilder.skills.register(automaticMigrationRulesSummarizeSkill);
    await agentBuilder.skills.register(automaticMigrationRulesStartMigrationSkill);
    await agentBuilder.skills.register(automaticMigrationRulesStopMigrationSkill);
    await agentBuilder.skills.register(automaticMigrationRulesUpdateMigrationSkill);
    await agentBuilder.skills.register(automaticMigrationRulesDeleteMigrationSkill);
  }

  if (experimentalFeatures.leadGenerationEnabled) {
    agentBuilder.skills.register(entityAnalyticsLeadsSkill);
  }

  if (experimentalFeatures.pciComplianceAgentBuilder) {
    agentBuilder.skills.register(pciComplianceSkill);
  }

  if (experimentalFeatures.endpointForensicAnalysisSkill) {
    await agentBuilder.skills.register(endpointForensicAnalysisSkill);
  }

  if (experimentalFeatures.autonomousForensicInvestigatorSkill) {
    await agentBuilder.skills.register(autonomousForensicInvestigatorSkill);
  }

  if (experimentalFeatures.investigateRuleSkill) {
    await agentBuilder.skills.register(createInvestigateRuleSkill());
  }
};
