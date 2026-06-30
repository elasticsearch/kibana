/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CreateRuleExceptionListItemSchema,
  ExceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import { INTERNAL_ALERTING_API_FIND_RULES_PATH } from '@kbn/alerting-plugin/common';
import type { ActionType, AsApiContract } from '@kbn/actions-plugin/common';
import { BASE_ACTION_API_PATH } from '@kbn/actions-plugin/common';
import type { ActionResult } from '@kbn/actions-plugin/server';
import type { GapFillStatus } from '@kbn/alerting-plugin/common/constants/gap_status';
import { convertRulesFilterToKQL } from '../../../../common/detection_engine/rule_management/rule_filtering';
import type {
  GetPrebuiltRuleBaseVersionRequest,
  GetPrebuiltRuleBaseVersionResponseBody,
  GetPrebuiltRulesStatusResponseBody,
  InstallSpecificRulesRequest,
  PerformRuleInstallationResponseBody,
  PerformRuleUpgradeRequestBody,
  PerformRuleUpgradeResponseBody,
  ReviewRuleDeprecationRequestBody,
  ReviewRuleDeprecationResponseBody,
  RevertPrebuiltRulesRequest,
  RevertPrebuiltRulesResponseBody,
  ReviewRuleInstallationRequestBody,
  ReviewRuleInstallationResponseBody,
  ReviewRuleUpgradeRequestBody,
  ReviewRuleUpgradeResponseBody,
} from '../../../../common/api/detection_engine/prebuilt_rules';
import {
  BOOTSTRAP_EASE_RULES_URL,
  GET_PREBUILT_RULES_BASE_VERSION_URL,
  GET_PREBUILT_RULES_STATUS_URL,
  PERFORM_RULE_INSTALLATION_URL,
  PERFORM_RULE_UPGRADE_URL,
  PREBUILT_RULES_STATUS_URL,
  REVERT_PREBUILT_RULES_URL,
  REVIEW_RULE_DEPRECATION_URL,
  REVIEW_RULE_INSTALLATION_URL,
  REVIEW_RULE_UPGRADE_URL,
} from '../../../../common/api/detection_engine/prebuilt_rules';
import type {
  BulkActionEditPayload,
  BulkActionsDryRunErrCode,
  BulkActionType,
  BulkDuplicateRules,
  BulkManualRuleRun,
  CoverageOverviewResponse,
  GetRuleManagementFiltersResponse,
  ImportRulesResponse,
  BulkManualRuleFillGaps,
  RuleChangesHistoryResponse,
  RestoreRuleFromHistoryResponse,
} from '../../../../common/api/detection_engine/rule_management';
import {
  BulkActionTypeEnum,
  RULE_HISTORY_URL,
  RULE_MANAGEMENT_COVERAGE_OVERVIEW_URL,
  RULE_MANAGEMENT_FILTERS_URL,
  RULE_MANAGEMENT_RULES_URL_SEARCH,
  RULE_RESTORE_FROM_HISTORY_URL,
} from '../../../../common/api/detection_engine/rule_management';
import {
  DETECTION_ENGINE_RULES_BULK_ACTION,
  DETECTION_ENGINE_RULES_IMPORT_URL,
  DETECTION_ENGINE_RULES_PREVIEW,
  DETECTION_ENGINE_RULES_URL,
  DETECTION_ENGINE_RULES_URL_FIND,
} from '../../../../common/constants';

import type { RulesReferencedByExceptionListsSchema } from '../../../../common/api/detection_engine/rule_exceptions';
import { DETECTION_ENGINE_RULES_EXCEPTIONS_REFERENCE_URL } from '../../../../common/api/detection_engine/rule_exceptions';

import type { RulePreviewResponse, RuleResponse } from '../../../../common/api/detection_engine';

