/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';

import { SECURITY_SOLUTION_OWNER } from '../common/constants';
import { createCasesClientMock } from './client/mocks';
import type { CaseSavedObjectTransformed } from './common/types/case';
import type {
  ActionsAttachmentPayload,
  AlertAttachmentPayload,
  AttachmentAttributes,
  ConnectorMappings,
  EventAttachmentPayload,
  UnifiedAttachmentAttributes,
  UserActionAttributes,
  UserCommentAttachmentPayload,
} from '../common/types/domain';
import {
  UserActionActions,
  UserActionTypes,
  CaseSeverity,
  CaseStatuses,
  ConnectorTypes,
  AttachmentType,
} from '../common/types/domain';
import type { CasePostRequest } from '../common/types/api';
import { ALLOWED_MIME_TYPES } from '../common/constants/mime_types';
import type { CasesServerStart } from './types';

const lensPersistableState = {
  attributes: {
    title: '',
    description: '',
    visualizationType: 'lnsXY',
    references: [
      {
        type: 'index-pattern',
        id: 'security-solution-default',
        name: 'indexpattern-datasource-layer-3298543e-9615-4df1-bc10-248cb0ec857f',
      },
    ],
    state: {
      visualization: {
        legend: {
          isVisible: true,
          position: 'right',
        },
        valueLabels: 'hide',
        fittingFunction: 'None',
        axisTitlesVisibilitySettings: {
          x: true,
          yLeft: true,
          yRight: true,
        },
        tickLabelsVisibilitySettings: {
          x: true,
          yLeft: true,
          yRight: true,
        },
        labelsOrientation: {
          x: 0,
          yLeft: 0,
          yRight: 0,
        },
        gridlinesVisibilitySettings: {
          x: true,
          yLeft: true,
          yRight: true,
        },
        preferredSeriesType: 'bar_stacked',
        layers: [
          {
            layerId: '3298543e-9615-4df1-bc10-248cb0ec857f',
            accessors: ['fde6cfef-44d7-452c-9c0a-5c797cbb0d40'],
            position: 'top',
            seriesType: 'bar_stacked',
            showGridlines: false,
            layerType: 'data',
          },
        ],
      },
      query: {
        query: '',
        language: 'kuery',
      },
      filters: [],
      datasourceStates: {
        formBased: {
          layers: {
            '3298543e-9615-4df1-bc10-248cb0ec857f': {
              columns: {
                'fde6cfef-44d7-452c-9c0a-5c797cbb0d40': {
                  label: 'Count of records',
                  dataType: 'number',
                  operationType: 'count',
                  isBucketed: false,
                  scale: 'ratio',
                  sourceField: '___records___',
                  params: {
                    emptyAsNull: true,
                  },
                },
              },
              columnOrder: ['fde6cfef-44d7-452c-9c0a-5c797cbb0d40'],
              incompleteColumns: {},
              sampling: 1,
            },
          },
        },
        textBased: {
          layers: {},
        },
      },
      internalReferences: [],
      adHocDataViews: {},
    },
  },
  timeRange: {
    from: 'now-15m',
    to: 'now',
  },
};

