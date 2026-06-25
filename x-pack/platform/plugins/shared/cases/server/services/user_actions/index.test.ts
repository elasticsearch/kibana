/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit, unset } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import { loggerMock } from '@kbn/logging-mocks';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type {
  SavedObject,
  SavedObjectsBulkCreateObject,
  SavedObjectsFindResponse,
} from '@kbn/core/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import type { CaseUserActionWithoutReferenceIds } from '../../../common/types/domain';
import type { UserActionEvent } from './types';

import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  SECURITY_SOLUTION_OWNER,
} from '../../../common/constants';
import { createSOFindResponse } from '../test_utils';
import {
  casePayload,
  externalService,
  attachments,
  patchRemoveAssigneesCasesRequest,
  patchCasesRequest,
  patchAssigneesCasesRequest,
  patchAddRemoveAssigneesCasesRequest,
  patchTagsCasesRequest,
  getBuiltUserActions,
  getAssigneesAddedUserActions,
  getAssigneesRemovedUserActions,
  getAssigneesAddedRemovedUserActions,
  getTagsAddedRemovedUserActions,
  patchSyncAlertsCasesRequest,
  patchExtractObservablesCasesRequest,
  patchBothSettingsCasesRequest,
  getSyncAlertsUserActions,
  getExtractObservablesUserActions,
  getBothSettingsUserActions,
} from './mocks';
import { CaseUserActionService } from '.';
import { serializerMock } from '@kbn/core-saved-objects-base-server-mocks';
import {
  createUserActionFindSO,
  createConnectorUserAction,
  createUserActionSO,
  pushConnectorUserAction,
} from './test_utils';
import { comment } from '../../mocks';
import {
  UserActionActions,
  UserActionTypes,
  CaseSeverity,
  CaseStatuses,
} from '../../../common/types/domain';