import { KibanaServices } from '../../../common/lib/kibana';
import * as i18n from '../../common/translations';
import { getGapRange } from '../../rule_gaps/api/hooks/utils';
import type {
  CreateRulesProps,
  ExportDocumentsProps,
  FetchCoverageOverviewProps,
  FetchRuleHistoryProps,
  FetchRuleProps,
  FetchRuleSnoozingProps,
  FetchSearchRulesProps,
  FetchSearchRulesResponse,
  FetchRulesProps,
  FetchRulesResponse,
  FindRulesReferencedByExceptionsProps,
  ImportDataProps,
  PatchRuleProps,
  PrePackagedRulesStatusResponse,
  PreviewRulesProps,
  RestoreRuleFromHistoryProps,
  RulesSnoozeSettingsBatchResponse,
  RulesSnoozeSettingsMap,
  UpdateRulesProps,
} from '../logic/types';
import type { RuleBootstrapResults } from '../../../../common/api/detection_engine/prebuilt_rules/bootstrap_ease_rules/bootstrap_ease_rules.gen';
import { defaultRangeValue } from '../../rule_gaps/constants';

/**
 * Create provided Rule
 *
 * @param rule RuleCreateProps to add
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const createRule = async ({ rule, signal }: CreateRulesProps): Promise<RuleResponse> =>
  KibanaServices.get().http.fetch<RuleResponse>(DETECTION_ENGINE_RULES_URL, {
    method: 'POST',
    version: '2023-10-31',
    body: JSON.stringify(rule),
    signal,
  });

/**
 * Update provided Rule using PUT
 *
 * @param rule RuleUpdateProps to be updated
 * @param signal to cancel request
 *
 * @returns Promise<RuleResponse> An updated rule
 *
 * In fact this function should return Promise<RuleResponse> but it'd require massive refactoring.
 * It should be addressed as a part of OpenAPI schema adoption.
 *
 * @throws An error if response is not OK
 */
export const updateRule = async ({ rule, signal }: UpdateRulesProps): Promise<RuleResponse> =>
  KibanaServices.get().http.fetch<RuleResponse>(DETECTION_ENGINE_RULES_URL, {
    method: 'PUT',
    version: '2023-10-31',
    body: JSON.stringify(rule),
    signal,
  });

