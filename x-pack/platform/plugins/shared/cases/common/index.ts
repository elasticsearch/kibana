/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Careful of exporting anything from this file as any file(s) you export here will cause your page bundle size to increase.
// If you're using functions/types/etc... internally or within integration tests it's best to import directly from their paths
// than expose the functions/types/etc... here. You should _only_ expose functions/types/etc... that need to be shared with other plugins here.

// When you do have to add things here you might want to consider creating a package such as kbn-cases-constants to share with
// other plugins instead as packages are easier to break down and you do not have to carry the cost of extra plugin weight on
// first download since the other plugins/areas of your code can directly pull from the package in their async imports.
// For example, constants below could eventually be in a "kbn-cases-constants" instead.
// See: https://docs.elastic.dev/kibana-dev-docs/key-concepts/platform-intro#public-plugin-api

export type {
  CasesBulkGetResponse,
  CasePostRequest,
  CasePatchRequest,
  GetRelatedCasesByAlertResponse,
  UserActionFindResponse,
} from './types/api';
export type { Case, Cases, RelatedCase } from './types/domain';
export type {
  CaseUI,
  CasesUI,
  CasesFindResponseUI,
  Ecs,
  CaseViewRefreshPropInterface,
  CasesPermissions,
  CasesCapabilities,
} from './ui/types';

export { CaseSeverity } from './types/domain';

export {
  APP_ID,
  FEATURE_ID,
  FEATURE_ID_V2,
  CASES_URL,
  SECURITY_SOLUTION_OWNER,
  OBSERVABILITY_OWNER,
  GENERAL_CASES_OWNER,
  CREATE_CASES_CAPABILITY,
  DELETE_CASES_CAPABILITY,
  PUSH_CASES_CAPABILITY,
  READ_CASES_CAPABILITY,
  UPDATE_CASES_CAPABILITY,
  INTERNAL_BULK_GET_CASES_URL,
  LENS_ATTACHMENT_TYPE,
  INTERNAL_BULK_CREATE_ATTACHMENTS_URL,
  CASE_COMMENT_SAVED_OBJECT,
  CASES_CONNECTORS_CAPABILITY,
  GET_CONNECTORS_CONFIGURE_API_TAG,
  CASES_SETTINGS_CAPABILITY,
  CREATE_COMMENT_CAPABILITY,
  CASES_REOPEN_CAPABILITY,
  ASSIGN_CASE_CAPABILITY,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
  SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  OSQUERY_ATTACHMENT_TYPE,
  INDICATOR_ATTACHMENT_TYPE,
  LEGACY_INDICATOR_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  SECURITY_TIMELINE_ATTACHMENT_TYPE,
  MANAGE_TEMPLATES_CAPABILITY,
  ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  ML_ANOMALY_CHARTS_ATTACHMENT_TYPE,
  ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
  AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
  AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
  AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
} from './constants';

export type { AttachmentAttributes } from './types/domain';
export { ConnectorTypes, AttachmentType, ExternalReferenceStorageType } from './types/domain';
export { getCasesFromAlertsUrl, getCaseFindUserActionsUrl, throwErrors } from './api';
export { createUICapabilities, type CasesUiCapabilities } from './utils/capabilities';
export { getApiTags, type CasesApiTags } from './utils/api_tags';
export { CaseMetricsFeature } from './types/api';
export type { SingleCaseMetricsResponse, CasesMetricsResponse } from './types/api';

export { CASE_VIEW_PAGE_TABS } from './types';

export { getSavedObjectsTypes } from './utils/saved_object_types';

export {
  isEventAttachmentType,
  isAlertAttachmentType,
  isLegacyAttachmentRequest,
  isUnifiedEventAttachment,
  isUnifiedAlertAttachment,
  isIndexMetadata,
  toStringArray,
  toStringOrStringArray,
  getNonEmptyField,
  isStringArray,
  getRuleInfo,
  getManualAlertIds,
} from './utils/attachments';

export { AttachmentActionType } from './utils/attachment_actions';

export { buildAlertAttachmentPayloadSchema } from './types/domain_zod/attachment/alert/v2';
export type { AlertAttachmentMetadata } from './types/domain_zod/attachment/alert/v2';
