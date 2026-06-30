/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { unset } from 'lodash';

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { AttachmentService } from '.';
import {
  externalReferenceAttachmentES,
  externalReferenceAttachmentESAttributes,
  externalReferenceAttachmentSO,
  externalReferenceAttachmentSOAttributes,
  externalReferenceAttachmentSOAttributesWithoutRefs,
  persistableStateAttachment,
  persistableStateAttachmentAttributes,
} from '../../attachment_framework/mocks';
import { createAlertAttachment, createUserAttachment } from './test_utils';
import { createErrorSO, createSOFindResponse } from '../test_utils';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  SECURITY_SOLUTION_OWNER,
} from '../../../common/constants';
import type { ConfigType } from '../../config';

const createAttachmentServiceConfig = (attachmentsEnabled = false): ConfigType =>
  ({ attachments: { enabled: attachmentsEnabled } } as ConfigType);

describe('AttachmentService', () => {
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const mockLogger = loggerMock.create();
  let service: AttachmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AttachmentService({
      log: mockLogger,
      unsecuredSavedObjectsClient,
      config: createAttachmentServiceConfig(),
    });
  });

  describe('create', () => {
    describe('Decoding', () => {
      it('does not throw when the response and the request has the required fields', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createUserAttachment());

        await expect(
          service.create({
            attributes: createUserAttachment().attributes,
            references: [],
            id: '1',
          })
        ).resolves.not.toThrow();
      });

      it('strips excess fields from the response', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createUserAttachment({ foo: 'bar' }));

        const res = await service.create({
          attributes: createUserAttachment().attributes,
          references: [],
          id: '1',
        });

        expect(res).toStrictEqual(createUserAttachment());
      });

      it('throws when the response is missing the attributes.comment', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.create.mockResolvedValue(invalidAttachment);

        await expect(
          service.create({
            attributes: createUserAttachment().attributes,
            references: [],
            id: '1',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\""`
        );
      });

      it('throws when the request is missing the attributes.comment', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.create.mockResolvedValue(createUserAttachment());

        await expect(
          service.create({
            attributes: invalidAttachment.attributes,
            references: [],
            id: '1',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\",Invalid value \\"undefined\\" supplied to \\"attachmentId\\",Invalid value \\"undefined\\" supplied to \\"data\\""`
        );
      });

      it('strips excess fields from the request', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue(createUserAttachment());

        await service.create({
          // @ts-expect-error: excess attributes
          attributes: { ...createUserAttachment().attributes, foo: 'bar' },
          references: [],
          id: '1',
        });

        const persistedAttributes = unsecuredSavedObjectsClient.create.mock.calls[0][1];
        expect(persistedAttributes).not.toHaveProperty('foo');
      });
    });
  });

  describe('bulkCreate', () => {
    describe('Decoding', () => {
      it('does not throw when the response and the request has the required fields', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        await expect(
          service.bulkCreate({
            attachments: [
              { attributes: createUserAttachment().attributes, references: [], id: '1' },
            ],
          })
        ).resolves.not.toThrow();
      });

      it('returns error objects unmodified', async () => {
        const userAttachment = createUserAttachment({ foo: 'bar' });

        const errorResponseObj = createErrorSO(CASE_COMMENT_SAVED_OBJECT);

        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          // @ts-expect-error: SO client types are wrong
          saved_objects: [errorResponseObj, userAttachment],
        });

        const res = await service.bulkCreate({
          attachments: [
            { attributes: createUserAttachment().attributes, references: [], id: '1' },
            { attributes: createUserAttachment().attributes, references: [], id: '1' },
          ],
        });

        expect(res).toStrictEqual({ saved_objects: [errorResponseObj, createUserAttachment()] });
      });

      it('strips excess fields', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createUserAttachment({ foo: 'bar' })],
        });

        const res = await service.bulkCreate({
          attachments: [{ attributes: createUserAttachment().attributes, references: [], id: '1' }],
        });

        expect(res).toStrictEqual({ saved_objects: [createUserAttachment()] });
      });

      it('throws when the response is missing the attributes.comment field', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [invalidAttachment],
        });

        await expect(
          service.bulkCreate({
            attachments: [
              { attributes: createUserAttachment().attributes, references: [], id: '1' },
            ],
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\""`
        );
      });

      it('throws when the request is missing the attributes.comment', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        await expect(
          service.bulkCreate({
            attachments: [{ attributes: invalidAttachment.attributes, references: [], id: '1' }],
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\",Invalid value \\"undefined\\" supplied to \\"attachmentId\\",Invalid value \\"undefined\\" supplied to \\"data\\""`
        );
      });

      it('strips excess fields from the request', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        await service.bulkCreate({
          attachments: [
            {
              // @ts-expect-error: excess attributes
              attributes: { ...createUserAttachment().attributes, foo: 'bar' },
              references: [],
              id: '1',
            },
          ],
        });

        const persistedAttributes = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0][0];
        expect(persistedAttributes.attributes).not.toHaveProperty('foo');
      });
    });
  });

  describe('feature flag (config.attachments.enabled)', () => {
    it('when enabled, create writes to CASE_ATTACHMENT_SAVED_OBJECT with unified attributes', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });
      const unifiedAttrs = {
        type: 'comment',
        data: { content: 'hello' },
        owner: SECURITY_SOLUTION_OWNER,
        created_at: '2024-01-01T00:00:00.000Z',
        created_by: { username: 'u', full_name: null, email: null },
        pushed_at: null,
        pushed_by: null,
        updated_at: null,
        updated_by: null,
      };
      unsecuredSavedObjectsClient.create.mockResolvedValue({
        id: '1',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
        attributes: unifiedAttrs,
        references: [],
      });

      await serviceWithFlagOn.create({
        attributes: unifiedAttrs,
        references: [],
        id: '1',
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        CASE_ATTACHMENT_SAVED_OBJECT,
        expect.objectContaining({ type: 'comment', data: { content: 'hello' } }),
        expect.any(Object)
      );
    });

    it('when enabled, unified file create round-trips: extracts `attachmentId` to refs on write and re-injects it on the response', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });

      const fileMetadata = {
        files: [
          {
            name: 'screenshot',
            extension: 'png',
            mimeType: 'image/png',
            created: '2024-01-01T00:00:00.000Z',
          },
        ],
        soType: 'file' as const,
      };

      const fileAttrs = {
        type: 'file' as const,
        attachmentId: 'file-id-1',
        metadata: fileMetadata,
        owner: SECURITY_SOLUTION_OWNER,
        created_at: '2024-01-01T00:00:00.000Z',
        created_by: { username: 'u', full_name: null, email: null },
        pushed_at: null,
        pushed_by: null,
        updated_at: null,
        updated_by: null,
      };

      // SO-client `create` is what the production extractor would have written:
      // `attachmentId` left on attributes AND mirrored into references.
      unsecuredSavedObjectsClient.create.mockResolvedValue({
        id: '1',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
        attributes: fileAttrs,
        references: [{ id: 'file-id-1', name: 'attachmentId', type: 'file' }],
      });

      const result = await serviceWithFlagOn.create({
        attributes: fileAttrs,
        references: [],
        id: '1',
      });

      const writeCall = unsecuredSavedObjectsClient.create.mock.calls[0];
      expect(writeCall[0]).toBe(CASE_ATTACHMENT_SAVED_OBJECT);
      const writtenRefs =
        (writeCall[2] as { references?: Array<{ name: string }> }).references ?? [];
      expect(writtenRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'file-id-1', name: 'attachmentId', type: 'file' }),
        ])
      );

      // Response shape preserves the unified `attachmentId` for downstream callers.
      expect(result.attributes).toEqual(
        expect.objectContaining({ type: 'file', attachmentId: 'file-id-1' })
      );
    });

    it('when disabled, create writes to CASE_COMMENT_SAVED_OBJECT with legacy attributes', async () => {
      unsecuredSavedObjectsClient.create.mockResolvedValue(createUserAttachment());

      await service.create({
        attributes: createUserAttachment().attributes,
        references: [],
        id: '1',
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        CASE_COMMENT_SAVED_OBJECT,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('when enabled, bulkCreate writes to CASE_ATTACHMENT_SAVED_OBJECT', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });
      const unifiedAttrs = {
        type: 'comment',
        data: { content: 'hi' },
        owner: SECURITY_SOLUTION_OWNER,
        created_at: '2024-01-01T00:00:00.000Z',
        created_by: { username: 'u', full_name: null, email: null },
        pushed_at: null,
        pushed_by: null,
        updated_at: null,
        updated_by: null,
      };
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          { id: '1', type: CASE_ATTACHMENT_SAVED_OBJECT, attributes: unifiedAttrs, references: [] },
        ],
      });

      await serviceWithFlagOn.bulkCreate({
        attachments: [{ attributes: unifiedAttrs, references: [], id: '1' }],
        refresh: false,
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: CASE_ATTACHMENT_SAVED_OBJECT,
            attributes: expect.objectContaining({ type: 'comment', data: { content: 'hi' } }),
          }),
        ]),
        expect.any(Object)
      );
    });

    it('when enabled, bulkUpdate accepts partial attributes for push metadata only', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });
      const unifiedAttrs = {
        type: 'comment',
        data: { content: 'hello' },
        owner: SECURITY_SOLUTION_OWNER,
        created_at: '2024-01-01T00:00:00.000Z',
        created_by: { username: 'u', full_name: null, email: null },
        pushed_at: null,
        pushed_by: null,
        updated_at: null,
        updated_by: null,
      };
      const pushedAt = '2024-01-02T00:00:00.000Z';
      const pushedBy = { username: 'pusher', full_name: null, email: null };
      unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
        saved_objects: [
          {
            id: 'ef2942ed-c4b6-4dd4-a85b-8ce90e8f2d47',
            type: CASE_ATTACHMENT_SAVED_OBJECT,
            attributes: { ...unifiedAttrs, pushed_at: pushedAt, pushed_by: pushedBy },
            references: [],
            version: 'v2',
          },
        ],
      });

      await expect(
        serviceWithFlagOn.bulkUpdate({
          comments: [
            {
              savedObjectId: 'ef2942ed-c4b6-4dd4-a85b-8ce90e8f2d47',
              updatedAttributes: { pushed_at: pushedAt, pushed_by: pushedBy },
            },
          ],
          refresh: false,
          requestWithoutType: true,
        })
      ).resolves.not.toThrow();

      expect(unsecuredSavedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: CASE_ATTACHMENT_SAVED_OBJECT,
            id: 'ef2942ed-c4b6-4dd4-a85b-8ce90e8f2d47',
            attributes: { pushed_at: pushedAt, pushed_by: pushedBy },
          }),
        ],
        expect.any(Object)
      );
    });

    it('when enabled, bulkUpdate throws for typed patches without owner when requestWithoutType is false', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });

      await expect(
        serviceWithFlagOn.bulkUpdate({
          comments: [
            {
              savedObjectId: 'ef2942ed-c4b6-4dd4-a85b-8ce90e8f2d47',
              updatedAttributes: { type: 'comment', data: { content: 'hello' } },
            },
          ],
          refresh: false,
          requestWithoutType: false,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid attributes: expected owner when transforming attachment patch"`
      );
    });

    it('when disabled, bulkCreate writes to CASE_COMMENT_SAVED_OBJECT', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [createUserAttachment()],
      });

      await service.bulkCreate({
        attachments: [{ attributes: createUserAttachment().attributes, references: [], id: '1' }],
        refresh: false,
      });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ type: CASE_COMMENT_SAVED_OBJECT })]),
        expect.any(Object)
      );
    });

    // Regression: when a unified-shape payload (e.g. `security.endpoint`) is
    // written via the legacy `cases-comments` storage, the persisted SO must be
    // byte-for-byte equivalent to a pre-migration legacy attachment — i.e. no
    // orphan `attachmentId: null`, `metadata: null`, or `data: null` keys
    // leaking from the unified shape into the legacy `_source`.
    describe('byte-for-byte legacy storage equivalence', () => {
      const unifiedEndpointAttrs = {
        type: 'security.endpoint',
        attachmentId: 'sec-endpoint-1',
        // Post-lift wire shape: analyst comment lives on `data.content`, metadata
        // carries only the machine-derived facts (`command`, `targets`). The legacy
        // round-trip lowers `data.content` back into `externalReferenceMetadata.comment`.
        data: { content: 'isolated by op' },
        metadata: {
          command: 'isolate',
          targets: [
            {
              endpointId: 'endpoint-1',
              hostname: 'host-1',
              agentType: 'endpoint' as const,
            },
          ],
        },
        owner: SECURITY_SOLUTION_OWNER,
        created_at: '2024-01-01T00:00:00.000Z',
        created_by: { username: 'u', full_name: null, email: null },
        pushed_at: null,
        pushed_by: null,
        updated_at: null,
        updated_by: null,
      };

      const expectNoUnifiedOrphans = (persistedAttributes: unknown): void => {
        expect(persistedAttributes).not.toHaveProperty('attachmentId');
        expect(persistedAttributes).not.toHaveProperty('metadata');
        expect(persistedAttributes).not.toHaveProperty('data');
      };

      it('create strips attachmentId/metadata/data when writing unified payload to cases-comments', async () => {
        unsecuredSavedObjectsClient.create.mockResolvedValue({
          id: '1',
          type: CASE_COMMENT_SAVED_OBJECT,
          attributes: { ...createUserAttachment().attributes },
          references: [],
        });

        await service.create({
          attributes: unifiedEndpointAttrs,
          references: [],
          id: '1',
        });

        const [soType, persistedAttributes] = unsecuredSavedObjectsClient.create.mock.calls[0];
        expect(soType).toBe(CASE_COMMENT_SAVED_OBJECT);
        expectNoUnifiedOrphans(persistedAttributes);
        // Sanity: the payload was actually converted to legacy externalReference shape.
        expect(persistedAttributes).toEqual(
          expect.objectContaining({
            type: 'externalReference',
            externalReferenceId: 'sec-endpoint-1',
            externalReferenceAttachmentTypeId: 'endpoint',
          })
        );
      });

      it('create throws Boom 400 for unified-only types (no legacy equivalent) when attachments flag is off', async () => {
        const entityAttrs = {
          type: SECURITY_ENTITY_ATTACHMENT_TYPE,
          attachmentId: 'entity-1',
          metadata: { entityName: 'alice', entityType: 'user' },
          owner: SECURITY_SOLUTION_OWNER,
          created_at: '2024-01-01T00:00:00.000Z',
          created_by: { username: 'u', full_name: null, email: null },
          pushed_at: null,
          pushed_by: null,
          updated_at: null,
          updated_by: null,
        };

        await expect(
          service.create({ attributes: entityAttrs, references: [], id: '1' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 400 },
          message: expect.stringContaining(SECURITY_ENTITY_ATTACHMENT_TYPE),
        });

        expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
      });

      it('bulkCreate throws Boom 400 for unified-only types (no legacy equivalent) when attachments flag is off', async () => {
        const entityAttrs = {
          type: SECURITY_ENTITY_ATTACHMENT_TYPE,
          attachmentId: 'entity-1',
          metadata: { entityName: 'alice', entityType: 'user' },
          owner: SECURITY_SOLUTION_OWNER,
          created_at: '2024-01-01T00:00:00.000Z',
          created_by: { username: 'u', full_name: null, email: null },
          pushed_at: null,
          pushed_by: null,
          updated_at: null,
          updated_by: null,
        };

        await expect(
          service.bulkCreate({
            attachments: [{ attributes: entityAttrs, references: [], id: '1' }],
            refresh: false,
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 400 },
          message: expect.stringContaining(SECURITY_ENTITY_ATTACHMENT_TYPE),
        });

        expect(unsecuredSavedObjectsClient.bulkCreate).not.toHaveBeenCalled();
      });

      it('bulkCreate strips attachmentId/metadata/data when writing unified payload to cases-comments', async () => {
        unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        await service.bulkCreate({
          attachments: [{ attributes: unifiedEndpointAttrs, references: [], id: '1' }],
          refresh: false,
        });

        const persistedSos = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0];
        expect(persistedSos).toHaveLength(1);
        expect(persistedSos[0].type).toBe(CASE_COMMENT_SAVED_OBJECT);
        expectNoUnifiedOrphans(persistedSos[0].attributes);
        expect(persistedSos[0].attributes).toEqual(
          expect.objectContaining({
            type: 'externalReference',
            externalReferenceId: 'sec-endpoint-1',
            externalReferenceAttachmentTypeId: 'endpoint',
          })
        );
      });

      it('update strips attachmentId/metadata/data when writing unified payload to cases-comments', async () => {
        // `update` first resolves the SO type via `resolveAttachmentSavedObjectType`,
        // which probes `cases-attachments` then falls back to `cases-comments`.
        // Simulate the legacy-only state: 404 on the unified type, hit on the legacy type.
        unsecuredSavedObjectsClient.get.mockImplementation((type: string) => {
          if (type === CASE_ATTACHMENT_SAVED_OBJECT) {
            return Promise.reject(Object.assign(new Error('Not found'), { statusCode: 404 }));
          }
          return Promise.resolve(createUserAttachment());
        });

        unsecuredSavedObjectsClient.update.mockResolvedValue(createUserAttachment());

        await service.update({
          savedObjectId: '1',
          updatedAttributes: unifiedEndpointAttrs,
          options: { references: [] },
        });

        const [soType, , persistedAttributes] = unsecuredSavedObjectsClient.update.mock.calls[0];
        expect(soType).toBe(CASE_COMMENT_SAVED_OBJECT);
        expectNoUnifiedOrphans(persistedAttributes);
        expect(persistedAttributes).toEqual(
          expect.objectContaining({
            type: 'externalReference',
            externalReferenceId: 'sec-endpoint-1',
            externalReferenceAttachmentTypeId: 'endpoint',
          })
        );
      });

      it('bulkUpdate strips attachmentId/metadata/data when writing unified payload to cases-comments', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        await service.bulkUpdate({
          comments: [
            {
              savedObjectId: '1',
              updatedAttributes: unifiedEndpointAttrs,
              options: { references: [] },
            },
          ],
        });

        const persistedSos = unsecuredSavedObjectsClient.bulkUpdate.mock.calls[0][0];
        expect(persistedSos).toHaveLength(1);
        expect(persistedSos[0].type).toBe(CASE_COMMENT_SAVED_OBJECT);
        expectNoUnifiedOrphans(persistedSos[0].attributes);
        expect(persistedSos[0].attributes).toEqual(
          expect.objectContaining({
            type: 'externalReference',
            externalReferenceId: 'sec-endpoint-1',
            externalReferenceAttachmentTypeId: 'endpoint',
          })
        );
      });
    });
  });

  describe('update', () => {
    const soClientRes = {
      id: '1',
      attributes: persistableStateAttachmentAttributes,
      references: [],
      version: 'test',
      type: 'cases-comments',
    };

    beforeEach(() => {
      unsecuredSavedObjectsClient.get.mockImplementation((type: string, id: string) => {
        if (type === CASE_ATTACHMENT_SAVED_OBJECT) {
          return Promise.reject(Object.assign(new Error('Not found'), { statusCode: 404 }));
        }
        if (type === CASE_COMMENT_SAVED_OBJECT) {
          return Promise.resolve(createUserAttachment());
        }
        return Promise.reject(new Error('Unknown type'));
      });
    });

    it('should inject the references to the attributes correctly (persistable state)', async () => {
      unsecuredSavedObjectsClient.update.mockResolvedValue(soClientRes);

      const res = await service.update({
        savedObjectId: '1',
        updatedAttributes: persistableStateAttachment,
        options: { references: [] },
      });

      expect(res).toEqual({ ...soClientRes, attributes: persistableStateAttachmentAttributes });
    });

    it('should inject the references to the attributes correctly (external reference savedObject)', async () => {
      unsecuredSavedObjectsClient.update.mockResolvedValue({
        ...soClientRes,
        attributes: externalReferenceAttachmentSOAttributesWithoutRefs,
      });

      const res = await service.update({
        savedObjectId: '1',
        updatedAttributes: externalReferenceAttachmentSO,
        options: { references: [] },
      });

      expect(res).toEqual({ ...soClientRes, attributes: externalReferenceAttachmentSOAttributes });
    });

    it('should inject the references to the attributes correctly (external reference elasticSearchDoc)', async () => {
      unsecuredSavedObjectsClient.update.mockResolvedValue({
        ...soClientRes,
        attributes: externalReferenceAttachmentESAttributes,
      });

      const res = await service.update({
        savedObjectId: '1',
        updatedAttributes: externalReferenceAttachmentESAttributes,
        options: { references: [] },
      });

      expect(res).toEqual({ ...soClientRes, attributes: externalReferenceAttachmentESAttributes });
    });

    describe('Decoding', () => {
      it('does not throw when the response and the request has the required fields', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(createUserAttachment());

        await expect(
          service.update({
            updatedAttributes: createUserAttachment().attributes,
            savedObjectId: '1',
          })
        ).resolves.not.toThrow();
      });

      it('strips excess fields', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(createUserAttachment({ foo: 'bar' }));

        const res = await service.update({
          updatedAttributes: createUserAttachment().attributes,
          savedObjectId: '1',
        });

        expect(res).toStrictEqual(createUserAttachment());
      });

      it('throws when the response is missing the attributes.rule.name', async () => {
        const invalidAttachment = createAlertAttachment();
        unset(invalidAttachment, 'attributes.rule.name');

        unsecuredSavedObjectsClient.update.mockResolvedValue(invalidAttachment);

        await expect(
          service.update({
            updatedAttributes: createAlertAttachment().attributes,
            savedObjectId: '1',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid attributes: expected attributes.rule.name for alert attachments"`
        );
      });

      it('throws when the request is missing the attributes.rule.name', async () => {
        const invalidAttachment = createAlertAttachment();
        unset(invalidAttachment, 'attributes.rule.name');

        unsecuredSavedObjectsClient.update.mockResolvedValue(createAlertAttachment());

        await expect(
          service.update({
            updatedAttributes: invalidAttachment.attributes,
            savedObjectId: '1',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid attributes: expected attributes.rule.name for alert attachments"`
        );
      });

      it('strips excess fields from the request', async () => {
        unsecuredSavedObjectsClient.update.mockResolvedValue(createUserAttachment());

        await service.update({
          // @ts-expect-error: excess attributes
          updatedAttributes: { ...createUserAttachment().attributes, foo: 'bar' },
          savedObjectId: '1',
        });

        const persistedAttributes = unsecuredSavedObjectsClient.update.mock.calls[0][2];
        expect(persistedAttributes).not.toHaveProperty('foo');
      });

      it('carries the owner through to the response', async () => {
        const attachment = createUserAttachment();
        unsecuredSavedObjectsClient.update.mockResolvedValue(attachment);

        const res = await service.update({
          updatedAttributes: attachment.attributes,
          savedObjectId: '1',
        });

        expect(res.attributes.owner).toBe(attachment.attributes.owner);
      });

      it('throws Boom 400 for unified-only types when the attachments flag is off', async () => {
        const entityAttrs = {
          type: SECURITY_ENTITY_ATTACHMENT_TYPE,
          attachmentId: 'entity-1',
          metadata: { entityName: 'alice', entityType: 'user' },
          owner: SECURITY_SOLUTION_OWNER,
          created_at: '2024-01-01T00:00:00.000Z',
          created_by: { username: 'u', full_name: null, email: null },
          pushed_at: null,
          pushed_by: null,
          updated_at: null,
          updated_by: null,
        };

        await expect(
          service.update({ updatedAttributes: entityAttrs, savedObjectId: '1' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 400 },
          message: expect.stringContaining(SECURITY_ENTITY_ATTACHMENT_TYPE),
        });

        expect(unsecuredSavedObjectsClient.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('bulkUpdate', () => {
    const soClientRes = {
      id: '1',
      attributes: persistableStateAttachmentAttributes,
      references: [],
      version: 'test',
      type: 'cases-comments',
    };

    it('should inject the references to the attributes correctly (persistable state)', async () => {
      unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
        saved_objects: [
          soClientRes,
          {
            ...soClientRes,
            attributes: externalReferenceAttachmentSOAttributesWithoutRefs,
          },
          {
            ...soClientRes,
            attributes: externalReferenceAttachmentESAttributes,
          },
        ],
      });

      const res = await service.bulkUpdate({
        comments: [
          {
            savedObjectId: '1',
            updatedAttributes: persistableStateAttachment,
            options: { references: [] },
          },
          {
            savedObjectId: '2',
            updatedAttributes: externalReferenceAttachmentSO,
            options: { references: [] },
          },
          {
            savedObjectId: '3',
            updatedAttributes: externalReferenceAttachmentES,
            options: { references: [] },
          },
        ],
      });

      expect(res).toEqual({
        saved_objects: [
          { ...soClientRes, attributes: persistableStateAttachmentAttributes },
          { ...soClientRes, attributes: externalReferenceAttachmentSOAttributes },
          { ...soClientRes, attributes: externalReferenceAttachmentESAttributes },
        ],
      });
    });

    describe('Decoding', () => {
      it('does not throw when the response and the request has the required fields', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        const updatedAttributes = createUserAttachment().attributes;

        await expect(
          service.bulkUpdate({ comments: [{ savedObjectId: '1', updatedAttributes }] })
        ).resolves.not.toThrow();
      });

      it('returns error objects unmodified', async () => {
        const userAttachment = createUserAttachment({ foo: 'bar' });

        const errorResponseObj = createErrorSO(CASE_COMMENT_SAVED_OBJECT);

        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          // @ts-expect-error: SO client types are wrong
          saved_objects: [errorResponseObj, userAttachment],
        });

        const res = await service.bulkUpdate({
          comments: [
            { savedObjectId: '1', updatedAttributes: userAttachment.attributes },
            { savedObjectId: '1', updatedAttributes: userAttachment.attributes },
          ],
        });

        expect(res).toStrictEqual({ saved_objects: [errorResponseObj, createUserAttachment()] });
      });

      it('strips excess fields', async () => {
        const updatedAttributes = createUserAttachment().attributes;

        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [createUserAttachment({ foo: 'bar' })],
        });

        const res = await service.bulkUpdate({
          comments: [{ savedObjectId: '1', updatedAttributes }],
        });

        expect(res).toStrictEqual({ saved_objects: [createUserAttachment()] });
      });

      it('throws when the response is missing the attributes.rule.name field', async () => {
        const invalidAttachment = createAlertAttachment();
        unset(invalidAttachment, 'attributes.rule.name');

        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [invalidAttachment],
        });

        const updatedAttributes = createAlertAttachment().attributes;

        await expect(
          service.bulkUpdate({ comments: [{ savedObjectId: '1', updatedAttributes }] })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid attributes: expected attributes.rule.name for alert attachments"`
        );
      });

      it('throws when the request is missing the attributes.rule.name', async () => {
        const invalidAttachment = createAlertAttachment();
        unset(invalidAttachment, 'attributes.rule.name');

        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [createAlertAttachment()],
        });

        await expect(
          service.bulkUpdate({
            comments: [
              {
                updatedAttributes: invalidAttachment.attributes,
                savedObjectId: '1',
              },
            ],
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid attributes: expected attributes.rule.name for alert attachments"`
        );
      });

      it('strips excess fields from the request', async () => {
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [createUserAttachment()],
        });

        await service.bulkUpdate({
          comments: [
            {
              // @ts-expect-error: excess attributes
              updatedAttributes: { ...createUserAttachment().attributes, foo: 'bar' },
              savedObjectId: '1',
            },
          ],
        });

        const persistedAttributes =
          unsecuredSavedObjectsClient.bulkUpdate.mock.calls[0][0][0].attributes;

        expect(persistedAttributes).not.toHaveProperty('foo');
      });

      it('carries the owner through to the response', async () => {
        const attachment = createUserAttachment();
        unsecuredSavedObjectsClient.bulkUpdate.mockResolvedValue({
          saved_objects: [attachment],
        });

        const res = await service.bulkUpdate({
          comments: [{ savedObjectId: '1', updatedAttributes: attachment.attributes }],
        });

        expect(res.saved_objects[0].attributes.owner).toBe(attachment.attributes.owner);
      });

      it('throws Boom 400 for unified-only types when the attachments flag is off', async () => {
        const entityAttrs = {
          type: SECURITY_ENTITY_ATTACHMENT_TYPE,
          attachmentId: 'entity-1',
          metadata: { entityName: 'alice', entityType: 'user' },
          owner: SECURITY_SOLUTION_OWNER,
          created_at: '2024-01-01T00:00:00.000Z',
          created_by: { username: 'u', full_name: null, email: null },
          pushed_at: null,
          pushed_by: null,
          updated_at: null,
          updated_by: null,
        };

        await expect(
          service.bulkUpdate({
            comments: [{ savedObjectId: '1', updatedAttributes: entityAttrs }],
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 400 },
          message: expect.stringContaining(SECURITY_ENTITY_ATTACHMENT_TYPE),
        });

        expect(unsecuredSavedObjectsClient.bulkUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe('bulkDelete', () => {
    it('calls bulkDelete with both CASE_ATTACHMENT_SAVED_OBJECT and CASE_COMMENT_SAVED_OBJECT for each id', async () => {
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({ statuses: [] });

      await service.bulkDelete({ savedObjectIds: ['id-1', 'id-2'], refresh: false });

      expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledTimes(1);
      const [deleteRequests] = unsecuredSavedObjectsClient.bulkDelete.mock.calls[0];
      expect(deleteRequests).toHaveLength(4);
      const byId = (deleteRequests as Array<{ id: string; type: string }>).reduce((acc, r) => {
        if (!acc[r.id]) acc[r.id] = [];
        acc[r.id].push(r.type);
        return acc;
      }, {} as Record<string, string[]>);
      expect(byId['id-1']).toEqual(
        expect.arrayContaining([CASE_ATTACHMENT_SAVED_OBJECT, CASE_COMMENT_SAVED_OBJECT])
      );
      expect(byId['id-2']).toEqual(
        expect.arrayContaining([CASE_ATTACHMENT_SAVED_OBJECT, CASE_COMMENT_SAVED_OBJECT])
      );
    });
  });

  describe('find', () => {
    it('uses a single paginated find call when feature flag is enabled', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });
      unsecuredSavedObjectsClient.find.mockResolvedValue(
        createSOFindResponse([{ ...createUserAttachment(), score: 0 }])
      );

      await serviceWithFlagOn.find({
        mode: 'legacy',
        options: {
          page: 1,
          perPage: 10,
        },
      });

      expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          perPage: 10,
          type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
        })
      );
    });

    it('queries only legacy SO type when feature flag is disabled', async () => {
      unsecuredSavedObjectsClient.find.mockResolvedValue(
        createSOFindResponse([{ ...createUserAttachment(), score: 0 }])
      );

      await service.find({ mode: 'legacy' });

      expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CASE_COMMENT_SAVED_OBJECT,
        })
      );
    });

    it('queries both legacy and unified comment SO types when feature flag is enabled', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });
      unsecuredSavedObjectsClient.find.mockResolvedValue(
        createSOFindResponse([{ ...createUserAttachment(), score: 0 }])
      );

      await serviceWithFlagOn.find({ mode: 'legacy' });

      expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT],
        })
      );
    });

    it('transforms unified comment find results to legacy output', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });
      unsecuredSavedObjectsClient.find.mockResolvedValue(
        createSOFindResponse([
          {
            id: 'unified-1',
            type: CASE_ATTACHMENT_SAVED_OBJECT,
            score: 0,
            attributes: {
              type: 'comment',
              data: { content: 'from unified' },
              owner: SECURITY_SOLUTION_OWNER,
              metadata: { owner: SECURITY_SOLUTION_OWNER },
              created_at: '2024-01-01T00:00:00.000Z',
              created_by: { username: 'u', full_name: null, email: null },
              pushed_at: null,
              pushed_by: null,
              updated_at: null,
              updated_by: null,
            },
            references: [],
          },
        ])
      );

      const res = await serviceWithFlagOn.find({ mode: 'legacy' });

      expect(res.saved_objects[0].attributes).toMatchObject({
        type: 'user',
        comment: 'from unified',
        owner: SECURITY_SOLUTION_OWNER,
      });
    });

    describe('Decoding', () => {
      it('does not throw when the response has the required fields', async () => {
        unsecuredSavedObjectsClient.find.mockResolvedValue(
          createSOFindResponse([{ ...createUserAttachment(), score: 0 }])
        );

        await expect(service.find({ mode: 'legacy' })).resolves.not.toThrow();
      });

      it('strips excess fields', async () => {
        unsecuredSavedObjectsClient.find.mockResolvedValue(
          createSOFindResponse([{ ...createUserAttachment({ foo: 'bar' }), score: 0 }])
        );

        const res = await service.find({ mode: 'legacy' });

        expect(res).toStrictEqual(createSOFindResponse([{ ...createUserAttachment(), score: 0 }]));
      });

      it('throws when the response is missing the attributes.rule.name field', async () => {
        const invalidAttachment = createUserAttachment();
        unset(invalidAttachment, 'attributes.comment');

        unsecuredSavedObjectsClient.find.mockResolvedValue(
          createSOFindResponse([{ ...invalidAttachment, score: 0 }])
        );

        await expect(service.find({ mode: 'legacy' })).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Invalid value \\"undefined\\" supplied to \\"comment\\",Invalid value \\"user\\" supplied to \\"type\\",Invalid value \\"undefined\\" supplied to \\"alertId\\",Invalid value \\"undefined\\" supplied to \\"index\\",Invalid value \\"undefined\\" supplied to \\"rule\\",Invalid value \\"undefined\\" supplied to \\"eventId\\",Invalid value \\"undefined\\" supplied to \\"actions\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceMetadata\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceId\\",Invalid value \\"undefined\\" supplied to \\"externalReferenceStorage\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentTypeId\\",Invalid value \\"undefined\\" supplied to \\"persistableStateAttachmentState\\""`
        );
      });
    });
  });

  describe('countPersistableStateAndExternalReferenceAttachments', () => {
    it('does not throw and calls unsecuredSavedObjectsClient.find with the right parameters', async () => {
      unsecuredSavedObjectsClient.find.mockResolvedValue(
        createSOFindResponse([{ ...createUserAttachment(), score: 0 }])
      );

      await expect(
        service.countPersistableStateAndExternalReferenceAttachments({ caseId: 'test-id' })
      ).resolves.not.toThrow();

      expect(unsecuredSavedObjectsClient.find.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "filter": Object {
            "arguments": Array [
              Object {
                "arguments": Array [
                  Object {
                    "arguments": Array [
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "cases-comments.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "persistableState",
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
                        "value": "cases-comments.attributes.type",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "externalReference",
                      },
                    ],
                    "function": "is",
                    "type": "function",
                  },
                ],
                "function": "or",
                "type": "function",
              },
              Object {
                "arguments": Array [
                  Object {
                    "arguments": Array [
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": "cases-comments.attributes.externalReferenceAttachmentTypeId",
                      },
                      Object {
                        "isQuoted": false,
                        "type": "literal",
                        "value": ".files",
                      },
                    ],
                    "function": "is",
                    "type": "function",
                  },
                ],
                "function": "not",
                "type": "function",
              },
            ],
            "function": "and",
            "type": "function",
          },
          "hasReference": Object {
            "id": "test-id",
            "type": "cases",
          },
          "page": 1,
          "perPage": 1,
          "sortField": "created_at",
          "type": "cases-comments",
        }
      `);
    });

    it('returns the expected total', async () => {
      const total = 3;

      unsecuredSavedObjectsClient.find.mockResolvedValue(
        createSOFindResponse(
          Array(total).fill({ ...createUserAttachment({ foo: 'bar' }), score: 0 })
        )
      );

      const res = await service.countPersistableStateAndExternalReferenceAttachments({
        caseId: 'test-id',
      });

      expect(res).toBe(total);
    });

    it('when enabled, sums legacy + unified counts and excludes `file` from the unified type filter', async () => {
      const serviceWithFlagOn = new AttachmentService({
        log: mockLogger,
        unsecuredSavedObjectsClient,
        config: createAttachmentServiceConfig(true),
      });

      unsecuredSavedObjectsClient.find
        .mockResolvedValueOnce(
          createSOFindResponse(Array(2).fill({ ...createUserAttachment({ foo: 'bar' }), score: 0 }))
        )
        .mockResolvedValueOnce(
          createSOFindResponse(Array(3).fill({ ...createUserAttachment({ foo: 'bar' }), score: 0 }))
        );

      const res = await serviceWithFlagOn.countPersistableStateAndExternalReferenceAttachments({
        caseId: 'test-id',
      });

      expect(res).toBe(5);
      expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledTimes(2);

      const unifiedCallArgs = unsecuredSavedObjectsClient.find.mock.calls[1][0];
      expect(unifiedCallArgs.type).toBe('cases-attachments');

      const filterAsString = JSON.stringify(unifiedCallArgs.filter);
      expect(filterAsString).not.toMatch(/"value":\s*"file"/);
    });
  });
});
