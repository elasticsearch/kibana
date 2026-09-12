/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { FileJSON } from '@kbn/shared-ux-file-types';

import type {
  UserActionAction,
  CommentUserAction,
  UserAction,
  UserActions,
  UserActionType,
  Case,
  Cases,
  CaseConnector,
  Attachment,
  ObservableType,
} from '../../common/types/domain';
import {
  CaseSeverity,
  CaseStatuses,
  UserActionActions,
  UserActionTypes,
  ConnectorTypes,
  AttachmentType,
  ExternalReferenceStorageType,
  CustomFieldTypes,
} from '../../common/types/domain';
import type { ActionLicense, CaseUI, UserActionUI } from './types';

import type {
  ResolvedCase,
  SingleCaseMetrics,
  SingleCaseMetricsFeature,
  AlertAttachmentUI,
  CasesMetrics,
  ExternalReferenceAttachmentUI,
  PersistableStateAttachmentUI,
  CaseUsers,
  CaseUserActionsStats,
  CasesFindResponseUI,
  CasesUI,
  AttachmentUI,
  AttachmentUIV2,
  CaseUICustomField,
  CasesConfigurationUICustomField,
  CasesConfigurationUITemplate,
  CasesSimilarResponseUI,
  ObservableUI,
  InternalFindCaseUserActions,
  EventAttachmentUI,
} from '../../common/ui/types';
import { CaseMetricsFeature } from '../../common/types/api';
import { OBSERVABLE_TYPE_IPV4, SECURITY_SOLUTION_OWNER } from '../../common/constants';
import type { SnakeToCamelCase } from '../../common/types';
import { covertToSnakeCase } from './utils';
import type {
  CasesSearchResponse,
  CasesSimilarResponse,
  UserActionWithResponse,
} from '../../common/types/api';

export { connectorsMock } from '../common/mock/connectors';
export const basicCaseId = 'basic-case-id';
export const caseWithAlertsId = 'case-with-alerts-id';
export const caseWithAlertsSyncOffId = 'case-with-alerts-syncoff-id';
export const pushConnectorId = 'servicenow-1';

const basicCommentId = 'basic-comment-id';
const basicCreatedAt = '2020-02-19T23:06:33.798Z';
const basicUpdatedAt = '2020-02-20T15:02:57.995Z';
const basicClosedAt = '2020-02-21T15:02:57.995Z';
const basicPushedAt = '2023-01-17T09:46:29.813Z';
const laterTime = '2023-01-18T09:46:29.813Z';

export const elasticUser = {
  fullName: 'Leslie Knope',
  username: 'lknope',
  email: 'leslie.knope@elastic.co',
};

export const tags: string[] = ['coke', 'pepsi'];
export const categories: string[] = ['snickers', 'twix'];