/**
 * Patch provided rule
 * NOTE: The rule edit flow does NOT use patch as it relies on the
 * functionality of PUT to delete field values when not provided, if
 * just expecting changes, use this `patchRule`
 *
 * @param ruleProperties to patch
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const patchRule = async ({
  ruleProperties,
  signal,
}: PatchRuleProps): Promise<RuleResponse> =>
  KibanaServices.get().http.fetch<RuleResponse>(DETECTION_ENGINE_RULES_URL, {
    method: 'PATCH',
    version: '2023-10-31',
    body: JSON.stringify(ruleProperties),
    signal,
  });

/**
 * Preview provided Rule
 *
 * @param rule RuleCreateProps to add
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const previewRule = async ({
  rule,
  enableLoggedRequests,
  signal,
}: PreviewRulesProps): Promise<RulePreviewResponse> =>
  KibanaServices.get().http.fetch<RulePreviewResponse>(DETECTION_ENGINE_RULES_PREVIEW, {
    method: 'POST',
    version: '2023-10-31',
    body: JSON.stringify(rule),
    signal,
    query: enableLoggedRequests ? { enable_logged_requests: enableLoggedRequests } : undefined,
  });

/**
 * Fetches all rules from the Detection Engine API
 *
 * @param filterOptions desired filters (e.g. filter/sortField/sortOrder)
 * @param pagination desired pagination options (e.g. page/perPage)
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const fetchRules = async ({
  filterOptions = {
    filter: '',
    showCustomRules: false,
    showElasticRules: false,
    tags: [],
  },
  sortingOptions = {
    field: 'enabled',
    order: 'desc',
  },
  pagination = {
    page: 1,
    perPage: 20,
  },
  signal,
  schedulerId,
}: FetchRulesProps): Promise<FetchRulesResponse> => {
  const kql = convertRulesFilterToKQL(filterOptions);

  const shouldApplyDefaultGapsRange = Boolean(filterOptions?.gapFillStatuses?.length);
  const defaultGapsRange = shouldApplyDefaultGapsRange ? getGapRange(defaultRangeValue) : undefined;

  const query = {
    page: pagination.page,
    per_page: pagination.perPage,
    sort_field: sortingOptions.field,
    sort_order: sortingOptions.order,
    ...(filterOptions?.gapFillStatuses?.length
      ? { gap_fill_statuses: filterOptions.gapFillStatuses }
      : {}),
    ...(defaultGapsRange
      ? { gaps_range_start: defaultGapsRange.start, gaps_range_end: defaultGapsRange.end }
      : {}),
    ...(kql !== '' ? { filter: kql } : {}),
    ...(schedulerId ? { gap_auto_fill_scheduler_id: schedulerId } : {}),
  };

  return KibanaServices.get().http.fetch<FetchRulesResponse>(DETECTION_ENGINE_RULES_URL_FIND, {
    method: 'GET',
    version: '2023-10-31',
    query,
    signal,
  });
};

/**
 * Fetches all rules from the Detection Engine API with the option to include aggregations
 * and deep pagination via `search_after`.
 *
 * @param fields subset of rule attributes to return (omit for all attributes)
 * @param filter structured KQL filter
 * @param search free-text search (e.g. `{ term, mode }`)
 * @param sort_field field to sort by
 * @param sort_order sort order (e.g. `asc` or `desc`)
 * @param aggregations aggregations to include (e.g. `{ counts: ['tags', 'enabled'] }`)
 * @param pagination pagination options (e.g. `{ page, perPage }`)
 * @param search_after for deep pagination
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const fetchSearchRules = async ({
  fields,
  filter,
  search,
  sort_field = 'enabled',
  sort_order = 'desc',
  pagination = {
    page: 1,
    perPage: 20,
  },
  signal,
  aggregations,
  search_after,
  gap_fill_statuses,
  gaps_range_start,
  gaps_range_end,
  gap_auto_fill_scheduler_id,
}: FetchSearchRulesProps): Promise<FetchSearchRulesResponse> => {
  const body = {
    page: pagination.page,
    per_page: pagination.perPage,
    sort_field,
    sort_order,
    fields,
    ...(filter != null && filter.term.trim() !== '' ? { filter } : {}),
    search,
    aggregations,
    search_after,
    ...(gap_fill_statuses?.length ? { gap_fill_statuses } : {}),
    ...(gaps_range_start ? { gaps_range_start } : {}),
    ...(gaps_range_end ? { gaps_range_end } : {}),
    ...(gap_auto_fill_scheduler_id ? { gap_auto_fill_scheduler_id } : {}),
  };

  return KibanaServices.get().http.fetch<FetchSearchRulesResponse>(
    RULE_MANAGEMENT_RULES_URL_SEARCH,
    {
      method: 'POST',
      version: '1',
      body: JSON.stringify(body),
      signal,
    }
  );
};

/**
 * Fetch a Rule by providing a Rule ID
 *
 * @param id Rule ID's (not rule_id)
 * @param signal to cancel request
 *
 * @returns Promise<RuleResponse>
 *
 * In fact this function should return Promise<RuleResponse> but it'd require massive refactoring.
 * It should be addressed as a part of OpenAPI schema adoption.
 *
 * @throws An error if response is not OK
 */
export const fetchRuleById = async ({ id, signal }: FetchRuleProps): Promise<RuleResponse> =>
  KibanaServices.get().http.fetch<RuleResponse>(DETECTION_ENGINE_RULES_URL, {
    method: 'GET',
    version: '2023-10-31',
    query: { id },
    signal,
  });

/**
 * Fetch the change history for a Rule.
 *
 * @param ruleId Rule SO id (not `rule_id`)
 * @param page 1-based page number
 * @param perPage items per page
 * @param signal to cancel request
 *
 * @returns Promise<RuleChangesHistoryResponse>
 */
export const fetchRuleChangeHistoryById = async ({
  ruleId,
  page,
  perPage,
  signal,
}: FetchRuleHistoryProps): Promise<RuleChangesHistoryResponse> =>
  KibanaServices.get().http.fetch<RuleChangesHistoryResponse>(
    RULE_HISTORY_URL.replace('{ruleId}', encodeURIComponent(ruleId)),
    {
      method: 'GET',
      version: '1',
      query: { page, per_page: perPage },
      signal,
    }
  );

/**
 * Restore a rule to a specific historical revision.
 *
 * @param params.ruleId Rule SO id (not `rule_id`)
 * @param params.changeId The change history entry id to restore to
 *
 * @returns Promise<RestoreRuleResponse>
 */
