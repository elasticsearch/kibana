/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_RULE_CONSUMER, ALERT_RULE_PRODUCER, ALERT_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import { BASE_RAC_ALERTS_API_PATH } from '@kbn/rule-registry-plugin/common/constants';
import type { CaseCustomField, User } from '../../common/types/domain';
import { AttachmentType } from '../../common/types/domain';
import type { Case, Cases } from '../../common';
import type {
  AttachmentRequest,
  BulkCreateAttachmentsRequestV2,
  CasePatchRequest,
  CasePostRequest,
  CaseResolveResponse,
  CasesFindResponse,
  CaseUserActionStatsResponse,
  GetCaseConnectorsResponse,
  SingleCaseMetricsResponse,
  CustomFieldPutRequest,
  CasesSimilarResponse,
  AddObservableRequest,
  UpdateObservableRequest,
  UserActionInternalFindResponse,
  FindCasesContainingAllAlertsResponse,
  FindCasesContainingAllDocumentsRequest,
  UpdateSummary,
  CasesPatchResponse,
} from '../../common/types/api';
import type {
  CaseConnectors,
  CaseUpdateRequest,
  FetchCasesProps,
  ResolvedCase,
  CaseUserActionTypeWithAll,
  CaseUserActionsStats,
  CaseUsers,
  CasesFindResponseUI,
  CasesUI,
  FilterOptions,
  CaseUICustomField,
  SimilarCasesProps,
  CasesSimilarResponseUI,
  InternalFindCaseUserActions,
} from '../../common/ui/types';
import { SortFieldCase } from '../../common/ui/types';
import {
  getCaseCommentsUrl,
  getCasesDeleteFileAttachmentsUrl,
  getCaseDetailsUrl,
  getCaseDetailsMetricsUrl,
  getCasePushUrl,
  getCaseFindUserActionsUrl,
  getCaseCommentDeleteUrl,
  getCaseConnectorsUrl,
  getCaseUsersUrl,
  getCaseUserActionStatsUrl,
  getCustomFieldReplaceUrl,
  getCaseCreateObservableUrl,
  getCaseUpdateObservableUrl,
  getCaseDeleteObservableUrl,
  getCaseSimilarCasesUrl,
} from '../../common/api';
import {
  CASE_REPORTERS_URL,
  CASE_TAGS_URL,
  CASES_URL,
  INTERNAL_BULK_CREATE_ATTACHMENTS_URL,
  INTERNAL_GET_CASE_CATEGORIES_URL,
  CASES_INTERNAL_URL,
  INTERNAL_CASE_GET_CASES_BY_ATTACHMENT_URL,
} from '../../common/constants';
import { getAllConnectorTypesUrl } from '../../common/utils/connectors_api';

import { KibanaServices } from '../common/lib/kibana';

import {
  convertAllCasesToCamel,
  convertToCamelCase,
  convertArrayToCamelCase,
  convertUserActionsToCamelCase,
  convertCaseToCamelCase,
  convertCasesToCamelCase,
  convertCaseResolveToCamelCase,
  convertSimilarCasesToCamel,
  convertAttachmentsToCamelCase,
} from '../api/utils';

import type {
  ActionLicense,
  CaseUI,
  FeatureIdsResponse,
  SingleCaseMetrics,
  SingleCaseMetricsFeature,
  UserActionUI,
} from './types';

import {
  decodeCaseResponse,
  decodeCasesResponse,
  decodeCaseUserActionsResponse,
  decodeCaseResolveResponse,
  decodeSingleCaseMetricsResponse,
  decodeCasesWithUpdateSummaryResponse,
  constructAssigneesFilter,
  constructReportersFilter,
  decodeCaseUserActionStatsResponse,
  constructCustomFieldsFilter,
  decodeFindAllAttachedAlertsResponse,
} from './utils';
import { decodeCasesFindResponse, decodeCasesSimilarResponse } from '../api/decoders';
import { DEFAULT_FROM_DATE, DEFAULT_TO_DATE } from './constants';

