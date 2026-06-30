/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { OBSERVABLE_TYPE_IPV4 } from '../../constants';

const observablesFixture = [
  {
    id: 'cpaon3223fj2omwcpown9pv',
    typeKey: OBSERVABLE_TYPE_IPV4.key,
    value: '10.0.0.8',
  },
];

export const createCaseRequestFixture = {
  title: 'My new case',
  description: 'A description',
  tags: ['new', 'case'],
  connector: {
    id: 'none',
    name: 'none',
    type: '.none',
    fields: null,
  },
  settings: {
    syncAlerts: true,
    extractObservables: true,
  },
  owner: 'securitySolution',
};

export const createCaseResponseFixture = {
  id: 'case-1',
  owner: 'securitySolution',
  title: 'Another horrible breach!!',
  description: 'Security banana Issue',
  tags: ['coke', 'pepsi'],
  status: 'open',
  severity: 'low',
  connector: {
    id: 'none',
    name: 'My Connector',
    type: '.none',
    fields: null,
  },
  settings: {
    syncAlerts: true,
    extractObservables: false,
  },
  comments: [
    {
      comment: 'Solve this fast!',
      type: 'user',
      id: 'basic-comment-id',
      created_at: '2020-02-19T23:06:33.798Z',
      created_by: {
        full_name: 'Leslie Knope',
        username: 'lknope',
        email: 'leslie.knope@elastic.co',
      },
      owner: 'securitySolution',
      pushed_at: null,
      pushed_by: null,
      updated_at: null,
      updated_by: null,
      version: 'WzQ3LDFc',
    },
  ],
  created_at: '2020-02-19T23:06:33.798Z',
  created_by: {
    full_name: 'Leslie Knope',
    username: 'lknope',
    email: 'leslie.knope@elastic.co',
  },
  updated_at: '2020-02-20T15:02:57.995Z',
  updated_by: {
    full_name: 'Leslie Knope',
    username: 'lknope',
    email: 'leslie.knope@elastic.co',
  },
  closed_at: null,
  closed_by: null,
  external_service: null,
  duration: null,
  totalAlerts: 0,
  totalComment: 1,
  version: 'WzQ3LDFd',
  observables: [
    {
      id: 'cpaon3223fj2omwcpown9pv',
      typeKey: OBSERVABLE_TYPE_IPV4.key,
      value: '10.0.0.8',
      updatedAt: '2020-02-20T15:07:57.995Z',
      createdAt: '2020-02-20T15:02:57.995Z',
      description: 'test description',
    },
  ],
  total_observables: 1,
};

export const caseIdFixture = 'case-1';
export const caseVersionFixture = 'WzQ3LDFd';
export const caseTitleFixture = 'Updated title';
export const caseDescriptionFixture = 'Updated description';
export const caseSeverityFixture = 'high';
export const caseStatusFixture = 'in-progress';
export const caseCategoryFixture = 'Malware';
export const caseTagsFixture = ['triage'];
export const caseAssigneesFixture = [{ uid: 'user-1' }];

export const addCommentInputFixture = {
  case_id: caseIdFixture,
  comment: 'Investigating now',
};

export const updateCaseInputFixture = {
  case_id: caseIdFixture,
  updates: { title: caseTitleFixture },
};

export const updateCaseInputWithVersionFixture = {
  ...updateCaseInputFixture,
  version: caseVersionFixture,
};

export const updateCasesInputFixture = {
  cases: [updateCaseInputFixture],
};

export const updateCasesInputWithVersionFixture = {
  cases: [updateCaseInputWithVersionFixture],
};

export const setCustomFieldTextInputFixture = {
  case_id: caseIdFixture,
  owner: 'securitySolution',
  field_name: 'cf_text',
  value: 'new value',
};

export const setCustomFieldToggleInputFixture = {
  case_id: caseIdFixture,
  owner: 'securitySolution',
  field_name: 'cf_toggle',
  value: true,
};

export const setCustomFieldNumberInputFixture = {
  case_id: caseIdFixture,
  owner: 'securitySolution',
  field_name: 'cf_number',
  value: 42,
};

export const setCustomFieldNullInputFixture = {
  case_id: caseIdFixture,
  owner: 'securitySolution',
  field_name: 'cf_optional',
  value: null,
};

export const setSeverityInputFixture = {
  case_id: caseIdFixture,
  severity: caseSeverityFixture,
};

export const setStatusInputFixture = {
  case_id: caseIdFixture,
  status: caseStatusFixture,
};

