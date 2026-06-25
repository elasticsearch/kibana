/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';

import {
  comment as commentObj,
  userActions,
  commentAlert,
  commentAlertMultipleIds,
  isolateCommentActions,
  releaseCommentActions,
  isolateCommentActionsMultipleTargets,
  commentExternalReference,
  commentPersistableState,
} from './mock';

import {
  createIncident,
  dedupAssignees,
  getClosedInfoForUpdate,
  getCloseReasonIfValid,
  getDurationForUpdate,
  getEntity,
  getLatestPushInfo,
  mapCaseFieldsToExternalSystemFields,
  formatComments,
  addKibanaInformationToDescription,
  fillMissingCustomFields,
  normalizeCreateCaseRequest,
  getInProgressInfoForUpdate,
  getTimingMetricsForUpdate,
  isObservable,
  processObservables,
  enrichCasesWithFieldLabels,
} from './utils';

import type {
  AttachmentV2,
  CaseCustomFields,
  CustomFieldsConfiguration,
  Observable,
  CaseConnector,
  JiraFieldsType,
} from '../../../common/types/domain';
import {
  CaseStatuses,
  CustomFieldTypes,
  UserActionActions,
  UserActionTypes,
  CaseSeverity,
  ConnectorTypes,
} from '../../../common/types/domain';
import { flattenCaseSavedObject } from '../../common/utils';
import { SECURITY_SOLUTION_OWNER } from '../../../common/constants';
import { casesConnectors } from '../../connectors';
import { userProfiles, userProfilesMap } from '../user_profiles.mock';
import { mappings, mockCases } from '../../mocks';
import type { ObservablePost, CaseUserActionsDeprecatedResponse } from '../../../common/types/api';
import { createMockConnector } from '@kbn/actions-plugin/server/application/connector/mocks';

const allComments = [
  commentObj,
  commentAlert,
  commentAlertMultipleIds,
  isolateCommentActions,
  releaseCommentActions,
  isolateCommentActionsMultipleTargets,
  commentExternalReference,
  commentPersistableState,
];