export const mockCases: CaseSavedObjectTransformed[] = [
  {
    type: 'cases',
    id: 'mock-id-1',
    attributes: {
      closed_at: null,
      closed_by: null,
      connector: {
        id: 'none',
        name: 'none',
        type: ConnectorTypes.none,
        fields: null,
      },
      created_at: '2019-11-25T21:54:48.952Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      severity: CaseSeverity.LOW,
      duration: null,
      description: 'This is a brand new case of a bad meanie defacing data',
      external_service: null,
      incremental_id: undefined,
      title: 'Super Bad Security Issue',
      status: CaseStatuses.open,
      tags: ['defacement'],
      observables: [],
      total_observables: 0,
      updated_at: '2019-11-25T21:54:48.952Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      settings: {
        syncAlerts: true,
        extractObservables: true,
      },
      owner: SECURITY_SOLUTION_OWNER,
      assignees: [],
      category: null,
      customFields: [],
    },
    references: [],
    updated_at: '2019-11-25T21:54:48.952Z',
    version: 'WzAsMV0=',
  },
  {
    type: 'cases',
    id: 'mock-id-2',
    attributes: {
      closed_at: null,
      closed_by: null,
      connector: {
        id: 'none',
        name: 'none',
        type: ConnectorTypes.none,
        fields: null,
      },
      created_at: '2019-11-25T22:32:00.900Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      severity: CaseSeverity.LOW,
      duration: null,
      description: 'Oh no, a bad meanie destroying data!',
      external_service: null,
      incremental_id: undefined,
      title: 'Damaging Data Destruction Detected',
      status: CaseStatuses.open,
      tags: ['Data Destruction'],
      updated_at: '2019-11-25T22:32:00.900Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      settings: {
        syncAlerts: true,
        extractObservables: true,
      },
      observables: [],
      total_observables: 0,
      owner: SECURITY_SOLUTION_OWNER,
      assignees: [],
      category: null,
      customFields: [],
    },
    references: [],
    updated_at: '2019-11-25T22:32:00.900Z',
    version: 'WzQsMV0=',
  },
  {
    type: 'cases',
    id: 'mock-id-3',
    attributes: {
      closed_at: null,
      closed_by: null,
      connector: {
        id: '123',
        name: 'My connector',
        type: ConnectorTypes.jira,
        fields: { issueType: 'Task', priority: 'High', parent: null },
      },
      created_at: '2019-11-25T22:32:17.947Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      severity: CaseSeverity.LOW,
      duration: null,
      description: 'Oh no, a bad meanie going LOLBins all over the place!',
      external_service: null,
      incremental_id: undefined,
      title: 'Another bad one',
      status: CaseStatuses.open,
      tags: ['LOLBins'],
      updated_at: '2019-11-25T22:32:17.947Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      settings: {
        syncAlerts: true,
        extractObservables: true,
      },
      observables: [],
      total_observables: 0,
      owner: SECURITY_SOLUTION_OWNER,
      assignees: [],
      category: null,
      customFields: [],
    },
    references: [],
    updated_at: '2019-11-25T22:32:17.947Z',
    version: 'WzUsMV0=',
  },
  {
    type: 'cases',
    id: 'mock-id-4',
    attributes: {
      closed_at: '2019-11-25T22:32:17.947Z',
      closed_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      connector: {
        id: '123',
        name: 'My connector',
        type: ConnectorTypes.jira,
        fields: { issueType: 'Task', priority: 'High', parent: null },
      },
      created_at: '2019-11-25T22:32:17.947Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      severity: CaseSeverity.LOW,
      duration: null,
      description: 'Oh no, a bad meanie going LOLBins all over the place!',
      external_service: null,
      incremental_id: undefined,
      status: CaseStatuses.closed,
      title: 'Another bad one',
      tags: ['LOLBins'],
      updated_at: '2019-11-25T22:32:17.947Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      settings: {
        syncAlerts: true,
        extractObservables: true,
      },
      observables: [],
      total_observables: 0,
      owner: SECURITY_SOLUTION_OWNER,
      assignees: [],
      category: null,
      customFields: [],
    },
    references: [],
    updated_at: '2019-11-25T22:32:17.947Z',
    version: 'WzUsMV0=',
  },
];

export const mockCasesErrorTriggerData = [
  {
    id: 'valid-id',
  },
  {
    id: 'bad-guy',
  },
];