export const closeCaseInputFixture = {
  case_id: caseIdFixture,
};

export const deleteCasesInputFixture = {
  case_ids: [caseIdFixture, 'case-2'],
};

export const deleteCasesOutputFixture = {
  case_ids: [caseIdFixture, 'case-2'],
};

export const assignCaseInputFixture = {
  case_id: caseIdFixture,
  assignees: caseAssigneesFixture,
};

export const unassignCaseInputFixture = {
  case_id: caseIdFixture,
  assignees: [],
};

export const addAlertsInputFixture = {
  case_id: caseIdFixture,
  alerts: [{ alertId: 'alert-1', index: '.alerts-security.alerts-default' }],
};

export const addEventsInputFixture = {
  case_id: caseIdFixture,
  events: [{ eventId: 'event-1', index: '.ds-logs-*' }],
};

export const addObservablesInputFixture = {
  case_id: caseIdFixture,
  observables: observablesFixture,
};

export const addTagInputFixture = {
  case_id: caseIdFixture,
  tags: caseTagsFixture,
};

export const addCategoryInputFixture = {
  case_id: caseIdFixture,
  category: caseCategoryFixture,
};

export const setDescriptionInputFixture = {
  case_id: caseIdFixture,
  description: caseDescriptionFixture,
};

export const setTitleInputFixture = {
  case_id: caseIdFixture,
  title: caseTitleFixture,
};

export const findSimilarCasesInputFixture = {
  case_id: caseIdFixture,
  page: 1,
  perPage: 20,
};

export const findSimilarCasesOutputFixture = {
  cases: [
    {
      ...createCaseResponseFixture,
      similarities: {
        observables: [{ typeKey: 'ip', typeLabel: 'IP', value: '10.0.0.8' }],
      },
    },
  ],
  page: 1,
  per_page: 20,
  total: 1,
};

export const findCasesInputFixture = {
  owner: 'securitySolution',
  status: ['open', 'in-progress'],
  severity: 'high',
  search: 'incident',
  searchFields: ['title', 'description'],
  sortField: 'updatedAt',
  sortOrder: 'desc',
  tags: ['tag-1', 'tag-2'],
  page: 1,
  perPage: 20,
};

export const findCasesOutputFixture = {
  cases: [createCaseResponseFixture],
  count_closed_cases: 0,
  count_in_progress_cases: 0,
  count_open_cases: 1,
  page: 1,
  per_page: 20,
  total: 1,
};

export const alertIdFixture = 'alert-id-1';

export const getCasesByAlertIdInputFixture = {
  alert_id: alertIdFixture,
  owner: 'securitySolution',
};

export const getCasesByAlertIdOutputFixture = {
  cases: [
    {
      id: caseIdFixture,
      title: 'Another horrible breach!!',
      description: 'Security banana Issue',
      status: 'open',
      createdAt: '2020-02-19T23:06:33.798Z',
      totals: { alerts: 1, events: 0, userComments: 0 },
    },
  ],
};

export const userCommentFixture = {
  id: 'comment-1',
  type: 'user' as const,
  comment: 'Investigating now',
  owner: 'securitySolution',
  created_at: '2020-02-19T23:06:33.798Z',
  created_by: {
    full_name: 'Leslie Knope',
    username: 'lknope',
    email: 'leslie.knope@elastic.co',
  },
  pushed_at: null,
  pushed_by: null,
  updated_at: null,
  updated_by: null,
  version: 'WzQ3LDFc',
};

export const getAllAttachmentsInputFixture = {
  case_id: caseIdFixture,
};

export const getAllAttachmentsOutputFixture = {
  attachments: [userCommentFixture],
};

export const observableIdFixture = 'obs-1';

export const updateObservableInputFixture = {
  case_id: caseIdFixture,
  observable_id: observableIdFixture,
  value: '10.0.0.42',
  description: 'Updated source IP',
};

export const deleteObservableInputFixture = {
  case_id: caseIdFixture,
  observable_id: observableIdFixture,
};

export const deleteObservableOutputFixture = {
  case_id: caseIdFixture,
  observable_id: observableIdFixture,
};

export const getCasesInputFixture = {
  case_ids: [caseIdFixture, 'case-2'],
};

export const getCasesOutputFixture = {
  cases: [createCaseResponseFixture],
  errors: [],
};

export const pushCasesInputFixture = {
  case_ids: [caseIdFixture],
};

export const pushCasesOutputFixture = {
  cases: [createCaseResponseFixture],
};
