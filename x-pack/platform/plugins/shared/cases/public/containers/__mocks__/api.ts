/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ActionLicense,
  CasesFindResponseUI,
  CaseUI,
  CasesUI,
  FetchCasesProps,
  FindCaseUserActions,
  CaseUICustomField,
} from '../types';
import { SortFieldCase } from '../types';
import {
  actionLicenses,
  allCases,
  basicCase,
  basicCaseMetrics,
  basicCaseCommentPatch,
  basicCasePost,
  basicResolvedCase,
  pushedCase,
  tags,
  categories,
  findCaseUserActionsResponse,
  getCaseUserActionsStatsResponse,
  getCaseUsersMockResponse,
  customFieldsMock,
  allCasesSnake,
} from '../mock';
import type {
  CaseConnectors,
  CaseUpdateRequest,
  CaseUsers,
  ResolvedCase,
  CaseUserActionsStats,
} from '../../../common/ui/types';
import type {
  SingleCaseMetricsResponse,
  CasePostRequest,
  CasePatchRequest,
  AttachmentRequest,
} from '../../../common/types/api';
import { CaseStatuses } from '../../../common/types/domain';
import type { ValidFeatureId } from '@kbn/rule-data-utils';
import type { UserProfile } from '@kbn/security-plugin/common';
import { userProfiles } from '../user_profiles/api.mock';
import { getCaseConnectorsMockResponse } from '../../common/mock/connectors';
import { DEFAULT_FROM_DATE, DEFAULT_TO_DATE } from '../constants';

export const resolveCase = async (caseId: string, signal: AbortSignal): Promise<ResolvedCase> =>
  Promise.resolve(basicResolvedCase);

export const getCase = async ({
  caseId,
  signal,
}: {
  caseId: string;
  signal?: AbortSignal;
}): Promise<CaseUI> => Promise.resolve(basicCase);

export const getSingleCaseMetrics = async (
  caseId: string,
  signal: AbortSignal
): Promise<SingleCaseMetricsResponse> => Promise.resolve(basicCaseMetrics);

export const getTags = async (signal: AbortSignal): Promise<string[]> => Promise.resolve(tags);

export const findAssignees = async (): Promise<UserProfile[]> => userProfiles;

export const findCaseUserActions = async (
  caseId: string,
  signal: AbortSignal
): Promise<FindCaseUserActions> => Promise.resolve(findCaseUserActionsResponse);

export const getCaseUserActionsStats = async (
  caseId: string,
  signal: AbortSignal
): Promise<CaseUserActionsStats> => Promise.resolve(getCaseUserActionsStatsResponse);

export const getCases = async ({
  filterOptions = {
    severity: [],
    search: '',
    searchFields: [],
    assignees: [],
    reporters: [],
    status: [CaseStatuses.open],
    tags: [],
    owner: [],
    category: [],
    customFields: {},
    extendedFieldFilters: [],
    from: DEFAULT_FROM_DATE,
    to: DEFAULT_TO_DATE,
  },
  queryParams = {
    page: 1,
    perPage: 5,
    sortField: SortFieldCase.createdAt,
    sortOrder: 'desc',
  },
  signal,
}: FetchCasesProps): Promise<CasesFindResponseUI> => Promise.resolve(allCases);

export const postCase = async (newCase: CasePostRequest, signal: AbortSignal): Promise<CaseUI> =>
  Promise.resolve(basicCasePost);

export const patchCase = async (
  caseId: string,
  updatedCase: Pick<CasePatchRequest, 'description' | 'status' | 'tags' | 'title'>,
  version: string,
  signal: AbortSignal
): Promise<CasesUI> => Promise.resolve([basicCase]);

export const updateCases = async (
  cases: CaseUpdateRequest[],
  signal: AbortSignal
): Promise<Array<CaseUI & { updateSummary?: { syncedAlertCount: number } }>> =>
  Promise.resolve(allCases.cases.map((theCase) => ({ ...theCase })));

export const createAttachments = async (
  newComment: AttachmentRequest,
  caseId: string,
  signal: AbortSignal
): Promise<CaseUI> => Promise.resolve(basicCase);

export const deleteComment = async (
  caseId: string,
  commentId: string,
  signal: AbortSignal
): Promise<void> => Promise.resolve(undefined);

export const patchComment = async (
  caseId: string,
  commentId: string,
  commentUpdate: string,
  version: string,
  signal: AbortSignal
): Promise<CaseUI> => Promise.resolve(basicCaseCommentPatch);

export const deleteCases = async (caseIds: string[], signal: AbortSignal): Promise<boolean> =>
  Promise.resolve(true);

export const pushCase = async (
  caseId: string,
  connectorId: string,
  signal: AbortSignal
): Promise<CaseUI> => Promise.resolve(pushedCase);

export const getActionLicense = async (signal: AbortSignal): Promise<ActionLicense[]> =>
  Promise.resolve(actionLicenses);

export const getFeatureIds = async (
  _query: { registrationContext: string[] },
  _signal: AbortSignal
): Promise<ValidFeatureId[]> => Promise.resolve(['siem', 'observability']);

export const getCaseConnectors = async (
  caseId: string,
  signal: AbortSignal
): Promise<CaseConnectors> => Promise.resolve(getCaseConnectorsMockResponse());

export const getCaseUsers = async (caseId: string, signal: AbortSignal): Promise<CaseUsers> =>
  Promise.resolve(getCaseUsersMockResponse());

export const deleteFileAttachments = async ({
  caseId,
  fileIds,
  signal,
}: {
  caseId: string;
  fileIds: string[];
  signal: AbortSignal;
}): Promise<void> => Promise.resolve(undefined);

export const getCategories = async (signal: AbortSignal): Promise<string[]> =>
  Promise.resolve(categories);

export const replaceCustomField = async ({
  caseId,
  customFieldId,
  customFieldValue,
  caseVersion,
}: {
  caseId: string;
  customFieldId: string;
  customFieldValue: string | boolean | null;
  caseVersion: string;
}): Promise<CaseUICustomField> => Promise.resolve(customFieldsMock[0]);

export const getSimilarCases = async () => allCasesSnake;

export const postObservable = jest.fn();
export const patchObservable = jest.fn();
export const deleteObservable = jest.fn();

export const searchEvents = jest.fn();