describe('utils', () => {
  describe('dedupAssignees', () => {
    it('removes duplicate assignees', () => {
      expect(dedupAssignees([{ uid: '123' }, { uid: '123' }, { uid: '456' }])).toEqual([
        { uid: '123' },
        { uid: '456' },
      ]);
    });

    it('leaves the array as it is when there are no duplicates', () => {
      expect(dedupAssignees([{ uid: '123' }, { uid: '456' }])).toEqual([
        { uid: '123' },
        { uid: '456' },
      ]);
    });

    it('returns undefined when the assignees is undefined', () => {
      expect(dedupAssignees()).toBeUndefined();
    });
  });

  describe('getCloseReasonIfValid', () => {
    it('returns any non-empty close reason', () => {
      expect(getCloseReasonIfValid('false_positive')).toBe('false_positive');
      expect(getCloseReasonIfValid('automated_closure')).toBe('automated_closure');
      expect(getCloseReasonIfValid('my custom reason')).toBe('my custom reason');
    });

    it('returns undefined for empty values', () => {
      expect(getCloseReasonIfValid('')).toBeUndefined();
      expect(getCloseReasonIfValid('   ')).toBeUndefined();
      expect(getCloseReasonIfValid()).toBeUndefined();
    });
  });

  describe('createIncident', () => {
    const theCase = {
      ...flattenCaseSavedObject({
        savedObject: mockCases[0],
      }),
      comments: [commentObj],
      totalComments: 1,
    };

    const connector = createMockConnector({
      id: '456',
      actionTypeId: '.jira',
      name: 'Connector without isCaseOwned',
      config: {
        apiUrl: 'https://elastic.jira.com',
      },
    });

    it('creates an external incident correctly for Jira', async () => {
      const res = await createIncident({
        theCase,
        userActions: [],
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          priority: null,
          labels: ['defacement'],
          issueType: null,
          parent: null,
          otherFields: null,
          summary: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('creates an external incident correctly for SN', async () => {
      const snConnector = {
        ...connector,
        actionTypeId: '.servicenow',
      };

      const res = await createIncident({
        theCase,
        userActions: [],
        connector: snConnector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          additional_fields: null,
          category: null,
          subcategory: null,
          correlation_display: 'Elastic Case',
          correlation_id: 'mock-id-1',
          impact: null,
          severity: null,
          urgency: null,
          short_description: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('creates an external incident correctly for SIR', async () => {
      const snConnector = {
        ...connector,
        actionTypeId: '.servicenow-sir',
      };

      const res = await createIncident({
        theCase,
        userActions: [],
        connector: snConnector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          additional_fields: null,
          category: null,
          subcategory: null,
          correlation_display: 'Elastic Case',
          correlation_id: 'mock-id-1',
          dest_ip: [],
          source_ip: [],
          malware_hash: [],
          malware_url: [],
          priority: null,
          short_description: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('creates an external incident correctly for IBM Resilient', async () => {
      const resilientConnector = {
        ...connector,
        actionTypeId: '.resilient',
      };

      const res = await createIncident({
        theCase,
        userActions: [],
        connector: resilientConnector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          incidentTypes: null,
          severityCode: null,
          name: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.',
          externalId: null,
          additionalFields: null,
        },
        comments: [],
      });
    });

    it('creates an external incident correctly for Swimlane', async () => {
      const swimlaneConnector = {
        ...connector,
        actionTypeId: '.swimlane',
      };

      const res = await createIncident({
        theCase,
        userActions: [],
        connector: swimlaneConnector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          caseId: 'mock-id-1',
          caseName: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('creates an external incident correctly for Cases webhook', async () => {
      const webhookConnector = {
        ...connector,
        actionTypeId: '.cases-webhook',
      };

      const res = await createIncident({
        theCase,
        userActions: [],
        connector: webhookConnector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          description: 'This is a brand new case of a bad meanie defacing data',
          externalId: null,
          id: 'mock-id-1',
          severity: 'low',
          status: 'open',
          tags: ['defacement'],
          title: 'Super Bad Security Issue',
        },
        comments: [],
      });
    });

    it('formats the connector fields correctly', async () => {
      const caseWithConnector = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[2],
        }),
        comments: [],
        totalComments: 0,
      };

      const res = await createIncident({
        theCase: caseWithConnector,
        userActions: [],
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          priority: 'High',
          labels: ['LOLBins'],
          issueType: 'Task',
          parent: null,
          otherFields: null,
          summary: 'Another bad one',
          description: 'Oh no, a bad meanie going LOLBins all over the place!\n\nAdded by elastic.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('includes Jira otherFields in the incident payload', async () => {
      const caseWithOtherFields = {
        ...flattenCaseSavedObject({
          savedObject: {
            ...mockCases[2],
            attributes: {
              ...mockCases[2].attributes,
              connector: {
                ...mockCases[2].attributes.connector,
                fields: {
                  ...(mockCases[2].attributes.connector.fields as JiraFieldsType),
                  otherFields: '{"customfield_123456":"Blue team"}',
                },
              } as CaseConnector,
            },
          },
        }),
        comments: [],
        totalComments: 0,
      };

      const res = await createIncident({
        theCase: caseWithOtherFields,
        userActions: [],
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          priority: 'High',
          labels: ['LOLBins'],
          issueType: 'Task',
          parent: null,
          otherFields: '{"customfield_123456":"Blue team"}',
          summary: 'Another bad one',
          description: 'Oh no, a bad meanie going LOLBins all over the place!\n\nAdded by elastic.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('creates comments correctly', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [commentObj],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
      ]);
    });

    it('adds the total alert comments correctly', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [commentObj, commentAlert, commentAlertMultipleIds],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
        {
          comment: 'Elastic Alerts attached to the case: 3',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('filters out the alerts from the comments correctly', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [{ ...commentObj, id: 'comment-user-1' }, commentAlertMultipleIds],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
        {
          comment: 'Elastic Alerts attached to the case: 2',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('does not add the alerts count comment if all alerts have been pushed', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [
            { ...commentObj, id: 'comment-user-1', pushed_at: '2019-11-25T21:55:00.177Z' },
            { ...commentAlertMultipleIds, pushed_at: '2019-11-25T21:55:00.177Z' },
          ],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
      ]);
    });

    it('counts unified alert attachments toward the alerts total', async () => {
      const unifiedAlertSingle = {
        ...omit(commentAlert, ['alertId', 'index', 'rule']),
        id: 'unified-alert-1',
        type: 'security.alert',
        attachmentId: 'alert-id-3',
      } as unknown as AttachmentV2;
      const unifiedAlertMulti = {
        ...omit(commentAlert, ['alertId', 'index', 'rule']),
        id: 'unified-alert-2',
        type: 'security.alert',
        attachmentId: ['alert-id-4', 'alert-id-5'],
      } as unknown as AttachmentV2;

      const res = await createIncident({
        theCase: {
          ...theCase,
          // 1 legacy alert (1 id) + 2 unified alerts (1 + 2 ids) = 4 alerts total
          comments: [commentAlert, unifiedAlertSingle, unifiedAlertMulti],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Elastic Alerts attached to the case: 4',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('skips the alerts summary when every alert (legacy or unified) has been pushed', async () => {
      const pushedAt = '2019-11-25T21:55:00.177Z';
      const unifiedAlertPushed = {
        ...omit(commentAlert, ['alertId', 'index', 'rule']),
        id: 'unified-alert-1',
        type: 'security.alert',
        attachmentId: ['alert-id-3', 'alert-id-4'],
        pushed_at: pushedAt,
      } as unknown as AttachmentV2;

      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [{ ...commentAlertMultipleIds, pushed_at: pushedAt }, unifiedAlertPushed],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        spaceId: 'default',
      });

      expect(res.comments).toEqual([]);
    });

    it('adds the backlink to cases correctly', async () => {
      const res = await createIncident({
        theCase,
        userActions: [],
        connector,
        alerts: [],
        casesConnectors,
        publicBaseUrl: 'https://example.com',
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          priority: null,
          labels: ['defacement'],
          issueType: null,
          parent: null,
          otherFields: null,
          summary: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.\nFor more details, view this case in Kibana.\nCase URL: https://example.com/app/security/cases/mock-id-1',
          externalId: null,
        },
        comments: [],
      });
    });

    it('adds the backlink with spaceId to cases correctly', async () => {
      const res = await createIncident({
        theCase,
        userActions: [],
        connector,
        alerts: [],
        casesConnectors,
        publicBaseUrl: 'https://example.com',
        spaceId: 'test-space',
      });

      expect(res).toEqual({
        incident: {
          priority: null,
          labels: ['defacement'],
          issueType: null,
          parent: null,
          otherFields: null,
          summary: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.\nFor more details, view this case in Kibana.\nCase URL: https://example.com/s/test-space/app/security/cases/mock-id-1',
          externalId: null,
        },
        comments: [],
      });
    });

    it('adds the user profile correctly to description', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          created_by: { ...theCase.created_by, profile_uid: userProfiles[0].uid },
          updated_by: null,
        },
        userActions: [],
        connector,
        alerts: [],
        casesConnectors,
        userProfiles: userProfilesMap,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          priority: null,
          labels: ['defacement'],
          issueType: null,
          parent: null,
          otherFields: null,
          summary: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by Damaged Raccoon.',
          externalId: null,
        },
        comments: [],
      });
    });

    it('adds the user profile correctly to comments', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          created_by: { ...theCase.created_by, profile_uid: userProfiles[0].uid },
          updated_by: null,
          comments: [
            {
              ...commentObj,
              created_by: { ...theCase.created_by, profile_uid: userProfiles[0].uid },
              updated_by: null,
            },
          ],
          totalComment: 1,
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        userProfiles: userProfilesMap,
        spaceId: 'default',
      });

      expect(res).toEqual({
        incident: {
          priority: null,
          labels: ['defacement'],
          issueType: null,
          parent: null,
          otherFields: null,
          summary: 'Super Bad Security Issue',
          description:
            'This is a brand new case of a bad meanie defacing data\n\nAdded by Damaged Raccoon.',
          externalId: 'external-id',
        },
        comments: [
          {
            comment: 'Wow, good luck catching that bad meanie!\n\nAdded by Damaged Raccoon.',
            commentId: 'comment-user-1',
          },
        ],
      });
    });

    it('does not map if the connector is not registered', async () => {
      const res = await createIncident({
        theCase,
        userActions: [],
        // @ts-expect-error: not existing connector
        connector: { actionTypeId: '.not-exist' },
        alerts: [],
        casesConnectors,
      });

      expect(res).toEqual({
        incident: {
          externalId: null,
        },
        comments: [],
      });
    });

    it('adds a backlink to the total alert comments correctly', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [commentObj, commentAlert, commentAlertMultipleIds],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        publicBaseUrl: 'https://example.com',
        spaceId: 'default',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
        {
          comment:
            'Elastic Alerts attached to the case: 3\n\nFor more details, view the alerts in Kibana\nAlerts URL: https://example.com/app/security/cases/mock-id-1/?tabId=alerts',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('adds a backlink with spaceId to the total alert comments correctly', async () => {
      const res = await createIncident({
        theCase: {
          ...theCase,
          comments: [commentObj, commentAlert, commentAlertMultipleIds],
        },
        userActions,
        connector,
        alerts: [],
        casesConnectors,
        publicBaseUrl: 'https://example.com',
        spaceId: 'test-space',
      });

      expect(res.comments).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
        {
          comment:
            'Elastic Alerts attached to the case: 3\n\nFor more details, view the alerts in Kibana\nAlerts URL: https://example.com/s/test-space/app/security/cases/mock-id-1/?tabId=alerts',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });
  });

  describe('mapCaseFieldsToExternalSystemFields', () => {
    const caseFields = { title: 'My title', description: 'my desc' };

    it('maps correctly', () => {
      expect(mapCaseFieldsToExternalSystemFields(caseFields, mappings)).toEqual({
        description: 'my desc',
        short_description: 'My title',
      });
    });

    it('does not map unknown case fields', () => {
      // @ts-expect-error
      expect(mapCaseFieldsToExternalSystemFields({ notCaseField: 'test' }, mappings)).toEqual({});
    });

    it('does not map unknown source', () => {
      expect(
        mapCaseFieldsToExternalSystemFields(caseFields, [
          {
            // @ts-expect-error
            source: 'not-a-case-field',
            target: 'short_description',
            action_type: 'overwrite',
          },
        ])
      ).toEqual({});
    });

    it('does not map if target=not_mapped', () => {
      expect(
        mapCaseFieldsToExternalSystemFields(caseFields, [
          {
            source: 'title',
            target: 'not_mapped',
            action_type: 'overwrite',
          },
        ])
      ).toEqual({});
    });
  });

  describe('formatComments', () => {
    it('formats comments correctly', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: allComments,
        totalComments: allComments.length,
      };

      const latestPushInfo = getLatestPushInfo('not-exists', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
        // Legacy `actions` host-isolation comments are no longer pushed: they
        // are folded into the unified `security.endpoint` shape on read and
        // the registry-hook redesign tracked in
        // https://github.com/elastic/kibana/issues/262574 will own per-type
        // connector formatting.
        {
          comment: 'Elastic Alerts attached to the case: 3',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('filters unsupported comments and adds the user profile information correctly', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: allComments.map((theComment) => ({
          ...theComment,
          created_by: { ...theComment.created_by, profile_uid: userProfiles[0].uid },
          updated_by: null,
        })),
        totalComments: allComments.length,
      };

      const latestPushInfo = getLatestPushInfo('not-exists', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by Damaged Raccoon.',
          commentId: 'comment-user-1',
        },
        {
          comment: 'Elastic Alerts attached to the case: 3',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('formats only comments that have not been pushed', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: allComments,
        totalComments: allComments.length,
      };

      const latestPushInfo = getLatestPushInfo('456', userActions);
      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([
        {
          comment: 'Wow, good luck catching that bad meanie!\n\nAdded by elastic.',
          commentId: 'comment-user-1',
        },
        {
          comment: 'Elastic Alerts attached to the case: 3',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('filters out alert comments correctly and appends the total alerts on the end', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: [commentAlert],
        totalComments: 1,
      };

      const latestPushInfo = getLatestPushInfo('not-exists', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([
        {
          comment: 'Elastic Alerts attached to the case: 1',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('returns an empty array when there are no comments', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: [],
        totalComments: 0,
      };

      const latestPushInfo = getLatestPushInfo('456', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([]);
    });

    it('returns an empty array when there the comment has been pushed', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: [isolateCommentActions],
        totalComments: 1,
      };

      const latestPushInfo = getLatestPushInfo('456', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([]);
    });

    it('adds a backlink to the total alerts comment', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: [commentAlert],
        totalComments: 1,
      };

      const latestPushInfo = getLatestPushInfo('not-exists', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          publicBaseUrl: 'https://example.com',
          spaceId: 'default',
        })
      ).toEqual([
        {
          comment:
            'Elastic Alerts attached to the case: 1\n\nFor more details, view the alerts in Kibana\nAlerts URL: https://example.com/app/security/cases/mock-id-1/?tabId=alerts',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('adds a backlink with spaceId to the total alerts comment', () => {
      const theCase = {
        ...flattenCaseSavedObject({
          savedObject: mockCases[0],
        }),
        comments: [commentAlert],
        totalComments: 1,
      };

      const latestPushInfo = getLatestPushInfo('not-exists', userActions);

      expect(
        formatComments({
          userActions,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          publicBaseUrl: 'https://example.com',
          spaceId: 'test-space',
        })
      ).toEqual([
        {
          comment:
            'Elastic Alerts attached to the case: 1\n\nFor more details, view the alerts in Kibana\nAlerts URL: https://example.com/s/test-space/app/security/cases/mock-id-1/?tabId=alerts',
          commentId: 'mock-id-1-total-alerts',
        },
      ]);
    });

    it('formats unified `comment` attachments using data.content', () => {
      const unifiedComment = {
        ...omit(commentObj, ['comment']),
        id: 'comment-unified-1',
        type: 'comment',
        data: { content: 'Unified comment body' },
      } as unknown as AttachmentV2;

      const userActionsWithUnified = [
        ...userActions,
        {
          ...userActions.find((action) => action.type === UserActionTypes.comment)!,
          comment_id: unifiedComment.id,
        },
      ] as CaseUserActionsDeprecatedResponse;

      const theCase = {
        ...flattenCaseSavedObject({ savedObject: mockCases[0] }),
        comments: [unifiedComment],
        totalComments: 1,
      };

      const latestPushInfo = getLatestPushInfo('not-exists', userActionsWithUnified);

      expect(
        formatComments({
          userActions: userActionsWithUnified,
          theCase,
          latestPushInfo,
          userProfiles: userProfilesMap,
          spaceId: 'default',
        })
      ).toEqual([
        {
          comment: 'Unified comment body\n\nAdded by elastic.',
          commentId: 'comment-unified-1',
        },
      ]);
    });
  });

  describe('addKibanaInformationToDescription', () => {
    const theCase = {
      ...flattenCaseSavedObject({
        savedObject: mockCases[0],
      }),
      comments: [],
      totalComments: 0,
    };
    const publicBaseUrl = 'https://example.com';

    it('adds the kibana information to description correctly', () => {
      expect(
        addKibanaInformationToDescription(
          {
            ...theCase,
            created_by: { ...theCase.created_by, profile_uid: userProfiles[0].uid },
            updated_by: null,
          },
          'default',
          userProfilesMap,
          publicBaseUrl
        )
      ).toBe(
        'This is a brand new case of a bad meanie defacing data\n\nAdded by Damaged Raccoon.\nFor more details, view this case in Kibana.\nCase URL: https://example.com/app/security/cases/mock-id-1'
      );
    });

    it('adds the kibana information to description correctly without publicBaseUrl and userProfilesMap', () => {
      expect(addKibanaInformationToDescription(theCase, 'default')).toBe(
        'This is a brand new case of a bad meanie defacing data\n\nAdded by elastic.'
      );
    });

    it('adds the kibana information with spaceId to description correctly', () => {
      expect(
        addKibanaInformationToDescription(
          {
            ...theCase,
            created_by: { ...theCase.created_by, profile_uid: userProfiles[0].uid },
            updated_by: null,
          },
          'test-space',
          userProfilesMap,
          publicBaseUrl
        )
      ).toBe(
        'This is a brand new case of a bad meanie defacing data\n\nAdded by Damaged Raccoon.\nFor more details, view this case in Kibana.\nCase URL: https://example.com/s/test-space/app/security/cases/mock-id-1'
      );
    });
  });

  describe('getLatestPushInfo', () => {
    it('it returns the latest push information correctly', async () => {
      const res = getLatestPushInfo('456', userActions);
      expect(res).toEqual({
        index: 9,
        pushedInfo: {
          connector_id: '456',
          connector_name: 'ServiceNow SN',
          external_id: 'external-id',
          external_title: 'SIR0010037',
          external_url:
            'https://dev92273.service-now.com/nav_to.do?uri=sn_si_incident.do?sys_id=external-id',
          pushed_at: '2021-02-03T17:45:29.400Z',
          pushed_by: {
            email: 'elastic@elastic.co',
            full_name: 'Elastic',
            username: 'elastic',
          },
        },
      });
    });

    it('it returns null when there are not actions', async () => {
      const res = getLatestPushInfo('456', []);
      expect(res).toBe(null);
    });

    it('it returns null when there are no push user action', async () => {
      const res = getLatestPushInfo('456', [userActions[0]]);
      expect(res).toBe(null);
    });

    it('it returns the correct push information when with multiple push on different connectors', async () => {
      const res = getLatestPushInfo('456', [
        ...userActions.slice(0, 3),
        {
          type: 'pushed',
          action: UserActionActions.push_to_service,
          created_at: '2021-02-03T17:45:29.400Z',
          created_by: {
            email: 'elastic@elastic.co',
            full_name: 'Elastic',
            username: 'elastic',
          },
          payload: {
            externalService: {
              pushed_at: '2021-02-03T17:45:29.400Z',
              pushed_by: {
                username: 'elastic',
                full_name: 'Elastic',
                email: 'elastic@elastic.co',
              },
              connector_id: '123',
              connector_name: 'ServiceNow SN',
              external_id: 'external-id',
              external_title: 'SIR0010037',
              external_url:
                'https://dev92273.service-now.com/nav_to.do?uri=sn_si_incident.do?sys_id=external-id',
            },
          },
          action_id: '9b91d8f0-6647-11eb-a291-51bf6b175a53',
          case_id: 'fcdedd20-6646-11eb-a291-51bf6b175a53',
          comment_id: null,
          owner: SECURITY_SOLUTION_OWNER,
        },
      ]);

      expect(res).toEqual({
        index: 1,
        pushedInfo: {
          connector_id: '456',
          connector_name: 'ServiceNow SN',
          external_id: 'external-id',
          external_title: 'SIR0010037',
          external_url:
            'https://dev92273.service-now.com/nav_to.do?uri=sn_si_incident.do?sys_id=external-id',
          pushed_at: '2021-02-03T17:41:26.108Z',
          pushed_by: {
            email: 'elastic@elastic.co',
            full_name: 'Elastic',
            username: 'elastic',
          },
        },
      });
    });
  });

  describe('getClosedInfoForUpdate', () => {
    const date = '2021-02-03T17:41:26.108Z';
    const user = { full_name: 'Elastic', username: 'elastic', email: 'elastic@elastic.co' };

    it('returns the correct closed info when the case closes', async () => {
      expect(
        getClosedInfoForUpdate({ status: CaseStatuses.closed, closedDate: date, user })
      ).toEqual({
        closed_at: date,
        closed_by: user,
      });
    });

    it.each([[CaseStatuses.open], [CaseStatuses['in-progress']]])(
      'returns the correct closed info when the case %s',
      async (status) => {
        expect(getClosedInfoForUpdate({ status, closedDate: date, user })).toEqual({
          closed_at: null,
          closed_by: null,
        });
      }
    );

    it('returns undefined if the status is not provided', async () => {
      expect(getClosedInfoForUpdate({ closedDate: date, user })).toBe(undefined);
    });
  });

  describe('getInProgressInfoForUpdate', () => {
    const date = '2021-02-03T17:41:26.108Z';

    it('returns the correct in_progress_at info when the case is marked as in-progress and the in_progress_at is not set', async () => {
      expect(
        getInProgressInfoForUpdate({
          status: CaseStatuses['in-progress'],
          stateTransitionTimestamp: date,
        })
      ).toEqual({
        in_progress_at: date,
      });
    });

    it('should not set the in_progress_at when the status is not in-progress', async () => {
      expect(
        getInProgressInfoForUpdate({ status: CaseStatuses.open, stateTransitionTimestamp: date })
      ).toBeUndefined();
    });

    it('does not change the in_progress_at if it is already set', async () => {
      expect(
        getInProgressInfoForUpdate({
          status: CaseStatuses['in-progress'],
          stateTransitionTimestamp: date,
          inProgressAt: date,
        })
      ).toBeUndefined();
    });

    it('returns undefined if the status is not provided', async () => {
      expect(getInProgressInfoForUpdate({ stateTransitionTimestamp: date })).toBeUndefined();
    });
  });

  describe('getTimingMetricsForUpdate', () => {
    const createdAt = '2021-11-23T19:00:00Z';
    const inProgressAt = '2021-11-23T19:00:10Z';
    const stateTransitionTimestamp = '2021-11-23T19:00:20Z';

    describe('changing status to in-progress', () => {
      it('should return the correct metrics', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses['in-progress'],
            createdAt,
            stateTransitionTimestamp,
          })
        ).toEqual({
          time_to_acknowledge: 20,
          time_to_investigate: null,
          time_to_resolve: null,
        });
      });

      it('setting inProgressAt does not affect the metrics', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses['in-progress'],
            createdAt,
            inProgressAt,
            stateTransitionTimestamp,
          })
        ).toEqual({
          time_to_acknowledge: 20,
          time_to_investigate: null,
          time_to_resolve: null,
        });
      });

      it.each([['invalid'], [null]])(
        'returns undefined if the createdAt date is %s',
        (createdAtInvalid) => {
          expect(
            getTimingMetricsForUpdate({
              status: CaseStatuses['in-progress'],
              // @ts-expect-error
              createdAt: createdAtInvalid,
              stateTransitionTimestamp,
            })
          ).toBeUndefined();
        }
      );

      it.each([['invalid'], [null]])(
        'returns undefined if the stateTransitionTimestamp date is %s',
        (stateTransitionTimestampInvalid) => {
          expect(
            getTimingMetricsForUpdate({
              status: CaseStatuses['in-progress'],
              createdAt,
              // @ts-expect-error
              stateTransitionTimestamp: stateTransitionTimestampInvalid,
            })
          ).toBeUndefined();
        }
      );

      it('returns undefined if createdAt > stateTransitionTimestamp', async () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses['in-progress'],
            createdAt: '2021-11-23T19:05:00Z',
            stateTransitionTimestamp: '2021-11-23T19:00:00Z',
          })
        ).toBeUndefined();
      });

      it('rounds the seconds correctly', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses['in-progress'],
            createdAt: '2022-04-11T15:56:00.087Z',
            stateTransitionTimestamp: '2022-04-11T16:00:00.056Z',
          })
        ).toEqual({
          time_to_acknowledge: 239,
          time_to_investigate: null,
          time_to_resolve: null,
        });
      });

      it('rounds the zero correctly', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses['in-progress'],
            createdAt: '2022-04-11T15:56:00.087Z',
            stateTransitionTimestamp: '2022-04-11T15:56:00.287Z',
          })
        ).toEqual({
          time_to_acknowledge: 0,
          time_to_investigate: null,
          time_to_resolve: null,
        });
      });
    });

    describe('changing status to closed', () => {
      it('should return the correct metrics when inProgressAt is not set', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt,
            stateTransitionTimestamp,
          })
        ).toEqual({
          time_to_acknowledge: 20,
          time_to_investigate: 0,
          time_to_resolve: 20,
        });
      });

      it('should return the correct metrics when inProgressAt is set', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt,
            inProgressAt,
            stateTransitionTimestamp,
          })
        ).toEqual({
          time_to_acknowledge: 10,
          time_to_investigate: 10,
          time_to_resolve: 20,
        });
      });

      it.each([['invalid'], [null]])(
        'returns undefined if the createdAt date is %s',
        (createdAtInvalid) => {
          expect(
            getTimingMetricsForUpdate({
              status: CaseStatuses.closed,
              // @ts-expect-error
              createdAt: createdAtInvalid,
              stateTransitionTimestamp,
            })
          ).toBeUndefined();
        }
      );

      it.each([['invalid']])(
        'returns undefined if the inProgressAt date is %s',
        (inProgressAtInvalid) => {
          expect(
            getTimingMetricsForUpdate({
              status: CaseStatuses.closed,
              createdAt,
              inProgressAt: inProgressAtInvalid,
              stateTransitionTimestamp,
            })
          ).toBeUndefined();
        }
      );

      it.each([['invalid'], [null]])(
        'returns undefined if the stateTransitionTimestamp date is %s',
        (stateTransitionTimestampInvalid) => {
          expect(
            getTimingMetricsForUpdate({
              status: CaseStatuses.closed,
              createdAt,
              // @ts-expect-error
              stateTransitionTimestamp: stateTransitionTimestampInvalid,
            })
          ).toBeUndefined();
        }
      );

      it('returns undefined if createdAt > stateTransitionTimestamp', async () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt: '2021-11-23T19:05:00Z',
            stateTransitionTimestamp: '2021-11-23T19:00:00Z',
          })
        ).toBeUndefined();
      });

      it('returns undefined if inProgressAt > stateTransitionTimestamp', async () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt: '2021-11-23T19:05:00Z',
            inProgressAt: '2021-11-23T19:06:00Z',
            stateTransitionTimestamp: '2021-11-23T19:00:00Z',
          })
        ).toBeUndefined();
      });

      it('returns undefined if inProgressAt > createdAt', async () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt: '2021-11-23T19:05:00Z',
            inProgressAt: '2021-11-23T19:06:00Z',
            stateTransitionTimestamp: '2021-11-23T19:00:00Z',
          })
        ).toBeUndefined();
      });

      it('rounds the seconds correctly', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt: '2022-04-11T15:56:00.087Z',
            inProgressAt: '2022-04-11T15:58:00.043Z',
            stateTransitionTimestamp: '2022-04-11T16:00:00.056Z',
          })
        ).toEqual({
          time_to_acknowledge: 119,
          time_to_investigate: 120,
          time_to_resolve: 239,
        });
      });

      it('rounds the zero correctly', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.closed,
            createdAt: '2022-04-11T15:56:00.087Z',
            inProgressAt: '2022-04-11T15:56:00.187Z',
            stateTransitionTimestamp: '2022-04-11T15:56:00.287Z',
          })
        ).toEqual({
          time_to_acknowledge: 0,
          time_to_investigate: 0,
          time_to_resolve: 0,
        });
      });
    });

    describe('changing status to open', () => {
      it('should return the correct metrics', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.open,
            createdAt,
            stateTransitionTimestamp,
          })
        ).toEqual({
          time_to_acknowledge: null,
          time_to_investigate: null,
          time_to_resolve: null,
        });
      });

      it('setting inProgressAt does not affect the metrics', () => {
        expect(
          getTimingMetricsForUpdate({
            status: CaseStatuses.open,
            createdAt,
            inProgressAt,
            stateTransitionTimestamp,
          })
        ).toEqual({
          time_to_acknowledge: null,
          time_to_investigate: null,
          time_to_resolve: null,
        });
      });
    });

    it('should return the correct metrics when the case is marked as closed', () => {
      expect(
        getTimingMetricsForUpdate({
          status: CaseStatuses.closed,
          createdAt,
          inProgressAt,
          stateTransitionTimestamp,
        })
      ).toEqual({
        time_to_acknowledge: 10,
        time_to_investigate: 10,
        time_to_resolve: 20,
      });
    });

    it('should return the correct metrics when the case transitions from open to closed', () => {
      expect(
        getTimingMetricsForUpdate({
          status: CaseStatuses.closed,
          createdAt,
          stateTransitionTimestamp,
        })
      ).toEqual({
        time_to_acknowledge: 20,
        time_to_investigate: 0,
        time_to_resolve: 20,
      });
    });

    it('returns undefined if the status is not provided', async () => {
      expect(
        getTimingMetricsForUpdate({
          createdAt,
          inProgressAt,
          stateTransitionTimestamp,
        })
      ).toBe(undefined);
    });
  });

  describe('getDurationForUpdate', () => {
    const createdAt = '2021-11-23T19:00:00Z';
    const closedAt = '2021-11-23T19:02:00Z';

    it('returns the correct duration when the case closes', () => {
      expect(getDurationForUpdate({ status: CaseStatuses.closed, closedAt, createdAt })).toEqual({
        duration: 120,
      });
    });

    it.each([[CaseStatuses.open], [CaseStatuses['in-progress']]])(
      'returns the correct duration when the case %s',
      (status) => {
        expect(getDurationForUpdate({ status, closedAt, createdAt })).toEqual({
          duration: null,
        });
      }
    );

    it('returns undefined if the status is not provided', async () => {
      expect(getDurationForUpdate({ closedAt, createdAt })).toBe(undefined);
    });

    it.each([['invalid'], [null]])(
      'returns undefined if the createdAt date is %s',
      (createdAtInvalid) => {
        expect(
          getDurationForUpdate({
            status: CaseStatuses.closed,
            closedAt,
            // @ts-expect-error
            createdAt: createdAtInvalid,
          })
        ).toBe(undefined);
      }
    );

    it.each([['invalid'], [null]])(
      'returns undefined if the closedAt date is %s',
      (closedAtInvalid) => {
        expect(
          getDurationForUpdate({
            status: CaseStatuses.closed,
            // @ts-expect-error
            closedAt: closedAtInvalid,
            createdAt,
          })
        ).toBe(undefined);
      }
    );

    it('returns undefined if createdAt > closedAt', async () => {
      expect(
        getDurationForUpdate({
          status: CaseStatuses.closed,
          closedAt: '2021-11-23T19:00:00Z',
          createdAt: '2021-11-23T19:05:00Z',
        })
      ).toBe(undefined);
    });

    it('rounds the seconds correctly', () => {
      expect(
        getDurationForUpdate({
          status: CaseStatuses.closed,
          createdAt: '2022-04-11T15:56:00.087Z',
          closedAt: '2022-04-11T15:58:56.187Z',
        })
      ).toEqual({
        duration: 176,
      });
    });

    it('rounds the zero correctly', () => {
      expect(
        getDurationForUpdate({
          status: CaseStatuses.closed,
          createdAt: '2022-04-11T15:56:00.087Z',
          closedAt: '2022-04-11T15:56:00.187Z',
        })
      ).toEqual({
        duration: 0,
      });
    });
  });

  describe('getEntity', () => {
    const userProfilesMapNoFullNames = new Map(
      Array.from(userProfilesMap.entries()).map((profileTuple) => [
        profileTuple[0],
        { ...profileTuple[1], user: { ...profileTuple[1].user, full_name: undefined } },
      ])
    );

    it('returns the username when full name is empty for updatedBy', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: null, username: null },
          updatedBy: { email: null, full_name: '', username: 'updatedBy_username' },
        })
      ).toEqual('updatedBy_username');
    });

    it('returns the username when full name is empty for createdBy', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: '', username: 'createdBy_username' },
          updatedBy: null,
        })
      ).toEqual('createdBy_username');
    });

    it('returns Unknown with neither updatedBy or createdBy are defined', () => {
      expect(
        getEntity({
          // @ts-expect-error
          createdBy: null,
          updatedBy: null,
        })
      ).toEqual('Unknown');
    });

    it('returns Unknown when createdBy fields are all null', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: null, username: null },
          updatedBy: null,
        })
      ).toEqual('Unknown');
    });

    it('returns the full name of updatedBy when available', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: 'createdBy_full_name', username: null },
          updatedBy: { full_name: 'updatedBy_full_name', email: null, username: null },
        })
      ).toEqual('updatedBy_full_name');
    });

    it('returns the username of updatedBy when available', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: null, username: 'createdBy_username' },
          updatedBy: { full_name: null, email: null, username: 'updatedBy_username' },
        })
      ).toEqual('updatedBy_username');
    });

    it('returns Unknown when updatedBy username is null', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: null, username: 'createdBy_username' },
          updatedBy: { full_name: null, email: null, username: null },
        })
      ).toEqual('Unknown');
    });

    it('returns the full name of createdBy when available', () => {
      expect(
        getEntity({
          createdBy: {
            email: null,
            full_name: 'createdBy_full_name',
            username: 'createdBy_username',
          },
          updatedBy: null,
        })
      ).toEqual('createdBy_full_name');
    });

    it('returns the username of createdBy when available', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: null, username: 'createdBy_username' },
          updatedBy: null,
        })
      ).toEqual('createdBy_username');
    });

    it('returns updatedBy full name when the profile uid is not found', () => {
      expect(
        getEntity({
          createdBy: { email: null, full_name: null, username: 'createdBy_username' },
          updatedBy: {
            email: null,
            full_name: 'updatedBy_full_name',
            username: 'createdBy_username',
            profile_uid: '123',
          },
        })
      ).toEqual('updatedBy_full_name');
    });

    it('returns createdBy full name when the profile uid is not found', () => {
      expect(
        getEntity({
          createdBy: {
            email: null,
            full_name: 'createdBy_full_name',
            username: 'createdBy_username',
            profile_uid: '123',
          },
          updatedBy: null,
        })
      ).toEqual('createdBy_full_name');
    });

    it('returns updatedBy profile full name when the profile is found', () => {
      expect(
        getEntity(
          {
            createdBy: {
              email: null,
              full_name: null,
              username: null,
            },
            updatedBy: {
              email: null,
              full_name: null,
              username: null,
              profile_uid: userProfiles[0].uid,
            },
          },
          userProfilesMap
        )
      ).toEqual(userProfiles[0].user.full_name);
    });

    it('returns updatedBy profile username when the profile is found', () => {
      expect(
        getEntity(
          {
            createdBy: {
              email: null,
              full_name: null,
              username: null,
            },
            updatedBy: {
              email: null,
              full_name: null,
              username: null,
              profile_uid: userProfiles[0].uid,
            },
          },
          userProfilesMapNoFullNames
        )
      ).toEqual(userProfiles[0].user.username);
    });

    it('returns createdBy profile full name when the profile is found', () => {
      expect(
        getEntity(
          {
            createdBy: {
              email: null,
              full_name: null,
              username: null,
              profile_uid: userProfiles[0].uid,
            },
            updatedBy: null,
          },
          userProfilesMap
        )
      ).toEqual(userProfiles[0].user.full_name);
    });

    it('returns createdBy profile username when the profile is found', () => {
      expect(
        getEntity(
          {
            updatedBy: null,
            createdBy: {
              email: null,
              full_name: null,
              username: null,
              profile_uid: userProfiles[0].uid,
            },
          },
          userProfilesMapNoFullNames
        )
      ).toEqual(userProfiles[0].user.username);
    });
  });

  describe('fillMissingCustomFields', () => {
    const customFields: CaseCustomFields = [
      {
        key: 'first_key',
        type: CustomFieldTypes.TEXT,
        value: 'this is a text field value',
      },
      {
        key: 'second_key',
        type: CustomFieldTypes.TOGGLE,
        value: null,
      },
      {
        key: 'third_key',
        type: CustomFieldTypes.TEXT,
        value: 'default value',
      },
      {
        key: 'fourth_key',
        type: CustomFieldTypes.TOGGLE,
        value: false,
      },
    ];

    const customFieldsConfiguration: CustomFieldsConfiguration = [
      {
        key: 'first_key',
        type: CustomFieldTypes.TEXT,
        label: 'foo',
        required: false,
      },
      {
        key: 'second_key',
        type: CustomFieldTypes.TOGGLE,
        label: 'foo',
        required: false,
      },
      {
        key: 'third_key',
        type: CustomFieldTypes.TEXT,
        label: 'foo',
        required: true,
        defaultValue: 'default value',
      },
      {
        key: 'fourth_key',
        type: CustomFieldTypes.TOGGLE,
        label: 'foo',
        required: true,
        defaultValue: false,
      },
    ];

    it('adds missing custom fields correctly', () => {
      expect(
        fillMissingCustomFields({
          customFields: [customFields[0]],
          customFieldsConfiguration,
        })
      ).toEqual(customFields);
    });

    it('uses the default value for optional custom fields', () => {
      expect(
        fillMissingCustomFields({
          customFields: [],
          customFieldsConfiguration: [
            // @ts-ignore: expected
            { ...customFieldsConfiguration[0], defaultValue: 'default value' },
            // @ts-ignore: expected
            { ...customFieldsConfiguration[1], defaultValue: true },
          ],
        })
      ).toEqual([
        { ...customFields[0], value: 'default value' },
        { ...customFields[1], value: true },
      ]);
    });

    it('does not set to null custom fields that exist', () => {
      expect(
        fillMissingCustomFields({
          customFields: [customFields[0], customFields[1]],
          customFieldsConfiguration,
        })
      ).toEqual(customFields);
    });

    it('does not update existing required custom fields to their default value', () => {
      const customFieldsToTest = [
        customFields[0],
        customFields[1],
        { ...customFields[2], value: 'not the default' },
        { ...customFields[3], value: true },
      ] as CaseCustomFields;

      expect(
        fillMissingCustomFields({
          customFields: customFieldsToTest,
          customFieldsConfiguration,
        })
      ).toEqual(customFieldsToTest);
    });

    it('does not insert missing required custom fields if default value is null', () => {
      const customFieldsToTest = [customFields[0], customFields[1]] as CaseCustomFields;

      expect(
        fillMissingCustomFields({
          customFields: customFieldsToTest,
          customFieldsConfiguration: [
            customFieldsConfiguration[0],
            customFieldsConfiguration[1],
            { ...customFieldsConfiguration[2], defaultValue: null },
            { ...customFieldsConfiguration[3], defaultValue: null },
          ],
        })
      ).toEqual(customFieldsToTest);
    });

    it('does not insert missing required custom fields if default value is undefined', () => {
      const customFieldsToTest = [customFields[0], customFields[1]] as CaseCustomFields;

      expect(
        fillMissingCustomFields({
          customFields: customFieldsToTest,
          customFieldsConfiguration: [
            customFieldsConfiguration[0],
            customFieldsConfiguration[1],
            { ...customFieldsConfiguration[2], defaultValue: undefined },
            { ...customFieldsConfiguration[3], defaultValue: undefined },
          ],
        })
      ).toEqual(customFieldsToTest);
    });

    it('returns all custom fields if they are more than the configuration', () => {
      expect(
        fillMissingCustomFields({
          customFields: [
            ...customFields,
            {
              key: 'extra 1',
              type: CustomFieldTypes.TOGGLE,
              value: true,
            },
            {
              key: 'extra 2',
              type: CustomFieldTypes.TOGGLE,
              value: true,
            },
          ],
          customFieldsConfiguration,
        })
      ).toEqual([
        ...customFields,
        {
          key: 'extra 1',
          type: CustomFieldTypes.TOGGLE,
          value: true,
        },
        {
          key: 'extra 2',
          type: CustomFieldTypes.TOGGLE,
          value: true,
        },
      ]);
    });

    it('adds missing custom fields if they are undefined', () => {
      expect(
        fillMissingCustomFields({
          customFieldsConfiguration,
        })
      ).toEqual([
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          value: null,
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          value: null,
        },
        customFields[2],
        customFields[3],
      ]);
    });

    it('does not add missing fields if the customFieldsConfiguration is undefined', () => {
      expect(
        fillMissingCustomFields({
          customFields,
        })
      ).toEqual(customFields);
    });
  });
});

