/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { servers as evalsTracingConfig } from '../../evals_tracing/stateful/classic.stateful.config';

/**
 * Custom Scout stateful server configuration for the skill-selection benchmark suite.
 *
 * Enables all evaluated agent builder skills for routing evaluation:
 * - aiAssistant.aiAgents feature flag — required for AI agent skill loading
 * - agentBuilder:experimentalFeatures — enables skill-authoring (experimental: true)
 * - aiAssistant:preferredChatExperience=agent — ensures agent mode is active
 * - securitySolution.enableExperimental — enables elastic-defend-configuration-troubleshooting
 *   (automaticTroubleshootingSkill) and find-security-rules (dexAiSkillFindRules)
 * - streams.significantEventsMemoryEnabled — enables significant-events-memory skill registration
 *
 * Skills NOT included (intentionally excluded from benchmark scope):
 * - workflow-authoring, rule-management, pci-compliance, observability.rca
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_skill_selection
 */
export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs,
      '--feature_flags.overrides.aiAssistant.aiAgents.enabled=true',
      '--feature_flags.overrides.streams.significantEventsMemoryEnabled=true',
      '--uiSettings.overrides.agentBuilder:experimentalFeatures=true',
      '--uiSettings.overrides.aiAssistant:preferredChatExperience=agent',
      `--xpack.securitySolution.enableExperimental=${JSON.stringify([
        'automaticTroubleshootingSkill',
        'dexAiSkillFindRules',
        'investigateRuleSkill',
      ])}`,
    ],
  },
};
