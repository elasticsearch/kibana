/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BASE_RAC_ALERTS_API_PATH } from '@kbn/rule-registry-plugin/common';
import { KibanaServices } from '../common/lib/kibana';

import {
  CASES_INTERNAL_URL,
  CASES_URL,
  INTERNAL_BULK_CREATE_ATTACHMENTS_URL,
  SECURITY_SOLUTION_OWNER,
  INTERNAL_GET_CASE_USER_ACTIONS_STATS_URL,
  INTERNAL_DELETE_FILE_ATTACHMENTS_URL,
  INTERNAL_GET_CASE_CATEGORIES_URL,
} from '../../common/constants';

import {
  deleteCases,
  deleteComment,
  getActionLicense,
  getCases,
  findCaseUserActions,
  getTags,
  patchCase,
  updateCases,
  patchComment,
  postCase,
  createAttachments,
  pushCase,
  resolveCase,
  getFeatureIds,
  postComment,
  getCaseConnectors,
  getCaseUserActionsStats,
  deleteFileAttachments,
  getCategories,
  replaceCustomField,
  postObservable,
  getSimilarCases,
  patchObservable,
  deleteObservable,
} from './api';

import {
  actionLicenses,
  allCases,
  basicCase,
  allCasesSnake,
  basicCaseSnake,
  pushedCaseSnake,
  categories,
  casesSnake,
  cases,
  pushedCase,
  tags,
  findCaseUserActionsResponse,
  basicCaseId,
  caseWithRegisteredAttachmentsSnake,
  caseWithRegisteredAttachments,
  caseUserActionsWithRegisteredAttachmentsSnake,
  basicPushSnake,
  getCaseUserActionsStatsResponse,
  basicFileMock,
  customFieldsMock,
  mockCase,
  similarCases,
  similarCasesSnake,
} from './mock';

import {
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_QUERY_PARAMS,
  DEFAULT_FROM_DATE,
  DEFAULT_TO_DATE,
} from './constants';
import { getCaseConnectorsMockResponse } from '../common/mock/connectors';
import { set } from '@kbn/safer-lodash-set';
import { cloneDeep, omit } from 'lodash';
import type { CaseUserActionTypeWithAll } from './types';
import type { CaseUserActionStatsResponse } from '../../common/types/api';
import {
  CaseSeverity,
  CaseStatuses,
  ConnectorTypes,
  AttachmentType,
  CustomFieldTypes,
} from '../../common/types/domain';
const abortCtrl = new AbortController();
const mockKibanaServices = KibanaServices.get as jest.Mock;
jest.mock('../common/lib/kibana');

const fetchMock = jest.fn();
const postMock = jest.fn();
mockKibanaServices.mockReturnValue({ http: { fetch: fetchMock, post: postMock } });