export const resolveCase = async ({
  caseId,
  signal,
  mode = 'legacy',
}: {
  caseId: string;
  signal?: AbortSignal;
  mode?: 'legacy' | 'unified';
}): Promise<ResolvedCase> => {
  const response = await KibanaServices.get().http.fetch<CaseResolveResponse>(
    `${getCaseDetailsUrl(caseId)}/resolve`,
    {
      method: 'GET',
      query: { includeComments: true, mode },
      signal,
    }
  );
  return convertCaseResolveToCamelCase(decodeCaseResolveResponse(response));
};

export const getCase = async ({
  caseId,
  signal,
}: {
  caseId: string;
  signal?: AbortSignal;
}): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(getCaseDetailsUrl(caseId), {
    method: 'GET',
    signal,
  });

  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const getTags = async ({
  owner,
  signal,
}: {
  owner: string[];
  signal?: AbortSignal;
}): Promise<string[]> => {
  const response = await KibanaServices.get().http.fetch<string[]>(CASE_TAGS_URL, {
    method: 'GET',
    signal,
    query: { ...(owner.length > 0 ? { owner } : {}) },
  });
  return response ?? [];
};

export const getCategories = async ({
  owner,
  signal,
}: {
  owner: string[];
  signal?: AbortSignal;
}): Promise<string[]> => {
  const response = await KibanaServices.get().http.fetch<string[]>(
    INTERNAL_GET_CASE_CATEGORIES_URL,
    {
      method: 'GET',
      signal,
      query: { ...(owner.length > 0 ? { owner } : {}) },
    }
  );
  return response ?? [];
};

export const getReporters = async (signal: AbortSignal, owner: string[]): Promise<User[]> => {
  const response = await KibanaServices.get().http.fetch<User[]>(CASE_REPORTERS_URL, {
    method: 'GET',
    signal,
    query: { ...(owner.length > 0 ? { owner } : {}) },
  });
  return response ?? [];
};

export const getSingleCaseMetrics = async (
  caseId: string,
  features: SingleCaseMetricsFeature[],
  signal?: AbortSignal
): Promise<SingleCaseMetrics> => {
  const response = await KibanaServices.get().http.fetch<SingleCaseMetricsResponse>(
    getCaseDetailsMetricsUrl(caseId),
    {
      method: 'GET',
      signal,
      query: { features: JSON.stringify(features) },
    }
  );
  return convertToCamelCase<SingleCaseMetricsResponse, SingleCaseMetrics>(
    decodeSingleCaseMetricsResponse(response)
  );
};

export const findCasesByAttachmentId = async (documentIds: string[], caseIds: string[]) => {
  const response = await KibanaServices.get().http.fetch<FindCasesContainingAllAlertsResponse>(
    `${INTERNAL_CASE_GET_CASES_BY_ATTACHMENT_URL}`,
    {
      method: 'POST',
      body: JSON.stringify({
        documentIds,
        caseIds,
      } as FindCasesContainingAllDocumentsRequest),
    }
  );
  return decodeFindAllAttachedAlertsResponse(response);
};

export const findCaseUserActions = async (
  caseId: string,
  params: {
    type: CaseUserActionTypeWithAll;
    sortOrder: 'asc' | 'desc';
    page: number;
    perPage: number;
  },
  signal?: AbortSignal
): Promise<InternalFindCaseUserActions> => {
  const query = {
    types: params.type !== 'all' ? [params.type] : [],
    sortOrder: params.sortOrder,
    page: params.page,
    perPage: params.perPage,
  };

  const response = await KibanaServices.get().http.fetch<UserActionInternalFindResponse>(
    getCaseFindUserActionsUrl(caseId),
    {
      method: 'GET',
      query,
      signal,
    }
  );

  return {
    ...response,
    userActions: convertUserActionsToCamelCase(
      decodeCaseUserActionsResponse(response.userActions)
    ) as UserActionUI[],
    latestAttachments: convertAttachmentsToCamelCase(response.latestAttachments),
  };
};

