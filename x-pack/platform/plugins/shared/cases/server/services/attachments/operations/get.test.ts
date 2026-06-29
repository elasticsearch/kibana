/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { unset } from 'lodash';

import { fromKueryExpression } from '@kbn/es-query';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { SavedObjectsBulkResponse, SavedObjectsFindResponse } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { AttachmentGetter } from './get';
import { createAlertAttachment, createFileAttachment, createUserAttachment } from '../test_utils';
import { mockPointInTimeFinder, createSOFindResponse, createErrorSO } from '../../test_utils';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
} from '../../../../common/constants';
import {
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
} from '../../../../common/constants/attachments';
import { AttachmentType } from '../../../../common/types/domain';
import type { ConfigType } from '../../../config';

const mode = 'legacy';

describe('AttachmentService getter', () => {
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const mockLogger = loggerMock.create();

  const mockFinder = (soFindRes: SavedObjectsFindResponse) =>
    mockPointInTimeFinder(unsecuredSavedObjectsClient)(soFindRes);
  const createAttachmentGetter = (attachmentsEnabled = false) =>
    new AttachmentGetter({
      log: mockLogger,
      unsecuredSavedObjectsClient,
      config: { attachments: { enabled: attachmentsEnabled } } as unknown as ConfigType,
    });
  let attachmentGetter: AttachmentGetter;

  beforeEach(async () => {
    jest.clearAllMocks();
    attachmentGetter = createAttachmentGetter(false);
  });

  describe('bulkGet', () => {
    describe('Decoding', () => {
      it('does not throw when the response has the required fields', async () => {
        // Production `bulkGet` is called with `[unified, legacy]` per id, so the
        // mocked response must return matching pairs.
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            createUserAttachment(),
            { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        await expect(attachmentGetter.bulkGet(['1'], mode)).resolves.not.toThrow();
      });

      it('surfaces the legacy not-found error per id when FF is off and no SO type hits', async () => {
        const unifiedNotFoundForId1 = {
          ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT),
          id: '1',
        };
        const legacyNotFoundForMissing = {
          ...createErrorSO(CASE_COMMENT_SAVED_OBJECT),
          id: 'missing-id',
        };
        const unifiedNotFoundForMissing = {
          ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT),
          id: 'missing-id',
        };
        // Production order is interleaved as `[unified, legacy]` per id.
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            unifiedNotFoundForId1,
            createUserAttachment(),
            unifiedNotFoundForMissing,
            legacyNotFoundForMissing,
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        const res = await attachmentGetter.bulkGet(['1', 'missing-id'], mode);

        // The success at id 1 is kept; the duplicate not-founds at `missing-id`
        // collapse to a single error. FF is off, so the surfaced error comes
        // from the legacy (`cases-comments`) bucket to match where new writes go.
        expect(res.saved_objects).toEqual([createUserAttachment(), legacyNotFoundForMissing]);
      });

      it('surfaces the unified not-found error per id when FF is on and no SO type hits', async () => {
        const attachmentGetterWithFlagOn = createAttachmentGetter(true);
        const legacyNotFoundForMissing = {
          ...createErrorSO(CASE_COMMENT_SAVED_OBJECT),
          id: 'missing-id',
        };
        const unifiedNotFoundForMissing = {
          ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT),
          id: 'missing-id',
        };
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            unifiedNotFoundForMissing,
            legacyNotFoundForMissing,
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        const res = await attachmentGetterWithFlagOn.bulkGet(['missing-id'], mode);

        // FF is on → surfaced error comes from the unified (`cases-attachments`)
        // bucket since that's where new writes go.
        expect(res.saved_objects).toEqual([unifiedNotFoundForMissing]);
      });

      it('Filters successful result over error', async () => {
        const attachmentGetterWithFlagOn = createAttachmentGetter(true);
        const unifiedError = {
          ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT),
          id: '1',
        };
        const legacy = {
          ...createUserAttachment(),
          id: '1',
        };
        const unifiedNotFound = {
          ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT),
          id: '2',
        };
        const legacyNotFound = {
          ...createErrorSO(CASE_COMMENT_SAVED_OBJECT),
          id: '2',
        };
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          // @ts-expect-error: SO client types are not correct
          saved_objects: [unifiedError, legacy, unifiedNotFound, legacyNotFound],
        });

        const res = await attachmentGetterWithFlagOn.bulkGet(['1', '2'], mode);

        expect(res.saved_objects).toEqual([legacy, unifiedNotFound]);
      });

      it('strips excess fields', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            { ...createUserAttachment({ foo: 'bar' }) },
            { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        const res = await attachmentGetter.bulkGet(['1'], mode);
        expect(res).toStrictEqual({ saved_objects: [createUserAttachment()] });
      });

      it('returns migrated legacy events in unified shape when mode=unified', async () => {
        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '1' },
            {
              id: '1',
              type: CASE_COMMENT_SAVED_OBJECT,
              attributes: {
                type: AttachmentType.event,
                eventId: 'event-1',
                index: 'index-1',
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
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        const res = await attachmentGetter.bulkGet(['1'], 'unified');

        expect(res.saved_objects).toEqual([
          expect.objectContaining({
            id: '1',
            attributes: expect.objectContaining({
              type: SECURITY_EVENT_ATTACHMENT_TYPE,
              attachmentId: 'event-1',
              metadata: { index: 'index-1' },
              owner: 'securitySolution',
            }),
          }),
        ]);
      });

      it('returns migrated legacy file externalReference in unified shape when mode=unified', async () => {
        const legacyFile = createFileAttachment({
          externalReferenceMetadata: {
            files: [
              {
                name: 'foo',
                extension: 'txt',
                mimeType: 'text/plain',
                created: '2025-01-01T00:00:00.000Z',
              },
            ],
          },
        });

        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '1' },
            legacyFile,
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        const res = await attachmentGetter.bulkGet(['1'], 'unified');

        expect(res.saved_objects).toEqual([
          expect.objectContaining({
            id: '1',
            attributes: expect.objectContaining({
              type: 'file',
              attachmentId: 'my-id',
              metadata: expect.objectContaining({
                soType: 'file',
                files: [
                  {
                    name: 'foo',
                    extension: 'txt',
                    mimeType: 'text/plain',
                    created: '2025-01-01T00:00:00.000Z',
                  },
                ],
              }),
              owner: 'securitySolution',
            }),
          }),
        ]);
      });

      it('throws when the response is missing the attributes.comment field', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.bulkGet.mockResolvedValue({
          saved_objects: [
            invalidAttachment,
            { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
          ] as unknown as SavedObjectsBulkResponse['saved_objects'],
        });

        await expect(
          attachmentGetter.bulkGet(['1'], mode)
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\""`
        );
      });
    });
  });

  describe('getAllAlertsAttachToCase', () => {
    describe('Decoding', () => {
      it('does not throw when the response has the required fields', async () => {
        const soFindRes = createSOFindResponse([{ ...createAlertAttachment(), score: 0 }]);

        mockFinder(soFindRes);

        await expect(
          attachmentGetter.getAllDocumentsAttachedToCase({ caseId: '1', owner: 'securitySolution' })
        ).resolves.not.toThrow();
      });

      it('strips excess fields', async () => {
        const soFindRes = createSOFindResponse([
          { ...createAlertAttachment({ foo: 'bar' }), score: 0 },
        ]);

        mockFinder(soFindRes);

        const res = await attachmentGetter.getAllDocumentsAttachedToCase({
          caseId: '1',
          owner: 'securitySolution',
        });
        expect(res).toStrictEqual([{ ...createAlertAttachment(), score: 0 }]);
      });

      it('decodes unified event attachments from cases-attachments SO', async () => {
        const attachmentGetterWithFlagOn = createAttachmentGetter(true);
        const soFindRes = createSOFindResponse([
          {
            id: 'event-so-1',
            type: CASE_ATTACHMENT_SAVED_OBJECT,
            references: [],
            score: 0,
            attributes: {
              type: SECURITY_EVENT_ATTACHMENT_TYPE,
              attachmentId: 'event-1',
              metadata: { index: 'logs-1' },
              owner: 'securitySolution',
              created_at: '2020-01-01T00:00:00.000Z',
              created_by: {
                username: 'elastic',
                full_name: null,
                email: null,
              },
              pushed_at: null,
              pushed_by: null,
              updated_at: null,
              updated_by: null,
            },
          },
        ]);

        mockFinder(soFindRes);

        const res = await attachmentGetterWithFlagOn.getAllDocumentsAttachedToCase({
          caseId: '1',
          owner: 'securitySolution',
        });

        expect(res).toEqual([
          expect.objectContaining({
            attributes: expect.objectContaining({
              type: SECURITY_EVENT_ATTACHMENT_TYPE,
              attachmentId: 'event-1',
              metadata: { index: 'logs-1' },
            }),
          }),
        ]);
      });

      it('throws when the response is missing the attributes.alertId field', async () => {
        const invalidAlert = { ...createAlertAttachment(), score: 0 };
        unset(invalidAlert, 'attributes.alertId');
        const soFindRes = createSOFindResponse([invalidAlert]);

        mockFinder(soFindRes);

        await expect(
          attachmentGetter.getAllDocumentsAttachedToCase({ caseId: '1', owner: 'securitySolution' })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"alert\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"attachmentId\\""`
        );
      });
    });

    it('builds an OR group for legacy/unified type filters', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      mockFinder(createSOFindResponse([]));

      await attachmentGetterWithFlagOn.getAllDocumentsAttachedToCase({
        caseId: '1',
        filter: fromKueryExpression('cases-comments.attributes.owner:securitySolution'),
        owner: 'securitySolution',
      });

      const finderArg = unsecuredSavedObjectsClient.createPointInTimeFinder.mock.calls[0][0] as {
        filter: { function: string; arguments: Array<{ function?: string }> };
      };
      expect(finderArg.filter.function).toBe('and');
      expect(finderArg.filter.arguments[0]?.function).toBe('or');
    });
  });

  describe('get', () => {
    it('falls back to legacy SO when unified SO returns 404', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.get
        .mockRejectedValueOnce(
          SavedObjectsErrorHelpers.createGenericNotFoundError(CASE_ATTACHMENT_SAVED_OBJECT, '1')
        )
        .mockResolvedValueOnce(createUserAttachment());

      const res = await attachmentGetterWithFlagOn.get({ savedObjectId: '1', mode });

      expect(res).toStrictEqual(createUserAttachment());
      expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledTimes(2);
      expect(unsecuredSavedObjectsClient.get).toHaveBeenNthCalledWith(
        1,
        CASE_ATTACHMENT_SAVED_OBJECT,
        '1'
      );
      expect(unsecuredSavedObjectsClient.get).toHaveBeenNthCalledWith(
        2,
        CASE_COMMENT_SAVED_OBJECT,
        '1'
      );
    });

    it('does not fall back to legacy SO when unified SO returns non-404 error', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.get.mockRejectedValueOnce(new Error('ES timeout'));

      await expect(
        attachmentGetterWithFlagOn.get({ savedObjectId: '1', mode })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"ES timeout"`);

      expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(
        CASE_ATTACHMENT_SAVED_OBJECT,
        '1'
      );
    });

    describe('Decoding', () => {
      it('does not throw when the response has the required fields', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue(createUserAttachment());

        await expect(attachmentGetter.get({ savedObjectId: '1', mode })).resolves.not.toThrow();
      });

      it('strips excess fields', async () => {
        unsecuredSavedObjectsClient.get.mockResolvedValue({
          ...createUserAttachment({ foo: 'bar' }),
        });

        const res = await attachmentGetter.get({ savedObjectId: '1', mode });
        expect(res).toStrictEqual(createUserAttachment());
      });

      it('throws when the response is missing the attributes.comment field', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.get.mockResolvedValue(invalidAttachment);

        await expect(
          attachmentGetter.get({ savedObjectId: '1', mode })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\""`
        );
      });
    });
  });

  describe('getFileAttachments', () => {
    describe('Decoding', () => {
      it('does not throw when the response has the required fields', async () => {
        const soFindRes = createSOFindResponse([{ ...createFileAttachment(), score: 0 }]);

        mockFinder(soFindRes);

        await expect(
          attachmentGetter.getFileAttachments({ caseId: '1', fileIds: ['1'] })
        ).resolves.not.toThrow();
      });

      it('strips excess fields', async () => {
        const soFindRes = createSOFindResponse([
          { ...createFileAttachment({ foo: 'bar' }), score: 0 },
        ]);

        mockFinder(soFindRes);

        const res = await attachmentGetter.getFileAttachments({ caseId: 'caseId', fileIds: ['1'] });

        expect(res).toStrictEqual([
          { ...createFileAttachment({ externalReferenceId: 'my-id' }), score: 0 },
        ]);
      });

      it('throws when the response is missing the attributes.externalReferenceAttachmentTypeId field', async () => {
        const invalidFile = { ...createFileAttachment(), score: 0 };
        unset(invalidFile, 'attributes.externalReferenceAttachmentTypeId');
        const soFindRes = createSOFindResponse([invalidFile]);

        mockFinder(soFindRes);

        await expect(
          attachmentGetter.getFileAttachments({ caseId: '1', fileIds: ['1'] })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"externalReference\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"savedObject\\" supplied to \\"externalReferenceStorage,type\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\""`
        );
      });
    });
  });

  describe('getAllAlertIds', () => {
    const aggsRes = {
      aggregations: { alertIds: { buckets: [{ key: 'alert-id-1' }, { key: 'alert-id-2' }] } },
      saved_objects: [],
      page: 1,
      per_page: 0,
      total: 0,
    };

    unsecuredSavedObjectsClient.find.mockResolvedValue(aggsRes);

    const caseId = 'test-case';

    it('returns the alert ids correctly', async () => {
      const res = await attachmentGetter.getAllAlertIds({ caseId });
      expect(Array.from(res.values())).toEqual(['alert-id-1', 'alert-id-2']);
    });

    it('calls find with correct arguments', async () => {
      await attachmentGetter.getAllAlertIds({ caseId });
      expect(unsecuredSavedObjectsClient.find.mock.calls).toMatchInlineSnapshot(`
        Array [
          Array [
            Object {
              "aggs": Object {
                "alertIds": Object {
                  "terms": Object {
                    "field": "cases-comments.attributes.alertId",
                    "size": 1000,
                  },
                },
              },
              "filter": Object {
                "arguments": Array [
                  Object {
                    "isQuoted": false,
                    "type": "literal",
                    "value": "cases-comments.attributes.type",
                  },
                  Object {
                    "isQuoted": false,
                    "type": "literal",
                    "value": "alert",
                  },
                ],
                "function": "is",
                "type": "function",
              },
              "hasReference": Object {
                "id": "test-case",
                "type": "cases",
              },
              "perPage": 0,
              "sortField": "created_at",
              "sortOrder": "asc",
              "type": "cases-comments",
            },
          ],
          Array [
            Object {
              "aggs": Object {
                "alertIds": Object {
                  "terms": Object {
                    "field": "cases-attachments.attributes.attachmentId",
                    "size": 1000,
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
                        "value": "cases-attachments.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "security.alert",
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
                        "value": "cases-attachments.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "observability.alert",
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
                        "value": "cases-attachments.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "stack.alert",
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
                "id": "test-case",
                "type": "cases",
              },
              "perPage": 0,
              "type": "cases-attachments",
            },
          ],
        ]
      `);
    });

    it('returns an empty set when there is no response', async () => {
      // @ts-expect-error
      unsecuredSavedObjectsClient.find.mockResolvedValue({});

      const res = await attachmentGetter.getAllAlertIds({ caseId });
      expect(Array.from(res.values())).toEqual([]);
    });

    it('remove duplicate keys', async () => {
      unsecuredSavedObjectsClient.find.mockResolvedValue({
        ...aggsRes,
        aggregations: { alertIds: { buckets: [{ key: 'alert-id-1' }, { key: 'alert-id-1' }] } },
      });

      const res = await attachmentGetter.getAllAlertIds({ caseId });
      expect(Array.from(res.values())).toEqual(['alert-id-1']);
    });
  });

  describe('getAllEventIds', () => {
    const caseId = 'test-case';

    it('queries both legacy and unified event ids when attachments FF is enabled', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.find.mockResolvedValue({
        aggregations: {
          legacyEventIds: { buckets: [{ key: 'legacy-event' }] },
          unifiedEventIds: { buckets: [{ key: 'unified-event' }] },
        },
        saved_objects: [],
        page: 1,
        per_page: 0,
        total: 0,
      });

      const ids = await attachmentGetterWithFlagOn.getAllEventIds({
        caseId,
        owner: 'securitySolution',
      });

      expect(Array.from(ids.values())).toEqual(['legacy-event', 'unified-event']);
      expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
          filter: expect.objectContaining({ function: 'or' }),
          aggs: expect.objectContaining({
            legacyEventIds: expect.anything(),
            unifiedEventIds: expect.anything(),
          }),
        })
      );
    });
  });

  describe('getCaseAttatchmentStats', () => {
    it('aggregates unified comment and event totals from cases-attachments', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.find
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            references: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-1',
                    doc_count: 1,
                    reverse: {
                      comments: { doc_count: 2 },
                      alerts: { value: 0 },
                      events: { value: 0 },
                    },
                  },
                ],
              },
            },
          },
        })
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            refs: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-1',
                    reverse: {
                      comments: { doc_count: 3 },
                      events: { eventIds: { value: 2 } },
                      alerts: { alertIds: { value: 0 } },
                    },
                  },
                ],
              },
            },
          },
        });

      const stats = await attachmentGetterWithFlagOn.getCaseAttatchmentStats({
        caseIds: ['case-1'],
      });

      expect(stats.get('case-1')).toEqual({
        userComments: 5,
        alerts: 0,
        events: 2,
      });
      expect(unsecuredSavedObjectsClient.find.mock.calls[1][0]).toEqual(
        expect.objectContaining({ type: CASE_ATTACHMENT_SAVED_OBJECT })
      );
    });

    it('returns unified event-only totals for cases without legacy buckets', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.find
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            references: {
              caseIds: {
                buckets: [],
              },
            },
          },
        })
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            refs: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-events-only',
                    reverse: {
                      comments: { doc_count: 0 },
                      events: { eventIds: { value: 4 } },
                      alerts: { alertIds: { value: 0 } },
                    },
                  },
                ],
              },
            },
          },
        });

      const stats = await attachmentGetterWithFlagOn.getCaseAttatchmentStats({
        caseIds: ['case-events-only'],
      });

      expect(stats.get('case-events-only')).toEqual({
        userComments: 0,
        alerts: 0,
        events: 4,
      });
    });

    it('keeps unified buckets separated per case', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.find
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            references: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-a',
                    doc_count: 1,
                    reverse: {
                      comments: { doc_count: 1 },
                      alerts: { value: 0 },
                      events: { value: 0 },
                    },
                  },
                  {
                    key: 'case-b',
                    doc_count: 1,
                    reverse: {
                      comments: { doc_count: 2 },
                      alerts: { value: 0 },
                      events: { value: 1 },
                    },
                  },
                ],
              },
            },
          },
        })
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            refs: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-a',
                    reverse: {
                      comments: { doc_count: 1 },
                      events: { eventIds: { value: 2 } },
                      alerts: { alertIds: { value: 0 } },
                    },
                  },
                  {
                    key: 'case-b',
                    reverse: {
                      comments: { doc_count: 0 },
                      events: { eventIds: { value: 3 } },
                      alerts: { alertIds: { value: 0 } },
                    },
                  },
                ],
              },
            },
          },
        });

      const stats = await attachmentGetterWithFlagOn.getCaseAttatchmentStats({
        caseIds: ['case-a', 'case-b'],
      });

      expect(stats.get('case-a')).toEqual({
        userComments: 2,
        alerts: 0,
        events: 2,
      });
      expect(stats.get('case-b')).toEqual({
        userComments: 2,
        alerts: 0,
        events: 4,
      });
    });

    it('sums unified alert ids across the per-type filter buckets', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.find
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            references: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-mixed-alerts',
                    doc_count: 1,
                    reverse: {
                      comments: { doc_count: 0 },
                      alerts: { value: 1 },
                      events: { value: 0 },
                    },
                  },
                ],
              },
            },
          },
        })
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            refs: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-mixed-alerts',
                    reverse: {
                      comments: { doc_count: 0 },
                      events: { eventIds: { value: 0 } },
                      alerts: {
                        buckets: {
                          [SECURITY_ALERT_ATTACHMENT_TYPE]: { alertIds: { value: 2 } },
                          [OBSERVABILITY_ALERT_ATTACHMENT_TYPE]: { alertIds: { value: 1 } },
                          [STACK_ALERT_ATTACHMENT_TYPE]: { alertIds: { value: 4 } },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        });

      const stats = await attachmentGetterWithFlagOn.getCaseAttatchmentStats({
        caseIds: ['case-mixed-alerts'],
      });

      expect(stats.get('case-mixed-alerts')).toEqual({
        userComments: 0,
        // 1 legacy + 2 + 1 + 4 unified across three alert types
        alerts: 8,
        events: 0,
      });
    });

    it('uses cardinality semantics for duplicated unified event ids', async () => {
      const attachmentGetterWithFlagOn = createAttachmentGetter(true);
      unsecuredSavedObjectsClient.find
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            references: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-dup-events',
                    doc_count: 1,
                    reverse: {
                      comments: { doc_count: 0 },
                      alerts: { value: 0 },
                      events: { value: 0 },
                    },
                  },
                ],
              },
            },
          },
        })
        .mockResolvedValueOnce({
          saved_objects: [],
          page: 1,
          per_page: 0,
          total: 0,
          aggregations: {
            refs: {
              caseIds: {
                buckets: [
                  {
                    key: 'case-dup-events',
                    reverse: {
                      comments: { doc_count: 0 },
                      // Cardinality should count unique values only.
                      events: { eventIds: { value: 1 } },
                      alerts: { alertIds: { value: 0 } },
                    },
                  },
                ],
              },
            },
          },
        });

      const stats = await attachmentGetterWithFlagOn.getCaseAttatchmentStats({
        caseIds: ['case-dup-events'],
      });

      expect(stats.get('case-dup-events')).toEqual({
        userComments: 0,
        alerts: 0,
        events: 1,
      });
    });
  });

  describe('getAttachmentIdsForCases', () => {
    it('always queries both legacy and unified SO types', async () => {
      mockFinder(createSOFindResponse([{ ...createUserAttachment(), score: 0 }]));

      await attachmentGetter.getAttachmentIdsForCases({ caseIds: ['case-1'] });

      expect(unsecuredSavedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
        })
      );
    });
  });
});