export const fetchRestoreRuleRevision = async (
  params: RestoreRuleFromHistoryProps
): Promise<RestoreRuleFromHistoryResponse> =>
  KibanaServices.get().http.fetch<RestoreRuleFromHistoryResponse>(
    RULE_RESTORE_FROM_HISTORY_URL.replace('{ruleId}', encodeURIComponent(params.ruleId)).replace(
      '{changeId}',
      encodeURIComponent(params.changeId)
    ),
    {
      method: 'POST',
      version: '1',
      body: JSON.stringify({ revision: params.revision }),
    }
  );

/**
 * Fetch rule snooze settings for each provided ruleId
 *
 * @param ids Rule IDs (not rule_id)
 * @param signal to cancel request
 *
 * @returns An error if response is not OK
 */
export const fetchRulesSnoozeSettings = async ({
  ids,
  signal,
}: FetchRuleSnoozingProps): Promise<RulesSnoozeSettingsMap> => {
  const response = await KibanaServices.get().http.fetch<RulesSnoozeSettingsBatchResponse>(
    INTERNAL_ALERTING_API_FIND_RULES_PATH,
    {
      method: 'POST',
      body: JSON.stringify({
        filter: ids.map((x) => `alert.id:"alert:${x}"`).join(' or '),
        fields: JSON.stringify([
          'name',
          'muteAll',
          'activeSnoozes',
          'isSnoozedUntil',
          'snoozeSchedule',
        ]),
        per_page: ids.length,
      }),
      signal,
    }
  );

  return response.data?.reduce((result, { id, ...snoozeSettings }) => {
    result[id] = {
      name: snoozeSettings.name ?? '',
      muteAll: snoozeSettings.mute_all ?? false,
      activeSnoozes: snoozeSettings.active_snoozes ?? [],
      isSnoozedUntil: snoozeSettings.is_snoozed_until
        ? new Date(snoozeSettings.is_snoozed_until)
        : undefined,
      snoozeSchedule: snoozeSettings.snooze_schedule,
    };

    return result;
  }, {} as RulesSnoozeSettingsMap);
};

export const fetchConnectors = (
  signal?: AbortSignal
): Promise<Array<AsApiContract<ActionResult>>> =>
  KibanaServices.get().http.fetch(`${BASE_ACTION_API_PATH}/connectors`, { method: 'GET', signal });

export const fetchCoverageOverview = async ({
  filter,
  signal,
}: FetchCoverageOverviewProps): Promise<CoverageOverviewResponse> =>
  KibanaServices.get().http.fetch<CoverageOverviewResponse>(RULE_MANAGEMENT_COVERAGE_OVERVIEW_URL, {
    method: 'POST',
    version: '1',
    body: JSON.stringify({
      filter,
    }),
    signal,
  });

export const fetchConnectorTypes = (signal?: AbortSignal): Promise<ActionType[]> =>
  KibanaServices.get().http.fetch(`${BASE_ACTION_API_PATH}/connector_types`, {
    method: 'GET',
    signal,
    query: {
      feature_id: 'siem',
    },
  });

export interface BulkActionSummary {
  failed: number;
  skipped: number;
  succeeded: number;
  total: number;
}

export interface BulkActionResult {
  updated: RuleResponse[];
  created: RuleResponse[];
  deleted: RuleResponse[];
  skipped: RuleResponse[];
}

export interface BulkActionAggregatedError {
  message: string;
  status_code: number;
  err_code?: BulkActionsDryRunErrCode;
  rules: Array<{ id: string; name?: string }>;
}

export interface BulkActionAttributes {
  summary: BulkActionSummary;
  results: BulkActionResult;
  errors?: BulkActionAggregatedError[];
}

export interface BulkActionResponse {
  success?: boolean;
  rules_count?: number;
  attributes: BulkActionAttributes;
}

export interface BulkActionErrorResponse {
  message: string;
  status_code: number;
  attributes?: BulkActionAttributes;
}

export type QueryOrIds =
  | {
      query: string;
      ids?: undefined;
      gapRange?: { start: string; end: string };
      gapFillStatuses?: GapFillStatus[];
      schedulerId?: string;
    }
  | { query?: undefined; ids: string[] };