describe('normalizeCreateCaseRequest', () => {
  const theCase = {
    title: 'My Case',
    tags: [],
    description: 'testing sir',
    connector: {
      id: '.none',
      name: 'None',
      type: ConnectorTypes.none,
      fields: null,
    },
    settings: { syncAlerts: true, extractObservables: true },
    severity: CaseSeverity.LOW,
    owner: SECURITY_SOLUTION_OWNER,
    assignees: [{ uid: '1' }],
    category: 'my category',
    customFields: [],
  };

  it('should trim title', async () => {
    expect(normalizeCreateCaseRequest({ ...theCase, title: 'title with spaces      ' })).toEqual({
      ...theCase,
      title: 'title with spaces',
    });
  });

  it('should trim description', async () => {
    expect(
      normalizeCreateCaseRequest({
        ...theCase,
        description: 'this is a description with spaces!!      ',
      })
    ).toEqual({
      ...theCase,
      description: 'this is a description with spaces!!',
    });
  });

  it('should trim tags', async () => {
    expect(
      normalizeCreateCaseRequest({
        ...theCase,
        tags: ['pepsi     ', 'coke'],
      })
    ).toEqual({
      ...theCase,
      tags: ['pepsi', 'coke'],
    });
  });

  it('should trim category', async () => {
    expect(
      normalizeCreateCaseRequest({
        ...theCase,
        category: 'reporting       ',
      })
    ).toEqual({
      ...theCase,
      category: 'reporting',
    });
  });

  it('should set the category to null if missing', async () => {
    expect(normalizeCreateCaseRequest(omit(theCase, 'category'))).toEqual({
      ...theCase,
      category: null,
    });
  });

  it('should fill out missing custom fields', async () => {
    expect(
      normalizeCreateCaseRequest(omit(theCase, 'customFields'), [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'foo',
          required: false,
        },
      ])
    ).toEqual({
      ...theCase,
      customFields: [{ key: 'first_key', type: CustomFieldTypes.TEXT, value: null }],
    });
  });

  it('should set the customFields to an empty array if missing', async () => {
    expect(normalizeCreateCaseRequest(omit(theCase, 'customFields'))).toEqual({
      ...theCase,
      customFields: [],
    });
  });
});

