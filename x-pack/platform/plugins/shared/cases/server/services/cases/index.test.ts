/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * This test file references connector_id and connector.id. The connector_id is a field within the external_service
 * object. It holds the action connector's id that was used to push the case to the external service. The connector.id
 * field also holds an action connector's id. This id is the currently configured connector for the case. The next
 * time the case is pushed it will use this connector to push the case. The connector_id can be different from the
 * connector.id.
 */

import { omit, unset } from 'lodash';
import type { CaseAttributes, ExternalService, CaseConnector } from '../../../common/types/domain';
import { CaseSeverity, CaseStatuses } from '../../../common/types/domain';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_EXTENDED_FIELDS,
  CASE_EXTENDED_FIELDS_LABELS,
  CASE_SAVED_OBJECT,
  SECURITY_SOLUTION_OWNER,
} from '../../../common/constants';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type {
  SavedObject,
  SavedObjectReference,
  SavedObjectsBulkResponse,
  SavedObjectsCreateOptions,
  SavedObjectsFindResponse,
  SavedObjectsFindResult,
  SavedObjectsUpdateOptions,
  SavedObjectsUpdateResponse,
} from '@kbn/core/server';
import { ACTION_SAVED_OBJECT_TYPE } from '@kbn/actions-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';
import { CONNECTOR_ID_REFERENCE_NAME } from '../../common/constants';
import { getNoneCaseConnector } from '../../common/utils';
import { CasesService } from '.';
import { V2_NOOP_ACTIVITY_WRITER, V2_NOOP_WRITER } from '../../cases_analytics_v2';
import type { ESCaseConnectorWithId } from '../test_utils';
import {
  createESJiraConnector,
  createJiraConnector,
  createExternalService,
  createSavedObjectReferences,
  createCaseSavedObjectResponse,
  basicCaseFields,
  createSOFindResponse,
  createErrorSO,
} from '../test_utils';
import { AttachmentService } from '../attachments';
import type {
  CaseSavedObjectTransformed,
  CasePersistedAttributes,
  CaseTransformedAttributes,
} from '../../common/types/case';
import {
  CasePersistedSeverity,
  CasePersistedStatus,
  CaseTransformedAttributesRt,
} from '../../common/types/case';
import { transformSavedObjectToExternalModel } from './transform';
import type { ConfigType } from '../../config';

const createUpdateSOResponse = ({
  connector,
  externalService,
  severity,
  status,
}: {
  connector?: ESCaseConnectorWithId;
  externalService?: ExternalService | null;
  severity?: CasePersistedSeverity;
  status?: CasePersistedStatus;
} = {}): SavedObjectsUpdateResponse<CasePersistedAttributes> => {
  const references: SavedObjectReference[] = createSavedObjectReferences({
    connector,
    externalService,
  });

  let attributes: Partial<CasePersistedAttributes> = { total_alerts: -1, total_comments: -1 };

  if (connector) {
    const { id, ...restConnector } = connector;
    attributes = { ...attributes, connector: { ...restConnector } };
  }

  if (externalService) {
    const { connector_id: id, ...restService } = externalService;
    attributes = { ...attributes, external_service: { ...restService } };
  } else if (externalService === null) {
    attributes = { ...attributes, external_service: null };
  }

  attributes = {
    ...attributes,
    ...((severity || severity === 0) && { severity }),
    ...((status || status === 0) && { status }),
  };

  return {
    type: CASE_SAVED_OBJECT,
    id: '1',
    attributes,
    references,
  };
};

const createFindSO = (
  params: {
    connector?: ESCaseConnectorWithId;
    externalService?: ExternalService | null;
    overrides?: Partial<CasePersistedAttributes>;
    caseId?: string;
  } = {}
): SavedObjectsFindResult<CasePersistedAttributes> => ({
  ...createCaseSavedObjectResponse(params),
  score: 0,
});

const createCaseUpdateParams = ({
  connector,
  externalService,
  severity,
  status,
}: {
  connector?: CaseConnector;
  externalService?: ExternalService | null;
  severity?: CaseSeverity;
  status?: CaseStatuses;
}): Partial<CaseAttributes> => ({
  ...(connector && { connector }),
  ...(externalService && { external_service: externalService }),
  ...(severity && { severity }),
  ...(status && { status }),
});

const createCasePostParams = ({
  connector,
  externalService,
  severity,
  status,
}: {
  connector: CaseConnector;
  externalService?: ExternalService | null;
  severity?: CaseSeverity;
  status?: CaseStatuses;
}): CaseAttributes => ({
  ...basicCaseFields,
  connector,
  ...(severity ? { severity } : { severity: basicCaseFields.severity }),
  ...(status ? { status } : { status: basicCaseFields.status }),
  ...(externalService ? { external_service: externalService } : { external_service: null }),
});

const createCasePatchParams = ({
  connector,
  externalService,
}: {
  connector?: CaseConnector;
  externalService?: ExternalService | null;
} = {}): Partial<CaseAttributes> => ({
  ...basicCaseFields,
  connector,
  ...(externalService && { external_service: externalService }),
});

