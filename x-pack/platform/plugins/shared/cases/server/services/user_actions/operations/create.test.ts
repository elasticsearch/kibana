/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';
import { CASE_USER_ACTION_SAVED_OBJECT } from '../../../../common/constants';
import { createSavedObjectsSerializerMock } from '../../../client/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { unset } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import { createConnectorObject } from '../../test_utils';
import { UserActionPersister } from './create';
import { createUserActionSO } from '../test_utils';
import type {
  BuilderParameters,
  BulkCreateAttachmentUserAction,
  CreateUserActionArgs,
} from '../types';
import type { UserActionPersistedAttributes } from '../../../common/types/user_actions';
import {
  getAssigneesAddedRemovedUserActions,
  getAssigneesAddedUserActions,
  getAssigneesRemovedUserActions,
  getBuiltUserActions,
  getTagsAddedRemovedUserActions,
  patchAddRemoveAssigneesCasesRequest,
  patchAssigneesCasesRequest,
  patchCasesRequest,
  patchAddCustomFieldsToOriginalCasesRequest,
  patchUpdateCustomFieldsCasesRequest,
  patchRemoveAssigneesCasesRequest,
  patchTagsCasesRequest,
  patchUpdateResetCustomFieldsCasesRequest,
  patchNewCustomFieldConfAdded,
  patchCustomFieldConfRemoved,
  getExtractObservablesUserActions,
  patchSyncAlertsCasesRequest,
  getSyncAlertsUserActions,
  patchExtractObservablesCasesRequest,
  patchBothSettingsCasesRequest,
  getBothSettingsUserActions,
  patchExtendedFieldsCasesRequest,
  patchUpdateExtendedFieldsCasesRequest,
  getExtendedFieldsUserActions,
  patchTemplateCasesRequest,
  patchRemoveTemplateCasesRequest,
  getTemplateUserActions,
} from '../mocks';
import { AttachmentType, UserActionTypes } from '../../../../common/types/domain';