describe('isObservable', () => {
  it('should return true if the observable is an Observable', () => {
    expect(
      isObservable({
        id: '1',
        typeKey: 'ip',
        value: '127.0.0.1',
        description: null,
        createdAt: '2021-01-01',
        updatedAt: '2021-01-01',
      })
    ).toBe(true);
  });

  it('should return false if the observable is not an Observable', () => {
    expect(isObservable({ typeKey: 'ip', value: '127.0.0.1', description: null })).toBe(false);
  });
});

describe('processObservables', () => {
  const mockObservablePost: ObservablePost = {
    typeKey: 'ip',
    value: '127.0.0.1',
    description: null,
  };

  const mockObservable: Observable = {
    ...mockObservablePost,
    id: '1',
    createdAt: '2021-01-01',
    updatedAt: '2021-01-01',
  };

  it('should process the current observable', () => {
    const observablesMap = new Map<string, Observable>();
    processObservables(observablesMap, mockObservable);
    expect(observablesMap.get('ip-127.0.0.1')).toBeDefined();
  });

  it('should process the new observable post', () => {
    const observablesMap = new Map<string, Observable>();
    processObservables(observablesMap, mockObservablePost);
    expect(observablesMap.get('ip-127.0.0.1')).toBeDefined();
  });

  it('should not add the observable if it already exists', () => {
    const observablesMap = new Map<string, Observable>();
    processObservables(observablesMap, mockObservable);
    processObservables(observablesMap, mockObservable);
    expect(observablesMap.get('ip-127.0.0.1')).toBeDefined();
    expect(observablesMap.size).toBe(1);

    processObservables(observablesMap, mockObservablePost);
    expect(observablesMap.size).toBe(1);
  });

  it('should add a new observable if the key-value pair does not exist', () => {
    const observablesMap = new Map<string, Observable>();
    processObservables(observablesMap, mockObservablePost);
    processObservables(observablesMap, { ...mockObservablePost, typeKey: 'ip2' });
    expect(observablesMap.get('ip-127.0.0.1')).toBeDefined();
    expect(observablesMap.get('ip2-127.0.0.1')).toBeDefined();
    expect(observablesMap.size).toBe(2);
  });

  it('should not override the existing observable if the key-value pair already exists', () => {
    const observablesMap = new Map<string, Observable>();
    processObservables(observablesMap, mockObservable);
    processObservables(observablesMap, {
      ...mockObservable,
      id: '2',
      createdAt: '2021-01-02',
      updatedAt: '2021-01-02',
    });
    expect(observablesMap.get('ip-127.0.0.1')).toBeDefined();
    expect(observablesMap.get('ip-127.0.0.1')).toEqual(mockObservable);
    expect(observablesMap.size).toBe(1);
  });
});

