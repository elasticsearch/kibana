/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AttachmentType,
  CaseSeverity,
  CaseStatuses,
  ConnectorTypes,
  UserActionActions,
  UserActionTypes,
} from '../../../common/types/domain';
import { SECURITY_SOLUTION_OWNER } from '../../../common';
import { CASE_ATTACHMENT_SAVED_OBJECT } from '../../../common/constants';
import { CASE_ATTACHMENT_REF_NAME } from '../../common/constants';
import {
  externalReferenceAttachmentES,
  externalReferenceAttachmentSO,
  persistableStateAttachment,
} from '../../attachment_framework/mocks';
import { BuilderFactory } from './builder_factory';
import { casePayload, externalService } from './mocks';

describe('UserActionBuilder', () => {
  const commonArgs = {
    caseId: '123',
    user: { full_name: 'Elastic User', username: 'elastic', email: 'elastic@elastic.co' },
    owner: SECURITY_SOLUTION_OWNER,
  };
  let builderFactory: BuilderFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    builderFactory = new BuilderFactory();
  });

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2022-01-09T22:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('parameters', () => {
    it('builds a title user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.title)!;
      const userAction = builder.build({
        payload: { title: 'test' },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "title": "test",
            },
            "type": "title",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a connector user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.connector)!;
      const userAction = builder.build({
        payload: {
          connector: {
            id: '456',
            name: 'ServiceNow SN',
            type: ConnectorTypes.serviceNowSIR,
            fields: {
              category: 'Denial of Service',
              destIp: true,
              malwareHash: true,
              malwareUrl: true,
              priority: '2',
              sourceIp: true,
              subcategory: '45',
            },
          },
        },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "connector": Object {
                "fields": Object {
                  "category": "Denial of Service",
                  "destIp": true,
                  "malwareHash": true,
                  "malwareUrl": true,
                  "priority": "2",
                  "sourceIp": true,
                  "subcategory": "45",
                },
                "name": "ServiceNow SN",
                "type": ".servicenow-sir",
              },
            },
            "type": "connector",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "456",
              "name": "connectorId",
              "type": "action",
            },
          ],
        }
      `);
    });

    it('builds a comment user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: {
            comment: 'a comment!',
            type: AttachmentType.user,
            owner: SECURITY_SOLUTION_OWNER,
          },
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "comment": Object {
                "comment": "a comment!",
                "owner": "securitySolution",
                "type": "user",
              },
            },
            "type": "comment",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "test-id",
              "name": "associated-cases-comments",
              "type": "cases-comments",
            },
          ],
        }
      `);
    });

    it('builds a comment user action with the attachment saved object type', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: {
            comment: 'a comment!',
            type: AttachmentType.user,
            owner: SECURITY_SOLUTION_OWNER,
          },
        },
        savedObjectId: 'test-id',
        savedObjectType: CASE_ATTACHMENT_SAVED_OBJECT,
        ...commonArgs,
      });

      expect(userAction!.parameters.references).toContainEqual({
        id: 'test-id',
        name: CASE_ATTACHMENT_REF_NAME,
        type: CASE_ATTACHMENT_SAVED_OBJECT,
      });
      expect(userAction!.eventDetails.savedObjectType).toBe(CASE_ATTACHMENT_SAVED_OBJECT);
    });

    it('builds an external reference attachment (savedObject) user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: externalReferenceAttachmentSO,
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "comment": Object {
                "externalReferenceAttachmentTypeId": ".test",
                "externalReferenceMetadata": null,
                "externalReferenceStorage": Object {
                  "soType": "test-so",
                  "type": "savedObject",
                },
                "owner": "securitySolution",
                "type": "externalReference",
              },
            },
            "type": "comment",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "test-id",
              "name": "associated-cases-comments",
              "type": "cases-comments",
            },
            Object {
              "id": "my-id",
              "name": "externalReferenceId",
              "type": "test-so",
            },
          ],
        }
      `);
    });

    it('builds an external reference attachment (elasticSearchDoc) user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: externalReferenceAttachmentES,
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "comment": Object {
                "externalReferenceAttachmentTypeId": ".test",
                "externalReferenceId": "my-id",
                "externalReferenceMetadata": null,
                "externalReferenceStorage": Object {
                  "type": "elasticSearchDoc",
                },
                "owner": "securitySolution",
                "type": "externalReference",
              },
            },
            "type": "comment",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "test-id",
              "name": "associated-cases-comments",
              "type": "cases-comments",
            },
          ],
        }
      `);
    });

    it('builds a persistable state attachment user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: persistableStateAttachment,
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "comment": Object {
                "owner": "securitySolutionFixture",
                "persistableStateAttachmentState": Object {
                  "foo": "foo",
                },
                "persistableStateAttachmentTypeId": ".test",
                "type": "persistableState",
              },
            },
            "type": "comment",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "test-id",
              "name": "associated-cases-comments",
              "type": "cases-comments",
            },
          ],
        }
      `);
    });

    it('builds a description user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.description)!;
      const userAction = builder.build({
        payload: { description: 'test' },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "description": "test",
            },
            "type": "description",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a pushed user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.pushed)!;
      const userAction = builder.build({
        payload: { externalService },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
          "attributes": Object {
            "action": "push_to_service",
            "created_at": "2022-01-09T22:00:00.000Z",
            "created_by": Object {
              "email": "elastic@elastic.co",
              "full_name": "Elastic User",
              "username": "elastic",
            },
            "owner": "securitySolution",
            "payload": Object {
              "externalService": Object {
                "connector_name": "ServiceNow SN",
                "external_id": "external-id",
                "external_title": "SIR0010037",
                "external_url": "https://dev92273.service-now.com/nav_to.do?uri=sn_si_incident.do?sys_id=external-id",
                "pushed_at": "2021-02-03T17:41:26.108Z",
                "pushed_by": Object {
                  "email": "elastic@elastic.co",
                  "full_name": "Elastic",
                  "username": "elastic",
                },
              },
            },
            "type": "pushed",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "456",
              "name": "pushConnectorId",
              "type": "action",
            },
          ],
        }
      `);
    });

    it('builds a tags user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.tags)!;
      const userAction = builder.build({
        action: UserActionActions.add,
        payload: { tags: ['one', 'two'] },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
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
                "one",
                "two",
              ],
            },
            "type": "tags",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a status user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.status)!;
      const userAction = builder.build({
        payload: { status: CaseStatuses.open },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "status": "open",
            },
            "type": "status",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a severity user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.severity)!;
      const userAction = builder.build({
        payload: { severity: CaseSeverity.LOW },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "severity": "low",
            },
            "type": "severity",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds an assign user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.assignees)!;
      const userAction = builder.build({
        payload: { assignees: [{ uid: '1' }, { uid: '2' }] },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
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
                Object {
                  "uid": "2",
                },
              ],
            },
            "type": "assignees",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a settings user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.settings)!;
      const userAction = builder.build({
        payload: { settings: { syncAlerts: true } },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "settings": Object {
                "syncAlerts": true,
              },
            },
            "type": "settings",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a create case user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.create_case)!;
      const userAction = builder.build({
        payload: casePayload,
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
          "attributes": Object {
            "action": "create",
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
              "connector": Object {
                "fields": Object {
                  "category": "Denial of Service",
                  "destIp": true,
                  "malwareHash": true,
                  "malwareUrl": true,
                  "priority": "2",
                  "sourceIp": true,
                  "subcategory": "45",
                },
                "name": "ServiceNow SN",
                "type": ".servicenow-sir",
              },
              "description": "testing sir",
              "owner": "securitySolution",
              "settings": Object {
                "extractObservables": true,
                "syncAlerts": true,
              },
              "severity": "low",
              "status": "open",
              "tags": Array [
                "sir",
              ],
              "title": "Case SIR",
            },
            "type": "create_case",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
            Object {
              "id": "456",
              "name": "connectorId",
              "type": "action",
            },
          ],
        }
      `);
    });

    it('builds a delete case user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.delete_case)!;
      const userAction = builder.build({
        payload: {},
        connectorId: '456',
        ...commonArgs,
      });

      expect(userAction).toBeUndefined();
    });

    it('builds an add category user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.category)!;
      const userAction = builder.build({
        payload: { category: 'new' },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
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
              "category": "new",
            },
            "type": "category",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds a remove category user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.category)!;
      const userAction = builder.build({
        payload: { category: null },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
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
              "category": null,
            },
            "type": "category",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });

    it('builds an add observables user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.observables)!;
      const userAction = builder.build({
        payload: { observables: { count: 1, actionType: 'add' } },
        ...commonArgs,
      });

      expect(userAction!.parameters).toMatchInlineSnapshot(`
        Object {
          "attributes": Object {
            "action": "create",
            "created_at": "2022-01-09T22:00:00.000Z",
            "created_by": Object {
              "email": "elastic@elastic.co",
              "full_name": "Elastic User",
              "username": "elastic",
            },
            "owner": "securitySolution",
            "payload": Object {
              "observables": Object {
                "actionType": "add",
                "count": 1,
              },
            },
            "type": "observables",
          },
          "references": Array [
            Object {
              "id": "123",
              "name": "associated-cases",
              "type": "cases",
            },
          ],
        }
      `);
    });
  });

  describe('eventDetails', () => {
    it('builds a title user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.title)!;
      const userAction = builder.build({
        payload: { title: 'test' },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_title",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the title for case id: 123 - user action id: 123"`
      );
    });

    it('logs a connector user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.connector)!;
      const userAction = builder.build({
        payload: {
          connector: {
            id: '456',
            name: 'ServiceNow SN',
            type: ConnectorTypes.serviceNowSIR,
            fields: {
              category: 'Denial of Service',
              destIp: true,
              malwareHash: true,
              malwareUrl: true,
              priority: '2',
              sourceIp: true,
              subcategory: '45',
            },
          },
        },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_connector",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User changed the case connector to id: 456 for case id: 123 - user action id: 123"`
      );
    });

    it('logs a comment user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: {
            comment: 'a comment!',
            type: AttachmentType.user,
            owner: SECURITY_SOLUTION_OWNER,
          },
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_comment",
          "getMessage": [Function],
          "savedObjectId": "test-id",
          "savedObjectType": "cases-comments",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User changed comment id: test-id for case id: 123 - user action id: 123"`
      );
    });

    it('logs an external reference attachment (savedObject) user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.create,
        payload: {
          attachment: externalReferenceAttachmentSO,
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "create",
          "descriptiveAction": "case_user_action_create_comment",
          "getMessage": [Function],
          "savedObjectId": "test-id",
          "savedObjectType": "cases-comments",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User created comment id: test-id for case id: 123 - user action id: 123"`
      );
    });

    it('logs an external reference attachment (elasticSearchDoc) user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: externalReferenceAttachmentES,
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_comment",
          "getMessage": [Function],
          "savedObjectId": "test-id",
          "savedObjectType": "cases-comments",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User changed comment id: test-id for case id: 123 - user action id: 123"`
      );
    });

    it('logs a persistable state attachment user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.comment)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: {
          attachment: persistableStateAttachment,
        },
        savedObjectId: 'test-id',
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_comment",
          "getMessage": [Function],
          "savedObjectId": "test-id",
          "savedObjectType": "cases-comments",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User changed comment id: test-id for case id: 123 - user action id: 123"`
      );
    });

    it('logs a description user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.description)!;
      const userAction = builder.build({
        payload: { description: 'test' },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_description",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the description for case id: 123 - user action id: 123"`
      );
    });

    it('logs a pushed user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.pushed)!;
      const userAction = builder.build({
        payload: { externalService },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "push_to_service",
          "descriptiveAction": "case_user_action_pushed_case",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User pushed case id: 123 to an external service with connector id: 456 - user action id: 123"`
      );
    });

    it('logs a tags user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.tags)!;
      const userAction = builder.build({
        action: UserActionActions.add,
        payload: { tags: ['one', 'two'] },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "add",
          "descriptiveAction": "case_user_action_add_case_tags",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User added tags to case id: 123 - user action id: 123"`
      );
    });

    it('logs a tags change user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.tags)!;
      const userAction = builder.build({
        action: UserActionActions.update,
        payload: { tags: ['one', 'two'] },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_tags",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User changed tags for case id: 123 - user action id: 123"`
      );
    });

    it('logs a tags delete user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.tags)!;
      const userAction = builder.build({
        action: UserActionActions.delete,
        payload: { tags: ['one', 'two'] },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "delete",
          "descriptiveAction": "case_user_action_delete_case_tags",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User deleted tags in case id: 123 - user action id: 123"`
      );
    });

    it('logs a status user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.status)!;
      const userAction = builder.build({
        payload: { status: CaseStatuses.open },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_status",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the status for case id: 123 - user action id: 123"`
      );
    });

    it('logs a status user action with close reason when alerts are synced', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.status)!;
      const userAction = builder.build({
        payload: {
          status: CaseStatuses.closed,
          closeReason: 'false_positive',
          syncAlerts: true,
        },
        ...commonArgs,
      });

      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User closed case id: 123 and synced alerts with a close reason - user action id: 123"`
      );
      expect(userAction!.parameters.attributes.payload).toEqual({
        status: 'closed',
        closeReason: 'false_positive',
      });
    });

    it('logs a severity user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.severity)!;
      const userAction = builder.build({
        payload: { severity: CaseSeverity.LOW },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_severity",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the severity for case id: 123 - user action id: 123"`
      );
    });

    it('logs an assign user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.assignees)!;
      const userAction = builder.build({
        payload: { assignees: [{ uid: '1' }, { uid: '2' }] },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "add",
          "descriptiveAction": "case_user_action_add_case_assignees",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User assigned uids: [1,2] to case id: 123 - user action id: 123"`
      );
    });

    it('logs an unassign user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.assignees)!;
      const userAction = builder.build({
        payload: { assignees: [{ uid: '1' }, { uid: '2' }] },
        ...commonArgs,
        action: UserActionActions.delete,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "delete",
          "descriptiveAction": "case_user_action_delete_case_assignees",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User unassigned uids: [1,2] from case id: 123 - user action id: 123"`
      );
    });

    it('logs an assignee unknown action user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.assignees)!;
      const userAction = builder.build({
        payload: { assignees: [{ uid: '1' }, { uid: '2' }] },
        ...commonArgs,
        action: UserActionActions.create,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "create",
          "descriptiveAction": "case_user_action_create_case_assignees",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User changed uids: [1,2] for case id: 123 - user action id: 123"`
      );
    });

    it('logs a settings user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.settings)!;
      const userAction = builder.build({
        payload: { settings: { syncAlerts: true } },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_settings",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the settings for case id: 123 - user action id: 123"`
      );
    });

    it('logs a create case user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.create_case)!;
      const userAction = builder.build({
        payload: casePayload,
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "create",
          "descriptiveAction": "case_user_action_create_case",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User created case id: 123 - user action id: 123"`
      );
    });

    it('logs an add category user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.category)!;
      const userAction = builder.build({
        payload: { category: 'sci-fi' },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "update",
          "descriptiveAction": "case_user_action_update_case_category",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the category for case id: 123 - user action id: 123"`
      );
    });

    it('logs a remove category user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.category)!;
      const userAction = builder.build({
        payload: { category: null },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "delete",
          "descriptiveAction": "case_user_action_update_case_category",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User updated the category for case id: 123 - user action id: 123"`
      );
    });

    it('builds an update observables user action correctly', () => {
      const builder = builderFactory.getBuilder(UserActionTypes.observables)!;
      const userAction = builder.build({
        payload: { observables: { count: 1, actionType: 'update' } },
        ...commonArgs,
      });

      expect(userAction!.eventDetails).toMatchInlineSnapshot(`
        Object {
          "action": "create",
          "descriptiveAction": "case_user_action_observables",
          "getMessage": [Function],
          "savedObjectId": "123",
          "savedObjectType": "cases",
        }
      `);
      expect(userAction!.eventDetails.getMessage('123')).toMatchInlineSnapshot(
        `"User added observables to case id: 123 - user action id: 123"`
      );
    });
  });
});