type PlainBulkAction = {
  type: Exclude<
    BulkActionType,
    | BulkActionTypeEnum['edit']
    | BulkActionTypeEnum['export']
    | BulkActionTypeEnum['duplicate']
    | BulkActionTypeEnum['run']
    | BulkActionTypeEnum['fill_gaps']
  >;
} & QueryOrIds;

type EditBulkAction = {
  type: BulkActionTypeEnum['edit'];
  editPayload: BulkActionEditPayload[];
} & QueryOrIds;

type DuplicateBulkAction = {
  type: BulkActionTypeEnum['duplicate'];
  duplicatePayload?: BulkDuplicateRules['duplicate'];
} & QueryOrIds;

export type ManualRuleRunBulkAction = {
  type: BulkActionTypeEnum['run'];
  runPayload: BulkManualRuleRun['run'];
} & QueryOrIds;

export type ManualRuleFillGapsAction = {
  type: BulkActionTypeEnum['fill_gaps'];
  fillGapsPayload: BulkManualRuleFillGaps['fill_gaps'];
} & QueryOrIds;

export type BulkAction =
  | PlainBulkAction
  | EditBulkAction
  | DuplicateBulkAction
  | ManualRuleRunBulkAction
  | ManualRuleFillGapsAction;

export interface PerformRulesBulkActionProps {
  bulkAction: BulkAction;
  dryRun?: boolean;
}

/**
 * Perform bulk action with rules selected by a filter query
 *
 * @param bulkAction bulk action which contains type, query or ids and edit fields
 * @param dryRun enables dry run mode for bulk actions
 *
 * @throws An error if response is not OK
 */
export async function performBulkAction({
  bulkAction,
  dryRun = false,
}: PerformRulesBulkActionProps): Promise<BulkActionResponse> {
  const params = {
    action: bulkAction.type,
    query: bulkAction.query,
    ids: bulkAction.ids,
    edit: bulkAction.type === BulkActionTypeEnum.edit ? bulkAction.editPayload : undefined,
    duplicate:
      bulkAction.type === BulkActionTypeEnum.duplicate ? bulkAction.duplicatePayload : undefined,
    run: bulkAction.type === BulkActionTypeEnum.run ? bulkAction.runPayload : undefined,
    gaps_range_start: 'gapRange' in bulkAction ? bulkAction.gapRange?.start : undefined,
    gaps_range_end: 'gapRange' in bulkAction ? bulkAction.gapRange?.end : undefined,
    gap_fill_statuses:
      'gapFillStatuses' in bulkAction && bulkAction.gapFillStatuses?.length
        ? bulkAction.gapFillStatuses
        : undefined,
    fill_gaps:
      bulkAction.type === BulkActionTypeEnum.fill_gaps ? bulkAction.fillGapsPayload : undefined,
    gap_auto_fill_scheduler_id: 'schedulerId' in bulkAction ? bulkAction.schedulerId : undefined,
  };

  return KibanaServices.get().http.fetch<BulkActionResponse>(DETECTION_ENGINE_RULES_BULK_ACTION, {
    method: 'POST',
    version: '2023-10-31',
    body: JSON.stringify(params),
    query: { dry_run: dryRun },
  });
}

export type BulkExportResponse = Blob;

/**
 * Bulk export rules selected by a filter query
 *
 * @param queryOrIds filter query to select rules to perform bulk action with or rule ids to select rules to perform bulk action with
 *
 * @throws An error if response is not OK
 */
export async function bulkExportRules(queryOrIds: QueryOrIds): Promise<BulkExportResponse> {
  const params = {
    action: BulkActionTypeEnum.export,
    query: queryOrIds.query,
    ids: queryOrIds.ids,
  };

  return KibanaServices.get().http.fetch<BulkExportResponse>(DETECTION_ENGINE_RULES_BULK_ACTION, {
    method: 'POST',
    version: '2023-10-31',
    body: JSON.stringify(params),
  });
}

export interface CreatePrepackagedRulesResponse {
  rules_installed: number;
  rules_updated: number;
  timelines_installed: number;
  timelines_updated: number;
}

