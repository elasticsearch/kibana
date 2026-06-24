/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CasesFeaturesAllRequired } from '../ui/types';

export * from './owners';
export * from './files';
export * from './application';
export * from './observables';
export * from './attachments';

/**
 * Cases connector limits.
 */
export const MAX_OPEN_CASES_DEFAULT_MAXIMUM = 20;
export const ABSOLUTE_MAX_CASES_PER_RUN = 1000;
export const DEFAULT_MAX_OPEN_CASES = 5;
export const MAX_OPEN_CASES_ADVANCED_SETTING = 'cases:maxOpenCasesPerRuleRun' as const;

export const getMaximumOpenCases = (maxOpenCases?: number | null): number => {
  if (maxOpenCases == null || Number.isNaN(maxOpenCases) || !Number.isFinite(maxOpenCases)) {
    return MAX_OPEN_CASES_DEFAULT_MAXIMUM;
  }

  return Math.min(ABSOLUTE_MAX_CASES_PER_RUN, Math.max(1, Math.floor(maxOpenCases)));
};

export const DEFAULT_DATE_FORMAT = 'dateFormat' as const;
export const DEFAULT_DATE_FORMAT_TZ = 'dateFormat:tz' as const;

/**
 * Saved objects
 */

export const CASE_SAVED_OBJECT = 'cases' as const;
export const CASE_CONNECTOR_MAPPINGS_SAVED_OBJECT = 'cases-connector-mappings' as const;
export const CASE_USER_ACTION_SAVED_OBJECT = 'cases-user-actions' as const;
export const CASE_COMMENT_SAVED_OBJECT = 'cases-comments' as const;
export const CASE_ATTACHMENT_SAVED_OBJECT = 'cases-attachments' as const;
export const CASE_CONFIGURE_SAVED_OBJECT = 'cases-configure' as const;
export const CASE_RULES_SAVED_OBJECT = 'cases-rules' as const;
export const CASE_ID_INCREMENTER_SAVED_OBJECT = 'cases-incrementing-id' as const;
export const CASE_TEMPLATE_SAVED_OBJECT = 'cases-templates' as const;
export const CASE_FIELD_DEFINITION_SAVED_OBJECT = 'cases-field-definition' as const;

/**
 * If more values are added here please also add them here: x-pack/test/cases_api_integration/common/plugins
 */
export const SAVED_OBJECT_TYPES = [
  CASE_SAVED_OBJECT,
  CASE_CONNECTOR_MAPPINGS_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_CONFIGURE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
];

/**
 * Case routes
 */

export const CASES_URL = '/api/cases' as const;
export const CASE_FIND_URL = `${CASES_URL}/_find` as const;
export const CASE_DETAILS_URL = `${CASES_URL}/{case_id}` as const;
export const CASE_CONFIGURE_URL = `${CASES_URL}/configure` as const;
export const CASE_CONFIGURE_DETAILS_URL = `${CASES_URL}/configure/{configuration_id}` as const;
export const CASE_CONFIGURE_CONNECTORS_URL = `${CASE_CONFIGURE_URL}/connectors` as const;

export const CASE_COMMENTS_URL = `${CASE_DETAILS_URL}/comments` as const;
export const CASE_FIND_ATTACHMENTS_URL = `${CASE_COMMENTS_URL}/_find` as const;
export const CASE_COMMENT_DETAILS_URL = `${CASE_DETAILS_URL}/comments/{comment_id}` as const;
export const CASE_COMMENT_DELETE_URL = `${CASE_DETAILS_URL}/comments/{comment_id}` as const;
export const CASE_PUSH_URL = `${CASE_DETAILS_URL}/connector/{connector_id}/_push` as const;
export const CASE_REPORTERS_URL = `${CASES_URL}/reporters` as const;
export const CASE_TAGS_URL = `${CASES_URL}/tags` as const;
export const CASE_USER_ACTIONS_URL = `${CASE_DETAILS_URL}/user_actions` as const;
export const CASE_FIND_USER_ACTIONS_URL = `${CASE_USER_ACTIONS_URL}/_find` as const;

export const CASE_ALERTS_URL = `${CASES_URL}/alerts/{alert_id}` as const;
export const CASE_DETAILS_ALERTS_URL = `${CASE_DETAILS_URL}/alerts` as const;

export const CASE_FILES_URL = `${CASE_DETAILS_URL}/files` as const;

/**
 * Internal routes
 */

export const CASES_INTERNAL_URL = '/internal/cases' as const;
export const INTERNAL_BULK_CREATE_ATTACHMENTS_URL =
  `${CASES_INTERNAL_URL}/{case_id}/attachments/_bulk_create` as const;