describe('Cases API', () => {
  describe('deleteCases', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue('');
    });
    const data = ['1', '2'];

    it('should be called with correct check url, method, signal', async () => {
      await deleteCases({ caseIds: data, signal: abortCtrl.signal });
      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}`, {
        method: 'DELETE',
        query: { ids: JSON.stringify(data) },
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await deleteCases({ caseIds: data, signal: abortCtrl.signal });
      expect(resp).toEqual('');
    });
  });

  describe('getActionLicense', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(actionLicenses);
    });

    it('should be called with correct check url, method, signal', async () => {
      await getActionLicense(abortCtrl.signal);
      expect(fetchMock).toHaveBeenCalledWith(`/api/actions/connector_types`, {
        method: 'GET',
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await getActionLicense(abortCtrl.signal);
      expect(resp).toEqual(actionLicenses);
    });
  });

  describe('resolveCase', () => {
    const aliasTargetId = '12345';
    const basicResolveCase = {
      outcome: 'aliasMatch',
      case: basicCaseSnake,
    };
    const caseId = basicCase.id;

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue({ ...basicResolveCase, alias_target_id: aliasTargetId });
    });

    it('should be called with correct check url, method, signal', async () => {
      await resolveCase({ caseId, signal: abortCtrl.signal });
      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}/${caseId}/resolve`, {
        method: 'GET',
        query: {
          includeComments: true,
          mode: 'legacy',
        },
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await resolveCase({ caseId, signal: abortCtrl.signal });
      expect(resp).toEqual({ ...basicResolveCase, case: basicCase, aliasTargetId });
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue({
        ...basicResolveCase,
        case: caseWithRegisteredAttachmentsSnake,
        alias_target_id: aliasTargetId,
      });

      const resp = await resolveCase({ caseId, signal: abortCtrl.signal });
      expect(resp).toEqual({
        ...basicResolveCase,
        case: caseWithRegisteredAttachments,
        aliasTargetId,
      });
    });
  });

  describe('getCases', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(allCasesSnake);
    });

    it('should be called with correct check url, method, signal with empty defaults', async () => {
      await getCases({
        filterOptions: DEFAULT_FILTER_OPTIONS,
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should apply correctly all filters', async () => {
      await getCases({
        filterOptions: {
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          assignees: ['123'],
          reporters: [{ username: 'username', full_name: null, email: null }],
          tags,
          status: [CaseStatuses.open],
          severity: [CaseSeverity.HIGH],
          search: 'hello',
          owner: [SECURITY_SOLUTION_OWNER],
          category: [],
          customFields: {},
          extendedFieldFilters: [],
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          status: [CaseStatuses.open],
          severity: [CaseSeverity.HIGH],
          assignees: ['123'],
          reporters: ['username'],
          tags: ['coke', 'pepsi'],
          search: 'hello',
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          owner: [SECURITY_SOLUTION_OWNER],
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should apply the severity field correctly (with severity value)', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          severity: [CaseSeverity.HIGH],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          severity: [CaseSeverity.HIGH],
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should not send the severity field if empty', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          severity: [],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should apply the severity field correctly (with status value)', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          status: [CaseStatuses.open],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          status: [CaseStatuses.open],
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should not send the status field if empty', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          status: [],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should not send the assignees field if it an empty array', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          assignees: [],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should convert a single null value to none', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          assignees: [],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          assignees: undefined,
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should converts null value in the array to none', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          assignees: [null, '123'],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          assignees: ['none', '123'],
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should handle tags with weird chars', async () => {
      const weirdTags: string[] = ['(', '"double"'];

      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          assignees: ['123'],
          reporters: [{ username: undefined, full_name: undefined, email: undefined }],
          tags: weirdTags,
          status: [CaseStatuses.open],
          search: 'hello',
          owner: [SECURITY_SOLUTION_OWNER],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          status: [CaseStatuses.open],
          assignees: ['123'],
          reporters: [],
          tags: ['(', '"double"'],
          search: 'hello',
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          owner: [SECURITY_SOLUTION_OWNER],
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response and not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(allCasesSnake);
      const resp = await getCases({
        filterOptions: { ...DEFAULT_FILTER_OPTIONS, owner: [SECURITY_SOLUTION_OWNER] },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });
      expect(resp).toEqual({ ...allCases });
    });

    it('should not send the category field if it is an empty array', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          category: [],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should send custom fields', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          customFields: {
            activeCustomFieldKey: {
              type: CustomFieldTypes.TOGGLE,
              options: ['on'],
            },
            inactiveCustomFieldKey: {
              type: CustomFieldTypes.TOGGLE,
              options: ['off'],
            },
            emptyCustomFieldKey: {
              type: CustomFieldTypes.TOGGLE,
              options: [],
            },
          },
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          customFields: {
            activeCustomFieldKey: [true],
            inactiveCustomFieldKey: [false],
          },
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should not send empty custom fields', async () => {
      await getCases({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          customFields: {
            emptyCustomFieldKey: {
              type: CustomFieldTypes.TOGGLE,
              options: [],
            },
          },
        },
        queryParams: DEFAULT_QUERY_PARAMS,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/_search`, {
        method: 'POST',
        body: JSON.stringify({
          searchFields: DEFAULT_FILTER_OPTIONS.searchFields,
          from: DEFAULT_FROM_DATE,
          to: DEFAULT_TO_DATE,
          ...DEFAULT_QUERY_PARAMS,
        }),
        signal: abortCtrl.signal,
      });
    });
  });

  describe('findCaseUserActions', () => {
    const findCaseUserActionsSnake = {
      page: 1,
      perPage: 10,
      total: 30,
      userActions: [...caseUserActionsWithRegisteredAttachmentsSnake],
      latestAttachments: [],
    };
    const filterActionType: CaseUserActionTypeWithAll = 'all';
    const sortOrder: 'asc' | 'desc' = 'asc';
    const params = {
      type: filterActionType,
      sortOrder,
      page: 1,
      perPage: 10,
    };

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(findCaseUserActionsSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await findCaseUserActions(basicCase.id, params, abortCtrl.signal);
      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_INTERNAL_URL}/${basicCase.id}/user_actions/_find`,
        {
          method: 'GET',
          signal: abortCtrl.signal,
          query: {
            types: [],
            sortOrder: 'asc',
            page: 1,
            perPage: 10,
          },
        }
      );
    });

    it('should be called with action type user action and desc sort order', async () => {
      await findCaseUserActions(
        basicCase.id,
        { type: 'action', sortOrder: 'desc', page: 2, perPage: 15 },
        abortCtrl.signal
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_INTERNAL_URL}/${basicCase.id}/user_actions/_find`,
        {
          method: 'GET',
          signal: abortCtrl.signal,
          query: {
            types: ['action'],
            sortOrder: 'desc',
            page: 2,
            perPage: 15,
          },
        }
      );
    });

    it('should be called with user type user action and desc sort order', async () => {
      await findCaseUserActions(basicCase.id, { ...params, type: 'user' }, abortCtrl.signal);
      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_INTERNAL_URL}/${basicCase.id}/user_actions/_find`,
        {
          method: 'GET',
          signal: abortCtrl.signal,
          query: {
            types: ['user'],
            sortOrder: 'asc',
            page: 1,
            perPage: 10,
          },
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await findCaseUserActions(basicCase.id, params, abortCtrl.signal);
      expect(resp).toEqual(findCaseUserActionsResponse);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(findCaseUserActionsSnake);
      const resp = await findCaseUserActions(basicCase.id, params, abortCtrl.signal);
      expect(resp).toEqual(findCaseUserActionsResponse);
    });
  });

  describe('getCaseUserActionsStats', () => {
    const getCaseUserActionsStatsSnake: CaseUserActionStatsResponse = {
      total: 20,
      total_deletions: 0,
      total_comments: 10,
      total_comment_deletions: 0,
      total_comment_creations: 10,
      total_hidden_comment_updates: 0,
      total_other_actions: 10,
      total_other_action_deletions: 0,
    };

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(getCaseUserActionsStatsSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await getCaseUserActionsStats(basicCase.id, abortCtrl.signal);
      expect(fetchMock).toHaveBeenCalledWith(
        `${INTERNAL_GET_CASE_USER_ACTIONS_STATS_URL.replace('{case_id}', basicCase.id)}`,
        {
          method: 'GET',
          signal: abortCtrl.signal,
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await getCaseUserActionsStats(basicCase.id, abortCtrl.signal);
      expect(resp).toEqual(getCaseUserActionsStatsResponse);
    });
  });

  describe('getTags', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(tags);
    });

    it('should be called with correct check url, method, signal', async () => {
      await getTags({ owner: [SECURITY_SOLUTION_OWNER], signal: abortCtrl.signal });
      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}/tags`, {
        method: 'GET',
        signal: abortCtrl.signal,
        query: {
          owner: [SECURITY_SOLUTION_OWNER],
        },
      });
    });

    it('should return correct response', async () => {
      const resp = await getTags({ owner: [SECURITY_SOLUTION_OWNER], signal: abortCtrl.signal });
      expect(resp).toEqual(tags);
    });
  });

  describe('getCategories', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(categories);
    });

    it('should be called with the correct check url, method, signal', async () => {
      await getCategories({ owner: [SECURITY_SOLUTION_OWNER], signal: abortCtrl.signal });
      expect(fetchMock).toHaveBeenCalledWith(INTERNAL_GET_CASE_CATEGORIES_URL, {
        method: 'GET',
        signal: abortCtrl.signal,
        query: {
          owner: [SECURITY_SOLUTION_OWNER],
        },
      });
    });

    it('should return the correct response', async () => {
      const resp = await getCategories({
        owner: [SECURITY_SOLUTION_OWNER],
        signal: abortCtrl.signal,
      });
      expect(resp).toEqual(categories);
    });
  });

  describe('patchCase', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue([basicCaseSnake]);
    });

    const data = { description: 'updated description' };

    it('should be called with correct check url, method, signal', async () => {
      await patchCase({
        caseId: basicCase.id,
        updatedCase: data,
        version: basicCase.version,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}`, {
        method: 'PATCH',
        body: JSON.stringify({
          cases: [{ ...data, id: basicCase.id, version: basicCase.version }],
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await patchCase({
        caseId: basicCase.id,
        updatedCase: { description: 'updated description' },
        version: basicCase.version,
        signal: abortCtrl.signal,
      });

      expect(resp).toEqual([basicCase]);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue([caseWithRegisteredAttachmentsSnake]);
      const resp = await patchCase({
        caseId: basicCase.id,
        updatedCase: { description: 'updated description' },
        version: basicCase.version,
        signal: abortCtrl.signal,
      });

      expect(resp).toEqual([caseWithRegisteredAttachments]);
    });
  });

  describe('updateCases', () => {
    const casesSnakeWithUpdateSummary = casesSnake.map((theCase) => ({
      ...theCase,
      updateSummary: {
        syncedAlertCount: 0,
      },
    }));

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(casesSnakeWithUpdateSummary);
    });

    const data = [
      {
        status: CaseStatuses.closed,
        id: basicCase.id,
        version: basicCase.version,
      },
    ];

    it('should be called with correct check url, method, signal', async () => {
      await updateCases({ cases: data, signal: abortCtrl.signal });
      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}`, {
        method: 'PATCH',
        body: JSON.stringify({ cases: data }),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response should not covert to camel case registered attachments', async () => {
      const resp = await updateCases({ cases: data, signal: abortCtrl.signal });
      expect(resp).toHaveLength(cases.length);
      expect(resp[0]).toEqual(
        expect.objectContaining({
          id: cases[0].id,
          updateSummary: {
            syncedAlertCount: 0,
          },
        })
      );
    });

    it('returns an empty array if the cases are empty', async () => {
      const resp = await updateCases({ cases: [], signal: abortCtrl.signal });
      expect(resp).toEqual([]);
    });

    it('returns cases with per-case alert status update summary', async () => {
      fetchMock.mockResolvedValue(casesSnakeWithUpdateSummary);

      const resp = await updateCases({
        cases: data,
        signal: abortCtrl.signal,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}`, {
        method: 'PATCH',
        body: JSON.stringify({ cases: data }),
        signal: abortCtrl.signal,
      });

      expect(resp).toHaveLength(cases.length);
      expect(resp[0]).toEqual(
        expect.objectContaining({
          id: cases[0].id,
          updateSummary: {
            syncedAlertCount: 0,
          },
        })
      );
    });
  });

  describe('patchComment', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await patchComment({
        caseId: basicCase.id,
        commentId: basicCase.comments[0].id,
        commentUpdate: 'updated comment',
        version: basicCase.comments[0].version,
        signal: abortCtrl.signal,
        owner: SECURITY_SOLUTION_OWNER,
      });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}/${basicCase.id}/comments`, {
        method: 'PATCH',
        body: JSON.stringify({
          comment: 'updated comment',
          type: AttachmentType.user,
          id: basicCase.comments[0].id,
          version: basicCase.comments[0].version,
          owner: SECURITY_SOLUTION_OWNER,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await patchComment({
        caseId: basicCase.id,
        commentId: basicCase.comments[0].id,
        commentUpdate: 'updated comment',
        version: basicCase.comments[0].version,
        signal: abortCtrl.signal,
        owner: SECURITY_SOLUTION_OWNER,
      });
      expect(resp).toEqual(basicCase);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(caseWithRegisteredAttachmentsSnake);

      const resp = await patchComment({
        caseId: basicCase.id,
        commentId: basicCase.comments[0].id,
        commentUpdate: 'updated comment',
        version: basicCase.comments[0].version,
        signal: abortCtrl.signal,
        owner: SECURITY_SOLUTION_OWNER,
      });

      expect(resp).toEqual(caseWithRegisteredAttachments);
    });
  });

  describe('postCase', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });

    const data = {
      description: 'description',
      tags: ['tag'],
      title: 'title',
      connector: {
        id: 'none',
        name: 'none',
        type: ConnectorTypes.none,
        fields: null,
      },
      settings: {
        syncAlerts: true,
        extractObservables: true,
      },
      owner: SECURITY_SOLUTION_OWNER,
      category: 'test',
    };

    it('should be called with correct check url, method, signal', async () => {
      await postCase({ newCase: data, signal: abortCtrl.signal });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}`, {
        method: 'POST',
        body: JSON.stringify(data),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await postCase({ newCase: data, signal: abortCtrl.signal });
      expect(resp).toEqual(basicCase);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(caseWithRegisteredAttachmentsSnake);
      const resp = await postCase({ newCase: data, signal: abortCtrl.signal });
      expect(resp).toEqual(caseWithRegisteredAttachments);
    });

    it('should default category to null if it is undefined', async () => {
      const dataWithoutCategory = omit(data, 'category');
      await postCase({ newCase: dataWithoutCategory, signal: abortCtrl.signal });

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}`, {
        method: 'POST',
        body: JSON.stringify({ ...dataWithoutCategory, category: null }),
        signal: abortCtrl.signal,
      });
    });
  });

  describe('createAttachments', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });
    const data = [
      {
        comment: 'comment',
        owner: SECURITY_SOLUTION_OWNER,
        type: AttachmentType.user as const,
      },
      {
        alertId: 'test-id',
        index: 'test-index',
        rule: {
          id: 'test-rule',
          name: 'Test',
        },
        owner: SECURITY_SOLUTION_OWNER,
        type: AttachmentType.alert as const,
      },
    ];

    it('should be called with correct check url, method, signal', async () => {
      await createAttachments({
        attachments: data,
        caseId: basicCase.id,
        signal: abortCtrl.signal,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        INTERNAL_BULK_CREATE_ATTACHMENTS_URL.replace('{case_id}', basicCase.id),
        {
          method: 'POST',
          body: JSON.stringify(data),
          signal: abortCtrl.signal,
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await createAttachments({
        attachments: data,
        caseId: basicCase.id,
        signal: abortCtrl.signal,
      });
      expect(resp).toEqual(basicCase);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(caseWithRegisteredAttachmentsSnake);
      const resp = await createAttachments({
        attachments: data,
        caseId: basicCase.id,
        signal: abortCtrl.signal,
      });
      expect(resp).toEqual(caseWithRegisteredAttachments);
    });
  });

  describe('deleteFileAttachments', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(null);
    });

    it('should be called with correct url, method, signal and body', async () => {
      const resp = await deleteFileAttachments({
        caseId: basicCaseId,
        fileIds: [basicFileMock.id],
        signal: abortCtrl.signal,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        INTERNAL_DELETE_FILE_ATTACHMENTS_URL.replace('{case_id}', basicCaseId),
        {
          method: 'POST',
          body: JSON.stringify({ ids: [basicFileMock.id] }),
          signal: abortCtrl.signal,
        }
      );
      expect(resp).toBe(undefined);
    });
  });

  describe('pushCase', () => {
    const connectorId = 'connectorId';

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(pushedCaseSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await pushCase({ caseId: basicCase.id, connectorId, signal: abortCtrl.signal });
      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_URL}/${basicCase.id}/connector/${connectorId}/_push`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          signal: abortCtrl.signal,
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await pushCase({ caseId: basicCase.id, connectorId, signal: abortCtrl.signal });
      expect(resp).toEqual(pushedCase);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(caseWithRegisteredAttachmentsSnake);
      const resp = await pushCase({ caseId: basicCase.id, connectorId, signal: abortCtrl.signal });
      expect(resp).toEqual(caseWithRegisteredAttachments);
    });
  });

  describe('deleteComment', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(null);
    });
    const commentId = 'ab1234';

    it('should be called with correct check url, method, signal', async () => {
      const resp = await deleteComment({
        caseId: basicCaseId,
        commentId,
        signal: abortCtrl.signal,
      });
      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}/${basicCase.id}/comments/${commentId}`, {
        method: 'DELETE',
        signal: abortCtrl.signal,
      });
      expect(resp).toBe(undefined);
    });
  });

  describe('getFeatureIds', () => {
    beforeEach(() => {
      postMock.mockClear();
      postMock.mockResolvedValue({
        consumer: {
          buckets: [{ key: 'observability', doc_count: 1 }],
        },
        producer: {
          buckets: [],
        },
        ruleTypeIds: {
          buckets: [{ key: 'apm.threshold', doc_count: 1 }],
        },
      });
    });

    it('should be called with correct check url, method, signal', async () => {
      const resp = await getFeatureIds({
        query: { ids: { values: ['alert_id_1', 'alert_id_2'] } },
        signal: abortCtrl.signal,
      });

      expect(postMock).toHaveBeenCalledWith(`${BASE_RAC_ALERTS_API_PATH}/find`, {
        body: '{"aggs":{"consumer":{"terms":{"field":"kibana.alert.rule.consumer","size":100}},"producer":{"terms":{"field":"kibana.alert.rule.producer","size":100}},"ruleTypeIds":{"terms":{"field":"kibana.alert.rule.rule_type_id","size":100}}},"query":{"ids":{"values":["alert_id_1","alert_id_2"]}}}',
        method: 'POST',
        signal: abortCtrl.signal,
      });

      expect(resp).toEqual({
        consumer: {
          buckets: [{ key: 'observability', doc_count: 1 }],
        },
        producer: {
          buckets: [],
        },
        ruleTypeIds: {
          buckets: [{ key: 'apm.threshold', doc_count: 1 }],
        },
      });
    });
  });

  describe('postComment', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });

    const data = {
      comment: 'Solve this fast!',
      type: AttachmentType.user as const,
      owner: SECURITY_SOLUTION_OWNER,
    };

    it('should be called with correct check url, method, signal', async () => {
      await postComment(data, basicCase.id, abortCtrl.signal);

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_URL}/${basicCase.id}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await postComment(data, basicCase.id, abortCtrl.signal);
      expect(resp).toEqual(basicCase);
    });

    it('should not covert to camel case registered attachments', async () => {
      fetchMock.mockResolvedValue(caseWithRegisteredAttachmentsSnake);
      const resp = await postComment(data, basicCase.id, abortCtrl.signal);
      expect(resp).toEqual(caseWithRegisteredAttachments);
    });
  });

  describe('getCaseConnectors', () => {
    const caseConnectors = getCaseConnectorsMockResponse();
    const connectorCamelCase = caseConnectors['servicenow-1'];

    const snakeCaseConnector = cloneDeep(connectorCamelCase);
    set(snakeCaseConnector, 'push.details.externalService', basicPushSnake);

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue({ 'servicenow-1': snakeCaseConnector });
    });

    it('should be called with correct check url, method, signal', async () => {
      await getCaseConnectors(basicCase.id, abortCtrl.signal);

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/${basicCase.id}/_connectors`, {
        method: 'GET',
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await getCaseConnectors(basicCase.id, abortCtrl.signal);
      expect(resp).toEqual({ 'servicenow-1': connectorCamelCase });
    });
  });

  describe('replaceCustomField', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(customFieldsMock[0]);
    });

    const data = {
      caseId: basicCase.id,
      customFieldId: customFieldsMock[0].key,
      request: {
        value: 'this is an updated custom field',
        caseVersion: basicCase.version,
      },
    };

    it('should be called with correct check url, method, signal', async () => {
      await replaceCustomField({ ...data, signal: abortCtrl.signal });

      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_INTERNAL_URL}/${basicCase.id}/custom_fields/${customFieldsMock[0].key}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...data.request,
          }),
          signal: abortCtrl.signal,
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await replaceCustomField({ ...data, signal: abortCtrl.signal });
      expect(resp).toEqual(customFieldsMock[0]);
    });
  });

  describe('getSimilarCases', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(similarCasesSnake);
    });

    it('should be called with correct url, method, signal', async () => {
      await getSimilarCases({
        caseId: mockCase.id,
        signal: abortCtrl.signal,
        page: 0,
        perPage: 10,
      });
      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/${mockCase.id}/_similar`, {
        method: 'POST',
        body: JSON.stringify({
          page: 0,
          perPage: 10,
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await getSimilarCases({
        caseId: mockCase.id,
        signal: abortCtrl.signal,
        page: 1,
        perPage: 10,
      });
      expect(resp).toEqual(similarCases);
    });
  });

  describe('postObservable', () => {
    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await postObservable(
        {
          observable: {
            typeKey: '18b62f19-8c60-415e-8a08-706d1078c556',
            value: 'test value',
            description: '',
          },
        },
        mockCase.id,
        abortCtrl.signal
      );

      expect(fetchMock).toHaveBeenCalledWith(`${CASES_INTERNAL_URL}/${mockCase.id}/observables`, {
        method: 'POST',
        body: JSON.stringify({
          observable: {
            typeKey: '18b62f19-8c60-415e-8a08-706d1078c556',
            value: 'test value',
            description: '',
          },
        }),
        signal: abortCtrl.signal,
      });
    });

    it('should return correct response', async () => {
      const resp = await postObservable(
        {
          observable: {
            typeKey: '18b62f19-8c60-415e-8a08-706d1078c556',
            value: 'test value',
            description: '',
          },
        },
        mockCase.id,
        abortCtrl.signal
      );
      expect(resp).toEqual(basicCase);
    });
  });

  describe('patchObservable', () => {
    const observableId = 'afa44220-862c-4a21-b574-351ab4d0a732';

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await patchObservable(
        {
          observable: {
            value: 'test value',
            description: '',
          },
        },
        mockCase.id,
        observableId,
        abortCtrl.signal
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_INTERNAL_URL}/${mockCase.id}/observables/${observableId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            observable: {
              value: 'test value',
              description: '',
            },
          }),
          signal: abortCtrl.signal,
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await patchObservable(
        {
          observable: {
            value: 'test value',
            description: '',
          },
        },
        mockCase.id,
        observableId,
        abortCtrl.signal
      );
      expect(resp).toEqual(basicCase);
    });
  });

  describe('deleteObservable', () => {
    const observableId = 'afa44220-862c-4a21-b574-351ab4d0a732';

    beforeEach(() => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(basicCaseSnake);
    });

    it('should be called with correct check url, method, signal', async () => {
      await deleteObservable(mockCase.id, observableId, abortCtrl.signal);

      expect(fetchMock).toHaveBeenCalledWith(
        `${CASES_INTERNAL_URL}/${mockCase.id}/observables/${observableId}`,
        {
          method: 'DELETE',
          signal: abortCtrl.signal,
        }
      );
    });

    it('should return correct response', async () => {
      const resp = await deleteObservable(mockCase.id, observableId, abortCtrl.signal);
      expect(resp).toEqual(undefined);
    });
  });
});