/**
 * Imports rules in the same format as exported via the _export API
 *
 * @param fileToImport File to upload containing rules to import
 * @param overwrite whether or not to overwrite rules with the same ruleId
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const importRules = async ({
  fileToImport,
  overwrite = false,
  overwriteExceptions = false,
  overwriteActionConnectors = false,
  signal,
}: ImportDataProps): Promise<ImportRulesResponse> => {
  const formData = new FormData();
  formData.append('file', fileToImport);

  return KibanaServices.get().http.fetch<ImportRulesResponse>(DETECTION_ENGINE_RULES_IMPORT_URL, {
    method: 'POST',
    version: '2023-10-31',
    headers: { 'Content-Type': undefined },
    query: {
      overwrite,
      overwrite_exceptions: overwriteExceptions,
      overwrite_action_connectors: overwriteActionConnectors,
    },
    body: formData,
    signal,
  });
};

/**
 * Export rules from the server as a file download
 *
 * @param excludeExportDetails whether or not to exclude additional details at bottom of exported file (defaults to false)
 * @param filename of exported rules. Be sure to include `.ndjson` extension! (defaults to localized `rules_export.ndjson`)
 * @param ruleIds array of rule_id's (not id!) to export (empty array exports _all_ rules)
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const exportRules = async ({
  excludeExportDetails = false,
  filename = `${i18n.EXPORT_FILENAME}.ndjson`,
  ids = [],
  signal,
}: ExportDocumentsProps): Promise<Blob> => {
  const body =
    ids.length > 0
      ? JSON.stringify({ objects: ids.map((rule) => ({ rule_id: rule })) })
      : undefined;

  return KibanaServices.get().http.fetch<Blob>(`${DETECTION_ENGINE_RULES_URL}/_export`, {
    method: 'POST',
    version: '2023-10-31',
    body,
    query: {
      exclude_export_details: excludeExportDetails,
      file_name: filename,
    },
    signal,
  });
};

/**
 * Fetch rule filters related information like installed rules count, tags and etc
 *
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const fetchRuleManagementFilters = async ({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<GetRuleManagementFiltersResponse> =>
  KibanaServices.get().http.fetch<GetRuleManagementFiltersResponse>(RULE_MANAGEMENT_FILTERS_URL, {
    method: 'GET',
    version: '1',
    signal,
  });

/**
 * Get pre packaged rules Status
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const getPrePackagedRulesStatus = async ({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<PrePackagedRulesStatusResponse> =>
  KibanaServices.get().http.fetch<PrePackagedRulesStatusResponse>(PREBUILT_RULES_STATUS_URL, {
    method: 'GET',
    version: '2023-10-31',
    signal,
  });

/**
 * Fetch info on what exceptions lists are referenced by what rules
 *
 * @param lists exception list information needed for making request
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const findRuleExceptionReferences = async ({
  lists,
  signal,
}: FindRulesReferencedByExceptionsProps): Promise<RulesReferencedByExceptionListsSchema> => {
  const idsUndefined = lists.some(({ id }) => id === undefined);
  const query = idsUndefined
    ? {
        namespace_types: lists.map(({ namespaceType }) => namespaceType).join(','),
      }
    : {
        ids: lists.map(({ id }) => id).join(','),
        list_ids: lists.map(({ listId }) => listId).join(','),
        namespace_types: lists.map(({ namespaceType }) => namespaceType).join(','),
      };
  return KibanaServices.get().http.fetch<RulesReferencedByExceptionListsSchema>(
    DETECTION_ENGINE_RULES_EXCEPTIONS_REFERENCE_URL,
    {
      method: 'GET',
      version: '1',
      query,
      signal,
    }
  );
};

/**
 * Add exception items to default rule exception list
 *
 * @param ruleId `id` of rule to add items to
 * @param items CreateRuleExceptionListItemSchema[]
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const addRuleExceptions = async ({
  ruleId,
  items,
  signal,
}: {
  ruleId: string;
  items: CreateRuleExceptionListItemSchema[];
  signal: AbortSignal | undefined;
}): Promise<ExceptionListItemSchema[]> =>
  KibanaServices.get().http.fetch<ExceptionListItemSchema[]>(
    `${DETECTION_ENGINE_RULES_URL}/${ruleId}/exceptions`,
    {
      method: 'POST',
      version: '2023-10-31',
      body: JSON.stringify({ items }),
      signal,
    }
  );

/**
 * NEW PREBUILT RULES ROUTES START HERE! 👋
 * USE THESE ONES! THEY'RE THE NICE ONES, PROMISE!
 */

