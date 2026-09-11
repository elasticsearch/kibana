/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared constants for the rule-tuning managed workflow eval suite.
 *
 * Ported 2026-09-11 from the fork-stranded suite (hannahbrooks#9 /
 * patrykkopycinski#15) for the post-#290097 main architecture: the old
 * unified `system-security-rule-tuning` workflow was split into a
 * fan-out worker plus a per-rule review child.
 *
 * Inlined (rather than imported from `@kbn/workflows/managed`) to keep this
 * functional-tests package free of a runtime dependency on the security
 * solution plugin. They mirror:
 *   - ALERTZERO_RULE_TUNING_(WORKER|REVIEW)_WORKFLOW_ID (@kbn/workflows/managed)
 *   - WORKFLOWS_API_VERSION (workflows_management route constants)
 */

/**
 * Managed sweep workflow installed globally by the security solution plugin.
 * Harvests FP-alert clusters per rule and fans out one review child per rule.
 */
export const RULE_TUNING_WORKER_WORKFLOW_ID = 'system-security-rule-tuning-worker';

/**
 * Per-rule child workflow: fetch rule → diagnose (ai.agent) → backtest
 * previews → waitForApproval gate → apply/tag. The diagnose step's
 * structured_output is what this suite grades.
 */
export const RULE_TUNING_REVIEW_WORKFLOW_ID = 'system-security-rule-tuning-review';

/** Public workflows_management API version (`Elastic-Api-Version` header). */
export const WORKFLOWS_API_VERSION = '2023-10-31';

/**
 * The review workflow's diagnose step enum (rule_tuning_review.yaml). Post-split,
 * `risk_score`/`disable`/`manual` are no longer emittable — the closest intents
 * (low-value rules, unfixable noise) now route to the analyst via the approval
 * gate's Dismiss/Approve, so the old `manual` label has no successor in-band.
 */
export const CHANGE_TYPES = ['exception', 'suppression', 'query', 'threshold'] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Rule types whose PATCH payload accepts `alert_suppression` (see rule_schemas.schema.yaml). */
export const SUPPRESSION_CAPABLE_RULE_TYPES = ['query', 'saved_query', 'eql', 'threshold'] as const;

/** Tag prefix the workflow writes to harvested alerts. Isolated to the eval namespace. */
export const EVAL_TAG_PREFIX = 'eval-rule-tuning';