export const INTERNAL_BULK_GET_ATTACHMENTS_URL =
  `${CASES_INTERNAL_URL}/{case_id}/attachments/_bulk_get` as const;
export const INTERNAL_SUGGEST_USER_PROFILES_URL =
  `${CASES_INTERNAL_URL}/_suggest_user_profiles` as const;
export const INTERNAL_CONNECTORS_URL = `${CASES_INTERNAL_URL}/{case_id}/_connectors` as const;
export const INTERNAL_BULK_GET_CASES_URL = `${CASES_INTERNAL_URL}/_bulk_get` as const;
export const INTERNAL_GET_CASE_USER_ACTIONS_STATS_URL =
  `${CASES_INTERNAL_URL}/{case_id}/user_actions/_stats` as const;
export const INTERNAL_CASE_USERS_URL = `${CASES_INTERNAL_URL}/{case_id}/_users` as const;
export const INTERNAL_DELETE_FILE_ATTACHMENTS_URL =
  `${CASES_INTERNAL_URL}/{case_id}/attachments/files/_bulk_delete` as const;
export const INTERNAL_GET_CASE_CATEGORIES_URL = `${CASES_INTERNAL_URL}/categories` as const;
export const INTERNAL_CASE_METRICS_URL = `${CASES_INTERNAL_URL}/metrics` as const;
export const INTERNAL_CASE_METRICS_DETAILS_URL = `${CASES_INTERNAL_URL}/metrics/{case_id}` as const;
export const INTERNAL_CASE_SIMILAR_CASES_URL = `${CASES_INTERNAL_URL}/{case_id}/_similar` as const;
export const INTERNAL_PUT_CUSTOM_FIELDS_URL = `${CASES_INTERNAL_URL}/{case_id}/custom_fields/{custom_field_id}`;
export const INTERNAL_CASE_OBSERVABLES_URL = `${CASES_INTERNAL_URL}/{case_id}/observables` as const;
export const INTERNAL_CASE_OBSERVABLES_PATCH_URL =
  `${INTERNAL_CASE_OBSERVABLES_URL}/{observable_id}` as const;
export const INTERNAL_CASE_OBSERVABLES_DELETE_URL =
  `${INTERNAL_CASE_OBSERVABLES_URL}/{observable_id}` as const;
export const INTERNAL_CASE_FIND_USER_ACTIONS_URL =
  `${CASES_INTERNAL_URL}/{case_id}/user_actions/_find` as const;
export const INTERNAL_CASE_GET_CASES_BY_ATTACHMENT_URL =
  `${CASES_INTERNAL_URL}/case/attachments/_find_containing_all` as const;

export const INTERNAL_TEMPLATES_URL = `${CASES_INTERNAL_URL}/templates` as const;
export const INTERNAL_TEMPLATE_DETAILS_URL = `${INTERNAL_TEMPLATES_URL}/{template_id}` as const;
export const INTERNAL_BULK_DELETE_TEMPLATES_URL = `${INTERNAL_TEMPLATES_URL}/_bulk_delete` as const;
export const INTERNAL_BULK_EXPORT_TEMPLATES_URL = `${INTERNAL_TEMPLATES_URL}/_bulk_export` as const;
export const INTERNAL_TEMPLATE_TAGS_URL = `${INTERNAL_TEMPLATES_URL}/tags` as const;
export const INTERNAL_TEMPLATE_CREATORS_URL = `${INTERNAL_TEMPLATES_URL}/creators` as const;

export const INTERNAL_FIELD_DEFINITIONS_URL = `${CASES_INTERNAL_URL}/field_definitions` as const;
export const INTERNAL_FIELD_DEFINITION_DETAILS_URL =
  `${INTERNAL_FIELD_DEFINITIONS_URL}/{field_definition_id}` as const;

/**
 * Action routes
 */

export const ACTION_URL = '/api/actions' as const;
export const ACTION_TYPES_URL = `${ACTION_URL}/connector_types` as const;
export const CONNECTORS_URL = `${ACTION_URL}/connectors` as const;

/**
 * Alerts
 */
export const MAX_ALERTS_PER_CASE = 1000 as const;

/**
 * Searching
 */
export const MAX_DOCS_PER_PAGE = 10000 as const;
export const MAX_BULK_GET_ATTACHMENTS = 100 as const;
export const MAX_CONCURRENT_SEARCHES = 10 as const;
export const MAX_BULK_GET_CASES = 1000 as const;
export const MAX_COMMENTS_PER_PAGE = 100 as const;
export const MAX_CASES_PER_PAGE = 100 as const;
export const MAX_USER_ACTIONS_PER_PAGE = 100 as const;
export const MAX_CATEGORY_FILTER_LENGTH = 100 as const;
export const MAX_TAGS_FILTER_LENGTH = 100 as const;
export const MAX_ASSIGNEES_FILTER_LENGTH = 100 as const;
export const MAX_REPORTERS_FILTER_LENGTH = 100 as const;
export const MAX_SUPPORTED_CONNECTORS_RETURNED = 1000 as const;

