/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CASE_DETAILS_URL,
  INTERNAL_CASE_METRICS_DETAILS_URL,
  CASE_COMMENTS_URL,
  CASE_PUSH_URL,
  CASE_CONFIGURE_DETAILS_URL,
  CASE_ALERTS_URL,
  CASE_COMMENT_DELETE_URL,
  INTERNAL_CASE_FIND_USER_ACTIONS_URL,
  INTERNAL_GET_CASE_USER_ACTIONS_STATS_URL,
  INTERNAL_BULK_GET_ATTACHMENTS_URL,
  INTERNAL_CONNECTORS_URL,
  INTERNAL_CASE_USERS_URL,
  INTERNAL_DELETE_FILE_ATTACHMENTS_URL,
  CASE_FIND_ATTACHMENTS_URL,
  INTERNAL_PUT_CUSTOM_FIELDS_URL,
  INTERNAL_CASE_OBSERVABLES_URL,
  INTERNAL_CASE_OBSERVABLES_PATCH_URL,
  INTERNAL_CASE_SIMILAR_CASES_URL,
  INTERNAL_CASE_OBSERVABLES_DELETE_URL,
} from '../constants';

export const getCaseDetailsUrl = (id: string): string => {
  return CASE_DETAILS_URL.replace('{case_id}', id);
};

export const getCaseDetailsMetricsUrl = (id: string): string => {
  return INTERNAL_CASE_METRICS_DETAILS_URL.replace('{case_id}', id);
};

export const getCaseCommentsUrl = (id: string): string => {
  return CASE_COMMENTS_URL.replace('{case_id}', id);
};

export const getCaseFindAttachmentsUrl = (caseId: string): string => {
  return CASE_FIND_ATTACHMENTS_URL.replace('{case_id}', caseId);
};

export const getCaseCommentDeleteUrl = (caseId: string, commentId: string): string => {
  return CASE_COMMENT_DELETE_URL.replace('{case_id}', caseId).replace('{comment_id}', commentId);
};

export const getCaseUserActionStatsUrl = (id: string): string => {
  return INTERNAL_GET_CASE_USER_ACTIONS_STATS_URL.replace('{case_id}', id);
};

export const getCaseFindUserActionsUrl = (id: string): string => {
  return INTERNAL_CASE_FIND_USER_ACTIONS_URL.replace('{case_id}', id);
};

export const getCasePushUrl = (caseId: string, connectorId: string): string => {
  return CASE_PUSH_URL.replace('{case_id}', caseId).replace('{connector_id}', connectorId);
};

export const getCaseConfigurationDetailsUrl = (configureID: string): string => {
  return CASE_CONFIGURE_DETAILS_URL.replace('{configuration_id}', configureID);
};

export const getCasesFromAlertsUrl = (alertId: string): string => {
  return CASE_ALERTS_URL.replace('{alert_id}', alertId);
};

export const getCaseBulkGetAttachmentsUrl = (id: string): string => {
  return INTERNAL_BULK_GET_ATTACHMENTS_URL.replace('{case_id}', id);
};

export const getCaseConnectorsUrl = (id: string): string => {
  return INTERNAL_CONNECTORS_URL.replace('{case_id}', id);
};

export const getCaseUsersUrl = (id: string): string => {
  return INTERNAL_CASE_USERS_URL.replace('{case_id}', id);
};

export const getCasesDeleteFileAttachmentsUrl = (id: string): string => {
  return INTERNAL_DELETE_FILE_ATTACHMENTS_URL.replace('{case_id}', id);
};

export const getCustomFieldReplaceUrl = (caseId: string, customFieldId: string): string => {
  return INTERNAL_PUT_CUSTOM_FIELDS_URL.replace('{case_id}', caseId).replace(
    '{custom_field_id}',
    customFieldId
  );
};

export const getCaseCreateObservableUrl = (id: string): string => {
  return INTERNAL_CASE_OBSERVABLES_URL.replace('{case_id}', id);
};

export const getCaseUpdateObservableUrl = (id: string, observableId: string): string => {
  return INTERNAL_CASE_OBSERVABLES_PATCH_URL.replace('{case_id}', id).replace(
    '{observable_id}',
    observableId
  );
};

export const getCaseDeleteObservableUrl = (id: string, observableId: string): string => {
  return INTERNAL_CASE_OBSERVABLES_DELETE_URL.replace('{case_id}', id).replace(
    '{observable_id}',
    observableId
  );
};

export const getCaseSimilarCasesUrl = (caseId: string) => {
  return INTERNAL_CASE_SIMILAR_CASES_URL.replace('{case_id}', caseId);
};
