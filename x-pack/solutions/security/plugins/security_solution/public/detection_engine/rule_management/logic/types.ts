/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as z from '@kbn/zod/v4';

import type { RuleSnooze, GapFillStatus } from '@kbn/alerting-plugin/common';
import type { Type } from '@kbn/securitysolution-io-ts-alerting-types';
import type { NamespaceType } from '@kbn/securitysolution-io-ts-list-types';
import type { RuleSnoozeSettings } from '@kbn/triggers-actions-ui-plugin/public/types';
import type {
  RuleCustomizationStatus,
  WarningSchema,
} from '../../../../common/api/detection_engine';
import type { RuleExecutionStatus } from '../../../../common/api/detection_engine/rule_monitoring';

import { SortOrder } from '../../../../common/api/detection_engine';
import type {
  RuleCreateProps,
  RuleResponse,
  RuleUpdateProps,
} from '../../../../common/api/detection_engine/model/rule_schema';
import type {
  CoverageOverviewFilter,
  GranularRulesFilter,
  SearchRulesAggregations,
  SearchRulesResponse,
  SearchRulesSearchAfterItem,
  GranularRulesSearch,
  PatchRuleRequestBody,
} from '../../../../common/api/detection_engine/rule_management';
import { FindRulesSortField } from '../../../../common/api/detection_engine/rule_management';
export interface CreateRulesProps {
  rule: RuleCreateProps;
  signal?: AbortSignal;
}

export interface PreviewRulesProps {
  rule: RuleCreateProps & {
    invocationCount: number;
    timeframeEnd: string;
  };
  enableLoggedRequests?: boolean;
  signal?: AbortSignal;
}

export interface UpdateRulesProps {
  rule: RuleUpdateProps;
  signal?: AbortSignal;
}

export interface PatchRuleProps {
  ruleProperties: PatchRuleRequestBody;
  signal?: AbortSignal;
}

export type Rule = RuleResponse;

export type PaginationOptions = z.infer<typeof PaginationOptions>;
export const PaginationOptions = z.object({
  page: z.number().int().min(0),
  perPage: z.number().int().min(0),
  total: z.number().int().min(0),
});

export interface FetchRulesProps {
  pagination?: Pick<PaginationOptions, 'page' | 'perPage'>;
  filterOptions?: FilterOptions;
  sortingOptions?: SortingOptions;
  signal?: AbortSignal;
  schedulerId?: string;
}

// Rule snooze settings map keyed by rule SO's id (not ruleId) and valued by rule snooze settings
export type RulesSnoozeSettingsMap = Record<string, RuleSnoozeSettings>;

interface RuleSnoozeSettingsResponse {
  /**
   * Rule's SO id
   */
  id: string;
  name: string;
  mute_all: boolean;
  snooze_schedule?: RuleSnooze;
  active_snoozes?: string[];
  is_snoozed_until?: string;
}

export interface RulesSnoozeSettingsBatchResponse {
  data: RuleSnoozeSettingsResponse[];
}

export type SortingOptions = z.infer<typeof SortingOptions>;
export const SortingOptions = z.object({
  field: FindRulesSortField,
  order: SortOrder,
});

export interface FilterOptions {
  filter: string;
  showCustomRules: boolean;
  showElasticRules: boolean;
  tags: string[];
  excludeRuleTypes?: Type[];
  enabled?: boolean; // undefined is to display all the rules
  ruleExecutionStatus?: RuleExecutionStatus; // undefined means "all"
  ruleSource?: RuleCustomizationStatus[]; // undefined is to display all the rules
  gapFillStatuses?: GapFillStatus[];
  includeRuleTypes?: Type[];
}

export interface FetchRulesResponse {
  page: number;
  perPage: number;
  total: number;
  data: RuleResponse[];
  warnings?: WarningSchema[];
}

export interface FetchSearchRulesProps {
  pagination?: Pick<PaginationOptions, 'page' | 'perPage'>;
  fields?: string[];
  filter?: GranularRulesFilter;
  search?: GranularRulesSearch;
  sort_field?: z.infer<typeof FindRulesSortField>;
  sort_order?: z.infer<typeof SortOrder>;
  aggregations?: SearchRulesAggregations;
  search_after?: SearchRulesSearchAfterItem[];
  gap_fill_statuses?: GapFillStatus[];
  gaps_range_start?: string;
  gaps_range_end?: string;
  gap_auto_fill_scheduler_id?: string;
  signal?: AbortSignal;
}

export type FetchSearchRulesResponse = SearchRulesResponse;

export interface FetchRuleProps {
  id: string;
  signal?: AbortSignal;
}

export interface FetchRuleHistoryProps {
  ruleId: string;
  page: number;
  perPage: number;
  signal?: AbortSignal;
}

export interface RestoreRuleFromHistoryProps {
  ruleId: string;
  changeId: string;
  revision?: number;
  signal?: AbortSignal;
}

export interface FetchRuleSnoozingProps {
  ids: string[];
  signal?: AbortSignal;
}

export interface FetchCoverageOverviewProps {
  filter: CoverageOverviewFilter;
  signal?: AbortSignal;
}

export interface BasicFetchProps {
  signal: AbortSignal;
}

export interface ImportDataProps {
  fileToImport: File;
  overwrite?: boolean;
  overwriteExceptions?: boolean;
  overwriteActionConnectors?: boolean;
  signal?: AbortSignal;
}

export interface ImportRulesResponseError {
  rule_id: string;
  error: {
    status_code: number;
    message: string;
  };
}

export interface ImportResponseError {
  id: string;
  error: {
    status_code: number;
    message: string;
  };
}

export interface ExceptionsImportError {
  error: {
    status_code: number;
    message: string;
  };
  id?: string | undefined;
  list_id?: string | undefined;
  item_id?: string | undefined;
}

export interface ImportDataResponse {
  success: boolean;
  success_count: number;
  rules_count?: number;
  errors: Array<ImportRulesResponseError | ImportResponseError>;
  exceptions_success?: boolean;
  exceptions_success_count?: number;
  exceptions_errors?: ExceptionsImportError[];
  action_connectors_success?: boolean;
  action_connectors_success_count?: number;
  action_connectors_errors?: Array<ImportRulesResponseError | ImportResponseError>;
  action_connectors_warnings?: WarningSchema[];
}

export interface ExportDocumentsProps {
  ids: string[];
  filename?: string;
  excludeExportDetails?: boolean;
  signal?: AbortSignal;
}

export interface PrePackagedRulesStatusResponse {
  rules_custom_installed: number;
  rules_installed: number;
  rules_not_installed: number;
  rules_not_updated: number;
  timelines_installed: number;
  timelines_not_installed: number;
  timelines_not_updated: number;
}

export interface FindRulesReferencedByExceptionsListProp {
  id?: string;
  listId?: string;
  namespaceType: NamespaceType;
}

export interface FindRulesReferencedByExceptionsProps {
  lists: FindRulesReferencedByExceptionsListProp[];
  signal?: AbortSignal;
}