/**
 * Validation
 */

export const MAX_TITLE_LENGTH = 160 as const;
export const MAX_RULE_NAME_LENGTH = 100 as const;
export const MAX_SUFFIX_LENGTH = 60 as const;
export const MAX_CATEGORY_LENGTH = 50 as const;
export const MAX_DESCRIPTION_LENGTH = 30000 as const;
export const MAX_COMMENT_LENGTH = 30000 as const;
export const MAX_LENGTH_PER_TAG = 256 as const;
export const MAX_TAGS_PER_CASE = 200 as const;
export const MAX_DELETE_IDS_LENGTH = 100 as const;
export const MAX_SUGGESTED_PROFILES = 10 as const;
export const MAX_CASES_TO_UPDATE = 100 as const;
export const MAX_BULK_CREATE_ATTACHMENTS = 100 as const;
export const MAX_USER_ACTIONS_PER_CASE = 10000 as const;
export const MAX_PERSISTABLE_STATE_AND_EXTERNAL_REFERENCES = 100 as const;
export const MAX_CUSTOM_FIELDS_PER_CASE = 10 as const;
export const MAX_CUSTOM_FIELD_KEY_LENGTH = 36 as const; // uuidv4 length
export const MAX_CUSTOM_FIELD_LABEL_LENGTH = 50 as const;
export const MAX_CUSTOM_FIELD_TEXT_VALUE_LENGTH = 160 as const;
export const MAX_TEMPLATE_KEY_LENGTH = 36 as const; // uuidv4 length
export const MAX_TEMPLATE_NAME_LENGTH = 50 as const;
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 1000 as const;
export const MAX_TEMPLATES_LENGTH = 10 as const;
export const MAX_TEMPLATE_TAG_LENGTH = 50 as const;
export const MAX_TAGS_PER_TEMPLATE = 10 as const;
export const MAX_FIELD_DEFINITIONS_PER_OWNER = 200 as const;
export const MAX_FILENAME_LENGTH = 160 as const;
export const MAX_CUSTOM_OBSERVABLE_TYPES_LABEL_LENGTH = 50 as const;

/**
 * Cases features
 */

export const DEFAULT_FEATURES: CasesFeaturesAllRequired = Object.freeze({
  alerts: { sync: true, enabled: true, isExperimental: false, read: true, all: true },
  metrics: [],
  observables: { enabled: true, autoExtract: false },
  events: { enabled: false },
  templates: { enabled: false },
});

/**
 * Task manager
 */

export const CASES_TELEMETRY_TASK_NAME = 'cases-telemetry-task';
export const ANALYTICS_BACKFILL_TASK_TYPE = 'cai:cases_analytics_index_backfill';
export const ANALYTICS_SCHEDULER_TASK_TYPE = 'cai:cases_analytics_index_scheduler';
export const ANALYTICS_SYNCHRONIZATION_TASK_TYPE = 'cai:cases_analytics_index_synchronization';

/**
 * Telemetry
 */
export const CASE_TELEMETRY_SAVED_OBJECT = 'cases-telemetry';
export const CASE_TELEMETRY_SAVED_OBJECT_ID = 'cases-telemetry';

/**
 * Cases UI Capabilities
 */
export const CREATE_CASES_CAPABILITY = 'create_cases' as const;
export const READ_CASES_CAPABILITY = 'read_cases' as const;
export const UPDATE_CASES_CAPABILITY = 'update_cases' as const;
export const DELETE_CASES_CAPABILITY = 'delete_cases' as const;
export const PUSH_CASES_CAPABILITY = 'push_cases' as const;
export const CASES_SETTINGS_CAPABILITY = 'cases_settings' as const;
export const CASES_CONNECTORS_CAPABILITY = 'cases_connectors' as const;
export const CASES_REOPEN_CAPABILITY = 'case_reopen' as const;
export const CREATE_COMMENT_CAPABILITY = 'create_comment' as const;
export const ASSIGN_CASE_CAPABILITY = 'cases_assign' as const;
export const MANAGE_TEMPLATES_CAPABILITY = 'cases_manage_templates' as const;

/**
 * Cases API Tags
 */

/**
 * This tag registered for the cases suggest user profiles API
 */
export const SUGGEST_USER_PROFILES_API_TAG = 'casesSuggestUserProfiles';

/**
 * This tag is registered for the security bulk get API
 */