export const mockCaseComments: Array<SavedObject<AttachmentAttributes>> = [
  {
    type: 'cases-comment',
    id: 'mock-comment-1',
    attributes: {
      comment: 'Wow, good luck catching that bad meanie!',
      type: AttachmentType.user,
      created_at: '2019-11-25T21:55:00.177Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      updated_at: '2019-11-25T21:55:00.177Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-1',
      },
    ],
    updated_at: '2019-11-25T21:55:00.177Z',
    version: 'WzEsMV0=',
  },
  {
    type: 'cases-comment',
    id: 'mock-comment-2',
    attributes: {
      comment: 'Well I decided to update my comment. So what? Deal with it.',
      type: AttachmentType.user,
      created_at: '2019-11-25T21:55:14.633Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      updated_at: '2019-11-25T21:55:14.633Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-1',
      },
    ],
    updated_at: '2019-11-25T21:55:14.633Z',

    version: 'WzMsMV0=',
  },
  {
    type: 'cases-comment',
    id: 'mock-comment-3',
    attributes: {
      comment: 'Wow, good luck catching that bad meanie!',
      type: AttachmentType.user,
      created_at: '2019-11-25T22:32:30.608Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      updated_at: '2019-11-25T22:32:30.608Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-3',
      },
    ],
    updated_at: '2019-11-25T22:32:30.608Z',
    version: 'WzYsMV0=',
  },
  {
    type: 'cases-comment',
    id: 'mock-comment-4',
    attributes: {
      type: AttachmentType.alert,
      index: 'test-index',
      alertId: 'test-id',
      created_at: '2019-11-25T22:32:30.608Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      rule: {
        id: 'rule-id-1',
        name: 'rule-name-1',
      },
      updated_at: '2019-11-25T22:32:30.608Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-4',
      },
    ],
    updated_at: '2019-11-25T22:32:30.608Z',
    version: 'WzYsMV0=',
  },
  {
    type: 'cases-comment',
    id: 'mock-comment-5',
    attributes: {
      type: AttachmentType.alert,
      index: 'test-index-2',
      alertId: 'test-id-2',
      created_at: '2019-11-25T22:32:30.608Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      rule: {
        id: 'rule-id-2',
        name: 'rule-name-2',
      },
      updated_at: '2019-11-25T22:32:30.608Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-4',
      },
    ],
    updated_at: '2019-11-25T22:32:30.608Z',
    version: 'WzYsMV0=',
  },
  {
    type: 'cases-comment',
    id: 'mock-comment-6',
    attributes: {
      type: AttachmentType.alert,
      index: 'test-index-3',
      alertId: 'test-id-3',
      created_at: '2019-11-25T22:32:30.608Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      owner: SECURITY_SOLUTION_OWNER,
      pushed_at: null,
      pushed_by: null,
      rule: {
        id: 'rule-id-1',
        name: 'rule-name-1',
      },
      updated_at: '2019-11-25T22:32:30.608Z',
      updated_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-4',
      },
    ],
    updated_at: '2019-11-25T22:32:30.608Z',
    version: 'WzYsMV0=',
  },
  {
    type: 'cases-comment',
    id: 'mock-comment-7',
    attributes: {
      type: AttachmentType.persistableState,
      persistableStateAttachmentTypeId: '.lens',
      persistableStateAttachmentState: lensPersistableState,
      owner: 'cases',
      created_at: '2023-06-05T08:56:53.794Z',
      created_by: {
        email: null,
        full_name: null,
        username: 'elastic',
        profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
      },
      pushed_at: null,
      pushed_by: null,
      updated_at: '2019-11-25T22:32:30.608Z',
      updated_by: null,
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-4',
      },
    ],
    updated_at: '2019-11-25T22:32:30.608Z',
    version: 'WzE1NjM2ODQsMTFd',
  },
];

export const mockCaseUnifiedAttachments: Array<SavedObject<UnifiedAttachmentAttributes>> = [
  {
    type: 'cases-attachments',
    id: 'mock-attachment-1',
    attributes: {
      type: 'comment',
      data: { content: 'test' },
      owner: 'securitySolution',
      created_at: '2019-11-25T21:55:00.177Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      pushed_at: null,
      pushed_by: null,
      updated_at: null,
      updated_by: null,
    },
    references: [],
  },
];