export const basicComment: AttachmentUI = {
  comment: 'Solve this fast!',
  type: AttachmentType.user,
  id: basicCommentId,
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  owner: SECURITY_SOLUTION_OWNER,
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const basicCommentUnified: AttachmentUIV2 = {
  id: basicCommentId,
  type: 'comment',
  owner: SECURITY_SOLUTION_OWNER,
  data: { content: 'Solve this fast!' },
  metadata: null,
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const alertComment: AlertAttachmentUI = {
  alertId: 'alert-id-1',
  index: 'alert-index-1',
  type: AttachmentType.alert,
  id: 'alert-comment-id',
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  owner: SECURITY_SOLUTION_OWNER,
  pushedAt: null,
  pushedBy: null,
  rule: {
    id: 'rule-id-1',
    name: 'Awesome rule',
  },
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const alertCommentWithIndices: AlertAttachmentUI = {
  alertId: 'alert-id-1',
  index: '.alerts-matchme.alerts',
  type: AttachmentType.alert,
  id: 'alert-comment-id',
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  owner: SECURITY_SOLUTION_OWNER,
  pushedAt: null,
  pushedBy: null,
  rule: {
    id: 'rule-id-1',
    name: 'Awesome rule',
  },
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const eventComment: EventAttachmentUI = {
  eventId: 'event-id-1',
  index: 'event-index-1',
  type: AttachmentType.event,
  id: 'event-comment-id',
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  owner: SECURITY_SOLUTION_OWNER,
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const externalReferenceAttachment: ExternalReferenceAttachmentUI = {
  type: AttachmentType.externalReference,
  id: 'external-reference-comment-id',
  externalReferenceId: 'my-id',
  externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
  externalReferenceAttachmentTypeId: '.test',
  externalReferenceMetadata: { test_foo: 'foo' },
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  owner: SECURITY_SOLUTION_OWNER,
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const persistableStateAttachment: PersistableStateAttachmentUI = {
  type: AttachmentType.persistableState,
  id: 'persistable-state-comment-id',
  persistableStateAttachmentState: { test_foo: 'foo' },
  persistableStateAttachmentTypeId: '.test',
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  owner: SECURITY_SOLUTION_OWNER,
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

export const basicCase: CaseUI = {
  owner: SECURITY_SOLUTION_OWNER,
  closedAt: null,
  closedBy: null,
  id: basicCaseId,
  comments: [basicComment],
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  connector: {
    id: 'none',
    name: 'My Connector',
    type: ConnectorTypes.none,
    fields: null,
  },
  description: 'Security banana Issue',
  severity: CaseSeverity.LOW,
  duration: null,
  externalService: null,
  status: CaseStatuses.open,
  tags,
  title: 'Another horrible breach!!',
  totalComment: 1,
  totalAlerts: 0,
  totalEvents: 0,
  updatedAt: basicUpdatedAt,
  updatedBy: elasticUser,
  version: 'WzQ3LDFd',
  settings: {
    syncAlerts: true,
    extractObservables: true,
  },
  // damaged_raccoon uid
  assignees: [{ uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
  category: null,
  customFields: [],
  observables: [],
  totalObservables: 0,
  incrementalId: undefined,
};

export const basicCaseWithUnifiedComments: CaseUI = {
  ...basicCase,
  comments: [basicCommentUnified],
};

export const basicFileMock: FileJSON = {
  id: '7d47d130-bcec-11ed-afa1-0242ac120002',
  name: 'my-super-cool-screenshot',
  mimeType: 'image/png',
  created: basicCreatedAt,
  updated: basicCreatedAt,
  size: 999,
  meta: '',
  alt: '',
  fileKind: '',
  status: 'READY',
  extension: 'png',
  hash: {
    md5: 'md5',
    sha1: 'sha1',
    sha256: 'sha256',
  },
};

export const caseWithAlerts = {
  ...basicCase,
  totalAlerts: 2,
  id: caseWithAlertsId,
};

export const caseWithAlertsSyncOff = {
  ...basicCase,
  totalAlerts: 2,
  settings: {
    syncAlerts: false,
    extractObservables: false,
  },
  id: caseWithAlertsSyncOffId,
};

export const caseWithRegisteredAttachments = {
  ...basicCase,
  id: 'case-with-registered-attachment',
  comments: [externalReferenceAttachment, persistableStateAttachment],
};

export const basicResolvedCase: ResolvedCase = {
  case: basicCase,
  outcome: 'aliasMatch',
  aliasTargetId: `${basicCase.id}_2`,
};

export const basicCaseNumericValueFeatures: SingleCaseMetricsFeature[] = [
  CaseMetricsFeature.ALERTS_COUNT,
  CaseMetricsFeature.ALERTS_USERS,
  CaseMetricsFeature.ALERTS_HOSTS,
  CaseMetricsFeature.CONNECTORS,
];

export const basicCaseStatusFeatures: SingleCaseMetricsFeature[] = [CaseMetricsFeature.LIFESPAN];

export const basicCaseMetrics: SingleCaseMetrics = {
  alerts: {
    count: 12,
    hosts: {
      total: 2,
      values: [
        { name: 'foo', count: 2, id: 'foo' },
        { name: 'bar', count: 10, id: 'bar' },
      ],
    },
    users: {
      total: 1,
      values: [{ name: 'Jon', count: 12 }],
    },
  },
  connectors: { total: 1 },
  lifespan: {
    creationDate: basicCreatedAt,
    closeDate: basicClosedAt,
    statusInfo: {
      inProgressDuration: 20,
      openDuration: 10,
      reopenDates: [],
    },
  },
};

export const mockCase: CaseUI = {
  owner: SECURITY_SOLUTION_OWNER,
  closedAt: null,
  closedBy: null,
  id: 'mock-id',
  comments: [basicComment],
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  connector: {
    id: 'none',
    name: 'My Connector',
    type: ConnectorTypes.none,
    fields: null,
  },
  duration: null,
  severity: CaseSeverity.LOW,
  description: 'Security banana Issue',
  externalService: null,
  status: CaseStatuses.open,
  tags,
  title: 'Another horrible breach!!',
  totalComment: 1,
  totalAlerts: 0,
  totalEvents: 0,
  updatedAt: basicUpdatedAt,
  updatedBy: elasticUser,
  version: 'WzQ3LDFd',
  settings: {
    syncAlerts: true,
    extractObservables: true,
  },
  assignees: [],
  category: null,
  customFields: [],
  observables: [],
  totalObservables: 0,
  incrementalId: undefined,
};

export const basicCasePost: CaseUI = {
  ...basicCase,
  updatedAt: null,
  updatedBy: null,
};

export const basicCommentPatch: AttachmentUI = {
  ...basicComment,
  updatedAt: basicUpdatedAt,
  updatedBy: {
    username: 'elastic',
    email: 'elastic@elastic.co',
    fullName: 'Elastic',
  },
};

export const basicCaseCommentPatch = {
  ...basicCase,
  comments: [basicCommentPatch],
};

export const casesMetrics: CasesMetrics = {
  mttr: 12,
  status: {
    open: 20,
    inProgress: 40,
    closed: 130,
  },
};

export const basicPush = {
  connectorId: pushConnectorId,
  connectorName: 'My SN connector',
  externalId: 'external_id',
  externalTitle: 'external title',
  externalUrl: 'basicPush.com',
  pushedAt: basicPushedAt,
  pushedBy: elasticUser,
};

export const pushedCase: CaseUI = {
  ...basicCase,
  connector: {
    id: pushConnectorId,
    name: 'My SN connector',
    type: ConnectorTypes.serviceNowITSM,
    fields: null,
  },
  externalService: basicPush,
};

const basicAction = {
  createdAt: basicCreatedAt,
  createdBy: elasticUser,
  commentId: null,
  owner: SECURITY_SOLUTION_OWNER,
  payload: { title: 'a title' },
  type: 'title',
};

export const cases: CasesUI = [
  basicCase,
  {
    ...pushedCase,
    id: '1',
    totalComment: 0,
    comments: [],
    status: CaseStatuses['in-progress'],
    severity: CaseSeverity.MEDIUM,
    incrementalId: 1,
  },
  {
    ...pushedCase,
    updatedAt: laterTime,
    id: '2',
    totalComment: 0,
    comments: [],
  },
  { ...basicCase, id: '3', totalComment: 0, comments: [] },
  { ...basicCase, id: '4', totalComment: 0, comments: [] },
  caseWithAlerts,
  caseWithAlertsSyncOff,
  caseWithRegisteredAttachments,
];

export const allCases: CasesFindResponseUI = {
  cases,
  page: 1,
  perPage: 5,
  total: 10,
  countOpenCases: 20,
  countInProgressCases: 40,
  countClosedCases: 130,
  mttr: 2000,
};

export const similarCases: CasesSimilarResponseUI = {
  cases: cases.map(({ comments, ...theCase }) => ({
    ...theCase,
    similarities: { observables: [] },
  })),
  page: 1,
  perPage: 5,
  total: 10,
};

export const actionLicenses: ActionLicense[] = [
  {
    id: '.servicenow',
    name: 'ServiceNow',
    enabled: true,
    enabledInConfig: true,
    enabledInLicense: true,
  },
  {
    id: '.jira',
    name: 'Jira',
    enabled: true,
    enabledInConfig: true,
    enabledInLicense: true,
  },
];

// Snake case for mock api responses
export const elasticUserSnake = {
  full_name: 'Leslie Knope',
  username: 'lknope',
  email: 'leslie.knope@elastic.co',
};

export const basicCommentSnake: Attachment = {
  comment: 'Solve this fast!',
  type: AttachmentType.user,
  id: basicCommentId,
  created_at: basicCreatedAt,
  created_by: elasticUserSnake,
  owner: SECURITY_SOLUTION_OWNER,
  pushed_at: null,
  pushed_by: null,
  updated_at: null,
  updated_by: null,
  version: 'WzQ3LDFc',
};

export const externalReferenceAttachmentSnake: Attachment = {
  type: AttachmentType.externalReference,
  id: 'external-reference-comment-id',
  externalReferenceId: 'my-id',
  externalReferenceMetadata: { test_foo: 'foo' },
  externalReferenceAttachmentTypeId: '.test',
  externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
  created_at: basicCreatedAt,
  created_by: elasticUserSnake,
  owner: SECURITY_SOLUTION_OWNER,
  pushed_at: null,
  pushed_by: null,
  updated_at: null,
  updated_by: null,
  version: 'WzQ3LDFc',
};

export const persistableStateAttachmentSnake: Attachment = {
  type: AttachmentType.persistableState,
  id: 'persistable-state-comment-id',
  persistableStateAttachmentState: { test_foo: 'foo' },
  persistableStateAttachmentTypeId: '.test',
  created_at: basicCreatedAt,
  created_by: elasticUserSnake,
  owner: SECURITY_SOLUTION_OWNER,
  pushed_at: null,
  pushed_by: null,
  updated_at: null,
  updated_by: null,
  version: 'WzQ3LDFc',
};

export const basicCaseSnake: Case = {
  ...basicCase,
  status: CaseStatuses.open,
  closed_at: null,
  closed_by: null,
  comments: [basicCommentSnake],
  connector: { id: 'none', name: 'My Connector', type: ConnectorTypes.none, fields: null },
  created_at: basicCreatedAt,
  created_by: elasticUserSnake,
  duration: null,
  external_service: null,
  updated_at: basicUpdatedAt,
  updated_by: elasticUserSnake,
  owner: SECURITY_SOLUTION_OWNER,
  customFields: [],
  incremental_id: undefined,
  total_observables: 0,
} as Case;

export const caseWithAlertsSnake = {
  ...basicCaseSnake,
  totalAlerts: 2,
  id: caseWithAlertsId,
};

export const caseWithAlertsSyncOffSnake = {
  ...basicCaseSnake,
  totalAlerts: 2,
  settings: {
    syncAlerts: false,
    extractObservables: false,
  },
  id: caseWithAlertsSyncOffId,
};

export const caseWithRegisteredAttachmentsSnake = {
  ...basicCaseSnake,
  id: 'case-with-registered-attachment',
  comments: [externalReferenceAttachmentSnake, persistableStateAttachmentSnake],
};

export const pushSnake = {
  connector_id: pushConnectorId,
  connector_name: 'My SN connector',
  external_id: 'external_id',
  external_title: 'external title',
  external_url: 'basicPush.com',
};

export const basicPushSnake = {
  ...pushSnake,
  pushed_at: basicPushedAt,
  pushed_by: elasticUserSnake,
};

export const pushedCaseSnake = {
  ...basicCaseSnake,
  connector: {
    id: pushConnectorId,
    name: 'My SN connector',
    type: ConnectorTypes.serviceNowITSM,
    fields: null,
  },
  external_service: { ...basicPushSnake, connector_id: pushConnectorId },
};

export const casesSnake: Cases = [
  basicCaseSnake,
  {
    ...pushedCaseSnake,
    id: '1',
    incremental_id: 1,
    totalComment: 0,
    comments: [],
    status: CaseStatuses['in-progress'],
    severity: CaseSeverity.MEDIUM,
  },
  { ...pushedCaseSnake, updated_at: laterTime, id: '2', totalComment: 0, comments: [] },
  { ...basicCaseSnake, id: '3', totalComment: 0, comments: [] },
  { ...basicCaseSnake, id: '4', totalComment: 0, comments: [] },
  caseWithAlertsSnake,
  caseWithAlertsSyncOffSnake,
  caseWithRegisteredAttachmentsSnake,
];

export const allCasesSnake: CasesSearchResponse = {
  cases: casesSnake,
  page: 1,
  per_page: 5,
  total: 10,
  count_closed_cases: 130,
  count_in_progress_cases: 40,
  count_open_cases: 20,
  mttr: 2000,
};

export const similarCasesSnake: CasesSimilarResponse = {
  cases: casesSnake.map(({ ...theCase }) => ({ ...theCase, similarities: { observables: [] } })),
  page: 1,
  per_page: 5,
  total: 10,
};

export const getUserAction = (
  type: UserActionType,
  action: UserActionAction,
  overrides?: Record<string, unknown>
): UserActionUI => {
  const commonProperties = {
    ...basicAction,
    id: `${type}-${action}`,
    version: 'WzQ3LDFc',
    action,
  };

  const externalService = {
    connectorId: pushConnectorId,
    connectorName: 'My SN connector',
    externalId: 'external_id',
    externalTitle: 'external title',
    externalUrl: 'basicPush.com',
    pushedAt: basicPushedAt,
    pushedBy: elasticUser,
  };

  switch (type) {
    case UserActionTypes.comment:
      return {
        ...commonProperties,
        type: UserActionTypes.comment,
        payload: {
          comment: {
            comment: 'a comment',
            type: AttachmentType.user,
            owner: SECURITY_SOLUTION_OWNER,
          },
        },
        commentId: basicCommentId,
        ...overrides,
      };
    case UserActionTypes.connector:
      return {
        ...commonProperties,
        type: UserActionTypes.connector,
        payload: {
          connector: { ...getJiraConnector() },
        },
        ...overrides,
      };
    case UserActionTypes.create_case:
      return {
        ...commonProperties,
        type: UserActionTypes.create_case,
        payload: {
          description: 'a desc',
          connector: { ...getJiraConnector() },
          status: CaseStatuses.open,
          severity: CaseSeverity.LOW,
          title: 'a title',
          tags: ['a tag'],
          settings: { syncAlerts: true, extractObservables: true },
          owner: SECURITY_SOLUTION_OWNER,
          assignees: [],
        },
        ...overrides,
      };
    case UserActionTypes.delete_case:
      return {
        ...commonProperties,
        type: UserActionTypes.delete_case,
        payload: {},
        ...overrides,
      };
    case UserActionTypes.description:
      return {
        ...commonProperties,
        type: UserActionTypes.description,
        payload: { description: 'a desc' },
        ...overrides,
      };
    case UserActionTypes.pushed:
      return {
        ...commonProperties,
        createdAt: basicPushedAt,
        type: UserActionTypes.pushed,
        payload: {
          externalService,
        },
        ...overrides,
      };
    case UserActionTypes.settings:
      return {
        ...commonProperties,
        type: UserActionTypes.settings,
        payload: { settings: { syncAlerts: true, extractObservables: true } },
        ...overrides,
      };
    case UserActionTypes.status:
      return {
        ...commonProperties,
        type: UserActionTypes.status,
        payload: { status: CaseStatuses.open },
        ...overrides,
      };
    case UserActionTypes.tags:
      return {
        ...commonProperties,
        type: UserActionTypes.tags,
        payload: { tags: ['a tag'] },
        ...overrides,
      };
    case UserActionTypes.title:
      return {
        ...commonProperties,
        type: UserActionTypes.title,
        payload: { title: 'a title' },
        ...overrides,
      };
    case UserActionTypes.assignees:
      return {
        ...commonProperties,
        type: UserActionTypes.assignees,
        payload: {
          assignees: [
            // These values map to uids in x-pack/platform/plugins/shared/cases/public/containers/user_profiles/api.mock.ts
            { uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' },
            { uid: 'u_A_tM4n0wPkdiQ9smmd8o0Hr_h61XQfu8aRPh9GMoRoc_0' },
          ],
        },
        ...overrides,
      };
    case UserActionTypes.customFields:
      return {
        ...commonProperties,
        type: UserActionTypes.customFields,
        payload: {
          customFields: customFieldsMock,
        },
        ...overrides,
      };

    case UserActionTypes.workflow:
      return {
        ...commonProperties,
        type: UserActionTypes.workflow,
        payload: {
          workflow: { id: 'wf-1', name: 'My Workflow', executionId: 'exec-1' },
          origin: { type: 'cases.case', id: basicCaseId },
        },
        ...overrides,
      };

    default:
      return {
        ...commonProperties,
        ...overrides,
      } as UserActionUI;
  }
};

export const getUserActionSnake = (
  type: UserActionType,
  action: UserActionAction,
  overrides?: Record<string, unknown>
): UserAction => {
  return {
    ...covertToSnakeCase(getUserAction(type, action, overrides)),
  } as unknown as UserAction;
};

export const caseUserActionsSnake: UserActions = [
  getUserActionSnake('description', UserActionActions.create),
  getUserActionSnake('comment', UserActionActions.create),
  getUserActionSnake('description', UserActionActions.update),
];

export const caseUserActionsWithRegisteredAttachmentsSnake: UserActions = [
  getUserActionSnake('description', UserActionActions.create),
  {
    created_at: basicCreatedAt,
    created_by: elasticUserSnake,
    comment_id: null,
    owner: SECURITY_SOLUTION_OWNER,
    type: 'comment',
    action: 'create',
    id: 'create-comment-id',
    payload: {
      comment: {
        type: AttachmentType.externalReference,
        externalReferenceId: 'my-id',
        externalReferenceMetadata: { test_foo: 'foo' },
        externalReferenceAttachmentTypeId: '.test',
        externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
        owner: SECURITY_SOLUTION_OWNER,
      },
    },
    version: 'WzQ3LDFc',
  },
  {
    created_at: basicCreatedAt,
    created_by: elasticUserSnake,
    comment_id: null,
    owner: SECURITY_SOLUTION_OWNER,
    type: 'comment',
    action: 'create',
    id: 'create-comment-id',
    payload: {
      comment: {
        type: AttachmentType.persistableState,
        persistableStateAttachmentState: { test_foo: 'foo' },
        persistableStateAttachmentTypeId: '.test',
        owner: SECURITY_SOLUTION_OWNER,
      },
    },
    version: 'WzQ3LDFc',
  },
];

export const getJiraConnector = (overrides?: Partial<CaseConnector>): CaseConnector => {
  return {
    id: '123',
    name: 'jira1',
    ...jiraFields,
    ...overrides,
    type: ConnectorTypes.jira as const,
  } as CaseConnector;
};

export const jiraFields = { fields: { issueType: '10006', priority: null, parent: null } };

export const getAlertUserAction = (
  overrides?: Record<string, unknown>
): SnakeToCamelCase<UserActionWithResponse<CommentUserAction>> => ({
  ...getUserAction(UserActionTypes.comment, UserActionActions.create),
  id: 'alert-action-id',
  commentId: 'alert-comment-id',
  type: UserActionTypes.comment,
  payload: {
    comment: {
      type: AttachmentType.alert,
      alertId: 'alert-id-1',
      index: 'index-id-1',
      owner: SECURITY_SOLUTION_OWNER,
      rule: {
        id: 'rule-id-1',
        name: 'Awesome rule',
      },
    },
  },
  ...overrides,
});

export const getMultipleAlertsUserAction = (
  overrides?: Record<string, unknown>
): SnakeToCamelCase<UserActionWithResponse<CommentUserAction>> => ({
  ...getUserAction(UserActionTypes.comment, UserActionActions.create),
  id: 'alert-action-id',
  commentId: 'alert-comment-id',
  type: UserActionTypes.comment,
  payload: {
    comment: {
      type: AttachmentType.alert,
      alertId: ['alert-id-1', 'alert-id-2'],
      index: ['index-id-1', 'index-id-2'],
      owner: SECURITY_SOLUTION_OWNER,
      rule: {
        id: 'rule-id-1',
        name: 'Awesome rule',
      },
    },
  },
  ...overrides,
});

export const getEventUserAction = (
  overrides?: Record<string, unknown>
): SnakeToCamelCase<UserActionWithResponse<CommentUserAction>> => ({
  ...getUserAction(UserActionTypes.comment, UserActionActions.create),
  id: 'event-action-id',
  commentId: 'event-comment-id',
  type: UserActionTypes.comment,
  payload: {
    comment: {
      type: AttachmentType.event,
      eventId: 'event-id-1',
      index: 'index-id-1',
      owner: SECURITY_SOLUTION_OWNER,
    },
  },
  ...overrides,
});

export const caseUserActions: UserActionUI[] = [
  getUserAction('description', UserActionActions.create),
  getUserAction('comment', UserActionActions.create),
  getUserAction('description', UserActionActions.update),
];

export const caseUserActionsWithRegisteredAttachments: UserActionUI[] = [
  getUserAction('description', UserActionActions.create),
  {
    createdAt: basicCreatedAt,
    createdBy: elasticUser,
    commentId: null,
    owner: SECURITY_SOLUTION_OWNER,
    type: 'comment',
    action: 'create',
    id: 'create-comment-id',
    payload: {
      comment: {
        type: AttachmentType.externalReference,
        externalReferenceId: 'my-id',
        externalReferenceMetadata: { test_foo: 'foo' },
        externalReferenceAttachmentTypeId: '.test',
        externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
        owner: SECURITY_SOLUTION_OWNER,
      },
    },
    version: 'WzQ3LDFc',
  },
  {
    createdAt: basicCreatedAt,
    createdBy: elasticUser,
    commentId: null,
    owner: SECURITY_SOLUTION_OWNER,
    type: 'comment',
    action: 'create',
    id: 'create-comment-id',
    payload: {
      comment: {
        type: AttachmentType.persistableState,
        persistableStateAttachmentState: { test_foo: 'foo' },
        persistableStateAttachmentTypeId: '.test',
        owner: SECURITY_SOLUTION_OWNER,
      },
    },
    version: 'WzQ3LDFc',
  },
];

export const findCaseUserActionsResponse: InternalFindCaseUserActions = {
  page: 1,
  perPage: 10,
  total: 30,
  userActions: [...caseUserActionsWithRegisteredAttachments],
  latestAttachments: [],
};

export const getCaseUserActionsStatsResponse: CaseUserActionsStats = {
  total: 20,
  totalDeletions: 0,
  totalComments: 10,
  totalCommentCreations: 10,
  totalCommentDeletions: 0,
  totalHiddenCommentUpdates: 0,
  totalOtherActions: 10,
  totalOtherActionDeletions: 0,
};

// components tests
export const useGetCasesMockState = {
  data: allCases,
  isLoading: false,
  isError: false,
};

export const basicCaseClosed: CaseUI = {
  ...basicCase,
  closedAt: '2020-02-25T23:06:33.798Z',
  closedBy: elasticUser,
  status: CaseStatuses.closed,
};

export const getExternalReferenceUserAction = (
  overrides?: Record<string, unknown>
): SnakeToCamelCase<UserActionWithResponse<CommentUserAction>> => ({
  ...getUserAction(UserActionTypes.comment, UserActionActions.create),
  id: 'external-reference-action-id',
  type: UserActionTypes.comment,
  commentId: 'external-reference-comment-id',
  payload: {
    comment: {
      type: AttachmentType.externalReference,
      externalReferenceId: 'my-id',
      externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
      externalReferenceAttachmentTypeId: '.test',
      externalReferenceMetadata: null,
      owner: SECURITY_SOLUTION_OWNER,
    },
  },
  ...overrides,
});

export const getPersistableStateUserAction = (
  overrides?: Record<string, unknown>
): SnakeToCamelCase<UserActionWithResponse<CommentUserAction>> => ({
  ...getUserAction(UserActionTypes.comment, UserActionActions.create),
  id: 'persistable-state-action-id',
  type: UserActionTypes.comment,
  commentId: 'persistable-state-comment-id',
  payload: {
    comment: {
      type: AttachmentType.persistableState,
      persistableStateAttachmentState: { test_foo: 'foo' },
      persistableStateAttachmentTypeId: '.test',
      owner: SECURITY_SOLUTION_OWNER,
    },
  },
  ...overrides,
});

export const getCaseUsersMockResponse = (): CaseUsers => {
  return {
    participants: [
      {
        user: {
          email: 'participant_1@elastic.co',
          full_name: 'Participant 1',
          username: 'participant_1',
        },
      },
      {
        user: {
          email: 'participant_2@elastic.co',
          full_name: null,
          username: 'participant_2',
        },
      },
      {
        user: {
          email: null,
          full_name: null,
          username: 'participant_3',
        },
      },
      {
        user: {
          email: null,
          full_name: null,
          username: 'participant_4',
        },
        uid: 'participant_4_uid',
        avatar: { initials: 'P4' },
      },
      {
        user: {
          email: 'participant_5@elastic.co',
          full_name: 'Participant 5',
          username: 'participant_5',
        },
        uid: 'participant_5_uid',
      },
    ],
    reporter: {
      user: {
        email: 'reporter_1@elastic.co',
        full_name: 'Reporter 1',
        username: 'reporter_1',
      },
      uid: 'reporter_1_uid',
      avatar: { initials: 'R1' },
    },

    assignees: [
      {
        user: {
          email: null,
          full_name: null,
          username: null,
        },
        uid: 'u_62h24XVQzG4-MuH1-DqPmookrJY23aRa9h4fyULR6I8_0',
      },
      {
        user: {
          email: null,
          full_name: null,
          username: 'elastic',
        },
        uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      {
        user: {
          email: 'fuzzy_marten@profiles.elastic.co',
          full_name: 'Fuzzy Marten',
          username: 'fuzzy_marten',
        },
        uid: 'u_3OgKOf-ogtr8kJ5B0fnRcqzXs2aQQkZLtzKEEFnKaYg_0',
      },
      {
        user: {
          email: 'misty_mackerel@profiles.elastic.co',
          full_name: 'Misty Mackerel',
          username: 'misty_mackerel',
        },
        uid: 'u_BXf_iGxcnicv4l-3-ER7I-XPpfanAFAap7uls86xV7A_0',
      },
    ],
    unassignedUsers: [
      {
        user: {
          email: '',
          full_name: '',
          username: 'cases_no_connectors',
        },
        uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0',
      },
      {
        user: {
          email: 'valid_chimpanzee@profiles.elastic.co',
          full_name: 'Valid Chimpanzee',
          username: 'valid_chimpanzee',
        },
        uid: 'u_A_tM4n0wPkdiQ9smmd8o0Hr_h61XQfu8aRPh9GMoRoc_0',
      },
    ],
  };
};

export const customFieldsMock: CaseUICustomField[] = [
  { type: CustomFieldTypes.TEXT, key: 'test_key_1', value: 'My text test value 1' },
  { type: CustomFieldTypes.TOGGLE, key: 'test_key_2', value: true },
  { type: CustomFieldTypes.TEXT, key: 'test_key_3', value: null },
  { type: CustomFieldTypes.TOGGLE, key: 'test_key_4', value: null },
  { type: CustomFieldTypes.NUMBER, key: 'test_key_5', value: 1234 },
  { type: CustomFieldTypes.NUMBER, key: 'test_key_6', value: null },
];

export const customFieldsConfigurationMock: CasesConfigurationUICustomField[] = [
  {
    type: CustomFieldTypes.TEXT,
    key: 'test_key_1',
    label: 'My test label 1',
    required: true,
    defaultValue: 'My default value',
  },
  {
    type: CustomFieldTypes.TOGGLE,
    key: 'test_key_2',
    label: 'My test label 2',
    required: true,
    defaultValue: true,
  },
  { type: CustomFieldTypes.TEXT, key: 'test_key_3', label: 'My test label 3', required: false },
  { type: CustomFieldTypes.TOGGLE, key: 'test_key_4', label: 'My test label 4', required: false },
  {
    type: CustomFieldTypes.NUMBER,
    key: 'test_key_5',
    label: 'My test label 5',
    required: true,
    defaultValue: 123,
  },
  {
    type: CustomFieldTypes.NUMBER,
    key: 'test_key_6',
    label: 'My test label 6',
    required: false,
  },
];

export const templatesConfigurationMock: CasesConfigurationUITemplate[] = [
  {
    key: 'test_template_1',
    name: 'First test template',
    description: 'This is a first test template',
    caseFields: null,
  },
  {
    key: 'test_template_2',
    name: 'Second test template',
    description: 'This is a second test template',
    tags: [],
    caseFields: {},
  },
  {
    key: 'test_template_3',
    name: 'Third test template',
    description: 'This is a third test template with few case fields',
    tags: ['foo'],
    caseFields: {
      title: 'This is case title using a test template',
      severity: CaseSeverity.MEDIUM,
      tags: ['third-template', 'medium'],
    },
  },
  {
    key: 'test_template_4',
    name: 'Fourth test template',
    description: 'This is a fourth test template',
    tags: ['foo', 'bar'],
    caseFields: {
      title: 'Case with sample template 4',
      description: 'case desc',
      severity: CaseSeverity.LOW,
      category: null,
      tags: ['sample-4'],
      assignees: [{ uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
      customFields: [
        {
          key: 'first_custom_field_key',
          type: CustomFieldTypes.TEXT,
          value: 'this is a text field value',
        },
      ],
      connector: {
        id: 'none',
        name: 'My Connector',
        type: ConnectorTypes.none,
        fields: null,
      },
    },
  },
  {
    key: 'test_template_5',
    name: 'Fifth test template',
    description: 'This is a fifth test template',
    tags: ['foo', 'bar'],
    caseFields: {
      title: 'Case with sample template 5',
      description: 'case desc',
      severity: CaseSeverity.HIGH,
      category: 'my category',
      tags: ['sample-4'],
      assignees: [{ uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
      customFields: [
        {
          key: 'first_custom_field_key',
          type: CustomFieldTypes.TEXT,
          value: 'this is a text field value',
        },
      ],
      connector: {
        id: 'jira-1',
        name: 'Jira',
        type: ConnectorTypes.jira,
        fields: { issueType: 'Task', priority: 'Low', parent: null },
      },
    },
  },
];

export const observableTypesMock: ObservableType[] = [
  {
    label: 'test_observable_type_1',
    key: '26f3f226-6611-4371-9242-c959b37c7af6',
  },
  {
    label: 'test_observable_type_2',
    key: '67ec9e77-f64c-47d9-900c-1142239e0d25',
  },
];

export const mockObservables: ObservableUI[] = [
  {
    id: 'fa6dfb79-7fd5-44d0-a582-ca196e3a5e69',
    value: '127.0.0.1',
    typeKey: OBSERVABLE_TYPE_IPV4.key,
    description: null,
    createdAt: '2024-12-11',
    updatedAt: '2024-12-11',
  },
  {
    id: '096ca782-bd39-4dbf-8cf1-253d18277fdc',
    value: '10.0.0.1',
    typeKey: OBSERVABLE_TYPE_IPV4.key,
    description: null,
    createdAt: '2024-12-11',
    updatedAt: '2024-12-11',
  },
];

export const mockSimilarObservables = [
  {
    value: '127.0.0.1',
    typeKey: OBSERVABLE_TYPE_IPV4.key,
    typeLabel: OBSERVABLE_TYPE_IPV4.label,
  },
  {
    value: '10.0.0.1',
    typeKey: OBSERVABLE_TYPE_IPV4.key,
    typeLabel: OBSERVABLE_TYPE_IPV4.label,
  },
];