export const getCaseUserActionsStats = async (
  caseId: string,
  signal?: AbortSignal
): Promise<CaseUserActionsStats> => {
  const response = await KibanaServices.get().http.fetch<CaseUserActionStatsResponse>(
    getCaseUserActionStatsUrl(caseId),
    {
      method: 'GET',
      signal,
    }
  );

  return convertToCamelCase(decodeCaseUserActionStatsResponse(response));
};

const removeOptionFromFilter = ({
  filterKey,
  filterOptions,
  optionToBeRemoved,
}: {
  filterKey: keyof FilterOptions;
  filterOptions: string[];
  optionToBeRemoved: string;
}) => {
  const resultingFilterOptions = filterOptions.filter((option) => option !== optionToBeRemoved);
  return resultingFilterOptions.length === 0 ? {} : { [filterKey]: resultingFilterOptions };
};

export const getCases = async ({
  filterOptions = {
    search: '',
    searchFields: [],
    severity: [],
    assignees: [],
    reporters: [],
    status: [],
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
    perPage: 20,
    sortField: SortFieldCase.createdAt,
    sortOrder: 'desc',
  },
  signal,
}: FetchCasesProps): Promise<CasesFindResponseUI> => {
  const body = {
    ...removeOptionFromFilter({
      filterKey: 'status',
      filterOptions: filterOptions.status,
      optionToBeRemoved: 'all',
    }),
    ...removeOptionFromFilter({
      filterKey: 'severity',
      filterOptions: filterOptions.severity,
      optionToBeRemoved: 'all',
    }),
    ...constructAssigneesFilter(filterOptions.assignees),
    ...constructReportersFilter(filterOptions.reporters),
    ...(filterOptions.tags.length > 0 ? { tags: filterOptions.tags } : {}),
    ...(filterOptions.search.length > 0 ? { search: filterOptions.search } : {}),
    ...(filterOptions.searchFields.length > 0 ? { searchFields: filterOptions.searchFields } : {}),
    ...(filterOptions.owner.length > 0 ? { owner: filterOptions.owner } : {}),
    ...(filterOptions.category.length > 0 ? { category: filterOptions.category } : {}),
    ...constructCustomFieldsFilter(filterOptions.customFields),
    ...(filterOptions.extendedFieldFilters && filterOptions.extendedFieldFilters.length > 0
      ? { extendedFieldFilters: filterOptions.extendedFieldFilters }
      : {}),
    ...(filterOptions.from ? { from: filterOptions.from } : {}),
    ...(filterOptions.to ? { to: filterOptions.to } : {}),
    ...queryParams,
  };

  const response = await KibanaServices.get().http.fetch<CasesFindResponse>(
    `${CASES_INTERNAL_URL}/_search`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }
  );

  return convertAllCasesToCamel(decodeCasesFindResponse(response));
};