export const mockUsersActions: Array<SavedObject<UserActionAttributes>> = [
  {
    type: 'cases-user-actions',
    id: 'mock-user-action-1',
    attributes: {
      type: UserActionTypes.description,
      action: UserActionActions.update,
      payload: { description: 'test' },
      created_at: '2019-11-25T21:55:00.177Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      comment_id: null,
      owner: SECURITY_SOLUTION_OWNER,
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-1',
      },
    ],
    updated_at: '2019-11-25T21:55:00.177Z',
    version: 'WzEsMV0=',
  },
  {
    type: 'cases-user-actions',
    id: 'mock-user-action-2',
    attributes: {
      type: UserActionTypes.comment,
      action: UserActionActions.update,
      payload: {
        comment: {
          type: AttachmentType.persistableState,
          persistableStateAttachmentTypeId: '.test',
          persistableStateAttachmentState: {},
          owner: 'cases',
        },
      },
      created_at: '2019-11-25T21:55:00.177Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      comment_id: null,
      owner: SECURITY_SOLUTION_OWNER,
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-1',
      },
    ],
    updated_at: '2019-11-25T21:55:00.177Z',
    version: 'WzEsMV0=',
  },
  {
    type: 'cases-user-actions',
    id: 'mock-user-action-3',
    attributes: {
      type: UserActionTypes.comment,
      action: UserActionActions.update,
      payload: {
        comment: {
          type: AttachmentType.persistableState,
          persistableStateAttachmentTypeId: '.lens',
          persistableStateAttachmentState: lensPersistableState,
          owner: 'cases',
        },
      },
      created_at: '2019-11-25T21:55:00.177Z',
      created_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
      comment_id: null,
      owner: SECURITY_SOLUTION_OWNER,
    },
    references: [
      {
        type: 'cases',
        name: 'associated-cases',
        id: 'mock-id-1',
      },
    ],
    updated_at: '2019-11-25T21:55:00.177Z',
    version: 'WzEsMV0=',
  },
];

export const newCase: CasePostRequest = {
  title: 'My new case',
  description: 'A description',
  tags: ['new', 'case'],
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
};

export const comment: UserCommentAttachmentPayload = {
  comment: 'a comment',
  type: AttachmentType.user as const,
  owner: SECURITY_SOLUTION_OWNER,
};

export const actionComment: ActionsAttachmentPayload = {
  type: AttachmentType.actions,
  comment: 'I just isolated the host!',
  actions: {
    targets: [
      {
        hostname: 'host1',
        endpointId: '001',
      },
    ],
    type: 'isolate',
  },
  owner: 'cases',
};

export const alertComment: AlertAttachmentPayload = {
  alertId: 'alert-id-1',
  index: 'alert-index-1',
  rule: {
    id: 'rule-id-1',
    name: 'rule-name-1',
  },
  type: AttachmentType.alert as const,
  owner: SECURITY_SOLUTION_OWNER,
};

export const eventComment: EventAttachmentPayload = {
  eventId: 'event-id-1',
  index: 'mock-index',
  type: AttachmentType.event as const,
  owner: SECURITY_SOLUTION_OWNER,
};

export const multipleAlert: AlertAttachmentPayload = {
  ...alertComment,
  alertId: ['test-id-3', 'test-id-4', 'test-id-5'],
  index: ['test-index-3', 'test-index-4', 'test-index-5'],
};

export const mappings: ConnectorMappings = [
  {
    source: 'title',
    target: 'short_description',
    action_type: 'overwrite',
  },
  {
    source: 'description',
    target: 'description',
    action_type: 'append',
  },
  {
    source: 'comments',
    target: 'comments',
    action_type: 'append',
  },
];

const casesClientMock = createCasesClientMock();

export const mockCasesContract = (): CasesServerStart => ({
  getCasesClientWithRequest: jest.fn().mockResolvedValue(casesClientMock),
  getExternalReferenceAttachmentTypeRegistry: jest.fn(),
  getPersistableStateAttachmentTypeRegistry: jest.fn(),
  getUnifiedAttachmentTypeRegistry: jest.fn(),
  config: {
    enabled: true,
    stack: {
      enabled: true,
    },
    markdownPlugins: { lens: true },
    files: {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxSize: 1,
    },
    analytics: {
      index: {
        enabled: true,
      },
    },
    analyticsV2: {
      enabled: false,
      reconciliationIntervalMinutes: 30,
      enableAdminRoutes: false,
      resetTaskTimeoutMinutes: 60,
      resetPageDelayMs: 0,
    },
    incrementalId: {
      enabled: true,
      taskIntervalMinutes: 10,
      taskStartDelayMinutes: 10,
    },
    templates: {
      enabled: true,
    },
    casesRedesign: {
      list: false,
      details: false,
      settings: false,
    },
    attachments: {
      enabled: true,
    },
  },
});

export const casesPluginMock = {
  createStartContract: mockCasesContract,
};
