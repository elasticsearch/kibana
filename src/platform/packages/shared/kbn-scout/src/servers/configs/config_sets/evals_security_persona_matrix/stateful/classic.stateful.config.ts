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
 * Custom Scout stateful server configuration for the Security Persona Matrix suite.
 *
 * Enables every experimental-feature-gated security Agent Builder skill so the
 * breadth-first persona matrix always exercises the full skill surface, not just
 * the subset that happens to be on by default. Catching skill-routing/registration
 * regressions here (rather than only in each skill's own narrower eval suite) is
 * the point of this suite.
 *
 * Enabled via `xpack.securitySolution.enableExperimental`:
 * - automaticTroubleshootingSkill   (elastic-defend-configuration-troubleshooting)
 * - entityAnalyticsWatchlistEnabled (manage-watchlists)
 * - dexAiSkillRecommendPrebuiltRules (recommend-prebuilt-rules)
 * - dexAiSkillFindRules             (find-security-rules)
 * - investigateRuleSkill            (investigate-rule)
 * - leadGenerationEnabled           (entity-analytics-leads)
 * - pciComplianceAgentBuilder       (pci-compliance)
 * - rulePreviewAttachmentEnabled    (detection-rule-edit rule-preview tool)
 * - entityAnalyticsEntityStoreV2    (entity-analytics v2 code path)
 *
 * `xpack.alerting_v2.enabled` additionally gates the alerting_v2 plugin's
 * rule-management skill (defaults to true, set explicitly here for clarity).
 *
 * NOT enabled here: `SIEM_READINESS_AGENT_BUILDER_ENABLED` is a hardcoded internal
 * constant in security_solution/server/agent_builder/siem_readiness_feature_flag.ts,
 * not a runtime flag — it cannot be toggled via serverArgs. If the siem-readiness
 * skill needs coverage in this matrix, that constant must change or the skill needs
 * its own eval fixture, tracked as a follow-up.
 *
 * Skills that register unconditionally (always on, no flag needed): threat-hunting,
 * alert-analysis, alert-triage, workflow-authoring, entity-analytics (v1 path),
 * detection-rule-edit (base), find-security-ml-jobs.
 *
 * `server.maxPayload` is raised from the Scout default (1.6 MB) because the
 * judge's `/internal/inference/prompt` requests carry the full agent trajectory
 * and exceed it on long multi-step examples (observed 413 on
 * gemini-3.1-flash-lite, 2026-08-20). The inherited arg is filtered out and
 * re-set here so the value is deterministic regardless of CLI arg ordering.
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_security_persona_matrix
 */
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs.filter(
        (arg) => !arg.startsWith('--server.maxPayload=')
      ),
      `--server.maxPayload=${MAX_PAYLOAD_BYTES}`,
      '--uiSettings.overrides.agentBuilder:experimentalFeatures=true',
      `--xpack.securitySolution.enableExperimental=${JSON.stringify([
        'automaticTroubleshootingSkill',
        'entityAnalyticsWatchlistEnabled',
        'dexAiSkillRecommendPrebuiltRules',
        'dexAiSkillFindRules',
        'investigateRuleSkill',
        'leadGenerationEnabled',
        'pciComplianceAgentBuilder',
        'rulePreviewAttachmentEnabled',
        'entityAnalyticsEntityStoreV2',
      ])}`,
      '--xpack.alerting_v2.enabled=true',
    ],
  },
};
