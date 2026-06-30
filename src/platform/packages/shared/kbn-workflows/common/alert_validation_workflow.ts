/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

export const MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG =
  'securitySolution.managedAlertValidationWorkflowEnabled' as const;
export const MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT = true as const;

export const ALERT_VALIDATION_WORKFLOW_API_VERSION = '1' as const;

export const ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE =
  '/internal/security_solution/alert_validation_workflow/settings' as const;
export const ALERT_VALIDATION_WORKFLOW_RULES_ROUTE =
  '/internal/security_solution/alert_validation_workflow/rules' as const;
export const ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE =
  '/internal/security_solution/alert_validation_workflow/rules/_stats' as const;
export const ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE =
  '/internal/security_solution/alert_validation_workflow/rules/_selection' as const;
export const ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE =
  '/internal/security_solution/alert_validation_workflow/rules/_update' as const;

export const AlertValidationWorkflowSettings = z.object({
  autoCloseEnabled: z.boolean(),
  autoCloseConfidenceScoreMinThreshold: z.number().min(0).max(1),
  autoCloseConfidenceScoreMaxThreshold: z.number().min(0).max(1),
});

export type AlertValidationWorkflowSettings = z.infer<typeof AlertValidationWorkflowSettings>;

export const AlertValidationWorkflowSettingsRequestBody = AlertValidationWorkflowSettings.refine(
  ({ autoCloseConfidenceScoreMinThreshold, autoCloseConfidenceScoreMaxThreshold }) =>
    autoCloseConfidenceScoreMinThreshold < autoCloseConfidenceScoreMaxThreshold,
  {
    message: 'Minimum confidence score must be lower than maximum confidence score',
    path: ['autoCloseConfidenceScoreMaxThreshold'],
  }
);

export type AlertValidationWorkflowSettingsRequestBody = z.infer<
  typeof AlertValidationWorkflowSettingsRequestBody
>;

export interface AlertValidationWorkflowSettingsResponse {
  settings: AlertValidationWorkflowSettings;
  workflowId: string;
}

export interface AlertValidationWorkflowSaveResponse
  extends AlertValidationWorkflowSettingsResponse {
  installed: boolean;
}

export const AlertValidationWorkflowRuleAttachmentListRequestQuery = z.object({
  search: z.string().optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type AlertValidationWorkflowRuleAttachmentListRequestQuery = z.infer<
  typeof AlertValidationWorkflowRuleAttachmentListRequestQuery
>;

export const AlertValidationWorkflowRuleAttachmentStatsRequestBody = z.object({
  search: z.string().optional().default(''),
});

export type AlertValidationWorkflowRuleAttachmentStatsRequestBody = z.infer<
  typeof AlertValidationWorkflowRuleAttachmentStatsRequestBody
>;

export const AlertValidationWorkflowRuleAttachmentSelectionRequestBody =
  AlertValidationWorkflowRuleAttachmentStatsRequestBody;

export type AlertValidationWorkflowRuleAttachmentSelectionRequestBody = z.infer<
  typeof AlertValidationWorkflowRuleAttachmentSelectionRequestBody
>;

export const AlertValidationWorkflowRuleAttachmentUpdateRequestBody = z
  .object({
    attachRuleIds: z.array(z.string()).max(2000).optional().default([]),
    detachRuleIds: z.array(z.string()).max(2000).optional().default([]),
    dryRun: z.boolean().optional().default(false),
  })
  .refine(({ attachRuleIds, detachRuleIds }) => attachRuleIds.length + detachRuleIds.length > 0, {
    message: 'At least one rule update is required',
  });

export type AlertValidationWorkflowRuleAttachmentUpdateRequestBody = z.infer<
  typeof AlertValidationWorkflowRuleAttachmentUpdateRequestBody
>;

export interface RuleAttachmentQuery {
  search: string;
}

export interface AlertValidationWorkflowRuleAttachmentService {
  getRuleAttachmentStats(params: RuleAttachmentQuery): Promise<RuleAttachmentStats>;
  getRuleAttachments(params: GetRuleAttachmentsParams): Promise<RuleAttachmentPage>;
  getRuleAttachmentSelection(params: RuleAttachmentQuery): Promise<RuleAttachmentSelection>;
  updateRuleAttachments(params: UpdateRuleAttachmentsParams): Promise<UpdateRuleAttachmentsResult>;
}

export interface GetRuleAttachmentsParams extends RuleAttachmentQuery {
  page: number;
  perPage: number;
}

export interface RuleAttachmentStats {
  total: number;
  attached: number;
}

export interface RuleAttachmentPage extends RuleAttachmentStats {
  page: number;
  perPage: number;
  rules: RuleAttachmentSummary[];
}

export interface RuleAttachmentSelection extends RuleAttachmentStats {
  selectable: number;
  attachedRuleIds: string[];
  ruleIds: string[];
}

export interface RuleAttachmentSummary {
  id: string;
  name: string;
  enabled: boolean;
  attached: boolean;
}

export interface UpdateRuleAttachmentsParams {
  attachRuleIds: string[];
  detachRuleIds: string[];
  dryRun?: boolean;
}

export interface UpdateRuleAttachmentsResult {
  matched: number;
  updated: number;
}