export const postCase = async ({
  newCase,
  signal,
}: {
  newCase: CasePostRequest;
  signal?: AbortSignal;
}): Promise<CaseUI> => {
  const theCase = {
    ...newCase,
    ...(newCase.category != null ? { category: newCase.category } : { category: null }),
  };
  const response = await KibanaServices.get().http.fetch<Case>(CASES_URL, {
    method: 'POST',
    body: JSON.stringify(theCase),
    signal,
  });
  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const patchCase = async ({
  caseId,
  updatedCase,
  version,
  signal,
}: {
  caseId: string;
  updatedCase: Pick<
    CasePatchRequest,
    | 'description'
    | 'status'
    | 'tags'
    | 'title'
    | 'settings'
    | 'connector'
    | 'severity'
    | 'assignees'
    | 'category'
    | 'customFields'
    | 'extended_fields'
    | 'template'
  >;
  version: string;
  signal?: AbortSignal;
}): Promise<CasesUI> => {
  const response = await KibanaServices.get().http.fetch<Cases>(CASES_URL, {
    method: 'PATCH',
    body: JSON.stringify({ cases: [{ ...updatedCase, id: caseId, version }] }),
    signal,
  });
  return convertCasesToCamelCase(decodeCasesResponse(response));
};

export const updateCases = async ({
  cases,
  signal,
}: {
  cases: CaseUpdateRequest[];
  signal?: AbortSignal;
}): Promise<Array<CaseUI & { updateSummary?: UpdateSummary }>> => {
  if (cases.length === 0) {
    return [];
  }

  const response = await KibanaServices.get().http.fetch<CasesPatchResponse>(CASES_URL, {
    method: 'PATCH',
    body: JSON.stringify({ cases }),
    signal,
  });

  const decodedResponse = decodeCasesWithUpdateSummaryResponse(response);
  return decodedResponse.map(({ updateSummary, ...theCase }) => ({
    ...convertCaseToCamelCase(theCase),
    ...(updateSummary != null ? { updateSummary } : {}),
  }));
};

export const replaceCustomField = async ({
  caseId,
  customFieldId,
  request,
  signal,
}: {
  caseId: string;
  customFieldId: string;
  request: CustomFieldPutRequest;
  signal?: AbortSignal;
}): Promise<CaseUICustomField> => {
  const response = await KibanaServices.get().http.fetch<CaseCustomField>(
    getCustomFieldReplaceUrl(caseId, customFieldId),
    {
      method: 'PUT',
      body: JSON.stringify(request),
      signal,
    }
  );

  return convertToCamelCase<CaseCustomField, CaseUICustomField>(response);
};

export const postComment = async (
  newComment: AttachmentRequest,
  caseId: string,
  signal: AbortSignal
): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(`${CASES_URL}/${caseId}/comments`, {
    method: 'POST',
    body: JSON.stringify(newComment),
    signal,
  });
  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const patchComment = async ({
  caseId,
  commentId,
  commentUpdate,
  version,
  owner,
  signal,
}: {
  caseId: string;
  commentId: string;
  commentUpdate: string;
  version: string;
  owner: string;
  signal?: AbortSignal;
}): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(getCaseCommentsUrl(caseId), {
    method: 'PATCH',
    body: JSON.stringify({
      comment: commentUpdate,
      type: AttachmentType.user,
      id: commentId,
      version,
      owner,
    }),
    signal,
  });
  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const deleteComment = async ({
  caseId,
  commentId,
  signal,
}: {
  caseId: string;
  commentId: string;
  signal?: AbortSignal;
}): Promise<void> => {
  await KibanaServices.get().http.fetch<Case>(getCaseCommentDeleteUrl(caseId, commentId), {
    method: 'DELETE',
    signal,
  });
};

export const deleteCases = async ({
  caseIds,
  signal,
}: {
  caseIds: string[];
  signal?: AbortSignal;
}): Promise<string> => {
  const response = await KibanaServices.get().http.fetch<string>(CASES_URL, {
    method: 'DELETE',
    query: { ids: JSON.stringify(caseIds) },
    signal,
  });
  return response;
};

export const pushCase = async ({
  caseId,
  connectorId,
  signal,
}: {
  caseId: string;
  connectorId: string;
  signal?: AbortSignal;
}): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(
    getCasePushUrl(caseId, connectorId),
    {
      method: 'POST',
      body: JSON.stringify({}),
      signal,
    }
  );

  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const getActionLicense = async (signal?: AbortSignal): Promise<ActionLicense[]> => {
  const response = await KibanaServices.get().http.fetch<ActionLicense[]>(
    getAllConnectorTypesUrl(),
    {
      method: 'GET',
      signal,
    }
  );

  return convertArrayToCamelCase(response) as ActionLicense[];
};

export const createAttachments = async ({
  attachments,
  caseId,
  signal,
}: {
  attachments: BulkCreateAttachmentsRequestV2;
  caseId: string;
  signal?: AbortSignal;
}): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(
    INTERNAL_BULK_CREATE_ATTACHMENTS_URL.replace('{case_id}', caseId),
    {
      method: 'POST',
      body: JSON.stringify(attachments),
      signal,
    }
  );
  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const deleteFileAttachments = async ({
  caseId,
  fileIds,
  signal,
}: {
  caseId: string;
  fileIds: string[];
  signal?: AbortSignal;
}): Promise<void> => {
  await KibanaServices.get().http.fetch(getCasesDeleteFileAttachmentsUrl(caseId), {
    method: 'POST',
    body: JSON.stringify({ ids: fileIds }),
    signal,
  });
};

export const getFeatureIds = async ({
  query,
  signal,
}: {
  query: {
    ids: {
      values: string[];
    };
  };
  signal?: AbortSignal;
}): Promise<FeatureIdsResponse> => {
  return KibanaServices.get().http.post<FeatureIdsResponse>(`${BASE_RAC_ALERTS_API_PATH}/find`, {
    method: 'POST',
    body: JSON.stringify({
      aggs: {
        consumer: {
          terms: {
            field: ALERT_RULE_CONSUMER,
            size: 100,
          },
        },
        producer: {
          terms: {
            field: ALERT_RULE_PRODUCER,
            size: 100,
          },
        },
        ruleTypeIds: {
          terms: {
            field: ALERT_RULE_TYPE_ID,
            size: 100,
          },
        },
      },
      query,
    }),
    signal,
  });
};

export const getCaseConnectors = async (
  caseId: string,
  signal?: AbortSignal
): Promise<CaseConnectors> => {
  const res = await KibanaServices.get().http.fetch<GetCaseConnectorsResponse>(
    getCaseConnectorsUrl(caseId),
    {
      method: 'GET',
      signal,
    }
  );

  return Object.keys(res).reduce<CaseConnectors>((acc, connectorId) => {
    acc[connectorId] = {
      ...convertToCamelCase<GetCaseConnectorsResponse[string], CaseConnectors[string]>(
        res[connectorId]
      ),
    };
    return acc;
  }, {});
};

export const getCaseUsers = async ({
  caseId,
  signal,
}: {
  caseId: string;
  signal?: AbortSignal;
}): Promise<CaseUsers> => {
  return KibanaServices.get().http.fetch<CaseUsers>(getCaseUsersUrl(caseId), {
    method: 'GET',
    signal,
  });
};

export const postObservable = async (
  request: AddObservableRequest,
  caseId: string,
  signal?: AbortSignal
): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(getCaseCreateObservableUrl(caseId), {
    method: 'POST',
    body: JSON.stringify({ observable: request.observable }),
    signal,
  });
  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const patchObservable = async (
  request: UpdateObservableRequest,
  caseId: string,
  observableId: string,
  signal?: AbortSignal
): Promise<CaseUI> => {
  const response = await KibanaServices.get().http.fetch<Case>(
    getCaseUpdateObservableUrl(caseId, observableId),
    {
      method: 'PATCH',
      body: JSON.stringify({ observable: request.observable }),
      signal,
    }
  );
  return convertCaseToCamelCase(decodeCaseResponse(response));
};

export const deleteObservable = async (
  caseId: string,
  observableId: string,
  signal?: AbortSignal
): Promise<void> => {
  await KibanaServices.get().http.fetch<Case>(getCaseDeleteObservableUrl(caseId, observableId), {
    method: 'DELETE',
    signal,
  });
};

export const getSimilarCases = async ({
  caseId,
  signal,
  perPage,
  page,
}: SimilarCasesProps): Promise<CasesSimilarResponseUI> => {
  const response = await KibanaServices.get().http.fetch<CasesSimilarResponse>(
    getCaseSimilarCasesUrl(caseId),
    {
      method: 'POST',
      body: JSON.stringify({ page, perPage }),
      signal,
    }
  );

  return convertSimilarCasesToCamel(decodeCasesSimilarResponse(response));
};