/**
 * Get prebuilt rules status
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const getPrebuiltRulesStatus = async ({
  signal,
}: {
  signal: AbortSignal | undefined;
}): Promise<GetPrebuiltRulesStatusResponseBody> =>
  KibanaServices.get().http.fetch<GetPrebuiltRulesStatusResponseBody>(
    GET_PREBUILT_RULES_STATUS_URL,
    {
      method: 'GET',
      version: '1',
      signal,
    }
  );

/**
 * Review deprecated prebuilt rules
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const reviewRuleDeprecation = async ({
  signal,
  request,
}: {
  signal: AbortSignal | undefined;
  request: ReviewRuleDeprecationRequestBody;
}): Promise<ReviewRuleDeprecationResponseBody> =>
  KibanaServices.get().http.fetch<ReviewRuleDeprecationResponseBody>(REVIEW_RULE_DEPRECATION_URL, {
    method: 'POST',
    version: '1',
    signal,
    body: JSON.stringify(request),
  });

/**
 * Review prebuilt rules upgrade
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const reviewRuleUpgrade = async ({
  signal,
  request,
}: {
  signal: AbortSignal | undefined;
  request: ReviewRuleUpgradeRequestBody;
}): Promise<ReviewRuleUpgradeResponseBody> =>
  KibanaServices.get().http.fetch(REVIEW_RULE_UPGRADE_URL, {
    method: 'POST',
    version: '1',
    signal,
    body: JSON.stringify(request),
  });

/**
 * Review prebuilt rules install (new rules)
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const reviewRuleInstall = async ({
  signal,
  request,
}: {
  signal: AbortSignal | undefined;
  request: ReviewRuleInstallationRequestBody;
}): Promise<ReviewRuleInstallationResponseBody> =>
  KibanaServices.get().http.fetch(REVIEW_RULE_INSTALLATION_URL, {
    method: 'POST',
    version: '1',
    signal,
    body: JSON.stringify(request),
  });

export const performInstallAllRules = async (): Promise<PerformRuleInstallationResponseBody> =>
  KibanaServices.get().http.fetch(PERFORM_RULE_INSTALLATION_URL, {
    method: 'POST',
    version: '1',
    body: JSON.stringify({
      mode: 'ALL_RULES',
    }),
  });

export const performInstallSpecificRules = async (
  rules: InstallSpecificRulesRequest['rules']
): Promise<PerformRuleInstallationResponseBody> =>
  KibanaServices.get().http.fetch(PERFORM_RULE_INSTALLATION_URL, {
    method: 'POST',
    version: '1',
    body: JSON.stringify({
      mode: 'SPECIFIC_RULES',
      rules,
    }),
  });

export const performUpgradeRules = async (
  body: PerformRuleUpgradeRequestBody
): Promise<PerformRuleUpgradeResponseBody> =>
  KibanaServices.get().http.fetch(PERFORM_RULE_UPGRADE_URL, {
    method: 'POST',
    version: '1',
    body: JSON.stringify(body),
  });

export const bootstrapEaseRules = async (): Promise<RuleBootstrapResults> =>
  KibanaServices.get().http.fetch(BOOTSTRAP_EASE_RULES_URL, {
    method: 'POST',
    version: '1',
  });

export const getPrebuiltRuleBaseVersion = async ({
  signal,
  request,
}: {
  signal: AbortSignal | undefined;
  request: GetPrebuiltRuleBaseVersionRequest;
}): Promise<GetPrebuiltRuleBaseVersionResponseBody> =>
  KibanaServices.get().http.fetch(GET_PREBUILT_RULES_BASE_VERSION_URL, {
    method: 'GET',
    version: '1',
    signal,
    query: request,
  });

export const revertPrebuiltRule = async (
  body: RevertPrebuiltRulesRequest
): Promise<RevertPrebuiltRulesResponseBody> =>
  KibanaServices.get().http.fetch(REVERT_PREBUILT_RULES_URL, {
    method: 'POST',
    version: '1',
    body: JSON.stringify(body),
  });