export const BULK_GET_USER_PROFILES_API_TAG = 'bulkGetUserProfiles';

/**
 * This tag is registered for the connectors (configure) get API
 */
export const GET_CONNECTORS_CONFIGURE_API_TAG = 'casesGetConnectorsConfigure';

/**
 * User profiles
 */

export const DEFAULT_USER_SIZE = 10;
export const MAX_ASSIGNEES_PER_CASE = 10;
export const NO_ASSIGNEES_FILTERING_KEYWORD = 'none';
export const KIBANA_SYSTEM_USERNAME = 'elastic/kibana';
export const MAX_OBSERVABLES_PER_CASE = 50;

/**
 * Delays
 */
export const SEARCH_DEBOUNCE_MS = 500;

/**
 * Local storage keys
 */
export const LOCAL_STORAGE_KEYS = {
  casesTableColumns: 'cases.list.tableColumns',
  casesListFields: 'cases.list.fields',
  casesTableFiltersConfig: 'cases.list.tableFiltersConfig',
  casesViewMode: 'cases.list.viewMode',
  casesTableState: 'cases.list.state',
  templatesTableState: 'templates.list.state',
  templatesYamlEditorCreateState: 'templates.yaml.editor.create',
  templatesYamlEditorEditState: 'templates.yaml.editor.edit',
  userActivitySortOrder: 'cases.userActivity.sortOrder',
  casesUtilityBarHideMaxLimitWarning: 'cases.utilityBar.hideMaxLimitWarning',
};

/**
 * Connectors
 */

export enum CASES_CONNECTOR_SUB_ACTION {
  RUN = 'run',
}

export const NONE_CONNECTOR_ID: string = 'none';
export const CASES_CONNECTOR_ID = '.cases';
export const CASES_CONNECTOR_TITLE = 'Cases';

export const CASES_CONNECTOR_TIME_WINDOW_REGEX = '^[1-9][0-9]*[d,w,h,m]$';

/**
 * This field is used for authorization of the entities within the cases plugin. Each entity within Cases will have the owner field
 * set to a string that represents the plugin that "owns" (i.e. the plugin that originally issued the POST request to
 * create the entity) the entity.
 *
 * The Authorization class constructs a string composed of the operation being performed (createCase, getComment, etc),
 * and the owner of the entity being acted upon or created. This string is then given to the Security plugin which
 * checks to see if the user making the request has that particular string stored within it's privileges. If it does,
 * then the operation succeeds, otherwise the operation fails.
 *
 * APIs that create/update an entity require that the owner field be passed in the body of the request.
 * APIs that search for entities typically require that the owner be passed as a query parameter.
 * APIs that specify an ID of an entity directly generally don't need to specify the owner field.
 *
 * For APIs that create/update an entity, the RBAC implementation checks to see if the user making the request has the
 * correct privileges for performing that action (a create/update) for the specified owner.
 * This check is done through the Security plugin's API.
 *
 * For APIs that search for entities, the RBAC implementation creates a filter for the saved objects query that limits
 * the search to only owners that the user has access to. We also check that the objects returned by the saved objects
 * API have the limited owner scope. If we find one that the user does not have permissions for, we throw a 403 error.
 * The owner field that is passed in as a query parameter can be used to further limit the results. If a user attempts
 * to pass an owner that they do not have access to, the owner is ignored.
 *
 * For APIs that retrieve/delete entities directly using their ID, the RBAC implementation requests the object first,
 * and then checks to see if the user making the request has access to that operation and owner. If the user does, the
 * operation continues, otherwise we throw a 403.
 */
export const OWNER_FIELD = 'owner';

export const MAX_OBSERVABLE_TYPE_KEY_LENGTH = 36;

export const MAX_OBSERVABLE_TYPE_LABEL_LENGTH = 50;

export const MAX_CUSTOM_OBSERVABLE_TYPES = 10;

/**
 * EBT events
 */
export const CASE_PAGE_VIEW_EVENT_TYPE = 'case_page_view' as const;

export const CASE_ATTACH_EVENTS_EVENT_TYPE = 'case_attach_events' as const;

export const CASE_VIEW_ATTACHMENTS_TAB_CLICKED_EVENT_TYPE =
  'case_view_attachments_tab_clicked' as const;

export const CASE_VIEW_ATTACHMENTS_SUB_TAB_CLICKED_EVENT_TYPE =
  'case_view_attachments_sub_tab_clicked' as const;

/**
 * Exporting this to make it easier to track the usage across the codebase
 * via lsp references.
 */
export const CASE_EXTENDED_FIELDS = 'extended_fields' as const;
export const CASE_EXTENDED_FIELDS_LABELS = 'extended_fields_labels' as const;
