/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

/**
 * Register threat-intelligence-owned workflow step types with the public
 * `workflowsExtensions` setup contract so the YAML editor's strict-schema
 * validator (see
 * `workflows_management/public/features/validate_workflow_yaml/model/use_workflow_json_schema.ts`)
 * picks them up.
 *
 * Mirrors the server-side `registerThreatIntelligenceWorkflowSteps` in
 * `server/threat_intelligence/workflows/step_types/index.ts`. Steps are
 * loaded lazily via async loaders to keep the heavy
 * `fetch_source_common` Zod schemas off the critical-path bundle until the
 * editor actually requests them.
 *
 * The caller is expected to invoke this only when the optional
 * `workflowsExtensions` plugin is present and the
 * `threatIntelligenceSkillEnabled` experimental feature is on, matching
 * the gating policy applied server-side. Without that gate, dark-flagged
 * deployments would advertise a step type whose handler is never
 * registered.
 */
export const registerThreatIntelligenceWorkflowSteps = (
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup
): void => {
  workflowsExtensions.registerStepDefinition(async () =>
    import('./fetch_source').then((m) => m.fetchSourceStepDefinition)
  );
};