describe('CasesService', () => {
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const mockLogger = loggerMock.create();
  const attachmentService = new AttachmentService({
    log: mockLogger,
    unsecuredSavedObjectsClient,
    config: {} as ConfigType,
  });

  let service: CasesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CasesService({
      log: mockLogger,
      unsecuredSavedObjectsClient,
      attachmentService,
      // Tests don't exercise the analytics v2 path; the no-op writers
      // keep every hook a tight no-op.
      analyticsV2Writer: V2_NOOP_WRITER,
      analyticsV2ActivityWriter: V2_NOOP_ACTIVITY_WRITER,
    });
  });

  describe('execution', () => {
    describe('bulkCreateCases', () => {
      it('return cases with the SO errors correctly', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          // @ts-expect-error: SO client types are not correct
          saved_objects: [createCaseSavedObjectResponse(), createErrorSO('cases')],
        });

        const res = await service.bulkCreateCases({
          cases: [
            {
              ...createCasePostParams({
                connector: getNoneCaseConnector(),
                severity: CaseSeverity.MEDIUM,
              }),
              id: '1',
            },
          ],
        });

        expect(res).toMatchInlineSnapshot(`
          Object {
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "low",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
              Object {
                "error": Object {
                  "error": "error",
                  "message": "message",
                  "statusCode": 500,
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
            ],
          }
        `);
      });
    });
  });

  describe('transforms the external model to the Elasticsearch model', () => {
    describe('patch', () => {
      it('includes the passed in fields', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: {
            ...createCasePostParams({
              connector: createJiraConnector(),
              externalService: createExternalService(),
              severity: CaseSeverity.CRITICAL,
              status: CaseStatuses['in-progress'],
            }),
            total_alerts: 10,
            total_comments: 5,
          },
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const {
          connector: ignoreConnector,
          external_service: ignoreExternalService,
          ...restUpdateAttributes
        } = unsecuredSavedObjectsClient.update.mock.calls[0][2] as Partial<CasePersistedAttributes>;
        expect(restUpdateAttributes).toMatchInlineSnapshot(`
          Object {
            "assignees": Array [],
            "category": null,
            "closed_at": null,
            "closed_by": null,
            "created_at": "2019-11-25T21:54:48.952Z",
            "created_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
            "customFields": Array [],
            "description": "This is a brand new case of a bad meanie defacing data",
            "duration": null,
            "observables": Array [],
            "owner": "securitySolution",
            "settings": Object {
              "extractObservables": true,
              "syncAlerts": true,
            },
            "severity": 30,
            "status": 10,
            "tags": Array [
              "defacement",
            ],
            "title": "Super Bad Security Issue",
            "total_alerts": 10,
            "total_comments": 5,
            "total_observables": 0,
            "updated_at": "2019-11-25T21:54:48.952Z",
            "updated_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
          }
        `);
      });

      it('transforms the connector.fields to an array of key/value pairs', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCasePostParams({
            connector: createJiraConnector(),
            externalService: createExternalService(),
          }),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const { connector } = unsecuredSavedObjectsClient.update.mock
          .calls[0][2] as Partial<CasePersistedAttributes>;
        expect(connector?.fields).toMatchInlineSnapshot(`
          Array [
            Object {
              "key": "issueType",
              "value": "bug",
            },
            Object {
              "key": "priority",
              "value": "high",
            },
            Object {
              "key": "parent",
              "value": "2",
            },
          ]
        `);
      });

      it('preserves the connector fields but does not have the id', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCasePostParams({
            connector: createJiraConnector(),
            externalService: createExternalService(),
          }),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const { connector } = unsecuredSavedObjectsClient.update.mock
          .calls[0][2] as Partial<CasePersistedAttributes>;
        expect(connector).toMatchInlineSnapshot(`
          Object {
            "fields": Array [
              Object {
                "key": "issueType",
                "value": "bug",
              },
              Object {
                "key": "priority",
                "value": "high",
              },
              Object {
                "key": "parent",
                "value": "2",
              },
            ],
            "name": ".jira",
            "type": ".jira",
          }
        `);
      });

      it('removes the connector id and adds it to the references', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({ connector: createJiraConnector() }),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const updateAttributes = unsecuredSavedObjectsClient.update.mock
          .calls[0][2] as Partial<CasePersistedAttributes>;
        expect(updateAttributes.connector).not.toHaveProperty('id');

        const updateOptions = unsecuredSavedObjectsClient.update.mock
          .calls[0][3] as SavedObjectsUpdateOptions<unknown>;
        expect(updateOptions.references).toMatchInlineSnapshot(`
          Array [
            Object {
              "id": "1",
              "name": "connectorId",
              "type": "action",
            },
          ]
        `);
      });

      it('removes the external_service connector_id and adds it to the references', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCasePostParams({
            connector: getNoneCaseConnector(),
            externalService: createExternalService(),
          }),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const updateAttributes = unsecuredSavedObjectsClient.update.mock
          .calls[0][2] as Partial<CasePersistedAttributes>;
        expect(updateAttributes.external_service).not.toHaveProperty('connector_id');

        const updateOptions = unsecuredSavedObjectsClient.update.mock
          .calls[0][3] as SavedObjectsUpdateOptions<unknown>;
        expect(updateOptions.references).toMatchInlineSnapshot(`
          Array [
            Object {
              "id": "100",
              "name": "pushConnectorId",
              "type": "action",
            },
          ]
        `);
      });

      it('builds references for external service connector id, case connector id, and includes the existing references', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCasePostParams({
            connector: createJiraConnector(),
            externalService: createExternalService(),
          }),
          originalCase: {
            references: [{ id: 'a', name: 'awesome', type: 'hello' }],
          } as CaseSavedObjectTransformed,
        });

        const updateOptions = unsecuredSavedObjectsClient.update.mock
          .calls[0][3] as SavedObjectsUpdateOptions<unknown>;
        expect(updateOptions.references).toMatchInlineSnapshot(`
          Array [
            Object {
              "id": "a",
              "name": "awesome",
              "type": "hello",
            },
            Object {
              "id": "1",
              "name": "connectorId",
              "type": "action",
            },
            Object {
              "id": "100",
              "name": "pushConnectorId",
              "type": "action",
            },
          ]
        `);
      });

      it('builds references for connector_id and preserves the existing connector.id reference', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCasePatchParams({ externalService: createExternalService() }),
          originalCase: {
            references: [
              { id: '1', name: CONNECTOR_ID_REFERENCE_NAME, type: ACTION_SAVED_OBJECT_TYPE },
            ],
          } as CaseSavedObjectTransformed,
        });

        const updateOptions = unsecuredSavedObjectsClient.update.mock
          .calls[0][3] as SavedObjectsUpdateOptions<unknown>;
        expect(updateOptions.references).toMatchInlineSnapshot(`
          Array [
            Object {
              "id": "1",
              "name": "connectorId",
              "type": "action",
            },
            Object {
              "id": "100",
              "name": "pushConnectorId",
              "type": "action",
            },
          ]
        `);
      });

      it('preserves the external_service fields except for the connector_id', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCasePostParams({
            connector: getNoneCaseConnector(),
            externalService: createExternalService(),
          }),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const updateAttributes = unsecuredSavedObjectsClient.update.mock
          .calls[0][2] as Partial<CasePersistedAttributes>;
        expect(updateAttributes.external_service).toMatchInlineSnapshot(`
          Object {
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
          }
        `);
      });

      it('creates an empty updatedAttributes when there is no connector or external_service as input', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(unsecuredSavedObjectsClient.update.mock.calls[0][2]).toMatchInlineSnapshot(`
          Object {
            "total_observables": 0,
          }
        `);
        const updateOptions = unsecuredSavedObjectsClient.update.mock
          .calls[0][3] as SavedObjectsUpdateOptions<unknown>;
        expect(updateOptions.references).toBeUndefined();
      });

      it('creates a updatedAttributes field with the none connector', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({ connector: getNoneCaseConnector() }),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(unsecuredSavedObjectsClient.update.mock.calls[0][2]).toMatchInlineSnapshot(`
          Object {
            "connector": Object {
              "fields": Array [],
              "name": "none",
              "type": ".none",
            },
            "total_observables": 0,
          }
        `);
      });

      it.each([
        [CaseSeverity.LOW, CasePersistedSeverity.LOW],
        [CaseSeverity.MEDIUM, CasePersistedSeverity.MEDIUM],
        [CaseSeverity.HIGH, CasePersistedSeverity.HIGH],
        [CaseSeverity.CRITICAL, CasePersistedSeverity.CRITICAL],
      ])(
        'properly converts "%s" severity to corresponding ES value on updating SO',
        async (patchParamsSeverity, expectedSeverity) => {
          unsecuredSavedObjectsClient.update.mockResolvedValue(
            {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
          );

          await service.patchCase({
            caseId: '1',
            updatedAttributes: createCaseUpdateParams({ severity: patchParamsSeverity }),
            originalCase: {} as CaseSavedObjectTransformed,
          });

          const patchAttributes = unsecuredSavedObjectsClient.update.mock
            .calls[0][2] as CasePersistedAttributes;

          expect(patchAttributes.severity).toEqual(expectedSeverity);
        }
      );

      it.each([
        [CaseStatuses.open, CasePersistedStatus.OPEN],
        [CaseStatuses['in-progress'], CasePersistedStatus.IN_PROGRESS],
        [CaseStatuses.closed, CasePersistedStatus.CLOSED],
      ])(
        'properly converts "%s" status to corresponding ES value on updating SO',
        async (patchParamsStatus, expectedStatus) => {
          unsecuredSavedObjectsClient.update.mockResolvedValue(
            {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
          );

          await service.patchCase({
            caseId: '1',
            updatedAttributes: createCaseUpdateParams({ status: patchParamsStatus }),
            originalCase: {} as CaseSavedObjectTransformed,
          });

          const patchAttributes = unsecuredSavedObjectsClient.update.mock
            .calls[0][2] as CasePersistedAttributes;

          expect(patchAttributes.status).toEqual(expectedStatus);
        }
      );

      it('updates the total attachment stats', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        await service.patchCase({
          caseId: '1',
          updatedAttributes: {
            ...createCasePostParams({
              connector: createJiraConnector(),
              externalService: createExternalService(),
              severity: CaseSeverity.CRITICAL,
              status: CaseStatuses['in-progress'],
            }),
            total_alerts: 10,
            total_comments: 5,
          },
          originalCase: {} as CaseSavedObjectTransformed,
        });

        const patchAttributes = unsecuredSavedObjectsClient.update.mock
          .calls[0][2] as CasePersistedAttributes;

        expect(patchAttributes.total_alerts).toEqual(10);
        expect(patchAttributes.total_comments).toEqual(5);
      });
    });

    describe('bulkPatch', () => {
      it('properly converts severity to corresponding ES value on bulk updating SO', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
            createCaseSavedObjectResponse({ caseId: '3' }),
            createCaseSavedObjectResponse({ caseId: '4' }),
          ],
        });

        await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                severity: CaseSeverity.LOW,
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
            {
              caseId: '2',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                severity: CaseSeverity.MEDIUM,
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
            {
              caseId: '3',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                severity: CaseSeverity.HIGH,
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
            {
              caseId: '4',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                severity: CaseSeverity.CRITICAL,
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });

        const patchResults = unsecuredSavedObjectsClient.bulkUpdate.mock
          .calls[0][0] as unknown as Array<SavedObject<CasePersistedAttributes>>;

        expect(patchResults[0].attributes.severity).toEqual(CasePersistedSeverity.LOW);
        expect(patchResults[1].attributes.severity).toEqual(CasePersistedSeverity.MEDIUM);
        expect(patchResults[2].attributes.severity).toEqual(CasePersistedSeverity.HIGH);
        expect(patchResults[3].attributes.severity).toEqual(CasePersistedSeverity.CRITICAL);
      });

      it('properly converts status to corresponding ES value on bulk updating SO', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
            createCaseSavedObjectResponse({ caseId: '3' }),
          ],
        });

        await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                status: CaseStatuses.open,
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
            {
              caseId: '2',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                status: CaseStatuses['in-progress'],
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
            {
              caseId: '3',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
                status: CaseStatuses.closed,
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });

        const patchResults = unsecuredSavedObjectsClient.bulkUpdate.mock
          .calls[0][0] as unknown as Array<SavedObject<CasePersistedAttributes>>;

        expect(patchResults[0].attributes.status).toEqual(CasePersistedStatus.OPEN);
        expect(patchResults[1].attributes.status).toEqual(CasePersistedStatus.IN_PROGRESS);
        expect(patchResults[2].attributes.status).toEqual(CasePersistedStatus.CLOSED);
      });

      it('updates the total attachment stats', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
            createCaseSavedObjectResponse({ caseId: '3' }),
          ],
        });

        await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: {
                ...createCasePostParams({
                  connector: getNoneCaseConnector(),
                  status: CaseStatuses.open,
                }),
                total_alerts: 10,
                total_comments: 5,
              },
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });

        const patchResults = unsecuredSavedObjectsClient.bulkUpdate.mock
          .calls[0][0] as unknown as Array<SavedObject<CasePersistedAttributes>>;

        expect(patchResults[0].attributes.total_alerts).toEqual(10);
        expect(patchResults[0].attributes.total_comments).toEqual(5);
      });
    });

    describe('createCase', () => {
      it('creates a null external_service field when the attribute was null in the creation parameters', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({ connector: createJiraConnector() }),
          id: '1',
        });

        const postAttributes = unsecuredSavedObjectsClient.create.mock
          .calls[0][1] as CaseAttributes;
        expect(postAttributes.external_service).toMatchInlineSnapshot(`null`);
      });

      it('includes the creation attributes excluding the connector.id and connector_id', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({
            connector: createJiraConnector(),
            externalService: createExternalService(),
          }),
          id: '1',
        });

        const creationAttributes = unsecuredSavedObjectsClient.create.mock
          .calls[0][1] as CasePersistedAttributes;
        expect(creationAttributes.connector).not.toHaveProperty('id');
        expect(creationAttributes.external_service).not.toHaveProperty('connector_id');
        expect(creationAttributes).toMatchInlineSnapshot(`
          Object {
            "assignees": Array [],
            "category": null,
            "closed_at": null,
            "closed_by": null,
            "connector": Object {
              "fields": Array [
                Object {
                  "key": "issueType",
                  "value": "bug",
                },
                Object {
                  "key": "priority",
                  "value": "high",
                },
                Object {
                  "key": "parent",
                  "value": "2",
                },
              ],
              "name": ".jira",
              "type": ".jira",
            },
            "created_at": "2019-11-25T21:54:48.952Z",
            "created_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
            "customFields": Array [],
            "description": "This is a brand new case of a bad meanie defacing data",
            "duration": null,
            "external_service": Object {
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
            "observables": Array [],
            "owner": "securitySolution",
            "settings": Object {
              "extractObservables": true,
              "syncAlerts": true,
            },
            "severity": 0,
            "status": 0,
            "tags": Array [
              "defacement",
            ],
            "title": "Super Bad Security Issue",
            "total_alerts": 0,
            "total_comments": 0,
            "total_events": 0,
            "total_observables": 0,
            "updated_at": "2019-11-25T21:54:48.952Z",
            "updated_by": Object {
              "email": "testemail@elastic.co",
              "full_name": "elastic",
              "username": "elastic",
            },
          }
        `);
        expect(unsecuredSavedObjectsClient.create.mock.calls[0][2]).toMatchInlineSnapshot(`
          Object {
            "id": "1",
            "references": Array [
              Object {
                "id": "1",
                "name": "connectorId",
                "type": "action",
              },
              Object {
                "id": "100",
                "name": "pushConnectorId",
                "type": "action",
              },
            ],
            "refresh": undefined,
          }
        `);
      });

      it('includes default values for total_alerts and total_comments', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({
            connector: getNoneCaseConnector(),
          }),
          id: '1',
        });

        const postAttributes = unsecuredSavedObjectsClient.create.mock
          .calls[0][1] as CasePersistedAttributes;

        expect(postAttributes.total_alerts).toEqual(0);
        expect(postAttributes.total_comments).toEqual(0);
      });

      it('moves the connector.id and connector_id to the references', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({
            connector: createJiraConnector(),
            externalService: createExternalService(),
          }),
          id: '1',
        });

        const creationOptions = unsecuredSavedObjectsClient.create.mock
          .calls[0][2] as SavedObjectsCreateOptions;
        expect(creationOptions.references).toMatchInlineSnapshot(`
          Array [
            Object {
              "id": "1",
              "name": "connectorId",
              "type": "action",
            },
            Object {
              "id": "100",
              "name": "pushConnectorId",
              "type": "action",
            },
          ]
        `);
      });

      it('sets fields to an empty array when it is not included with the connector', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({
            connector: createJiraConnector({ setFieldsToNull: true }),
            externalService: createExternalService(),
          }),
          id: '1',
        });

        const postAttributes = unsecuredSavedObjectsClient.create.mock
          .calls[0][1] as CaseAttributes;
        expect(postAttributes.connector.fields).toEqual([]);
      });

      it('does not create a reference for a none connector', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({ connector: getNoneCaseConnector() }),
          id: '1',
        });

        const creationOptions = unsecuredSavedObjectsClient.create.mock
          .calls[0][2] as SavedObjectsCreateOptions;
        expect(creationOptions.references).toEqual([]);
      });

      it('does not create a reference for an external_service field that is null', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await service.createCase({
          attributes: createCasePostParams({ connector: getNoneCaseConnector() }),
          id: '1',
        });

        const creationOptions = unsecuredSavedObjectsClient.create.mock
          .calls[0][2] as SavedObjectsCreateOptions;
        expect(creationOptions.references).toEqual([]);
      });

      it.each([
        [CaseSeverity.LOW, CasePersistedSeverity.LOW],
        [CaseSeverity.MEDIUM, CasePersistedSeverity.MEDIUM],
        [CaseSeverity.HIGH, CasePersistedSeverity.HIGH],
        [CaseSeverity.CRITICAL, CasePersistedSeverity.CRITICAL],
      ])(
        'properly converts "%s" severity to corresponding ES value on creating SO',
        async (postParamsSeverity, expectedSeverity) => {
          unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

          await service.createCase({
            attributes: createCasePostParams({
              connector: getNoneCaseConnector(),
              severity: postParamsSeverity,
            }),
            id: '1',
          });

          const postAttributes = unsecuredSavedObjectsClient.create.mock
            .calls[0][1] as CasePersistedAttributes;
          expect(postAttributes.severity).toEqual(expectedSeverity);
        }
      );

      it.each([
        [CaseStatuses.open, CasePersistedStatus.OPEN],
        [CaseStatuses['in-progress'], CasePersistedStatus.IN_PROGRESS],
        [CaseStatuses.closed, CasePersistedStatus.CLOSED],
      ])(
        'properly converts "%s" status to corresponding ES value on creating SO',
        async (postParamsStatus, expectedStatus) => {
          unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

          await service.createCase({
            attributes: createCasePostParams({
              connector: getNoneCaseConnector(),
              status: postParamsStatus,
            }),
            id: '1',
          });

          const postAttributes = unsecuredSavedObjectsClient.create.mock
            .calls[0][1] as CasePersistedAttributes;
          expect(postAttributes.status).toEqual(expectedStatus);
        }
      );
    });

    describe('bulkCreateCases', () => {
      it('creates a null external_service field when the attribute was null in the creation parameters', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createCaseSavedObjectResponse()],
        });

        await service.bulkCreateCases({
          cases: [
            {
              ...createCasePostParams({
                connector: getNoneCaseConnector(),
                severity: CaseSeverity.MEDIUM,
              }),
              id: '1',
            },
          ],
        });

        const bulkCreateRequest = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0];

        expect(bulkCreateRequest).toMatchInlineSnapshot(`
          Array [
            Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": Array [],
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": null,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": true,
                    "syncAlerts": true,
                  },
                  "severity": 10,
                  "status": 0,
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_alerts": 0,
                  "total_comments": 0,
                  "total_events": 0,
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
            ],
            Object {
              "refresh": undefined,
            },
          ]
        `);
      });
    });

    it('includes default values for total_alerts and total_comments', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [createCaseSavedObjectResponse({})],
      });

      await service.bulkCreateCases({
        cases: [
          {
            ...createCasePostParams({ connector: getNoneCaseConnector() }),
            id: '1',
          },
        ],
      });

      const postAttributes = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0][0]
        .attributes as CasePersistedAttributes;

      expect(postAttributes.total_alerts).toEqual(0);
      expect(postAttributes.total_comments).toEqual(0);
    });
  });

  describe('transforms the Elasticsearch model to the external model', () => {
    describe('bulkPatch', () => {
      it('formats the update saved object by including the passed in fields and transforming the connector.fields', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              caseId: '1',
              connector: createESJiraConnector(),
              externalService: createExternalService(),
            }),
            createCaseSavedObjectResponse({
              caseId: '2',
              connector: createESJiraConnector({ id: '2' }),
              externalService: createExternalService({ connector_id: '200' }),
            }),
          ],
        });

        const res = await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({
                connector: createJiraConnector(),
                externalService: createExternalService(),
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });

        expect(res.saved_objects[0].attributes.connector).toMatchInlineSnapshot(`
          Object {
            "fields": Object {
              "issueType": "bug",
              "parent": "2",
              "priority": "high",
            },
            "id": "1",
            "name": ".jira",
            "type": ".jira",
          }
        `);
        expect(
          res.saved_objects[1].attributes.external_service?.connector_id
        ).toMatchInlineSnapshot(`"200"`);

        expect(res.saved_objects[1].attributes.connector).toMatchInlineSnapshot(`
                  Object {
                    "fields": Object {
                      "issueType": "bug",
                      "parent": "2",
                      "priority": "high",
                    },
                    "id": "2",
                    "name": ".jira",
                    "type": ".jira",
                  }
              `);
        expect(
          res.saved_objects[0].attributes.external_service?.connector_id
        ).toMatchInlineSnapshot(`"100"`);
      });

      it('properly converts the severity field to the corresponding external value in the bulkPatch response', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              caseId: '1',
              overrides: { severity: CasePersistedSeverity.LOW },
            }),
            createCaseSavedObjectResponse({
              caseId: '2',
              overrides: { severity: CasePersistedSeverity.MEDIUM },
            }),
            createCaseSavedObjectResponse({
              caseId: '3',
              overrides: { severity: CasePersistedSeverity.HIGH },
            }),
            createCaseSavedObjectResponse({
              caseId: '4',
              overrides: { severity: CasePersistedSeverity.CRITICAL },
            }),
          ],
        });

        const res = await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({ connector: getNoneCaseConnector() }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });
        expect(res.saved_objects[0].attributes.severity).toEqual(CaseSeverity.LOW);
        expect(res.saved_objects[1].attributes.severity).toEqual(CaseSeverity.MEDIUM);
        expect(res.saved_objects[2].attributes.severity).toEqual(CaseSeverity.HIGH);
        expect(res.saved_objects[3].attributes.severity).toEqual(CaseSeverity.CRITICAL);
      });

      it('properly converts the status field to the corresponding external value in the bulkPatch response', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              caseId: '1',
              overrides: { status: CasePersistedStatus.OPEN },
            }),
            createCaseSavedObjectResponse({
              caseId: '2',
              overrides: { status: CasePersistedStatus.IN_PROGRESS },
            }),
            createCaseSavedObjectResponse({
              caseId: '3',
              overrides: { status: CasePersistedStatus.CLOSED },
            }),
          ],
        });

        const res = await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({ connector: getNoneCaseConnector() }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });
        expect(res.saved_objects[0].attributes.status).toEqual(CaseStatuses.open);
        expect(res.saved_objects[1].attributes.status).toEqual(CaseStatuses['in-progress']);
        expect(res.saved_objects[2].attributes.status).toEqual(CaseStatuses.closed);
      });

      it('does not include total_alerts and total_comments fields in the response', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
            createCaseSavedObjectResponse({ caseId: '3' }),
          ],
        });

        const res = await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({ connector: getNoneCaseConnector() }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });

        expect(res.saved_objects[0].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[0].attributes).not.toHaveProperty('total_comments');
        expect(res.saved_objects[1].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[1].attributes).not.toHaveProperty('total_comments');
        expect(res.saved_objects[2].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[2].attributes).not.toHaveProperty('total_comments');
      });
    });

    describe('patch', () => {
      it('returns an object with a none connector and without a reference when it was set to a none connector in the update', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          createUpdateSOResponse({ connector: getNoneCaseConnector() })
        );

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes).toMatchInlineSnapshot(`
          Object {
            "connector": Object {
              "fields": null,
              "id": "none",
              "name": "none",
              "type": ".none",
            },
          }
        `);
        expect(res.references).toMatchInlineSnapshot(`Array []`);
      });

      it('returns an object with a null external service and without a reference when it was set to null in the update', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          createUpdateSOResponse({ externalService: null })
        );

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes).toMatchInlineSnapshot(`
          Object {
            "external_service": null,
          }
        `);
        expect(res.references).toMatchInlineSnapshot(`Array []`);
      });

      it('returns an empty object when neither the connector or external service was updated', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(createUpdateSOResponse());

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes).toMatchInlineSnapshot(`Object {}`);
        expect(res.references).toMatchInlineSnapshot(`Array []`);
      });

      it('returns an undefined connector if it is not returned by the update', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res).toMatchInlineSnapshot(`
          Object {
            "attributes": Object {
              "total_events": -1,
            },
          }
        `);
      });

      it('returns the default none connector when it cannot find the reference', async () => {
        const { name, type, fields } = createESJiraConnector();
        const returnValue: SavedObjectsUpdateResponse<CasePersistedAttributes> = {
          type: CASE_SAVED_OBJECT,
          id: '1',
          attributes: {
            connector: {
              name,
              type,
              fields,
            },
          },
          version: '1',
          references: undefined,
        };

        unsecuredSavedObjectsClient.update.mockResolvedValue(returnValue);

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes.connector).toMatchInlineSnapshot(`
            Object {
              "fields": null,
              "id": "none",
              "name": "none",
              "type": ".none",
            }
          `);
      });

      it('returns none external service connector when it cannot find the reference', async () => {
        const { connector_id: id, ...restExternalConnector } = createExternalService()!;
        const returnValue: SavedObjectsUpdateResponse<CasePersistedAttributes> = {
          type: CASE_SAVED_OBJECT,
          id: '1',
          attributes: {
            external_service: restExternalConnector,
          },
          version: '1',
          references: undefined,
        };

        unsecuredSavedObjectsClient.update.mockResolvedValue(returnValue);

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes.external_service?.connector_id).toBe('none');
      });

      it('returns the saved object fields when it cannot find the reference for connector_id', async () => {
        const { connector_id: id, ...restExternalConnector } = createExternalService()!;
        const returnValue: SavedObjectsUpdateResponse<CasePersistedAttributes> = {
          type: CASE_SAVED_OBJECT,
          id: '1',
          attributes: {
            external_service: restExternalConnector,
          },
          version: '1',
          references: undefined,
        };

        unsecuredSavedObjectsClient.update.mockResolvedValue(returnValue);

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res).toMatchInlineSnapshot(`
          Object {
            "attributes": Object {
              "external_service": Object {
                "connector_id": "none",
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
            "id": "1",
            "references": undefined,
            "type": "cases",
            "version": "1",
          }
        `);
      });

      it('returns the connector.id after finding the reference', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          createUpdateSOResponse({ connector: createESJiraConnector() })
        );

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes.connector).toMatchInlineSnapshot(`
            Object {
              "fields": Object {
                "issueType": "bug",
                "parent": "2",
                "priority": "high",
              },
              "id": "1",
              "name": ".jira",
              "type": ".jira",
            }
          `);
        expect(res.attributes.connector?.id).toMatchInlineSnapshot(`"1"`);
      });

      it('returns the external_service connector_id after finding the reference', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          createUpdateSOResponse({ externalService: createExternalService() })
        );

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes.external_service).toMatchInlineSnapshot(`
            Object {
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
            }
          `);
        expect(res.attributes.external_service?.connector_id).toMatchInlineSnapshot(`"100"`);
      });

      it.each([
        [CasePersistedSeverity.LOW, CaseSeverity.LOW],
        [CasePersistedSeverity.MEDIUM, CaseSeverity.MEDIUM],
        [CasePersistedSeverity.HIGH, CaseSeverity.HIGH],
        [CasePersistedSeverity.CRITICAL, CaseSeverity.CRITICAL],
      ])(
        'properly converts "%s" severity to corresponding external value in the patch response',
        async (internalSeverityValue, expectedSeverity) => {
          unsecuredSavedObjectsClient.update.mockResolvedValue(
            createUpdateSOResponse({ severity: internalSeverityValue })
          );

          const res = await service.patchCase({
            caseId: '1',
            updatedAttributes: createCaseUpdateParams({}),
            originalCase: {} as CaseSavedObjectTransformed,
          });

          expect(res.attributes.severity).toEqual(expectedSeverity);
        }
      );

      it.each([
        [CasePersistedStatus.OPEN, CaseStatuses.open],
        [CasePersistedStatus.IN_PROGRESS, CaseStatuses['in-progress']],
        [CasePersistedStatus.CLOSED, CaseStatuses.closed],
      ])(
        'properly converts "%s" status to corresponding external value in the patch response',
        async (internalStatusValue, expectedStatus) => {
          unsecuredSavedObjectsClient.update.mockResolvedValue(
            createUpdateSOResponse({ status: internalStatusValue })
          );

          const res = await service.patchCase({
            caseId: '1',
            updatedAttributes: createCaseUpdateParams({}),
            originalCase: {} as CaseSavedObjectTransformed,
          });

          expect(res.attributes.status).toEqual(expectedStatus);
        }
      );

      it('does not include total_alerts and total_comments fields in the response', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(createUpdateSOResponse({}));

        const res = await service.patchCase({
          caseId: '1',
          updatedAttributes: createCaseUpdateParams({}),
          originalCase: {} as CaseSavedObjectTransformed,
        });

        expect(res.attributes).not.toHaveProperty('total_alerts');
        expect(res.attributes).not.toHaveProperty('total_comments');
      });
    });

    describe('createCase', () => {
      it('includes the connector.id and connector_id fields in the response', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(
          createCaseSavedObjectResponse({
            connector: createESJiraConnector(),
            externalService: createExternalService(),
          })
        );

        const res = await service.createCase({
          attributes: createCasePostParams({ connector: getNoneCaseConnector() }),
          id: '1',
        });

        expect(res.attributes.connector.id).toMatchInlineSnapshot(`"1"`);
        expect(res.attributes.external_service?.connector_id).toMatchInlineSnapshot(`"100"`);
      });

      it.each([
        [CasePersistedSeverity.LOW, CaseSeverity.LOW],
        [CasePersistedSeverity.MEDIUM, CaseSeverity.MEDIUM],
        [CasePersistedSeverity.HIGH, CaseSeverity.HIGH],
        [CasePersistedSeverity.CRITICAL, CaseSeverity.CRITICAL],
      ])(
        'properly converts "%s" severity to corresponding external value in the post response',
        async (internalSeverityValue, expectedSeverity) => {
          unsecuredSavedObjectsClient.create.mockResolvedValue(
            createCaseSavedObjectResponse({ overrides: { severity: internalSeverityValue } })
          );

          const res = await service.createCase({
            attributes: createCasePostParams({ connector: getNoneCaseConnector() }),
            id: '1',
          });

          expect(res.attributes.severity).toEqual(expectedSeverity);
        }
      );

      it.each([
        [CasePersistedStatus.OPEN, CaseStatuses.open],
        [CasePersistedStatus.IN_PROGRESS, CaseStatuses['in-progress']],
        [CasePersistedStatus.CLOSED, CaseStatuses.closed],
      ])(
        'properly converts "%s" status to corresponding external value in the post response',
        async (internalStatusValue, expectedStatus) => {
          unsecuredSavedObjectsClient.create.mockResolvedValue(
            createCaseSavedObjectResponse({ overrides: { status: internalStatusValue } })
          );

          const res = await service.createCase({
            attributes: createCasePostParams({ connector: getNoneCaseConnector() }),
            id: '1',
          });

          expect(res.attributes.status).toEqual(expectedStatus);
        }
      );

      it('does not include total_alerts and total_comments fields in the response', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse({}));

        const res = await service.createCase({
          attributes: createCasePostParams({ connector: getNoneCaseConnector() }),
          id: '1',
        });

        expect(res.attributes).not.toHaveProperty('total_alerts');
        expect(res.attributes).not.toHaveProperty('total_comments');
      });
    });

    describe('bulkCreateCases', () => {
      it('includes the connector.id and connector_id fields in the response', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              overrides: { severity: CasePersistedSeverity.MEDIUM },
            }),
          ],
        });

        const res = await service.bulkCreateCases({
          cases: [
            {
              ...createCasePostParams({ connector: getNoneCaseConnector() }),
              id: '1',
            },
          ],
        });

        expect(res).toMatchInlineSnapshot(`
          Object {
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "medium",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
            ],
          }
        `);
      });

      it('does not include total_alerts and total_comments fields in the response', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createCaseSavedObjectResponse({})],
        });

        const res = await service.bulkCreateCases({
          cases: [
            {
              ...createCasePostParams({ connector: getNoneCaseConnector() }),
              id: '1',
            },
          ],
        });

        const theCase = res.saved_objects[0] as SavedObject<CaseTransformedAttributes>;

        expect(theCase.attributes).not.toHaveProperty('total_alerts');
        expect(theCase.attributes).not.toHaveProperty('total_comments');
      });
    });

    describe('find', () => {
      it('includes the connector.id and connector_id field in the response', async () => {
        const findMockReturn = createSOFindResponse([
          createFindSO({
            caseId: '1',
            connector: createESJiraConnector(),
            externalService: createExternalService(),
          }),
          createFindSO({
            caseId: '2',
          }),
        ]);
        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        const res = await service.findCases();
        expect(res.saved_objects[0].attributes.connector.id).toMatchInlineSnapshot(`"1"`);
        expect(
          res.saved_objects[0].attributes.external_service?.connector_id
        ).toMatchInlineSnapshot(`"100"`);
      });

      it('includes the saved object find response fields in the result', async () => {
        const findMockReturn = createSOFindResponse([
          createFindSO({
            caseId: '1',
            connector: createESJiraConnector(),
            externalService: createExternalService(),
          }),
          createFindSO({ caseId: '2' }),
        ]);
        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        const res = await service.findCases();
        const { saved_objects: ignored, ...findResponseFields } = res;
        expect(findResponseFields).toMatchInlineSnapshot(`
          Object {
            "page": 1,
            "per_page": 2,
            "total": 2,
          }
        `);
      });

      it.each([
        [CasePersistedSeverity.LOW, CaseSeverity.LOW],
        [CasePersistedSeverity.MEDIUM, CaseSeverity.MEDIUM],
        [CasePersistedSeverity.HIGH, CaseSeverity.HIGH],
        [CasePersistedSeverity.CRITICAL, CaseSeverity.CRITICAL],
      ])(
        'includes the properly converted "%s" severity field in the result',
        async (severity, expectedSeverity) => {
          const findMockReturn = createSOFindResponse([
            createFindSO({ caseId: '1', overrides: { severity } }),
            createFindSO({ caseId: '2' }),
          ]);
          unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

          const res = await service.findCases();
          expect(res.saved_objects[0].attributes.severity).toEqual(expectedSeverity);
        }
      );

      it.each([
        [CasePersistedStatus.OPEN, CaseStatuses.open],
        [CasePersistedStatus.IN_PROGRESS, CaseStatuses['in-progress']],
        [CasePersistedStatus.CLOSED, CaseStatuses.closed],
      ])(
        'includes the properly converted "%s" status field in the result',
        async (status, expectedStatus) => {
          const findMockReturn = createSOFindResponse([
            createFindSO({ caseId: '1', overrides: { status } }),
            createFindSO({ caseId: '2' }),
          ]);
          unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

          const res = await service.findCases();
          expect(res.saved_objects[0].attributes.status).toEqual(expectedStatus);
        }
      );

      it('does not include total_alerts and total_comments fields in the response', async () => {
        const findMockReturn = createSOFindResponse([
          createFindSO({ caseId: '1' }),
          createFindSO({ caseId: '2' }),
        ]);
        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        const res = await service.findCases();

        expect(res.saved_objects[0].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[0].attributes).not.toHaveProperty('total_comments');
      });
    });

    describe('bulkGet', () => {
      it('includes the connector.id and connector_id fields in the response', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              caseId: '1',
              connector: createESJiraConnector(),
              externalService: createExternalService(),
            }),
            createCaseSavedObjectResponse({
              caseId: '2',
              connector: createESJiraConnector({ id: '2' }),
              externalService: createExternalService({ connector_id: '200' }),
            }),
          ],
        });

        const res = (await service.getCases({
          caseIds: ['a'],
        })) as SavedObjectsBulkResponse<CaseTransformedAttributes>;

        expect(res.saved_objects[0].attributes.connector.id).toMatchInlineSnapshot(`"1"`);
        expect(
          res.saved_objects[1].attributes.external_service?.connector_id
        ).toMatchInlineSnapshot(`"200"`);

        expect(res.saved_objects[1].attributes.connector.id).toMatchInlineSnapshot(`"2"`);
        expect(
          res.saved_objects[1].attributes.external_service?.connector_id
        ).toMatchInlineSnapshot(`"200"`);
      });

      it('includes all severity values properly converted in the response', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              caseId: '1',
              overrides: { severity: CasePersistedSeverity.LOW },
            }),
            createCaseSavedObjectResponse({
              caseId: '2',
              overrides: { severity: CasePersistedSeverity.MEDIUM },
            }),
            createCaseSavedObjectResponse({
              caseId: '3',
              overrides: { severity: CasePersistedSeverity.HIGH },
            }),
            createCaseSavedObjectResponse({
              caseId: '4',
              overrides: { severity: CasePersistedSeverity.CRITICAL },
            }),
          ],
        });

        const res = (await service.getCases({
          caseIds: ['a'],
        })) as SavedObjectsBulkResponse<CaseTransformedAttributes>;

        expect(res.saved_objects[0].attributes.severity).toEqual(CaseSeverity.LOW);
        expect(res.saved_objects[1].attributes.severity).toEqual(CaseSeverity.MEDIUM);
        expect(res.saved_objects[2].attributes.severity).toEqual(CaseSeverity.HIGH);
        expect(res.saved_objects[3].attributes.severity).toEqual(CaseSeverity.CRITICAL);
      });

      it('includes all status values properly converted in the response', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({
              caseId: '1',
              overrides: { status: CasePersistedStatus.OPEN },
            }),
            createCaseSavedObjectResponse({
              caseId: '2',
              overrides: { status: CasePersistedStatus.IN_PROGRESS },
            }),
            createCaseSavedObjectResponse({
              caseId: '3',
              overrides: { status: CasePersistedStatus.CLOSED },
            }),
          ],
        });

        const res = (await service.getCases({
          caseIds: ['a'],
        })) as SavedObjectsBulkResponse<CaseTransformedAttributes>;

        expect(res.saved_objects[0].attributes.status).toEqual(CaseStatuses.open);
        expect(res.saved_objects[1].attributes.status).toEqual(CaseStatuses['in-progress']);
        expect(res.saved_objects[2].attributes.status).toEqual(CaseStatuses.closed);
      });

      it('does not include total_alerts and total_comments fields in the response', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
            createCaseSavedObjectResponse({ caseId: '3' }),
          ],
        });

        const res = (await service.getCases({
          caseIds: ['a'],
        })) as SavedObjectsBulkResponse<CaseTransformedAttributes>;

        expect(res.saved_objects[0].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[0].attributes).not.toHaveProperty('total_comments');
        expect(res.saved_objects[1].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[1].attributes).not.toHaveProperty('total_comments');
        expect(res.saved_objects[2].attributes).not.toHaveProperty('total_alerts');
        expect(res.saved_objects[2].attributes).not.toHaveProperty('total_comments');
      });
    });

    describe('get', () => {
      it('includes the connector.id and connector_id fields in the response', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue(
          createCaseSavedObjectResponse({
            connector: createESJiraConnector(),
            externalService: createExternalService(),
          })
        );

        const res = await service.getCase({ id: 'a' });

        expect(res.attributes.connector.id).toMatchInlineSnapshot(`"1"`);
        expect(res.attributes.external_service?.connector_id).toMatchInlineSnapshot(`"100"`);
      });

      it('defaults to the none connector when the connector reference cannot be found', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue(
          createCaseSavedObjectResponse({ externalService: createExternalService() })
        );
        const res = await service.getCase({ id: 'a' });

        expect(res.attributes.connector).toMatchInlineSnapshot(`
          Object {
            "fields": null,
            "id": "none",
            "name": "none",
            "type": ".none",
          }
        `);
      });

      it('sets external services connector_id to null when the connector id cannot be found in the references', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue(createCaseSavedObjectResponse());
        const res = await service.getCase({ id: 'a' });

        expect(res.attributes.external_service?.connector_id).toMatchInlineSnapshot(`"none"`);
      });

      it('includes the external services fields when the connector id cannot be found in the references', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue(createCaseSavedObjectResponse());
        const res = await service.getCase({ id: 'a' });

        expect(res.attributes.external_service).toMatchInlineSnapshot(`
          Object {
            "connector_id": "none",
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
          }
        `);
      });

      it('defaults to the none connector and null external_services when attributes is undefined', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue({
          ...createCaseSavedObjectResponse(),
          attributes: {
            ...createCaseSavedObjectResponse().attributes,
            external_service: undefined,
            connector: undefined,
          },
          references: [
            {
              id: '1',
              name: CONNECTOR_ID_REFERENCE_NAME,
              type: ACTION_SAVED_OBJECT_TYPE,
            },
          ],
        } as unknown as SavedObject<CasePersistedAttributes>);
        const res = await service.getCase({ id: 'a' });

        expect(res.attributes.connector).toMatchInlineSnapshot(`
          Object {
            "fields": null,
            "id": "none",
            "name": "none",
            "type": ".none",
          }
        `);

        expect(res.attributes.external_service).toMatchInlineSnapshot(`null`);
      });

      it('returns a null external_services when it is already null', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue({
          ...createCaseSavedObjectResponse(),
          attributes: { ...createCaseSavedObjectResponse().attributes, external_service: null },
        });
        const res = await service.getCase({ id: 'a' });

        expect(res.attributes.connector).toMatchInlineSnapshot(`
          Object {
            "fields": null,
            "id": "none",
            "name": "none",
            "type": ".none",
          }
        `);

        expect(res.attributes.external_service).toMatchInlineSnapshot(`null`);
      });

      it.each([
        [CasePersistedSeverity.LOW, CaseSeverity.LOW],
        [CasePersistedSeverity.MEDIUM, CaseSeverity.MEDIUM],
        [CasePersistedSeverity.HIGH, CaseSeverity.HIGH],
        [CasePersistedSeverity.CRITICAL, CaseSeverity.CRITICAL],
      ])(
        'includes the properly converted "%s" severity field in the result',
        async (internalSeverityValue, expectedSeverity) => {
          unsecuredSavedObjectsClient.get.mockResolvedValue({
            ...createCaseSavedObjectResponse(),
            attributes: {
              ...createCaseSavedObjectResponse().attributes,
              severity: internalSeverityValue,
            },
          } as SavedObject<CasePersistedAttributes>);

          const res = await service.getCase({ id: 'a' });

          expect(res.attributes.severity).toEqual(expectedSeverity);
        }
      );

      it.each([
        [CasePersistedStatus.OPEN, CaseStatuses.open],
        [CasePersistedStatus.IN_PROGRESS, CaseStatuses['in-progress']],
        [CasePersistedStatus.CLOSED, CaseStatuses.closed],
      ])(
        'includes the properly converted "%s" status field in the result',
        async (internalStatusValue, expectedStatus) => {
          unsecuredSavedObjectsClient.get.mockResolvedValue({
            ...createCaseSavedObjectResponse(),
            attributes: {
              ...createCaseSavedObjectResponse().attributes,
              status: internalStatusValue,
            },
          } as SavedObject<CasePersistedAttributes>);

          const res = await service.getCase({ id: 'a' });

          expect(res.attributes.status).toEqual(expectedStatus);
        }
      );

      it('does not include total_alerts and total_comments fields in the response', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue({
          ...createCaseSavedObjectResponse(),
          attributes: {
            ...createCaseSavedObjectResponse().attributes,
            total_alerts: -1,
            total_comments: -1,
          },
        } as unknown as SavedObject<CasePersistedAttributes>);

        const res = await service.getCase({ id: 'a' });
        expect(res.attributes).not.toHaveProperty('total_alerts');
        expect(res.attributes).not.toHaveProperty('total_comments');
      });
    });
  });

  describe('executeAggregations', () => {
    const aggregationBuilders = [
      {
        build: () => ({
          myAggregation: { avg: { field: 'avg-field' } },
        }),
        getName: () => 'avg-test-builder',
        formatResponse: () => {},
      },
      {
        build: () => ({
          myAggregation: { min: { field: 'min-field' } },
        }),
        getName: () => 'min-test-builder',
        formatResponse: () => {},
      },
    ];

    it('returns an aggregation correctly', async () => {
      unsecuredSavedObjectsClient.find.mockResolvedValue({
        saved_objects: [],
        total: 0,
        page: 1,
        per_page: 1,
        aggregations: { myAggregation: { value: 0 } },
      } as SavedObjectsFindResponse<CasePersistedAttributes>);

      const res = await service.executeAggregations({ aggregationBuilders });
      expect(res).toEqual({ myAggregation: { value: 0 } });
    });

    it('calls find correctly', async () => {
      unsecuredSavedObjectsClient.find.mockResolvedValue({
        saved_objects: [],
        total: 0,
        page: 1,
        per_page: 1,
        aggregations: { myAggregation: { value: 0 } },
      } as SavedObjectsFindResponse<CasePersistedAttributes>);

      await service.executeAggregations({ aggregationBuilders, options: { perPage: 20 } });
      expect(unsecuredSavedObjectsClient.find.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "aggs": Object {
            "myAggregation": Object {
              "min": Object {
                "field": "min-field",
              },
            },
          },
          "perPage": 20,
          "sortField": "created_at",
          "type": "cases",
        }
      `);
    });

    it('throws an error correctly', async () => {
      expect.assertions(1);
      unsecuredSavedObjectsClient.find.mockRejectedValue(new Error('Aggregation error'));

      await expect(service.executeAggregations({ aggregationBuilders })).rejects.toThrow(
        'Failed to execute aggregations [avg-test-builder,min-test-builder]: Error: Aggregation error'
      );
    });
  });

  describe('Decoding responses', () => {
    const caseTransformedAttributesProps = CaseTransformedAttributesRt.types.reduce(
      (acc, type) => ({ ...acc, ...type.type.props }),
      {}
    );

    /**
     * The following fields are set to a default value if missing:
     * - status
     * - severity
     * - connector
     * - external_service
     * - category
     * - settings
     *
     * The following fields can be undefined:
     * - total_alerts
     * - total_comments
     * - incremental_id
     */
    const attributesToValidateIfMissing = omit(
      caseTransformedAttributesProps,
      'status',
      'severity',
      'connector',
      'external_service',
      'category',
      'customFields',
      'observables',
      'total_observables',
      'settings',
      'incremental_id',
      'settings',
      'total_alerts',
      'total_comments',
      'in_progress_at',
      'time_to_acknowledge',
      'time_to_resolve',
      'time_to_investigate',
      'template',
      CASE_EXTENDED_FIELDS,
      CASE_EXTENDED_FIELDS_LABELS
    );

    describe('getCaseIdsByAlertId', () => {
      it('strips excess fields', async () => {
        const findMockReturn = createSOFindResponse([createFindSO({ caseId: '2' })]);
        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        const res = await service.getCaseIdsByAlertId({ alertId: '1' });
        expect(res).toStrictEqual({
          saved_objects: [
            {
              id: '2',
              score: 0,
              references: [],
              type: CASE_SAVED_OBJECT,
              attributes: { owner: SECURITY_SOLUTION_OWNER },
            },
          ],
          total: 1,
          per_page: 1,
          page: 1,
        });
      });

      it('throws an error when the owner field is not present', async () => {
        const findMockReturn = createSOFindResponse([createFindSO({ caseId: '2' })]);
        unset(findMockReturn, 'saved_objects[0].attributes.owner');
        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        await expect(
          service.getCaseIdsByAlertId({ alertId: '1' })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"owner\\""`
        );
      });

      it('does not throw an error when the owner field exists', async () => {
        const findMockReturn = createSOFindResponse([createFindSO({ caseId: '2' })]);
        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        await expect(service.getCaseIdsByAlertId({ alertId: '1' })).resolves.not.toThrow();
      });

      describe('unified attachments', () => {
        const buildAggsResponse = (caseIds: string[]) => ({
          ...createSOFindResponse([]),
          aggregations: {
            references: {
              doc_count: caseIds.length,
              caseIds: { buckets: caseIds.map((key) => ({ key })) },
            },
          },
        });

        it('does not query cases-attachments when the unified attachments flag is off', async () => {
          jest
            .spyOn(attachmentService, 'isUnifiedAttachmentsEnabled', 'get')
            .mockReturnValue(false);

          unsecuredSavedObjectsClient.find.mockResolvedValueOnce(buildAggsResponse(['legacy-1']));

          const res = await service.getCaseIdsByAlertId({ alertId: '1' });

          expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledTimes(1);
          expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'cases-comments' })
          );
          expect(CasesService.getCaseIDsFromAlertAggs(res)).toEqual(['legacy-1']);
        });

        it('runs an additional cases-attachments find when the flag is on and merges deduped case ids', async () => {
          jest.spyOn(attachmentService, 'isUnifiedAttachmentsEnabled', 'get').mockReturnValue(true);

          unsecuredSavedObjectsClient.find
            .mockResolvedValueOnce(buildAggsResponse(['shared-case', 'legacy-only']))
            .mockResolvedValueOnce(buildAggsResponse(['shared-case', 'unified-only']));

          const res = await service.getCaseIdsByAlertId({
            alertId: 'alert-1',
            unifiedFilter: undefined,
          });

          expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledTimes(2);
          expect(unsecuredSavedObjectsClient.find).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ type: 'cases-comments' })
          );
          expect(unsecuredSavedObjectsClient.find).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ type: 'cases-attachments' })
          );

          expect(CasesService.getCaseIDsFromAlertAggs(res)).toEqual([
            'shared-case',
            'legacy-only',
            'unified-only',
          ]);
        });
      });
    });

    describe('getCase', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue(createCaseSavedObjectResponse());

        await expect(service.getCase({ id: 'a' })).resolves.not.toThrow();
      });

      it.each(Object.keys(attributesToValidateIfMissing))(
        'throws if %s is omitted',
        async (key) => {
          const theCase = createCaseSavedObjectResponse();
          const attributes = omit({ ...theCase.attributes }, key);
          unsecuredSavedObjectsClient.get.mockResolvedValue({ ...theCase, attributes });

          await expect(service.getCase({ id: 'a' })).rejects.toThrow(
            `Invalid value "undefined" supplied to "${key}"`
          );
        }
      );

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse({
          connector: createESJiraConnector(),
          externalService: null,
        });
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        unsecuredSavedObjectsClient.get.mockResolvedValue({ ...theCase, attributes });

        await expect(service.getCase({ id: 'a' })).resolves.toMatchInlineSnapshot(`
          Object {
            "attributes": Object {
              "assignees": Array [],
              "category": null,
              "closed_at": null,
              "closed_by": null,
              "connector": Object {
                "fields": Object {
                  "issueType": "bug",
                  "parent": "2",
                  "priority": "high",
                },
                "id": "1",
                "name": ".jira",
                "type": ".jira",
              },
              "created_at": "2019-11-25T21:54:48.952Z",
              "created_by": Object {
                "email": "testemail@elastic.co",
                "full_name": "elastic",
                "username": "elastic",
              },
              "customFields": Array [],
              "description": "This is a brand new case of a bad meanie defacing data",
              "duration": null,
              "external_service": null,
              "incremental_id": undefined,
              "observables": Array [],
              "owner": "securitySolution",
              "settings": Object {
                "extractObservables": false,
                "syncAlerts": true,
              },
              "severity": "low",
              "status": "open",
              "tags": Array [
                "defacement",
              ],
              "title": "Super Bad Security Issue",
              "total_observables": 0,
              "updated_at": "2019-11-25T21:54:48.952Z",
              "updated_by": Object {
                "email": "testemail@elastic.co",
                "full_name": "elastic",
                "username": "elastic",
              },
            },
            "id": "1",
            "references": Array [
              Object {
                "id": "1",
                "name": "connectorId",
                "type": "action",
              },
            ],
            "type": "cases",
          }
        `);
      });
    });

    describe('getResolveCase', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.resolve.mockResolvedValue({
          saved_object: createCaseSavedObjectResponse(),
          outcome: 'exactMatch',
        });

        await expect(service.getResolveCase({ id: 'a' })).resolves.not.toThrow();
      });

      it.each(Object.keys(attributesToValidateIfMissing))(
        'throws if %s is omitted',
        async (key) => {
          const theCase = createCaseSavedObjectResponse();
          const attributes = omit({ ...theCase.attributes }, key);
          unsecuredSavedObjectsClient.resolve.mockResolvedValue({
            saved_object: { ...theCase, attributes },
            outcome: 'exactMatch',
          });

          await expect(service.getResolveCase({ id: 'a' })).rejects.toThrow(
            `Invalid value "undefined" supplied to "${key}"`
          );
        }
      );

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse();
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        unsecuredSavedObjectsClient.resolve.mockResolvedValue({
          saved_object: { ...theCase, attributes },
          outcome: 'exactMatch',
        });

        await expect(service.getResolveCase({ id: 'a' })).resolves.toMatchInlineSnapshot(`
          Object {
            "outcome": "exactMatch",
            "saved_object": Object {
              "attributes": Object {
                "assignees": Array [],
                "category": null,
                "closed_at": null,
                "closed_by": null,
                "connector": Object {
                  "fields": null,
                  "id": "none",
                  "name": "none",
                  "type": ".none",
                },
                "created_at": "2019-11-25T21:54:48.952Z",
                "created_by": Object {
                  "email": "testemail@elastic.co",
                  "full_name": "elastic",
                  "username": "elastic",
                },
                "customFields": Array [],
                "description": "This is a brand new case of a bad meanie defacing data",
                "duration": null,
                "external_service": Object {
                  "connector_id": "none",
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
                "incremental_id": undefined,
                "observables": Array [],
                "owner": "securitySolution",
                "settings": Object {
                  "extractObservables": false,
                  "syncAlerts": true,
                },
                "severity": "low",
                "status": "open",
                "tags": Array [
                  "defacement",
                ],
                "title": "Super Bad Security Issue",
                "total_observables": 0,
                "updated_at": "2019-11-25T21:54:48.952Z",
                "updated_by": Object {
                  "email": "testemail@elastic.co",
                  "full_name": "elastic",
                  "username": "elastic",
                },
              },
              "id": "1",
              "references": Array [],
              "type": "cases",
            },
          }
        `);
      });
    });

    describe('getCases', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
          ],
        });

        await expect(service.getCases({ caseIds: ['a', 'b'] })).resolves.not.toThrow();
      });

      it('do not decodes errors', async () => {
        const errorSO = {
          ...omit(createCaseSavedObjectResponse({ caseId: '2' }), 'attributes'),
          error: {
            statusCode: 404,
          },
        };

        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            // @ts-expect-error: bulkUpdate type expects attributes to be defined
            errorSO,
          ],
        });

        const res = await service.getCases({ caseIds: ['a', 'b'] });

        expect(res).toMatchInlineSnapshot(`
          Object {
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "low",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
              Object {
                "error": Object {
                  "statusCode": 404,
                },
                "id": "2",
                "references": Array [],
                "type": "cases",
              },
            ],
          }
        `);
      });

      it.each(Object.keys(attributesToValidateIfMissing))(
        'throws if %s is omitted',
        async (key) => {
          const theCase = createCaseSavedObjectResponse();
          const attributes = omit({ ...theCase.attributes }, key);
          unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
            saved_objects: [{ ...theCase, attributes }, createCaseSavedObjectResponse()],
          });

          await expect(service.getCases({ caseIds: ['a', 'b'] })).rejects.toThrow(
            `Invalid value "undefined" supplied to "${key}"`
          );
        }
      );

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse();
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [{ ...theCase, attributes }],
        });

        await expect(service.getCases({ caseIds: ['a', 'b'] })).resolves.toMatchInlineSnapshot(`
          Object {
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "low",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
            ],
          }
        `);
      });
    });

    describe('findCases', () => {
      it('decodes correctly', async () => {
        const findMockReturn = createSOFindResponse([
          createFindSO({ caseId: '1' }),
          createFindSO({ caseId: '2' }),
        ]);

        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        await expect(service.findCases()).resolves.not.toThrow();
      });

      it.each(Object.keys(attributesToValidateIfMissing))(
        'throws if %s is omitted',
        async (key) => {
          const theCase = createCaseSavedObjectResponse();
          const attributes = omit({ ...theCase.attributes }, key);
          const findMockReturn = createSOFindResponse([
            { ...theCase, attributes, score: 0 },
            createFindSO(),
          ]);

          unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

          await expect(service.findCases()).rejects.toThrow(
            `Invalid value "undefined" supplied to "${key}"`
          );
        }
      );

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse();
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        const findMockReturn = createSOFindResponse([
          { ...theCase, attributes, score: 0 },
          createFindSO(),
        ]);

        unsecuredSavedObjectsClient.find.mockResolvedValue(findMockReturn);

        await expect(service.findCases()).resolves.toMatchInlineSnapshot(`
          Object {
            "page": 1,
            "per_page": 2,
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "low",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "score": 0,
                "type": "cases",
              },
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "low",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "score": 0,
                "type": "cases",
              },
            ],
            "total": 2,
          }
        `);
      });
    });

    describe('createCase', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());

        await expect(
          service.createCase({
            attributes: createCasePostParams({ connector: createJiraConnector() }),
            id: '1',
          })
        ).resolves.not.toThrow();
      });

      it.each(Object.keys(attributesToValidateIfMissing))(
        'throws if %s is omitted',
        async (key) => {
          const theCase = createCaseSavedObjectResponse();
          const attributes = omit({ ...theCase.attributes }, key);
          unsecuredSavedObjectsClient.create.mockResolvedValue({ ...theCase, attributes });

          await expect(
            service.createCase({
              attributes: createCasePostParams({ connector: createJiraConnector() }),
              id: '1',
            })
          ).rejects.toThrow(`Invalid value "undefined" supplied to "${key}"`);
        }
      );

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse();
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        unsecuredSavedObjectsClient.create.mockResolvedValue({ ...theCase, attributes });

        await expect(
          service.createCase({
            attributes: createCasePostParams({ connector: createJiraConnector() }),
            id: '1',
          })
        ).resolves.toMatchInlineSnapshot(`
          Object {
            "attributes": Object {
              "assignees": Array [],
              "category": null,
              "closed_at": null,
              "closed_by": null,
              "connector": Object {
                "fields": null,
                "id": "none",
                "name": "none",
                "type": ".none",
              },
              "created_at": "2019-11-25T21:54:48.952Z",
              "created_by": Object {
                "email": "testemail@elastic.co",
                "full_name": "elastic",
                "username": "elastic",
              },
              "customFields": Array [],
              "description": "This is a brand new case of a bad meanie defacing data",
              "duration": null,
              "external_service": Object {
                "connector_id": "none",
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
              "incremental_id": undefined,
              "observables": Array [],
              "owner": "securitySolution",
              "settings": Object {
                "extractObservables": false,
                "syncAlerts": true,
              },
              "severity": "low",
              "status": "open",
              "tags": Array [
                "defacement",
              ],
              "title": "Super Bad Security Issue",
              "total_observables": 0,
              "updated_at": "2019-11-25T21:54:48.952Z",
              "updated_by": Object {
                "email": "testemail@elastic.co",
                "full_name": "elastic",
                "username": "elastic",
              },
            },
            "id": "1",
            "references": Array [],
            "type": "cases",
          }
        `);
      });
    });

    describe('bulkCreateCases', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createCaseSavedObjectResponse()],
        });

        await expect(
          service.bulkCreateCases({
            cases: [
              {
                ...createCasePostParams({ connector: createJiraConnector() }),
                id: '1',
              },
            ],
          })
        ).resolves.not.toThrow();
      });

      it.each(Object.keys(attributesToValidateIfMissing))(
        'throws if %s is omitted',
        async (key) => {
          const theCase = createCaseSavedObjectResponse();
          const attributes = omit({ ...theCase.attributes }, key);
          unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
            saved_objects: [{ ...theCase, attributes }],
          });

          await expect(
            service.bulkCreateCases({
              cases: [
                {
                  ...createCasePostParams({ connector: createJiraConnector() }),
                  id: '1',
                },
              ],
            })
          ).rejects.toThrow(`Invalid value "undefined" supplied to "${key}"`);
        }
      );

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse();
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [{ ...theCase, attributes }],
        });

        await expect(
          service.bulkCreateCases({
            cases: [
              {
                ...createCasePostParams({ connector: createJiraConnector() }),
                id: '1',
              },
            ],
          })
        ).resolves.toMatchInlineSnapshot(`
          Object {
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "assignees": Array [],
                  "category": null,
                  "closed_at": null,
                  "closed_by": null,
                  "connector": Object {
                    "fields": null,
                    "id": "none",
                    "name": "none",
                    "type": ".none",
                  },
                  "created_at": "2019-11-25T21:54:48.952Z",
                  "created_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                  "customFields": Array [],
                  "description": "This is a brand new case of a bad meanie defacing data",
                  "duration": null,
                  "external_service": Object {
                    "connector_id": "none",
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
                  "incremental_id": undefined,
                  "observables": Array [],
                  "owner": "securitySolution",
                  "settings": Object {
                    "extractObservables": false,
                    "syncAlerts": true,
                  },
                  "severity": "low",
                  "status": "open",
                  "tags": Array [
                    "defacement",
                  ],
                  "title": "Super Bad Security Issue",
                  "total_observables": 0,
                  "updated_at": "2019-11-25T21:54:48.952Z",
                  "updated_by": Object {
                    "email": "testemail@elastic.co",
                    "full_name": "elastic",
                    "username": "elastic",
                  },
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
            ],
          }
        `);
      });
    });

    describe('patchCase', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(createUpdateSOResponse());

        await expect(
          service.patchCase({
            caseId: '1',
            updatedAttributes: createCaseUpdateParams({}),
            originalCase: {} as CaseSavedObjectTransformed,
          })
        ).resolves.not.toThrow();
      });

      it('strips out excess attributes', async () => {
        const theCase = createUpdateSOResponse();
        const attributes = { ...theCase.attributes, 'not-exists': 'not-exists' };
        unsecuredSavedObjectsClient.update.mockResolvedValue({ ...theCase, attributes });

        await expect(
          service.patchCase({
            caseId: '1',
            updatedAttributes: {},
            originalCase: {} as CaseSavedObjectTransformed,
          })
        ).resolves.toEqual({
          attributes: {},
          id: '1',
          references: [],
          type: 'cases',
        });
      });
    });

    describe('patchCases', () => {
      it('decodes correctly', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            createCaseSavedObjectResponse({ caseId: '1' }),
            createCaseSavedObjectResponse({ caseId: '2' }),
          ],
        });

        await expect(
          service.patchCases({
            cases: [
              {
                caseId: '1',
                updatedAttributes: createCasePostParams({
                  connector: getNoneCaseConnector(),
                }),
                originalCase: {} as CaseSavedObjectTransformed,
              },
            ],
          })
        ).resolves.not.toThrow();
      });

      it('do not decodes errors', async () => {
        const errorSO = {
          ...omit(createCaseSavedObjectResponse({ caseId: '2' }), 'attributes'),
          error: {
            statusCode: 404,
          },
        };

        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            {
              ...createCaseSavedObjectResponse({ caseId: '1' }),
              attributes: { description: 'updated desc' },
            },
            // @ts-expect-error: bulkUpdate type expects attributes to be defined
            errorSO,
          ],
        });

        const res = await service.patchCases({
          cases: [
            {
              caseId: '1',
              updatedAttributes: createCasePostParams({
                connector: getNoneCaseConnector(),
              }),
              originalCase: {} as CaseSavedObjectTransformed,
            },
          ],
        });

        expect(res).toMatchInlineSnapshot(`
          Object {
            "saved_objects": Array [
              Object {
                "attributes": Object {
                  "description": "updated desc",
                },
                "id": "1",
                "references": Array [],
                "type": "cases",
              },
              Object {
                "error": Object {
                  "statusCode": 404,
                },
                "id": "2",
                "references": Array [],
                "type": "cases",
              },
            ],
          }
        `);
      });

      it('strips out excess attributes', async () => {
        const theCase = createCaseSavedObjectResponse();
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            {
              ...theCase,
              id: '1',
              attributes: { description: 'update desc', 'not-exists': 'not-exists' },
            },
            { ...theCase, id: '2', attributes: { title: 'update title' } },
          ],
        });

        await expect(
          service.patchCases({
            cases: [
              {
                caseId: '1',
                updatedAttributes: { description: 'update desc' },
                originalCase: {} as CaseSavedObjectTransformed,
              },
              {
                caseId: '2',
                updatedAttributes: { title: 'update title' },
                originalCase: {} as CaseSavedObjectTransformed,
              },
            ],
          })
        ).resolves.toEqual({
          saved_objects: [
            {
              attributes: {
                description: 'update desc',
              },
              id: '1',
              references: [],
              type: 'cases',
            },
            {
              attributes: {
                title: 'update title',
              },
              id: '2',
              references: [],
              type: 'cases',
            },
          ],
        });
      });
    });
  });

  describe('Decoding requests', () => {
    describe('createCase', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createCaseSavedObjectResponse());
      });

      it('decodes correctly the requested attributes', async () => {
        const attributes = createCasePostParams({ connector: createJiraConnector() });

        await expect(service.createCase({ id: 'a', attributes })).resolves.not.toThrow();
      });

      it('throws if title is omitted', async () => {
        const attributes = createCasePostParams({ connector: createJiraConnector() });
        unset(attributes, 'title');

        await expect(
          service.createCase({
            attributes,
            id: '1',
          })
        ).rejects.toThrow(`Invalid value "undefined" supplied to "title"`);
      });

      it('remove excess fields', async () => {
        const attributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          foo: 'bar',
        };

        await expect(service.createCase({ id: 'a', attributes })).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.create.mock.calls[0][1];
        expect(persistedAttributes).not.toHaveProperty('foo');
      });

      it('sets `incremental_id` field to undefined when it is passed', async () => {
        const attributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          incremental_id: 200,
        };

        await expect(service.createCase({ id: 'a', attributes })).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.create.mock.calls[0][1];
        expect((persistedAttributes as CaseAttributes).incremental_id).toBeUndefined();
      });
    });

    describe('bulkCreateCases', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createCaseSavedObjectResponse()],
        });
      });

      it('decodes correctly the requested attributes', async () => {
        const attributes = createCasePostParams({ connector: createJiraConnector() });

        await expect(
          service.bulkCreateCases({ cases: [{ id: 'a', ...attributes }] })
        ).resolves.not.toThrow();
      });

      it('throws if title is omitted', async () => {
        const attributes = createCasePostParams({ connector: createJiraConnector() });
        unset(attributes, 'title');

        await expect(
          service.bulkCreateCases({ cases: [{ id: '1', ...attributes }] })
        ).rejects.toThrow(`Invalid value "undefined" supplied to "title"`);
      });

      it('remove excess fields', async () => {
        const attributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          foo: 'bar',
        };

        await expect(
          service.bulkCreateCases({ cases: [{ id: 'a', ...attributes }] })
        ).resolves.not.toThrow();

        const persistedAttributes =
          unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0][0].attributes;

        expect(persistedAttributes).not.toHaveProperty('foo');
      });

      it('sets `incremental_id` field to undefined when it is passed', async () => {
        const attributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          incremental_id: 200,
        };

        await expect(
          service.bulkCreateCases({ cases: [{ id: 'a', ...attributes }] })
        ).resolves.not.toThrow();

        const persistedAttributes =
          unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0][0].attributes;

        expect((persistedAttributes as CaseAttributes).incremental_id).toBeUndefined();
      });
    });

    describe('patch case', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(
          {} as SavedObjectsUpdateResponse<CasePersistedAttributes>
        );
      });

      it('decodes correctly the requested attributes', async () => {
        const updatedAttributes = createCasePostParams({
          connector: createJiraConnector(),
          status: CaseStatuses['in-progress'],
        });

        await expect(
          service.patchCase({
            caseId: '1',
            updatedAttributes,
            originalCase: {} as CaseSavedObjectTransformed,
          })
        ).resolves.not.toThrow();
      });

      it('remove excess fields', async () => {
        const updatedAttributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          foo: 'bar',
        };

        await expect(
          service.patchCase({
            caseId: '1',
            updatedAttributes,
            originalCase: {} as CaseSavedObjectTransformed,
          })
        ).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.update.mock.calls[0][2];
        expect(persistedAttributes).not.toHaveProperty('foo');
      });

      it('removes incremental_id value', async () => {
        const updatedAttributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          incremental_id: 200,
        };

        await expect(
          service.patchCase({
            caseId: '1',
            updatedAttributes,
            originalCase: {} as CaseSavedObjectTransformed,
          })
        ).resolves.not.toThrow();

        const persistedAttributes = unsecuredSavedObjectsClient.update.mock.calls[0][2];
        expect((persistedAttributes as CaseAttributes).incremental_id).toBeUndefined();
      });
    });

    describe('patch cases', () => {
      beforeEach(() => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [createCaseSavedObjectResponse({ caseId: '1' })],
        });
      });

      it('decodes correctly the requested attributes', async () => {
        const updatedAttributes = createCasePostParams({
          connector: createJiraConnector(),
          status: CaseStatuses['in-progress'],
        });

        await expect(
          service.patchCases({
            cases: [
              {
                caseId: '1',
                updatedAttributes,
                originalCase: {} as CaseSavedObjectTransformed,
              },
            ],
          })
        ).resolves.not.toThrow();
      });

      it('remove excess fields', async () => {
        const updatedAttributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          foo: 'bar',
        };

        await expect(
          service.patchCases({
            cases: [
              {
                caseId: '1',
                updatedAttributes,
                originalCase: {} as CaseSavedObjectTransformed,
              },
            ],
          })
        ).resolves.not.toThrow();

        const persistedAttributes =
          unsecuredSavedObjectsClient.bulkUpdate.mock.calls[0][0][0].attributes;

        expect(persistedAttributes).not.toHaveProperty('foo');
      });

      it('removes incremental_id values', async () => {
        const updatedAttributes = {
          ...createCasePostParams({ connector: createJiraConnector() }),
          incremental_id: 200,
        };

        await expect(
          service.patchCases({
            cases: [
              {
                caseId: '1',
                updatedAttributes,
                originalCase: {} as CaseSavedObjectTransformed,
              },
            ],
          })
        ).resolves.not.toThrow();

        const persistedAttributes =
          unsecuredSavedObjectsClient.bulkUpdate.mock.calls[0][0][0].attributes;

        expect((persistedAttributes as CaseAttributes).incremental_id).toBeUndefined();
      });
    });

    describe('getCaseIdsByAttachmentSearch', () => {
      const namespaces = ['default'];
      const search = 'awesome case';

      const mockEmptySearchResponse = () => {
        // The SO mock doesn't include `search` by default, so wire it up here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (unsecuredSavedObjectsClient as any).search = jest
          .fn()
          .mockResolvedValue({ hits: { hits: [] } });
      };

      it('uses match_phrase for cases-comments.comment so multi-word searches require an exact phrase', async () => {
        mockEmptySearchResponse();

        await service.getCaseIdsByAttachmentSearch(namespaces, search, ['cases-comments.comment']);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const searchCall = (unsecuredSavedObjectsClient as any).search.mock.calls[0][0];
        expect(searchCall.query.bool.should).toEqual([
          { match_phrase: { 'cases-comments.comment': search } },
        ]);
      });

      it('uses match (not match_phrase) for keyword identifier fields like alertId and eventId', async () => {
        mockEmptySearchResponse();

        await service.getCaseIdsByAttachmentSearch(namespaces, search, [
          'cases-comments.alertId',
          'cases-comments.eventId',
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const searchCall = (unsecuredSavedObjectsClient as any).search.mock.calls[0][0];
        expect(searchCall.query.bool.should).toEqual([
          { match: { 'cases-comments.alertId': search } },
          { match: { 'cases-comments.eventId': search } },
        ]);
      });

      it('mixes match_phrase for comment and match for keyword fields when both are searched', async () => {
        mockEmptySearchResponse();

        await service.getCaseIdsByAttachmentSearch(namespaces, search, [
          'cases-comments.alertId',
          'cases-comments.comment',
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const searchCall = (unsecuredSavedObjectsClient as any).search.mock.calls[0][0];
        expect(searchCall.query.bool.should).toEqual([
          { match: { 'cases-comments.alertId': search } },
          { match_phrase: { 'cases-comments.comment': search } },
        ]);
      });
    });
  });

  describe('cases-analytics v2 writer integration', () => {
    // The default service fixture uses V2_NOOP_WRITER; for these assertions
    // we need a writer we can spy on.
    const makeServiceWithMockWriter = () => {
      const analyticsV2Writer = {
        upsertCase: jest.fn(),
        deleteCase: jest.fn(),
        bulkUpsertCases: jest.fn(),
        bulkDeleteCases: jest.fn(),
        bulkUpsertCasesAwait: jest.fn().mockResolvedValue(undefined),
      };
      const analyticsV2ActivityWriter = {
        upsertAction: jest.fn(),
        bulkUpsertActions: jest.fn(),
        bulkDeleteActionsByCaseIds: jest.fn(),
        bulkUpsertActionsAwait: jest.fn().mockResolvedValue(undefined),
      };
      const svc = new CasesService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        attachmentService,
        analyticsV2Writer,
        analyticsV2ActivityWriter,
      });
      return { svc, analyticsV2Writer, analyticsV2ActivityWriter };
    };

    describe('bulkDeleteCaseEntities', () => {
      it('removes the analytics doc only for cases whose SO delete succeeded', async () => {
        // case-A delete succeeds; case-B fails with 409. Without inspecting
        // the per-entity status, the analytics doc for case-B would be
        // removed while the SO survives — and reconciliation can't repair
        // it (the surviving SO's updated_at didn't change).
        unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
          statuses: [
            { id: 'case-A', type: CASE_SAVED_OBJECT, success: true },
            {
              id: 'case-B',
              type: CASE_SAVED_OBJECT,
              success: false,
              error: { error: 'Conflict', message: 'version conflict', statusCode: 409 },
            },
          ],
        });

        const { svc, analyticsV2Writer, analyticsV2ActivityWriter } = makeServiceWithMockWriter();
        await svc.bulkDeleteCaseEntities({
          entities: [
            { type: CASE_SAVED_OBJECT, id: 'case-A' },
            { type: CASE_SAVED_OBJECT, id: 'case-B' },
          ],
        });

        // Single bulk dispatch with only the successful case id — the
        // individual `deleteCase` path is unused on bulk operations now.
        expect(analyticsV2Writer.bulkDeleteCases).toHaveBeenCalledTimes(1);
        expect(analyticsV2Writer.bulkDeleteCases).toHaveBeenCalledWith(['case-A']);
        expect(analyticsV2Writer.deleteCase).not.toHaveBeenCalled();

        // The activity surface cascades the same successful-case-id set:
        // deleting a case cascades to its user-action SOs at the SO layer,
        // and reconciliation can't see that gap, so the activity docs are
        // dropped explicitly here.
        expect(analyticsV2ActivityWriter.bulkDeleteActionsByCaseIds).toHaveBeenCalledTimes(1);
        expect(analyticsV2ActivityWriter.bulkDeleteActionsByCaseIds).toHaveBeenCalledWith([
          'case-A',
        ]);
      });

      it('skips analytics writes for non-case entity types', async () => {
        // Comments, user-actions, etc. are tracked by their own analytics
        // surfaces (PR 2). The case-surface writer only handles cases.
        unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
          statuses: [
            { id: 'comment-1', type: CASE_COMMENT_SAVED_OBJECT, success: true },
            { id: 'case-A', type: CASE_SAVED_OBJECT, success: true },
          ],
        });

        const { svc, analyticsV2Writer, analyticsV2ActivityWriter } = makeServiceWithMockWriter();
        await svc.bulkDeleteCaseEntities({
          entities: [
            { type: CASE_COMMENT_SAVED_OBJECT, id: 'comment-1' },
            { type: CASE_SAVED_OBJECT, id: 'case-A' },
          ],
        });

        expect(analyticsV2Writer.bulkDeleteCases).toHaveBeenCalledTimes(1);
        expect(analyticsV2Writer.bulkDeleteCases).toHaveBeenCalledWith(['case-A']);
        expect(analyticsV2Writer.deleteCase).not.toHaveBeenCalled();

        // Activity cascade is keyed by case id and likewise skips the
        // non-case entity — only `case-A` is passed through.
        expect(analyticsV2ActivityWriter.bulkDeleteActionsByCaseIds).toHaveBeenCalledWith([
          'case-A',
        ]);
      });
    });

    describe('deleteCase', () => {
      it('cascades the deleted case id to the activity surface', async () => {
        unsecuredSavedObjectsClient.delete.mockResolvedValue({});

        const { svc, analyticsV2Writer, analyticsV2ActivityWriter } = makeServiceWithMockWriter();
        await svc.deleteCase({ id: 'case-A', refresh: false });

        expect(analyticsV2Writer.deleteCase).toHaveBeenCalledWith('case-A');
        // Deleting the case cascades to its user-action SOs at the SO
        // layer; reconciliation can't detect that, so the activity docs
        // are dropped explicitly by case id.
        expect(analyticsV2ActivityWriter.bulkDeleteActionsByCaseIds).toHaveBeenCalledWith([
          'case-A',
        ]);
      });
    });

    describe('patchCase', () => {
      it('dispatches the persisted model to the analytics writer even when status/severity are not part of the patch', async () => {
        // `originalCase` is the external model (string status/severity,
        // external_service.connector_id). When the patch only touches `title`,
        // the base must be converted to the persisted model before merging —
        // otherwise `status`/`severity` silently become `undefined` (the
        // *_TO_STRING maps are keyed by the numeric enum) and any pushed case
        // carries `external_service.connector_id` into the strict mapping.
        const persistedSO = createCaseSavedObjectResponse({
          externalService: createExternalService({ connector_id: 'push-connector-1' }),
        });
        const externalModelOriginalCase = transformSavedObjectToExternalModel(persistedSO);

        unsecuredSavedObjectsClient.update.mockResolvedValue({
          id: persistedSO.id,
          type: CASE_SAVED_OBJECT,
          attributes: { title: 'Updated Title' },
          references: persistedSO.references,
          version: 'WzEsMV0=',
        });

        const { svc, analyticsV2Writer } = makeServiceWithMockWriter();
        await svc.patchCase({
          caseId: persistedSO.id,
          updatedAttributes: { title: 'Updated Title' },
          originalCase: externalModelOriginalCase,
          version: 'WzAsMV0=',
          refresh: false,
        });

        expect(analyticsV2Writer.upsertCase).toHaveBeenCalledTimes(1);
        const dispatchedDoc = analyticsV2Writer.upsertCase.mock.calls[0][0];

        // status/severity must be the numeric persisted values, not the
        // string external-model values.
        expect(dispatchedDoc.attributes.status).toBe(CasePersistedStatus.OPEN);
        expect(dispatchedDoc.attributes.severity).toBe(CasePersistedSeverity.LOW);

        // connector_id must not appear — it's stored as a reference, not a
        // mapping field. Its presence in the doc triggers a
        // strict_dynamic_mapping_exception on the .cases index.
        expect(dispatchedDoc.attributes.external_service).not.toHaveProperty('connector_id');
      });
    });

    describe('patchCases', () => {
      it('dispatches the persisted model to the analytics writer even when status/severity are not part of the bulk patch', async () => {
        // Same model-mixing hazard as patchCase — both sites use the same
        // synthesize-from-originalCase pattern and need the same fix.
        const persistedSO = createCaseSavedObjectResponse({
          externalService: createExternalService({ connector_id: 'push-connector-2' }),
        });
        const externalModelOriginalCase = transformSavedObjectToExternalModel(persistedSO);

        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [
            {
              id: persistedSO.id,
              type: CASE_SAVED_OBJECT,
              attributes: { title: 'Bulk Updated Title' },
              references: persistedSO.references,
              version: 'WzEsMV0=',
            },
          ],
        });

        const { svc, analyticsV2Writer } = makeServiceWithMockWriter();
        await svc.patchCases({
          cases: [
            {
              caseId: persistedSO.id,
              updatedAttributes: { title: 'Bulk Updated Title' },
              originalCase: externalModelOriginalCase,
              version: 'WzAsMV0=',
            },
          ],
          refresh: false,
        });

        expect(analyticsV2Writer.bulkUpsertCases).toHaveBeenCalledTimes(1);
        const [mirrors] = analyticsV2Writer.bulkUpsertCases.mock.calls[0];
        expect(mirrors).toHaveLength(1);
        const dispatchedDoc = mirrors[0];

        expect(dispatchedDoc.attributes.status).toBe(CasePersistedStatus.OPEN);
        expect(dispatchedDoc.attributes.severity).toBe(CasePersistedSeverity.LOW);
        expect(dispatchedDoc.attributes.external_service).not.toHaveProperty('connector_id');
      });
    });
  });
});