describe('enrichCasesWithFieldLabels', () => {
  const baseCase = flattenCaseSavedObject({ savedObject: mockCases[0], totalComment: 0 });

  const caseWithTemplate = {
    ...baseCase,
    template: { id: 'template-id-1', version: 1 },
    extended_fields: { priority_as_keyword: 'high', effort_as_integer: '3' },
  };

  const templateSO = {
    id: 'so-id',
    type: 'cases-template' as const,
    references: [],
    attributes: {
      templateId: 'template-id-1',
      name: 'My Template',
      owner: 'cases',
      definition: '',
      templateVersion: 1,
      deletedAt: null,
      fieldNames: [
        { name: 'priority', label: 'Priority Level', type: 'keyword', control: 'INPUT_TEXT' },
        { name: 'effort', label: 'Effort Points', type: 'integer', control: 'INPUT_NUMBER' },
      ],
    },
  };

  it('populates extended_fields_labels from the matched template fieldNames', () => {
    const result = enrichCasesWithFieldLabels([caseWithTemplate], [templateSO]);

    expect(result[0].extended_fields_labels).toEqual({
      priority_as_keyword: 'Priority Level',
      effort_as_integer: 'Effort Points',
    });
  });

  it('returns case unchanged when it has no template reference', () => {
    const result = enrichCasesWithFieldLabels([baseCase], [templateSO]);

    expect(result[0]).toEqual(baseCase);
  });

  it('returns case unchanged when it has no extended_fields', () => {
    const caseNoExtFields = { ...baseCase, template: { id: 'template-id-1', version: 1 } };

    const result = enrichCasesWithFieldLabels([caseNoExtFields], [templateSO]);

    expect(result[0]).toEqual(caseNoExtFields);
  });

  it('omits extended_fields_labels when the referenced template is not in the provided list', () => {
    const result = enrichCasesWithFieldLabels([caseWithTemplate], []);

    expect(result[0].extended_fields_labels).toBeUndefined();
  });

  it('uses the same template SO for multiple cases with the same templateId+version', () => {
    const secondCase = {
      ...caseWithTemplate,
      id: 'mock-id-2',
    };

    const result = enrichCasesWithFieldLabels([caseWithTemplate, secondCase], [templateSO]);

    expect(result[0].extended_fields_labels).toEqual({
      priority_as_keyword: 'Priority Level',
      effort_as_integer: 'Effort Points',
    });
    expect(result[1].extended_fields_labels).toEqual({
      priority_as_keyword: 'Priority Level',
      effort_as_integer: 'Effort Points',
    });
  });

  it('resolves different template versions separately for the same templateId', () => {
    const templateSOv2 = {
      ...templateSO,
      id: 'so-id-v2',
      attributes: {
        ...templateSO.attributes,
        templateVersion: 2,
        fieldNames: [
          { name: 'priority', label: 'Priority Level v2', type: 'keyword', control: 'INPUT_TEXT' },
        ],
      },
    };

    const caseV2 = {
      ...caseWithTemplate,
      id: 'mock-id-2',
      template: { id: 'template-id-1', version: 2 },
    };

    const result = enrichCasesWithFieldLabels(
      [caseWithTemplate, caseV2],
      [templateSO, templateSOv2]
    );

    expect(result[0].extended_fields_labels).toEqual({
      priority_as_keyword: 'Priority Level',
      effort_as_integer: 'Effort Points',
    });
    expect(result[1].extended_fields_labels).toEqual({
      priority_as_keyword: 'Priority Level v2',
    });
  });

  it('handles multiple cases with different templateIds independently', () => {
    const templateSO2 = {
      ...templateSO,
      id: 'so-id-2',
      attributes: {
        ...templateSO.attributes,
        templateId: 'template-id-2',
        templateVersion: 1,
        fieldNames: [
          { name: 'severity', label: 'Severity Label', type: 'keyword', control: 'SELECT_BASIC' },
        ],
      },
    };

    const caseTwo = {
      ...caseWithTemplate,
      id: 'mock-id-2',
      template: { id: 'template-id-2', version: 1 },
      extended_fields: { severity_as_keyword: 'critical' },
    };

    const result = enrichCasesWithFieldLabels(
      [caseWithTemplate, caseTwo],
      [templateSO, templateSO2]
    );

    expect(result[0].extended_fields_labels).toEqual({
      priority_as_keyword: 'Priority Level',
      effort_as_integer: 'Effort Points',
    });
    expect(result[1].extended_fields_labels).toEqual({
      severity_as_keyword: 'Severity Label',
    });
  });
});