describe('UserActionPersister', () => {
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const mockLogger = loggerMock.create();
  const auditMockLocker = auditLoggerMock.create();
  const savedObjectsSerializer = createSavedObjectsSerializerMock();
  // Spy-able activity writer so the `.cases-activity` mirror assertions
  // below can inspect the fire-and-forget dispatches. `jest.resetAllMocks`
  // in `beforeEach` clears call state between tests.
  const analyticsV2ActivityWriter = {
    upsertAction: jest.fn(),
    bulkUpsertActions: jest.fn(),
    bulkDeleteActionsByCaseIds: jest.fn(),
    bulkUpsertActionsAwait: jest.fn().mockResolvedValue(undefined),
  };

  let persister: UserActionPersister;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2022-01-09T22:00:00.000Z'));
  });

  beforeEach(() => {
    jest.resetAllMocks();
    persister = new UserActionPersister({
      log: mockLogger,
      unsecuredSavedObjectsClient,
      savedObjectsSerializer,
      auditLogger: auditMockLocker,
      analyticsV2ActivityWriter,
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const getRequest = <T extends keyof BuilderParameters = 'connector'>(overrides = {}) =>
    ({
      userAction: {
        action: 'update' as const,
        type: 'connector' as const,
        caseId: 'test',
        payload: { connector: createConnectorObject().connector },
        connectorId: '1',
        owner: 'cases',
        user: { email: '', full_name: '', username: '' },
        ...overrides,
      },
    } as CreateUserActionArgs<T>);

  const getBulkCreateAttachmentRequest = (): BulkCreateAttachmentUserAction => ({
    caseId: 'test',
    attachments: [
      {
        id: '1',
        owner: 'cases',
        attachment: { comment: 'test', type: AttachmentType.user, owner: 'cases' },
      },
    ],
    user: { email: '', full_name: '', username: '' },
  });

  const testUser = { full_name: 'Elastic User', username: 'elastic', email: 'elastic@elastic.co' };

  describe('cases-analytics v2 activity mirror', () => {
    it('mirrors a single created user action to the activity writer', async () => {
      unsecuredSavedObjectsClient.create.mockResolvedValue({
        attributes: createUserActionSO(),
        id: 'ua-1',
        type: CASE_USER_ACTION_SAVED_OBJECT,
        references: [],
      });

      await persister.createUserAction(getRequest());

      expect(analyticsV2ActivityWriter.upsertAction).toHaveBeenCalledTimes(1);
      expect(analyticsV2ActivityWriter.upsertAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ua-1' })
      );
    });

    it('mirrors only the successfully-persisted entries on bulk create', async () => {
      // One success, one per-item failure (409). The failed entry must be
      // excluded so we never mirror a doc that wasn't actually persisted —
      // reconciliation can't repair that (a never-persisted user action has
      // no SO to walk).
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            attributes: createUserActionSO(),
            id: 'ua-ok',
            type: CASE_USER_ACTION_SAVED_OBJECT,
            references: [],
          },
          // A per-item failure has `error` and no `attributes`/`references`;
          // cast to the response element type since the SO API's typed
          // shape doesn't model the error variant inline.
          {
            id: 'ua-bad',
            type: CASE_USER_ACTION_SAVED_OBJECT,
            error: { error: 'Conflict', message: 'version conflict', statusCode: 409 },
          } as unknown as SavedObject<UserActionPersistedAttributes>,
        ],
      });

      await persister.bulkCreateUserAction({ userActions: [getRequest().userAction] });

      expect(analyticsV2ActivityWriter.bulkUpsertActions).toHaveBeenCalledTimes(1);
      const mirrored = analyticsV2ActivityWriter.bulkUpsertActions.mock.calls[0][0];
      expect(mirrored.map((so: { id: string }) => so.id)).toEqual(['ua-ok']);
    });

    it('does not dispatch to the activity writer when every bulk entry errored', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            id: 'ua-bad',
            type: CASE_USER_ACTION_SAVED_OBJECT,
            error: { error: 'Conflict', message: 'version conflict', statusCode: 409 },
          } as unknown as SavedObject<UserActionPersistedAttributes>,
        ],
      });

      await persister.bulkCreateUserAction({ userActions: [getRequest().userAction] });

      expect(analyticsV2ActivityWriter.bulkUpsertActions).not.toHaveBeenCalled();
    });
  });

  describe('Decoding requests', () => {
    describe('createUserAction', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.create.mockResolvedValue({
          attributes: createUserActionSO(),
          id: '1',
          type: CASE_USER_ACTION_SAVED_OBJECT,
          references: [],
        });
      });

      it('decodes correctly the requested attributes', async () => {
        await expect(persister.createUserAction(getRequest())).resolves.not.toThrow();
      });

      it('throws if fields is omitted', async () => {
        const req = getRequest();
        unset(req, 'userAction.payload.connector.fields');

        await expect(persister.createUserAction(req)).rejects.toThrow(
          'Invalid value "undefined" supplied to "payload,connector,fields"'
        );
      });

      it('strips out excess attributes', async () => {
        const req = getRequest();
        set(req, 'payload.foo', 'bar');

        await expect(persister.createUserAction(req)).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.create.mock
          .calls[0][1] as UserActionPersistedAttributes;

        expect(persistedAttributes.payload).not.toHaveProperty('foo');
      });
    });

    describe('bulkCreateAttachmentCreation', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [
            {
              attributes: createUserActionSO(),
              id: '1',
              type: CASE_USER_ACTION_SAVED_OBJECT,
              references: [],
            },
          ],
        });
      });

      it('decodes correctly the requested attributes', async () => {
        await expect(
          persister.bulkCreateUserAction({
            userActions: [getRequest().userAction],
          })
        ).resolves.not.toThrow();
      });

      it('throws if owner is omitted', async () => {
        const req = getRequest().userAction;
        unset(req, 'owner');

        await expect(
          persister.bulkCreateUserAction({
            userActions: [req],
          })
        ).rejects.toThrow('Invalid value "undefined" supplied to "owner"');
      });

      it('strips out excess attributes', async () => {
        const req = getRequest().userAction;
        set(req, 'payload.foo', 'bar');

        await expect(
          persister.bulkCreateUserAction({
            userActions: [req],
          })
        ).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0][0]
          .attributes as UserActionPersistedAttributes;

        expect(persistedAttributes.payload).not.toHaveProperty('foo');
      });
    });

    describe('bulkCreateUserAction', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [
            {
              attributes: createUserActionSO(),
              id: '1',
              type: CASE_USER_ACTION_SAVED_OBJECT,
              references: [],
            },
          ],
        });
      });

      it('decodes correctly the requested attributes', async () => {
        await expect(
          persister.bulkCreateAttachmentCreation(getBulkCreateAttachmentRequest())
        ).resolves.not.toThrow();
      });

      it('throws if owner is omitted', async () => {
        const req = getBulkCreateAttachmentRequest();
        unset(req, 'attachments[0].owner');

        await expect(persister.bulkCreateAttachmentCreation(req)).rejects.toThrow(
          'Invalid value "undefined" supplied to "owner"'
        );
      });

      it('strips out excess attributes', async () => {
        const req = getBulkCreateAttachmentRequest();
        set(req, 'attachments[0].attachment.foo', 'bar');

        await expect(persister.bulkCreateAttachmentCreation(req)).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0][0]
          .attributes as UserActionPersistedAttributes;

        expect(persistedAttributes.payload).not.toHaveProperty('foo');
      });
    });
  });

  describe('buildUserActions', () => {
    it('creates the correct user actions when bulk updating cases', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchCasesRequest,
          user: testUser,
        })
      ).toEqual(getBuiltUserActions({ isMock: false }));
    });

    it('creates the correct user actions when an assignee is added', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchAssigneesCasesRequest,
          user: testUser,
        })
      ).toEqual(getAssigneesAddedUserActions({ isMock: false }));
    });

    it('creates the correct user actions when an assignee is removed', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchRemoveAssigneesCasesRequest,
          user: testUser,
        })
      ).toEqual(getAssigneesRemovedUserActions({ isMock: false }));
    });

    it('creates the correct user actions when assignees are added and removed', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchAddRemoveAssigneesCasesRequest,
          user: testUser,
        })
      ).toEqual(
        getAssigneesAddedRemovedUserActions({
          isMock: false,
        })
      );
    });

    it('creates the correct user actions when tags are added and removed', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchTagsCasesRequest,
          user: testUser,
        })
      ).toEqual(
        getTagsAddedRemovedUserActions({
          isMock: false,
        })
      );
    });

    it('creates the correct user actions when sync alerts settings is changed', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchSyncAlertsCasesRequest,
          user: testUser,
        })
      ).toEqual(getSyncAlertsUserActions({ isMock: false }));
    });

    it('creates the correct user actions when extract observables settings is changed', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchExtractObservablesCasesRequest,
          user: testUser,
        })
      ).toEqual(getExtractObservablesUserActions({ isMock: false }));
    });

    it('creates the correct user actions when both settings are changed', async () => {
      expect(
        persister.buildUserActions({
          updatedCases: patchBothSettingsCasesRequest,
          user: testUser,
        })
      ).toEqual(getBothSettingsUserActions({ isMock: false }));
    });

    describe('extendedFields', () => {
      it('creates a user action when extended_fields are set for the first time', () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchExtendedFieldsCasesRequest,
            user: testUser,
          })
        ).toEqual(getExtendedFieldsUserActions({ isMock: false, payload: { risk_score: 'high' } }));
      });

      it('creates a user action only for the fields that changed', () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchUpdateExtendedFieldsCasesRequest,
            user: testUser,
          })
        ).toEqual(getExtendedFieldsUserActions({ isMock: false, payload: { risk_score: 'high' } }));
      });

      it('creates no user action when extended_fields have not changed', () => {
        const noDiffRequest = {
          cases: [
            {
              ...patchUpdateExtendedFieldsCasesRequest.cases[0],
              updatedAttributes: { extended_fields: { risk_score: 'low', severity: 'medium' } },
            },
          ],
        };
        expect(
          persister.buildUserActions({
            updatedCases: noDiffRequest,
            user: testUser,
          })
        ).toEqual({ '1': [] });
      });
    });

    describe('template', () => {
      it('creates a user action when a template is applied', () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchTemplateCasesRequest,
            user: testUser,
          })
        ).toEqual(getTemplateUserActions({ isMock: false, payload: { id: 'tmpl-1', version: 3 } }));
      });

      it('creates a user action when a template is removed (null)', () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchRemoveTemplateCasesRequest,
            user: testUser,
          })
        ).toEqual(getTemplateUserActions({ isMock: false, payload: null }));
      });
    });

    it('adds synced alerts count only to status user actions', () => {
      const userActionsDict = persister.buildUserActions({
        updatedCases: patchCasesRequest,
        user: testUser,
      });

      const updatedUserActionsDict = persister.addSyncedAlertsCountToUserActions({
        userActionsDict,
        syncedAlertCountCountByCaseId: new Map([['1', 3]]),
      });

      const statusAction = updatedUserActionsDict['1'].find(
        ({ parameters }) => parameters.attributes.type === UserActionTypes.status
      );

      expect(statusAction?.parameters.attributes.payload).toEqual({
        status: 'closed',
        syncedAlertCount: 3,
      });
      expect(updatedUserActionsDict['2']).toEqual(userActionsDict['2']);
    });

    it('adds close reason details to the status audit message when alerts are synced', () => {
      const updatedCases = {
        ...patchCasesRequest,
        cases: patchCasesRequest.cases.map((theCase) => {
          if (theCase.caseId !== '1') {
            return theCase;
          }

          return {
            ...theCase,
            closeReason: 'false_positive',
            updatedAttributes: {
              ...theCase.updatedAttributes,
              settings: {
                syncAlerts: true,
                extractObservables: false,
              },
            },
          };
        }),
      };

      const builtUserActions = persister.buildUserActions({
        updatedCases,
        user: testUser,
      });

      const statusAction = builtUserActions['1'].find(
        ({ parameters }) => parameters.attributes.type === UserActionTypes.status
      );

      expect(statusAction?.eventDetails.getMessage('status-user-action-id')).toBe(
        'User closed case id: 1 and synced alerts with a close reason - user action id: status-user-action-id'
      );
      expect(statusAction?.parameters.attributes.payload).toEqual({
        status: 'closed',
        closeReason: 'false_positive',
      });
    });

    describe('customFields', () => {
      it('creates the correct user actions when adding a new custom field to a case without custom fields', async () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchAddCustomFieldsToOriginalCasesRequest,
            user: testUser,
          })
        ).toMatchInlineSnapshot(`
          Object {
            "1": Array [
              Object {
                "eventDetails": Object {
                  "action": "update",
                  "descriptiveAction": "case_user_action_update_case_custom_fields",
                  "getMessage": [Function],
                  "savedObjectId": "1",
                  "savedObjectType": "cases",
                },
                "parameters": Object {
                  "attributes": Object {
                    "action": "update",
                    "created_at": "2022-01-09T22:00:00.000Z",
                    "created_by": Object {
                      "email": "elastic@elastic.co",
                      "full_name": "Elastic User",
                      "username": "elastic",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "customFields": Array [
                        Object {
                          "key": "string_custom_field_1",
                          "type": "text",
                          "value": "this is a text field value",
                        },
                      ],
                    },
                    "type": "customFields",
                  },
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                },
              },
            ],
          }
        `);
      });

      it('creates the correct user actions when updating an existing custom field', async () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchUpdateCustomFieldsCasesRequest,
            user: testUser,
          })
        ).toMatchInlineSnapshot(`
          Object {
            "1": Array [
              Object {
                "eventDetails": Object {
                  "action": "update",
                  "descriptiveAction": "case_user_action_update_case_custom_fields",
                  "getMessage": [Function],
                  "savedObjectId": "1",
                  "savedObjectType": "cases",
                },
                "parameters": Object {
                  "attributes": Object {
                    "action": "update",
                    "created_at": "2022-01-09T22:00:00.000Z",
                    "created_by": Object {
                      "email": "elastic@elastic.co",
                      "full_name": "Elastic User",
                      "username": "elastic",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "customFields": Array [
                        Object {
                          "key": "string_custom_field_1",
                          "type": "text",
                          "value": "updated value",
                        },
                      ],
                    },
                    "type": "customFields",
                  },
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                },
              },
            ],
          }
        `);
      });

      it('creates the correct user actions when updating and resetting custom fields', async () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchUpdateResetCustomFieldsCasesRequest,
            user: testUser,
          })
        ).toMatchInlineSnapshot(`
          Object {
            "1": Array [
              Object {
                "eventDetails": Object {
                  "action": "update",
                  "descriptiveAction": "case_user_action_update_case_custom_fields",
                  "getMessage": [Function],
                  "savedObjectId": "1",
                  "savedObjectType": "cases",
                },
                "parameters": Object {
                  "attributes": Object {
                    "action": "update",
                    "created_at": "2022-01-09T22:00:00.000Z",
                    "created_by": Object {
                      "email": "elastic@elastic.co",
                      "full_name": "Elastic User",
                      "username": "elastic",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "customFields": Array [
                        Object {
                          "key": "string_custom_field_1",
                          "type": "text",
                          "value": null,
                        },
                      ],
                    },
                    "type": "customFields",
                  },
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                },
              },
              Object {
                "eventDetails": Object {
                  "action": "update",
                  "descriptiveAction": "case_user_action_update_case_custom_fields",
                  "getMessage": [Function],
                  "savedObjectId": "1",
                  "savedObjectType": "cases",
                },
                "parameters": Object {
                  "attributes": Object {
                    "action": "update",
                    "created_at": "2022-01-09T22:00:00.000Z",
                    "created_by": Object {
                      "email": "elastic@elastic.co",
                      "full_name": "Elastic User",
                      "username": "elastic",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "customFields": Array [
                        Object {
                          "key": "string_custom_field_2",
                          "type": "text",
                          "value": "new custom field 2",
                        },
                      ],
                    },
                    "type": "customFields",
                  },
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                },
              },
            ],
          }
        `);
      });

      it('should create a user action only for the updated field and not for the added configuration', async () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchNewCustomFieldConfAdded,
            user: testUser,
          })
        ).toMatchInlineSnapshot(`
          Object {
            "1": Array [
              Object {
                "eventDetails": Object {
                  "action": "update",
                  "descriptiveAction": "case_user_action_update_case_custom_fields",
                  "getMessage": [Function],
                  "savedObjectId": "1",
                  "savedObjectType": "cases",
                },
                "parameters": Object {
                  "attributes": Object {
                    "action": "update",
                    "created_at": "2022-01-09T22:00:00.000Z",
                    "created_by": Object {
                      "email": "elastic@elastic.co",
                      "full_name": "Elastic User",
                      "username": "elastic",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "customFields": Array [
                        Object {
                          "key": "string_custom_field_1",
                          "type": "text",
                          "value": "new value",
                        },
                      ],
                    },
                    "type": "customFields",
                  },
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                },
              },
            ],
          }
        `);
      });

      it('should create a user action only for the field that got updated and not for the removed configuration', async () => {
        expect(
          persister.buildUserActions({
            updatedCases: patchCustomFieldConfRemoved,
            user: testUser,
          })
        ).toMatchInlineSnapshot(`
          Object {
            "1": Array [
              Object {
                "eventDetails": Object {
                  "action": "update",
                  "descriptiveAction": "case_user_action_update_case_custom_fields",
                  "getMessage": [Function],
                  "savedObjectId": "1",
                  "savedObjectType": "cases",
                },
                "parameters": Object {
                  "attributes": Object {
                    "action": "update",
                    "created_at": "2022-01-09T22:00:00.000Z",
                    "created_by": Object {
                      "email": "elastic@elastic.co",
                      "full_name": "Elastic User",
                      "username": "elastic",
                    },
                    "owner": "securitySolution",
                    "payload": Object {
                      "customFields": Array [
                        Object {
                          "key": "string_custom_field_1",
                          "type": "text",
                          "value": "new value",
                        },
                      ],
                    },
                    "type": "customFields",
                  },
                  "references": Array [
                    Object {
                      "id": "1",
                      "name": "associated-cases",
                      "type": "cases",
                    },
                  ],
                },
              },
            ],
          }
        `);
      });
    });
  });

  describe('bulkCreateUserAction', () => {
    beforeEach(() => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            attributes: [createUserActionSO()],
            id: '1',
            type: CASE_USER_ACTION_SAVED_OBJECT,
            references: [],
          },
          {
            attributes: [createUserActionSO()],
            id: '2',
            type: CASE_USER_ACTION_SAVED_OBJECT,
            references: [],
          },
        ],
      });
    });

    it('bulk creates the user actions correctly', async () => {
      const connectorUserAction = getRequest().userAction;
      const titleUserAction = getRequest<'title'>({
        type: 'title',
        payload: { title: 'my title' },
      }).userAction;

      await persister.bulkCreateUserAction({
        userActions: [connectorUserAction, titleUserAction],
      });

      expect(unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0]).toMatchInlineSnapshot(`
        Array [
          Object {
            "attributes": Object {
              "action": "update",
              "created_at": "2022-01-09T22:00:00.000Z",
              "created_by": Object {
                "email": "",
                "full_name": "",
                "username": "",
              },
              "owner": "cases",
              "payload": Object {
                "connector": Object {
                  "fields": Object {
                    "issueType": "bug",
                    "parent": "2",
                    "priority": "high",
                  },
                  "name": ".jira",
                  "type": ".jira",
                },
              },
              "type": "connector",
            },
            "references": Array [
              Object {
                "id": "test",
                "name": "associated-cases",
                "type": "cases",
              },
              Object {
                "id": "1",
                "name": "connectorId",
                "type": "action",
              },
            ],
            "type": "cases-user-actions",
          },
          Object {
            "attributes": Object {
              "action": "update",
              "created_at": "2022-01-09T22:00:00.000Z",
              "created_by": Object {
                "email": "",
                "full_name": "",
                "username": "",
              },
              "owner": "cases",
              "payload": Object {
                "title": "my title",
              },
              "type": "title",
            },
            "references": Array [
              Object {
                "id": "test",
                "name": "associated-cases",
                "type": "cases",
              },
            ],
            "type": "cases-user-actions",
          },
        ]
      `);
    });
  });
});
