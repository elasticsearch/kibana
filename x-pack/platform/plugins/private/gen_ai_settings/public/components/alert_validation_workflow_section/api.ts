/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import {
  ALERT_VALIDATION_WORKFLOW_API_VERSION,
  ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
  ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT,
  type AlertValidationWorkflowRuleAttachmentSelectionRequestBody,
  type AlertValidationWorkflowRuleAttachmentStatsRequestBody,
  type AlertValidationWorkflowRuleAttachmentUpdateRequestBody,
  type AlertValidationWorkflowSettings,
  type AlertValidationWorkflowSaveResponse,
  type AlertValidationWorkflowSettingsResponse,
  type RuleAttachmentPage,
  type RuleAttachmentSelection,
  type RuleAttachmentStats,
  type RuleAttachmentSummary,
  type UpdateRuleAttachmentsResult,
} from '@kbn/workflows/common/alert_validation_workflow';

export {
  ALERT_VALIDATION_WORKFLOW_API_VERSION,
  ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
  ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT,
};

export type { AlertValidationWorkflowSettings };
export type {
  RuleAttachmentPage,
  RuleAttachmentSelection,
  RuleAttachmentStats,
  RuleAttachmentSummary,
  UpdateRuleAttachmentsResult,
};

export const fetchAlertValidationWorkflowSettings = ({
  http,
}: {
  http: HttpStart;
}): Promise<AlertValidationWorkflowSettingsResponse> => {
  return http.fetch<AlertValidationWorkflowSettingsResponse>(
    ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
    {
      method: 'GET',
      version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
    }
  );
};

export const saveAlertValidationWorkflowSettings = ({
  http,
  settings,
}: {
  http: HttpStart;
  settings: AlertValidationWorkflowSettings;
}): Promise<AlertValidationWorkflowSaveResponse> => {
  return http.fetch<AlertValidationWorkflowSaveResponse>(ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE, {
    method: 'PUT',
    version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
    body: JSON.stringify(settings),
  });
};

export const fetchAlertValidationWorkflowRuleAttachments = ({
  http,
  search,
  page,
  perPage,
}: {
  http: HttpStart;
  search: string;
  page: number;
  perPage: number;
}): Promise<RuleAttachmentPage> => {
  return http.fetch<RuleAttachmentPage>(ALERT_VALIDATION_WORKFLOW_RULES_ROUTE, {
    method: 'GET',
    version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
    query: {
      search,
      page,
      per_page: perPage,
    },
  });
};

export const fetchAlertValidationWorkflowRuleAttachmentStats = ({
  http,
  search,
}: {
  http: HttpStart;
  search: string;
}): Promise<RuleAttachmentStats> => {
  const body: AlertValidationWorkflowRuleAttachmentStatsRequestBody = { search };

  return http.fetch<RuleAttachmentStats>(ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE, {
    method: 'POST',
    version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
    body: JSON.stringify(body),
  });
};

export const fetchAlertValidationWorkflowRuleAttachmentSelection = ({
  http,
  search,
}: {
  http: HttpStart;
  search: string;
}): Promise<RuleAttachmentSelection> => {
  const body: AlertValidationWorkflowRuleAttachmentSelectionRequestBody = { search };

  return http.fetch<RuleAttachmentSelection>(ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE, {
    method: 'POST',
    version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
    body: JSON.stringify(body),
  });
};

export const updateAlertValidationWorkflowRuleAttachments = ({
  http,
  attachRuleIds,
  detachRuleIds,
  dryRun,
}: {
  http: HttpStart;
  attachRuleIds: string[];
  detachRuleIds: string[];
  dryRun?: boolean;
}): Promise<UpdateRuleAttachmentsResult> => {
  const body: AlertValidationWorkflowRuleAttachmentUpdateRequestBody = {
    attachRuleIds,
    detachRuleIds,
    dryRun: dryRun ?? false,
  };

  return http.fetch<UpdateRuleAttachmentsResult>(ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE, {
    method: 'POST',
    version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
    body: JSON.stringify(body),
  });
};