describe('CaseUserActionService', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2022-01-09T22:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('methods', () => {
    let service: CaseUserActionService;
    const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
    unsecuredSavedObjectsClient.create.mockResolvedValue({
      id: 'created_user_action_id',
    } as SavedObject);

    unsecuredSavedObjectsClient.bulkCreate.mockImplementation(
      async (objects: SavedObjectsBulkCreateObject[]) => {
        const savedObjects: SavedObject[] = [];
        for (let i = 0; i < objects.length; i++) {
          savedObjects.push({ id: i } as unknown as SavedObject);
        }

        return {
          saved_objects: savedObjects,
        };
      }
    );
    const mockLogger = loggerMock.create();
    const commonArgs = {
      caseId: '123',
      user: { full_name: 'Elastic User', username: 'elastic', email: 'elastic@elastic.co' },
      owner: SECURITY_SOLUTION_OWNER,
    };
    const mockAuditLogger = auditLoggerMock.create();

    const soSerializerMock = serializerMock.create();

    beforeEach(() => {
      jest.clearAllMocks();
      service = new CaseUserActionService({
        unsecuredSavedObjectsClient,
        log: mockLogger,
        auditLogger: mockAuditLogger,
        savedObjectsSerializer: soSerializerMock,
      });
    });

    describe('getCaseUserActionStats', () => {
      const mockStatsResponse = {
        total: 20,
        saved_objects: [],
        page: 1,
        per_page: 1,
        aggregations: {
          totals: {
            buckets: [
              { key: 'user', doc_count: 4 },
              { key: 'comment', doc_count: 6 },
              { key: 'alert', doc_count: 3 },
            ],
          },
          deletions: {
            doc_count: 4,
            deletions: {
              buckets: [
                { key: 'user', doc_count: 1 },
                { key: 'comment', doc_count: 2 },
                { key: 'alert', doc_count: 1 },
              ],
            },
          },
          creations: {
            doc_count: 6,
            creations: {
              buckets: [
                { key: 'user', doc_count: 2 },
                { key: 'comment', doc_count: 3 },
                { key: 'alert', doc_count: 1 },
              ],
            },
          },
          nonDeletedCommentUpdates: {
            doc_count: 2,
            comments: {
              buckets: {
                [CASE_COMMENT_SAVED_OBJECT]: {
                  doc_count: 2,
                  byCommentId: {
                    buckets: [
                      {
                        key: 'deleted-comment',
                        doc_count: 3,
                        reverse: {
                          doc_count: 3,
                          hasDelete: { doc_count: 1 },
                          updates: {
                            doc_count: 3,
                            byCommentType: {
                              buckets: [
                                { key: 'user', doc_count: 2 },
                                { key: 'comment', doc_count: 4 },
                                { key: 'alert', doc_count: 1 },
                              ],
                            },
                          },
                        },
                      },
                      {
                        key: 'active-comment',
                        doc_count: 2,
                        reverse: {
                          doc_count: 2,
                          hasDelete: { doc_count: 0 },
                          updates: {
                            doc_count: 2,
                            byCommentType: {
                              buckets: [
                                { key: 'user', doc_count: 5 },
                                { key: 'comment', doc_count: 5 },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
                [CASE_ATTACHMENT_SAVED_OBJECT]: {
                  doc_count: 0,
                  byCommentId: { buckets: [] },
                },
              },
            },
          },
        },
      } as unknown as SavedObjectsFindResponse;

      it('does not count unified comment type when attachments flag is off', async () => {
        unsecuredSavedObjectsClient.find.mockResolvedValue(mockStatsResponse);

        const stats = await service.getCaseUserActionStats({ caseId: '123' });

        expect(stats).toEqual({
          total: 20,
          total_deletions: 4,
          total_comments: 4,
          total_comment_deletions: 1,
          total_comment_creations: 2,
          total_hidden_comment_updates: 2,
          total_other_actions: 16,
          total_other_action_deletions: 3,
        });
      });

      it('counts unified comment type when attachments flag is on', async () => {
        service = new CaseUserActionService({
          unsecuredSavedObjectsClient,
          log: mockLogger,
          auditLogger: mockAuditLogger,
          savedObjectsSerializer: soSerializerMock,
          isCasesAttachmentsEnabled: true,
        });
        unsecuredSavedObjectsClient.find.mockResolvedValue(mockStatsResponse);

        const stats = await service.getCaseUserActionStats({ caseId: '123' });

        expect(stats).toEqual({
          total: 20,
          total_deletions: 4,
          total_comments: 10,
          total_comment_deletions: 3,
          total_comment_creations: 5,
          total_hidden_comment_updates: 6,
          total_other_actions: 10,
          total_other_action_deletions: 1,
        });
      });

      it('groups non-deleted comment updates by both attachment saved object types', async () => {
        unsecuredSavedObjectsClient.find.mockResolvedValue(mockStatsResponse);

        await service.getCaseUserActionStats({ caseId: '123' });

        expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
          expect.objectContaining({
            aggs: expect.objectContaining({
              nonDeletedCommentUpdates: expect.objectContaining({
                aggs: expect.objectContaining({
                  comments: expect.objectContaining({
                    filters: {
                      filters: {
                        [CASE_COMMENT_SAVED_OBJECT]: {
                          term: {
                            'cases-user-actions.references.type': CASE_COMMENT_SAVED_OBJECT,
                          },
                        },
                        [CASE_ATTACHMENT_SAVED_OBJECT]: {
                          term: {
                            'cases-user-actions.references.type': CASE_ATTACHMENT_SAVED_OBJECT,
                          },
                        },
                      },
                    },
                  }),
                }),
              }),
            }),
          })
        );
      });
    });

    describe('createUserAction', () => {
      describe('create case', () => {
        it('creates a create case user action', async () => {
          await service.creator.createUserAction({
            userAction: {
              ...commonArgs,
              payload: casePayload,
              type: UserActionTypes.create_case,
            },
          });

          expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
            'cases-user-actions',
            {
              action: UserActionActions.create,
              created_at: '2022-01-09T22:00:00.000Z',
              created_by: {
                email: 'elastic@elastic.co',
                full_name: 'Elastic User',
                username: 'elastic',
              },
              type: 'create_case',
              owner: 'securitySolution',
              payload: {
                assignees: [{ uid: '1' }],
                connector: {
                  fields: {
                    category: 'Denial of Service',
                    destIp: true,
                    malwareHash: true,
                    malwareUrl: true,
                    priority: '2',
                    sourceIp: true,
                    subcategory: '45',
                  },
                  name: 'ServiceNow SN',
                  type: '.servicenow-sir',
                },
                description: 'testing sir',
                owner: 'securitySolution',
                settings: { syncAlerts: true, extractObservables: true },
                status: 'open',
                severity: 'low',
                tags: ['sir'],
                title: 'Case SIR',
              },
            },
            {
              references: [
                { id: '123', name: 'associated-cases', type: 'cases' },
                { id: '456', name: 'connectorId', type: 'action' },
              ],
            }
          );
        });

        it('logs a create case user action', async () => {
          await service.creator.createUserAction({
            userAction: {
              ...commonArgs,
              payload: casePayload,
              type: UserActionTypes.create_case,
            },
          });

          expect(mockAuditLogger.log).toBeCalledTimes(1);
          expect(mockAuditLogger.log.mock.calls[0]).toMatchInlineSnapshot(`
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_create_case",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "creation",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "123",
                    "type": "cases",
                  },
                },
                "message": "User created case id: 123 - user action id: created_user_action_id",
              },
            ]
          `);
        });

        describe('status', () => {
          it('creates an update status user action', async () => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                payload: { status: CaseStatuses.closed },
                type: UserActionTypes.status,
              },
            });

            expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
              'cases-user-actions',
              {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'status',
                owner: 'securitySolution',
                payload: { status: 'closed' },
              },
              { references: [{ id: '123', name: 'associated-cases', type: 'cases' }] }
            );
          });

          it('logs an update status user action', async () => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                payload: { status: CaseStatuses.closed },
                type: UserActionTypes.status,
              },
            });

            expect(mockAuditLogger.log).toBeCalledTimes(1);
            expect(mockAuditLogger.log.mock.calls[0]).toMatchInlineSnapshot(`
              Array [
                Object {
                  "event": Object {
                    "action": "case_user_action_update_case_status",
                    "category": Array [
                      "database",
                    ],
                    "outcome": "success",
                    "type": Array [
                      "change",
                    ],
                  },
                  "kibana": Object {
                    "saved_object": Object {
                      "id": "123",
                      "type": "cases",
                    },
                  },
                  "message": "User updated the status for case id: 123 - user action id: created_user_action_id",
                },
              ]
            `);
          });
        });

        describe('severity', () => {
          it('creates an update severity user action', async () => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                payload: { severity: CaseSeverity.MEDIUM },
                type: UserActionTypes.severity,
              },
            });

            expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
              'cases-user-actions',
              {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'severity',
                owner: 'securitySolution',
                payload: { severity: 'medium' },
              },
              { references: [{ id: '123', name: 'associated-cases', type: 'cases' }] }
            );
          });

          it('logs an update severity user action', async () => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                payload: { severity: CaseSeverity.MEDIUM },
                type: UserActionTypes.severity,
              },
            });

            expect(mockAuditLogger.log).toBeCalledTimes(1);
            expect(mockAuditLogger.log.mock.calls[0]).toMatchInlineSnapshot(`
              Array [
                Object {
                  "event": Object {
                    "action": "case_user_action_update_case_severity",
                    "category": Array [
                      "database",
                    ],
                    "outcome": "success",
                    "type": Array [
                      "change",
                    ],
                  },
                  "kibana": Object {
                    "saved_object": Object {
                      "id": "123",
                      "type": "cases",
                    },
                  },
                  "message": "User updated the severity for case id: 123 - user action id: created_user_action_id",
                },
              ]
            `);
          });
        });

        describe('push', () => {
          it('creates a push user action', async () => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                payload: { externalService },
                type: UserActionTypes.pushed,
              },
            });

            expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
              'cases-user-actions',
              {
                action: UserActionActions.push_to_service,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'pushed',
                owner: 'securitySolution',
                payload: {
                  externalService: {
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
                },
              },
              {
                references: [
                  { id: '123', name: 'associated-cases', type: 'cases' },
                  { id: '456', name: 'pushConnectorId', type: 'action' },
                ],
              }
            );
          });

          it('logs a push user action', async () => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                payload: { externalService },
                type: UserActionTypes.pushed,
              },
            });

            expect(mockAuditLogger.log).toBeCalledTimes(1);
            expect(mockAuditLogger.log.mock.calls[0]).toMatchInlineSnapshot(`
              Array [
                Object {
                  "event": Object {
                    "action": "case_user_action_pushed_case",
                    "category": Array [
                      "database",
                    ],
                    "outcome": "success",
                    "type": Array [
                      "change",
                    ],
                  },
                  "kibana": Object {
                    "saved_object": Object {
                      "id": "123",
                      "type": "cases",
                    },
                  },
                  "message": "User pushed case id: 123 to an external service with connector id: 456 - user action id: created_user_action_id",
                },
              ]
            `);
          });
        });

        describe('comment', () => {
          it.each([
            [UserActionActions.create],
            [UserActionActions.delete],
            [UserActionActions.update],
          ])('creates a comment user action of action: %s', async (action) => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                type: UserActionTypes.comment,
                action,
                savedObjectId: 'test-id',
                payload: { attachment: comment },
              },
            });

            expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
              'cases-user-actions',
              {
                action,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'comment',
                owner: 'securitySolution',
                payload: {
                  comment: {
                    comment: 'a comment',
                    type: 'user',
                    owner: 'securitySolution',
                  },
                },
              },
              {
                references: [
                  { id: '123', name: 'associated-cases', type: 'cases' },
                  { id: 'test-id', name: 'associated-cases-comments', type: 'cases-comments' },
                ],
              }
            );
          });

          it.each([
            [UserActionActions.create],
            [UserActionActions.delete],
            [UserActionActions.update],
          ])('logs a comment user action of action: %s', async (action) => {
            await service.creator.createUserAction({
              userAction: {
                ...commonArgs,
                type: UserActionTypes.comment,
                action,
                savedObjectId: 'test-id',
                payload: { attachment: comment },
              },
            });

            expect(mockAuditLogger.log).toBeCalledTimes(1);
            expect(mockAuditLogger.log.mock.calls[0]).toMatchSnapshot();
          });
        });
      });
    });

    describe('bulkAuditLogCaseDeletion', () => {
      it('logs a delete case audit log message', async () => {
        await service.creator.bulkAuditLogCaseDeletion(['1', '2']);

        expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();

        expect(mockAuditLogger.log).toHaveBeenCalledTimes(2);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_case",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": "User deleted case id: 1",
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_case",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases",
                  },
                },
                "message": "User deleted case id: 2",
              },
            ],
          ]
        `);
      });
    });

    describe('buildUserActions', () => {
      it('creates the correct user actions when bulk updating cases', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(getBuiltUserActions({ isMock: false }));
      });

      it('creates the correct user actions when an assignee is added', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchAssigneesCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(getAssigneesAddedUserActions({ isMock: false }));
      });

      it('creates the correct user actions when an assignee is removed', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchRemoveAssigneesCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(getAssigneesRemovedUserActions({ isMock: false }));
      });

      it('creates the correct user actions when assignees are added and removed', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchAddRemoveAssigneesCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(
          getAssigneesAddedRemovedUserActions({
            isMock: false,
          })
        );
      });

      it('creates the correct user actions when tags are added and removed', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchTagsCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(
          getTagsAddedRemovedUserActions({
            isMock: false,
          })
        );
      });

      it('creates the correct user actions when sync alerts settings is changed', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchSyncAlertsCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(getSyncAlertsUserActions({ isMock: false }));
      });

      it('creates the correct user actions when extract observables settings is changed', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchExtractObservablesCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(getExtractObservablesUserActions({ isMock: false }));
      });

      it('creates the correct user actions when both settings are changed', async () => {
        expect(
          await service.creator.buildUserActions({
            updatedCases: patchBothSettingsCasesRequest,
            user: commonArgs.user,
          })
        ).toEqual(getBothSettingsUserActions({ isMock: false }));
      });
    });

    describe('bulkCreateUpdateCase', () => {
      const mockBuiltUserActions = getBuiltUserActions({ isMock: true });
      const builtUserActions = Object.keys(mockBuiltUserActions).reduce<UserActionEvent[]>(
        (acc, key) => {
          return [...acc, ...mockBuiltUserActions[key]];
        },
        []
      );

      it('creates the correct user actions when bulk updating cases', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions,
        });

        expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
          [
            {
              attributes: {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'title',
                owner: 'securitySolution',
                payload: { title: 'updated title' },
              },
              references: [{ id: '1', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'status',
                owner: 'securitySolution',
                payload: { status: 'closed' },
              },
              references: [{ id: '1', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'connector',
                owner: 'securitySolution',
                payload: {
                  connector: {
                    fields: {
                      category: 'Denial of Service',
                      destIp: true,
                      malwareHash: true,
                      malwareUrl: true,
                      priority: '2',
                      sourceIp: true,
                      subcategory: '45',
                    },
                    name: 'ServiceNow SN',
                    type: '.servicenow-sir',
                  },
                },
              },
              references: [
                { id: '1', name: 'associated-cases', type: 'cases' },
                { id: '456', name: 'connectorId', type: 'action' },
              ],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'category',
                owner: 'securitySolution',
                payload: { category: 'pizza toppings' },
              },
              references: [{ id: '1', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'description',
                owner: 'securitySolution',
                payload: { description: 'updated desc' },
              },
              references: [{ id: '2', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: 'add',
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'tags',
                owner: 'securitySolution',
                payload: { tags: ['one', 'two'] },
              },
              references: [{ id: '2', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: 'delete',
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'tags',
                owner: 'securitySolution',
                payload: { tags: ['defacement'] },
              },
              references: [{ id: '2', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: UserActionActions.update,
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'settings',
                owner: 'securitySolution',
                payload: { settings: { syncAlerts: false } },
              },
              references: [{ id: '2', name: 'associated-cases', type: 'cases' }],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: 'update',
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                owner: 'securitySolution',
                payload: {
                  severity: 'critical',
                },
                type: 'severity',
              },
              references: [
                {
                  id: '2',
                  name: 'associated-cases',
                  type: 'cases',
                },
              ],
              type: 'cases-user-actions',
            },
          ],
          { refresh: undefined }
        );
      });

      it('logs the correct user actions when bulk updating cases', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions,
        });

        expect(mockAuditLogger.log).toBeCalledTimes(9);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_title",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_status",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_connector",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_category",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_description",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_add_case_tags",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_case_tags",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_settings",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_update_case_severity",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
          ]
        `);
      });

      const mockAssigneesAddedUserActions = getAssigneesAddedUserActions({ isMock: true });
      const assigneesAddedUserActions = Object.keys(mockAssigneesAddedUserActions).reduce<
        UserActionEvent[]
      >((acc, key) => {
        return [...acc, ...mockAssigneesAddedUserActions[key]];
      }, []);

      it('creates the correct user actions when an assignee is added', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: assigneesAddedUserActions,
        });

        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "attributes": Object {
                  "action": "add",
                  "created_at": "2022-01-09T22:00:00.000Z",
                  "created_by": Object {
                    "email": "elastic@elastic.co",
                    "full_name": "Elastic User",
                    "username": "elastic",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "assignees": Array [
                      Object {
                        "uid": "1",
                      },
                    ],
                  },
                  "type": "assignees",
                },
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "type": "cases-user-actions",
              },
            ],
            Object {
              "refresh": undefined,
            },
          ]
        `);
      });

      it('logs the correct user actions when an assignee is added', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: assigneesAddedUserActions,
        });

        expect(mockAuditLogger.log).toBeCalledTimes(1);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_add_case_assignees",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
          ]
        `);
      });

      const mockAssigneesRemovedUserActions = getAssigneesRemovedUserActions({ isMock: true });
      const assigneesRemovedUserActions = Object.keys(mockAssigneesRemovedUserActions).reduce<
        UserActionEvent[]
      >((acc, key) => {
        return [...acc, ...mockAssigneesRemovedUserActions[key]];
      }, []);

      it('creates the correct user actions when an assignee is removed', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: assigneesRemovedUserActions,
        });

        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "attributes": Object {
                  "action": "delete",
                  "created_at": "2022-01-09T22:00:00.000Z",
                  "created_by": Object {
                    "email": "elastic@elastic.co",
                    "full_name": "Elastic User",
                    "username": "elastic",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "assignees": Array [
                      Object {
                        "uid": "1",
                      },
                    ],
                  },
                  "type": "assignees",
                },
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "type": "cases-user-actions",
              },
            ],
            Object {
              "refresh": undefined,
            },
          ]
        `);
      });

      it('logs the correct user actions when an assignee is removed', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: assigneesRemovedUserActions,
        });

        expect(mockAuditLogger.log).toBeCalledTimes(1);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_case_assignees",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
          ]
        `);
      });

      const mockAssigneesAddedRemovedUserActions = getAssigneesAddedRemovedUserActions({
        isMock: true,
      });
      const assigneesAddedRemovedUserActions = Object.keys(
        mockAssigneesAddedRemovedUserActions
      ).reduce<UserActionEvent[]>((acc, key) => {
        return [...acc, ...mockAssigneesAddedRemovedUserActions[key]];
      }, []);

      it('creates the correct user actions when assignees are added and removed', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: assigneesAddedRemovedUserActions,
        });

        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "attributes": Object {
                  "action": "add",
                  "created_at": "2022-01-09T22:00:00.000Z",
                  "created_by": Object {
                    "email": "elastic@elastic.co",
                    "full_name": "Elastic User",
                    "username": "elastic",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "assignees": Array [
                      Object {
                        "uid": "2",
                      },
                    ],
                  },
                  "type": "assignees",
                },
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "type": "cases-user-actions",
              },
              Object {
                "attributes": Object {
                  "action": "delete",
                  "created_at": "2022-01-09T22:00:00.000Z",
                  "created_by": Object {
                    "email": "elastic@elastic.co",
                    "full_name": "Elastic User",
                    "username": "elastic",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "assignees": Array [
                      Object {
                        "uid": "1",
                      },
                    ],
                  },
                  "type": "assignees",
                },
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "type": "cases-user-actions",
              },
            ],
            Object {
              "refresh": undefined,
            },
          ]
        `);
      });

      it('logs the correct user actions when assignees are added and removed', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: assigneesAddedRemovedUserActions,
        });

        expect(mockAuditLogger.log).toBeCalledTimes(2);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_add_case_assignees",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_case_assignees",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
          ]
        `);
      });

      const mockTagsAddedRemovedUserActions = getTagsAddedRemovedUserActions({
        isMock: true,
      });
      const tagsAddedRemovedUserActions = Object.keys(mockTagsAddedRemovedUserActions).reduce<
        UserActionEvent[]
      >((acc, key) => {
        return [...acc, ...mockTagsAddedRemovedUserActions[key]];
      }, []);

      it('creates the correct user actions when tags are added and removed', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: tagsAddedRemovedUserActions,
        });

        expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "attributes": Object {
                  "action": "add",
                  "created_at": "2022-01-09T22:00:00.000Z",
                  "created_by": Object {
                    "email": "elastic@elastic.co",
                    "full_name": "Elastic User",
                    "username": "elastic",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "tags": Array [
                      "a",
                      "b",
                    ],
                  },
                  "type": "tags",
                },
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "type": "cases-user-actions",
              },
              Object {
                "attributes": Object {
                  "action": "delete",
                  "created_at": "2022-01-09T22:00:00.000Z",
                  "created_by": Object {
                    "email": "elastic@elastic.co",
                    "full_name": "Elastic User",
                    "username": "elastic",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "tags": Array [
                      "defacement",
                    ],
                  },
                  "type": "tags",
                },
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "type": "cases-user-actions",
              },
            ],
            Object {
              "refresh": undefined,
            },
          ]
        `);
      });

      it('logs the correct user actions when tags are added and removed', async () => {
        await service.creator.bulkCreateUpdateCase({
          builtUserActions: tagsAddedRemovedUserActions,
        });

        expect(mockAuditLogger.log).toBeCalledTimes(2);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_add_case_tags",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "change",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_case_tags",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases",
                  },
                },
                "message": undefined,
              },
            ],
          ]
        `);
      });
    });

    describe('bulkCreateAttachmentDeletion', () => {
      it('creates delete comment user action', async () => {
        await service.creator.bulkCreateAttachmentDeletion({
          ...commonArgs,
          attachments,
        });
        expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
          [
            {
              attributes: {
                action: 'delete',
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'comment',
                owner: 'securitySolution',
                payload: {
                  comment: { comment: 'a comment', owner: 'securitySolution', type: 'user' },
                },
              },
              references: [
                { id: '123', name: 'associated-cases', type: 'cases' },
                { id: '1', name: 'associated-cases-comments', type: 'cases-comments' },
              ],
              type: 'cases-user-actions',
            },
            {
              attributes: {
                action: 'delete',
                created_at: '2022-01-09T22:00:00.000Z',
                created_by: {
                  email: 'elastic@elastic.co',
                  full_name: 'Elastic User',
                  username: 'elastic',
                },
                type: 'comment',
                owner: 'securitySolution',
                payload: {
                  comment: {
                    alertId: 'alert-id-1',
                    index: 'alert-index-1',
                    owner: 'securitySolution',
                    rule: { id: 'rule-id-1', name: 'rule-name-1' },
                    type: 'alert',
                  },
                },
              },
              references: [
                { id: '123', name: 'associated-cases', type: 'cases' },
                { id: '2', name: 'associated-cases-comments', type: 'cases-comments' },
              ],
              type: 'cases-user-actions',
            },
          ],
          { refresh: undefined }
        );
      });

      it('logs delete comment user action', async () => {
        await service.creator.bulkCreateAttachmentDeletion({
          ...commonArgs,
          attachments,
        });

        expect(mockAuditLogger.log).toBeCalledTimes(2);
        expect(mockAuditLogger.log.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_comment",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "1",
                    "type": "cases-comments",
                  },
                },
                "message": "User deleted comment id: 1 for case id: 123 - user action id: 0",
              },
            ],
            Array [
              Object {
                "event": Object {
                  "action": "case_user_action_delete_comment",
                  "category": Array [
                    "database",
                  ],
                  "outcome": "success",
                  "type": Array [
                    "deletion",
                  ],
                },
                "kibana": Object {
                  "saved_object": Object {
                    "id": "2",
                    "type": "cases-comments",
                  },
                },
                "message": "User deleted comment id: 2 for case id: 123 - user action id: 1",
              },
            ],
          ]
        `);
      });
    });

    describe('getUniqueConnectors', () => {
      const findResponse = createUserActionFindSO(createConnectorUserAction());
      const aggregationResponse = {
        aggregations: {
          references: {
            doc_count: 8,
            connectors: {
              doc_count: 4,
              ids: {
                doc_count_error_upper_bound: 0,
                sum_other_doc_count: 0,
                buckets: [
                  {
                    key: '865b6040-7533-11ec-8bcc-a9fc6f9d63b2',
                    doc_count: 2,
                    docs: {},
                  },
                  {
                    key: '915c2600-7533-11ec-8bcc-a9fc6f9d63b2',
                    doc_count: 1,
                    docs: {},
                  },
                  {
                    key: 'b2635b10-63e1-11ec-90af-6fe7d490ff66',
                    doc_count: 1,
                    docs: {},
                  },
                ],
              },
            },
          },
        },
      };

      beforeAll(() => {
        unsecuredSavedObjectsClient.find.mockResolvedValue(
          findResponse as unknown as Promise<SavedObjectsFindResponse>
        );
      });

      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('returns an empty array if the response is not valid', async () => {
        const res = await service.getUniqueConnectors({
          caseId: '123',
        });

        expect(res).toEqual([]);
      });

      it('returns the connectors', async () => {
        unsecuredSavedObjectsClient.find.mockResolvedValue({
          ...findResponse,
          ...aggregationResponse,
        } as unknown as Promise<SavedObjectsFindResponse>);

        const res = await service.getUniqueConnectors({
          caseId: '123',
        });

        expect(res).toEqual([
          { id: '865b6040-7533-11ec-8bcc-a9fc6f9d63b2' },
          { id: '915c2600-7533-11ec-8bcc-a9fc6f9d63b2' },
          { id: 'b2635b10-63e1-11ec-90af-6fe7d490ff66' },
        ]);
      });

      it('returns the unique connectors', async () => {
        await service.getUniqueConnectors({
          caseId: '123',
        });

        expect(unsecuredSavedObjectsClient.find.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            Object {
              "aggs": Object {
                "references": Object {
                  "aggregations": Object {
                    "connectors": Object {
                      "aggregations": Object {
                        "ids": Object {
                          "terms": Object {
                            "field": "cases-user-actions.references.id",
                            "size": 100,
                          },
                        },
                      },
                      "filter": Object {
                        "term": Object {
                          "cases-user-actions.references.type": "action",
                        },
                      },
                    },
                  },
                  "nested": Object {
                    "path": "cases-user-actions.references",
                  },
                },
              },
              "filter": Object {
                "arguments": Array [
                  Object {
                    "arguments": Array [
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "cases-user-actions.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "connector",
                      },
                    ],
                    "function": "is",
                    "type": "function",
                  },
                  Object {
                    "arguments": Array [
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "cases-user-actions.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "create_case",
                      },
                    ],
                    "function": "is",
                    "type": "function",
                  },
                ],
                "function": "or",
                "type": "function",
              },
              "hasReference": Object {
                "id": "123",
                "type": "cases",
              },
              "page": 1,
              "perPage": 1,
              "sortField": "created_at",
              "type": "cases-user-actions",
            },
          ]
        `);
      });

      describe('Decode', () => {
        const attributesToValidateIfMissing = [
          'created_at',
          'created_by',
          'owner',
          'action',
          'payload',
        ];

        const pushes = [{ date: new Date(), connectorId: '123' }];

        describe('getAll', () => {
          it('does not throw when the required fields are present', async () => {
            unsecuredSavedObjectsClient.find.mockResolvedValue(
              createSOFindResponse([{ ...createUserActionSO(), score: 0 }])
            );

            await expect(service.getAll('1')).resolves.not.toThrow();
          });

          it('throws when payload does not exist', async () => {
            const findMockReturn = createSOFindResponse([{ ...createUserActionSO(), score: 0 }]);
            unset(findMockReturn, 'saved_objects[0].attributes.payload');

            unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

            await expect(service.getAll('1')).rejects.toThrowErrorMatchingInlineSnapshot(
              `"Invalid value \\"undefined\\" supplied to \\"payload\\""`
            );
          });

          it('strips excess fields', async () => {
            unsecuredSavedObjectsClient.find.mockResolvedValue(
              createSOFindResponse([
                {
                  ...createUserActionSO({
                    attributesOverrides: {
                      // @ts-expect-error foo is not a valid field for attributesOverrides
                      foo: 'bar',
                    },
                  }),
                  score: 0,
                },
              ])
            );

            const res = await service.getAll('1');
            expect(res).toStrictEqual(
              createSOFindResponse([
                {
                  ...createUserActionSO({
                    attributesOverrides: {
                      // @ts-expect-error these fields are populated by the legacy transformation logic but aren't valid for the override type
                      action_id: '100',
                      case_id: '1',
                      comment_id: null,
                    },
                  }),
                  score: 0,
                },
              ])
            );
          });
        });

        describe('getConnectorFieldsBeforeLatestPush', () => {
          const getAggregations = (userAction: SavedObject<CaseUserActionWithoutReferenceIds>) => {
            const connectors = set({}, 'servicenow.mostRecent.hits.hits', [userAction]);

            const aggregations = set({}, 'references.connectors.reverse.ids.buckets', connectors);

            return aggregations;
          };

          it('decodes correctly', async () => {
            const userAction = createUserActionSO();
            const aggregations = getAggregations(userAction);
            const soFindRes = createSOFindResponse([{ ...userAction, score: 0 }]);

            unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
            soSerializerMock.rawToSavedObject.mockReturnValue(userAction);

            await expect(
              service.getConnectorFieldsBeforeLatestPush('1', pushes)
            ).resolves.not.toThrow();
          });

          it.each(attributesToValidateIfMissing)('throws if %s is omitted', async (key) => {
            const userAction = createUserActionSO();
            const attributes = omit({ ...userAction.attributes }, key);
            const userActionWithOmittedAttribute = { ...userAction, attributes, score: 0 };

            // @ts-expect-error: an attribute is missing
            const aggregations = getAggregations(userActionWithOmittedAttribute);
            const soFindRes = createSOFindResponse([userActionWithOmittedAttribute]);

            unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
            soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithOmittedAttribute);

            await expect(service.getConnectorFieldsBeforeLatestPush('1', pushes)).rejects.toThrow(
              `Invalid value "undefined" supplied to "${key}"`
            );
          });

          it('throws if missing attributes from the payload', async () => {
            const userAction = createUserActionSO();
            const attributes = omit({ ...userAction.attributes }, 'payload.title');
            const userActionWithOmittedAttribute = { ...userAction, attributes, score: 0 };

            // @ts-expect-error: an attribute is missing
            const aggregations = getAggregations(userActionWithOmittedAttribute);
            const soFindRes = createSOFindResponse([userActionWithOmittedAttribute]);

            unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
            soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithOmittedAttribute);

            await expect(service.getConnectorFieldsBeforeLatestPush('1', pushes)).rejects.toThrow(
              'Invalid value "undefined" supplied to "payload,title"'
            );
          });

          it('throws if missing nested attributes from the payload', async () => {
            const userAction = createConnectorUserAction();
            const attributes = omit(
              { ...userAction.attributes },
              'payload.connector.fields.issueType'
            );
            const userActionWithOmittedAttribute = { ...userAction, attributes, score: 0 };

            // @ts-expect-error: an attribute is missing
            const aggregations = getAggregations(userActionWithOmittedAttribute);
            const soFindRes = createSOFindResponse([userActionWithOmittedAttribute]);

            unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
            soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithOmittedAttribute);

            await expect(service.getConnectorFieldsBeforeLatestPush('1', pushes)).rejects.toThrow(
              'Invalid value "undefined" supplied to "payload,connector,fields,issueType",Invalid value "{"priority":"high","parent":"2"}" supplied to "payload,connector,fields"'
            );
          });

          it('strips out excess attributes', async () => {
            const userAction = createUserActionSO();
            const attributes = { ...userAction.attributes, 'not-exists': 'not-exists' };
            const userActionWithExtraAttributes = { ...userAction, attributes, score: 0 };
            const aggregations = getAggregations(userActionWithExtraAttributes);
            const soFindRes = createSOFindResponse([userActionWithExtraAttributes]);

            unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
            soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithExtraAttributes);

            await expect(service.getConnectorFieldsBeforeLatestPush('1', pushes)).resolves
              .toMatchInlineSnapshot(`
              Map {
                "servicenow" => Object {
                  "attributes": Object {
                    "action": "create",
                    "comment_id": null,
                    "created_at": "abc",
                    "created_by": Object {
                      "email": "a",
                      "full_name": "abc",
                      "username": "b",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "title": "a new title",
                    },
                    "type": "title",
                  },
                  "id": "100",
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                  "score": 0,
                  "type": "cases-user-actions",
                },
              }
            `);
          });
        });

        describe('getMostRecentUserAction', () => {
          it('decodes correctly', async () => {
            const userAction = createUserActionSO();
            const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await expect(service.getMostRecentUserAction('123')).resolves.not.toThrow();
          });

          it.each(attributesToValidateIfMissing)('throws if %s is omitted', async (key) => {
            const userAction = createUserActionSO();
            const attributes = omit({ ...userAction.attributes }, key);
            const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await expect(service.getMostRecentUserAction('123')).rejects.toThrow(
              `Invalid value "undefined" supplied to "${key}"`
            );
          });

          it('throws if missing attributes from the payload', async () => {
            const userAction = createUserActionSO();
            const attributes = omit({ ...userAction.attributes }, 'payload.title');
            const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await expect(service.getMostRecentUserAction('123')).rejects.toThrow(
              'Invalid value "undefined" supplied to "payload,title"'
            );
          });

          it('throws if missing nested attributes from the payload', async () => {
            const userAction = createConnectorUserAction();
            const attributes = omit(
              { ...userAction.attributes },
              'payload.connector.fields.issueType'
            );
            const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await expect(service.getMostRecentUserAction('123')).rejects.toThrow(
              'Invalid value "undefined" supplied to "payload,connector,fields,issueType",Invalid value "{"priority":"high","parent":"2"}" supplied to "payload,connector,fields"'
            );
          });

          it('strips out excess attributes', async () => {
            const userAction = createUserActionSO();
            const attributes = { ...userAction.attributes, 'not-exists': 'not-exists' };
            const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await expect(service.getMostRecentUserAction('123')).resolves.toMatchInlineSnapshot(`
              Object {
                "attributes": Object {
                  "action": "create",
                  "comment_id": null,
                  "created_at": "abc",
                  "created_by": Object {
                    "email": "a",
                    "full_name": "abc",
                    "username": "b",
                  },
                  "owner": "securitySolution",
                  "payload": Object {
                    "title": "a new title",
                  },
                  "type": "title",
                },
                "id": "100",
                "references": Array [
                  Object {
                    "id": "1",
                    "name": "associated-cases",
                    "type": "cases",
                  },
                ],
                "score": 0,
                "type": "cases-user-actions",
              }
            `);
          });

          it('constructs the user actions filter correctly', async () => {
            const userAction = createUserActionSO();
            const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await service.getMostRecentUserAction('123');

            expect(unsecuredSavedObjectsClient.find.mock.calls[0][0]).toMatchInlineSnapshot(`
              Object {
                "filter": Object {
                  "arguments": Array [
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "comment",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "description",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "title",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                  ],
                  "function": "or",
                  "type": "function",
                },
                "hasReference": Object {
                  "id": "123",
                  "type": "cases",
                },
                "page": 1,
                "perPage": 1,
                "sortField": "created_at",
                "sortOrder": "desc",
                "type": "cases-user-actions",
              }
            `);
          });

          it('constructs the user actions filter correctly for the webhook connector', async () => {
            const userAction = createUserActionSO();
            const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
            unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);

            await service.getMostRecentUserAction('123', true);

            expect(unsecuredSavedObjectsClient.find.mock.calls[0][0]).toMatchInlineSnapshot(`
              Object {
                "filter": Object {
                  "arguments": Array [
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "comment",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "description",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "title",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "severity",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "status",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "cases-user-actions.attributes.type",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "tags",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                  ],
                  "function": "or",
                  "type": "function",
                },
                "hasReference": Object {
                  "id": "123",
                  "type": "cases",
                },
                "page": 1,
                "perPage": 1,
                "sortField": "created_at",
                "sortOrder": "desc",
                "type": "cases-user-actions",
              }
            `);
          });
        });

        describe('getCaseConnectorInformation', () => {
          const getAggregations = (
            userAction: SavedObject<CaseUserActionWithoutReferenceIds>,
            pushUserAction: SavedObject<CaseUserActionWithoutReferenceIds>
          ) => {
            const changeConnector = set({}, 'mostRecent.hits.hits', [userAction]);
            const createCase = set({}, 'mostRecent.hits.hits', []);
            const pushInfo = {
              mostRecent: set({}, 'hits.hits', [pushUserAction]),
              oldest: set({}, 'hits.hits', [pushUserAction]),
            };

            const connectorsBucket = { changeConnector, createCase, pushInfo };
            const connectors = set({}, 'reverse.connectorActivity.buckets', connectorsBucket);
            const aggregations = set({}, 'references.connectors.ids.buckets', [connectors]);

            return aggregations;
          };

          it('decodes correctly', async () => {
            const userAction = createUserActionSO();
            const pushUserAction = pushConnectorUserAction();
            const aggregations = getAggregations(userAction, pushUserAction);
            const soFindRes = createSOFindResponse([{ ...userAction, score: 0 }]);

            unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
            soSerializerMock.rawToSavedObject.mockReturnValue(userAction);

            await expect(service.getCaseConnectorInformation('1')).resolves.not.toThrow();
          });

          describe('Testing userAction', () => {
            it.each(attributesToValidateIfMissing)('throws if %s is omitted', async (key) => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = omit({ ...userAction.attributes }, key);
              const userActionWithOmittedAttribute = { ...userAction, attributes, score: 0 };

              // @ts-expect-error: an attribute is missing
              const aggregations = getAggregations(userActionWithOmittedAttribute, pushUserAction);
              const soFindRes = createSOFindResponse([userActionWithOmittedAttribute]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithOmittedAttribute);

              await expect(service.getCaseConnectorInformation('1')).rejects.toThrow(
                `Invalid value "undefined" supplied to "${key}"`
              );
            });

            it('throws if missing attributes from the payload', async () => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = omit({ ...userAction.attributes }, 'payload.title');
              const userActionWithOmittedAttribute = { ...userAction, attributes, score: 0 };

              // @ts-expect-error: an attribute is missing
              const aggregations = getAggregations(userActionWithOmittedAttribute, pushUserAction);
              const soFindRes = createSOFindResponse([userActionWithOmittedAttribute]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithOmittedAttribute);

              await expect(service.getCaseConnectorInformation('1')).rejects.toThrow(
                'Invalid value "undefined" supplied to "payload,title"'
              );
            });

            it('throws if missing nested attributes from the payload', async () => {
              const userAction = createConnectorUserAction();
              const pushUserAction = pushConnectorUserAction();
              const attributes = omit(
                { ...userAction.attributes },
                'payload.connector.fields.issueType'
              );
              const userActionWithOmittedAttribute = { ...userAction, attributes, score: 0 };

              // @ts-expect-error: an attribute is missing
              const aggregations = getAggregations(userActionWithOmittedAttribute, pushUserAction);
              const soFindRes = createSOFindResponse([userActionWithOmittedAttribute]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithOmittedAttribute);

              await expect(service.getCaseConnectorInformation('1')).rejects.toThrow(
                'Invalid value "undefined" supplied to "payload,connector,fields,issueType",Invalid value "{"priority":"high","parent":"2"}" supplied to "payload,connector,fields"'
              );
            });

            it('strips out excess attributes', async () => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = { ...userAction.attributes, 'not-exists': 'not-exists' };
              const userActionWithExtraAttributes = { ...userAction, attributes, score: 0 };
              const aggregations = getAggregations(userActionWithExtraAttributes, pushUserAction);
              const soFindRes = createSOFindResponse([userActionWithExtraAttributes]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValue(userActionWithExtraAttributes);

              await expect(service.getCaseConnectorInformation('1')).resolves
                .toMatchInlineSnapshot(`
                Array [
                  Object {
                    "connectorId": undefined,
                    "fields": Object {
                      "attributes": Object {
                        "action": "create",
                        "comment_id": null,
                        "created_at": "abc",
                        "created_by": Object {
                          "email": "a",
                          "full_name": "abc",
                          "username": "b",
                        },
                        "owner": "securitySolution",
                        "payload": Object {
                          "title": "a new title",
                        },
                        "type": "title",
                      },
                      "id": "100",
                      "references": Array [
                        Object {
                          "id": "1",
                          "name": "associated-cases",
                          "type": "cases",
                        },
                      ],
                      "score": 0,
                      "type": "cases-user-actions",
                    },
                    "push": Object {
                      "mostRecent": Object {
                        "attributes": Object {
                          "action": "create",
                          "comment_id": null,
                          "created_at": "abc",
                          "created_by": Object {
                            "email": "a",
                            "full_name": "abc",
                            "username": "b",
                          },
                          "owner": "securitySolution",
                          "payload": Object {
                            "title": "a new title",
                          },
                          "type": "title",
                        },
                        "id": "100",
                        "references": Array [
                          Object {
                            "id": "1",
                            "name": "associated-cases",
                            "type": "cases",
                          },
                        ],
                        "score": 0,
                        "type": "cases-user-actions",
                      },
                      "oldest": Object {
                        "attributes": Object {
                          "action": "create",
                          "comment_id": null,
                          "created_at": "abc",
                          "created_by": Object {
                            "email": "a",
                            "full_name": "abc",
                            "username": "b",
                          },
                          "owner": "securitySolution",
                          "payload": Object {
                            "title": "a new title",
                          },
                          "type": "title",
                        },
                        "id": "100",
                        "references": Array [
                          Object {
                            "id": "1",
                            "name": "associated-cases",
                            "type": "cases",
                          },
                        ],
                        "score": 0,
                        "type": "cases-user-actions",
                      },
                    },
                  },
                ]
              `);
            });
          });

          describe('Testing pushAction', () => {
            it.each(attributesToValidateIfMissing)('throws if %s is omitted', async (key) => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = omit({ ...pushUserAction.attributes }, key);
              const pushActionActionWithOmittedAttribute = {
                ...pushUserAction,
                attributes,
                score: 0,
              };

              const aggregations = getAggregations(
                userAction,
                // @ts-expect-error: an attribute is missing
                pushActionActionWithOmittedAttribute
              );
              const soFindRes = createSOFindResponse([{ ...userAction, score: 0 }]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(userAction);
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(
                pushActionActionWithOmittedAttribute
              );

              await expect(service.getCaseConnectorInformation('1')).rejects.toThrow(
                `Invalid value "undefined" supplied to "${key}"`
              );
            });

            it('throws if missing attributes from the payload', async () => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = omit({ ...pushUserAction.attributes }, 'payload.externalService');
              const pushActionActionWithOmittedAttribute = {
                ...pushUserAction,
                attributes,
                score: 0,
              };

              const aggregations = getAggregations(
                userAction,
                // @ts-expect-error: an attribute is missing
                pushActionActionWithOmittedAttribute
              );
              const soFindRes = createSOFindResponse([{ ...userAction, score: 0 }]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(userAction);
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(
                pushActionActionWithOmittedAttribute
              );

              await expect(service.getCaseConnectorInformation('1')).rejects.toThrow(
                'Invalid value "undefined" supplied to "payload,externalService"'
              );
            });

            it('throws if missing nested attributes from the payload', async () => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = omit(
                { ...pushUserAction.attributes },
                'payload.externalService.external_id'
              );
              const pushActionActionWithOmittedAttribute = {
                ...pushUserAction,
                attributes,
                score: 0,
              };

              const aggregations = getAggregations(
                userAction,
                // @ts-expect-error: an attribute is missing
                pushActionActionWithOmittedAttribute
              );
              const soFindRes = createSOFindResponse([{ ...userAction, score: 0 }]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(userAction);
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(
                pushActionActionWithOmittedAttribute
              );

              await expect(service.getCaseConnectorInformation('1')).rejects.toThrow(
                'Invalid value "undefined" supplied to "payload,externalService,external_id"'
              );
            });

            it('strips out excess attributes', async () => {
              const userAction = createUserActionSO();
              const pushUserAction = pushConnectorUserAction();
              const attributes = { ...pushUserAction.attributes, 'not-exists': 'not-exists' };
              const pushActionWithExtraAttributes = { ...pushUserAction, attributes, score: 0 };
              const aggregations = getAggregations(userAction, pushActionWithExtraAttributes);
              const soFindRes = createSOFindResponse([{ ...userAction, score: 0 }]);

              unsecuredSavedObjectsClient.find.mockResolvedValue({ ...soFindRes, aggregations });
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(userAction);
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(pushActionWithExtraAttributes);
              soSerializerMock.rawToSavedObject.mockReturnValueOnce(pushActionWithExtraAttributes);

              await expect(service.getCaseConnectorInformation('1')).resolves
                .toMatchInlineSnapshot(`
                Array [
                  Object {
                    "connectorId": undefined,
                    "fields": Object {
                      "attributes": Object {
                        "action": "create",
                        "comment_id": null,
                        "created_at": "abc",
                        "created_by": Object {
                          "email": "a",
                          "full_name": "abc",
                          "username": "b",
                        },
                        "owner": "securitySolution",
                        "payload": Object {
                          "title": "a new title",
                        },
                        "type": "title",
                      },
                      "id": "100",
                      "references": Array [
                        Object {
                          "id": "1",
                          "name": "associated-cases",
                          "type": "cases",
                        },
                      ],
                      "type": "cases-user-actions",
                    },
                    "push": Object {
                      "mostRecent": Object {
                        "attributes": Object {
                          "action": "push_to_service",
                          "comment_id": null,
                          "created_at": "abc",
                          "created_by": Object {
                            "email": "a",
                            "full_name": "abc",
                            "username": "b",
                          },
                          "owner": "securitySolution",
                          "payload": Object {
                            "externalService": Object {
                              "connector_id": "100",
                              "connector_name": ".jira",
                              "external_id": "100",
                              "external_title": "awesome",
                              "external_url": "http://www.google.com",
                              "pushed_at": "2019-11-25T21:54:48.952Z",
                              "pushed_by": Object {
                                "email": "testemail@elastic.co",
                                "full_name": "elastic",
                                "username": "elastic",
                              },
                            },
                          },
                          "type": "pushed",
                        },
                        "id": "100",
                        "references": Array [
                          Object {
                            "id": "1",
                            "name": "associated-cases",
                            "type": "cases",
                          },
                          Object {
                            "id": "100",
                            "name": "pushConnectorId",
                            "type": "action",
                          },
                        ],
                        "score": 0,
                        "type": "cases-user-actions",
                      },
                      "oldest": Object {
                        "attributes": Object {
                          "action": "push_to_service",
                          "comment_id": null,
                          "created_at": "abc",
                          "created_by": Object {
                            "email": "a",
                            "full_name": "abc",
                            "username": "b",
                          },
                          "owner": "securitySolution",
                          "payload": Object {
                            "externalService": Object {
                              "connector_id": "100",
                              "connector_name": ".jira",
                              "external_id": "100",
                              "external_title": "awesome",
                              "external_url": "http://www.google.com",
                              "pushed_at": "2019-11-25T21:54:48.952Z",
                              "pushed_by": Object {
                                "email": "testemail@elastic.co",
                                "full_name": "elastic",
                                "username": "elastic",
                              },
                            },
                          },
                          "type": "pushed",
                        },
                        "id": "100",
                        "references": Array [
                          Object {
                            "id": "1",
                            "name": "associated-cases",
                            "type": "cases",
                          },
                          Object {
                            "id": "100",
                            "name": "pushConnectorId",
                            "type": "action",
                          },
                        ],
                        "score": 0,
                        "type": "cases-user-actions",
                      },
                    },
                  },
                ]
              `);
            });
          });
        });
      });
    });
  });
});
