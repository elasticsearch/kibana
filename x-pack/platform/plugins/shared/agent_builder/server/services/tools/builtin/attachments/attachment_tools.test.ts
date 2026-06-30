/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, attachmentTools } from '@kbn/agent-builder-common';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { createAttachmentTools } from '.';

describe('attachment tools', () => {
  let attachmentManager: AttachmentStateManager;

  const getTypeDefinition = (type: string) =>
    ({
      id: type,
      validate: (input: unknown) => ({ valid: true, data: input }),
      format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
      isReadonly: false,
    } as any);

  beforeEach(() => {
    attachmentManager = createAttachmentStateManager([], { getTypeDefinition });
  });

  const attachmentsService = {
    getTypeDefinition: () => ({
      id: 'text',
      validate: (input: unknown) => ({ valid: true, data: input }),
      format: (attachment: { data: unknown }) => ({
        getRepresentation: () => ({
          type: 'text',
          value: `formatted:${String(attachment.data)}`,
        }),
      }),
      isReadonly: false,
    }),
  } as any;

  const formatContext = { request: httpServerMock.createKibanaRequest(), spaceId: 'default' };

  const getTools = () =>
    createAttachmentTools({
      attachmentManager,
      attachmentsService,
      formatContext,
    });
  const getTool = (id: string) => getTools().find((t) => t.id === id)!;

  describe('attachment_add', () => {
    it('creates a new attachment', async () => {
      const tool = getTool(attachmentTools.add);
      const result = (await tool.handler(
        { type: 'text', data: 'hello world', description: 'Test' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.other);
      expect((result.results[0] as any).data.type).toBe('text');
      expect((result.results[0] as any).data.attachment_id).toBeDefined();
    });

    it('returns error for read-only attachment types', async () => {
      const readonlyAttachmentsService = {
        getTypeDefinition: () => ({
          id: 'text',
          validate: (input: unknown) => ({ valid: true, data: input }),
          format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
          isReadonly: true,
        }),
      } as any;

      const tool = createAttachmentTools({
        attachmentManager,
        attachmentsService: readonlyAttachmentsService,
        formatContext,
      }).find((t) => t.id === attachmentTools.add)!;

      const result = (await tool.handler(
        { type: 'text', data: 'hello world', description: 'Test' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
      expect((result.results[0] as any).data.message).toContain('read-only');
    });

    it('creates an attachment with a custom ID', async () => {
      const tool = getTool(attachmentTools.add);
      const result = (await tool.handler(
        {
          id: 'custom-id',
          type: 'text',
          data: 'hello world',
          description: 'Test',
        },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.other);
      expect((result.results[0] as any).data.attachment_id).toBe('custom-id');
      expect((result.results[0] as any).data.type).toBe('text');
    });

    it('returns error for unknown attachment type with list of valid types', async () => {
      const typedAttachmentsService = {
        getTypeDefinition: (type: string) =>
          type === 'text'
            ? {
                id: 'text',
                validate: (input: unknown) => ({ valid: true, data: input }),
                format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
                isReadonly: false,
              }
            : undefined,
        getRegisteredTypeIds: () => ['text', 'esql', 'screen_context'],
      } as any;

      const tool = createAttachmentTools({
        attachmentManager,
        attachmentsService: typedAttachmentsService,
        formatContext,
      }).find((t) => t.id === attachmentTools.add)!;

      const result = (await tool.handler(
        { type: 'image', data: 'binary data', description: 'A photo' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
      expect((result.results[0] as any).data.message).toContain("Unknown attachment type 'image'");
      expect((result.results[0] as any).data.message).toContain('text');
      expect((result.results[0] as any).data.message).toContain('esql');
      expect((result.results[0] as any).data.message).toContain('screen_context');
    });

    it('returns error for duplicate ID', async () => {
      // First, create an attachment with a specific ID
      await attachmentManager.add({
        id: 'duplicate-id',
        type: 'text',
        data: 'first',
        description: 'First',
      });

      // Try to create another attachment with the same ID
      const tool = getTool(attachmentTools.add);
      const result = (await tool.handler(
        {
          id: 'duplicate-id',
          type: 'text',
          data: 'second',
          description: 'Second',
        },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.error);
      expect((result.results[0] as any).data.message).toContain('already exists');
    });
  });

  describe('attachment_read', () => {
    it('reads an existing attachment', async () => {
      const attachment = await attachmentManager.add({
        type: 'text',
        data: 'hello',
        description: 'Test',
      });
      const tool = getTool(attachmentTools.read);
      const result = (await tool.handler(
        { attachment_id: attachment.id },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      expect((result.results[0] as any).data.type).toBe('text');
      expect((result.results[0] as any).data.data).toBe('hello');
    });

    it('reads a visualization attachment that was resolved from origin at add time', async () => {
      const resolvedData = {
        query: 'My Lens',
        visualization: { layers: [] },
        chart_type: 'bar',
        esql: 'FROM index',
      };
      const customAttachmentsService = {
        getTypeDefinition: () =>
          ({
            id: 'visualization',
            validate: (input: unknown) => ({ valid: true, data: input }),
            format: (formattedAttachment: Attachment) => ({
              getRepresentation: () => ({
                type: 'text',
                value: JSON.stringify(formattedAttachment.data),
              }),
            }),
            resolve: async () => resolvedData,
            isReadonly: false,
          } as unknown as AttachmentTypeDefinition),
      } as any;
      const resolveAttachmentManager = createAttachmentStateManager([], {
        getTypeDefinition: customAttachmentsService.getTypeDefinition,
      });

      // Add the attachment with origin — content is resolved during add()
      const resolveContext = {
        request: httpServerMock.createKibanaRequest(),
        spaceId: 'default',
        savedObjectsClient: {} as any,
      };
      const attachment = await resolveAttachmentManager.add(
        {
          type: 'visualization',
          origin: 'so-123',
          description: 'Lens ref',
        },
        undefined,
        resolveContext
      );

      // Verify origin is stored on the attachment
      expect(attachment.origin).toEqual('so-123');

      // Read should return the resolved data directly — no raw_data, no re-resolve
      const tool = createAttachmentTools({
        attachmentManager: resolveAttachmentManager,
        attachmentsService: customAttachmentsService,
        formatContext,
      }).find((t) => t.id === attachmentTools.read)!;

      const result = (await tool.handler(
        { attachment_id: attachment.id },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect((result.results[0] as any).data.type).toBe('visualization');
      // Data is the resolved content stored directly
      expect((result.results[0] as any).data.data).toEqual(resolvedData);
      // No raw_data field in the response
      expect((result.results[0] as any).data.raw_data).toBeUndefined();
    });

    it('reads a specific version', async () => {
      const attachment = await attachmentManager.add({
        type: 'text',
        data: 'v1',
        description: 'Test',
      });
      await attachmentManager.update(attachment.id, { data: 'v2' });

      const tool = getTool(attachmentTools.read);
      const result = (await tool.handler(
        { attachment_id: attachment.id, version: 1 },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect((result.results[0] as any).data.type).toBe('text');
      expect((result.results[0] as any).data.data).toBe('v1');
    });

    it('returns error for non-existent attachment', async () => {
      const tool = getTool(attachmentTools.read);
      const result = (await tool.handler(
        { attachment_id: 'non-existent' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.error);
    });
  });

  describe('attachment_update', () => {
    it('updates an attachment', async () => {
      const attachment = await attachmentManager.add({
        type: 'text',
        data: 'v1',
        description: 'Test',
      });
      const tool = getTool(attachmentTools.update);
      const result = (await tool.handler(
        { attachment_id: attachment.id, data: 'v2' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect((result.results[0] as any).data.type).toBe('text');
      expect((result.results[0] as any).data.version).toBe(2);
      expect((result.results[0] as any).data.version_created).toBe(true);
    });

    it('returns error for deleted attachment', async () => {
      const attachment = await attachmentManager.add({
        type: 'text',
        data: 'v1',
        description: 'Test',
      });
      attachmentManager.delete(attachment.id);

      const tool = getTool(attachmentTools.update);
      const result = (await tool.handler(
        { attachment_id: attachment.id, data: 'v2' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
    });

    it('returns error for read-only attachments', async () => {
      const readonlyAttachmentsService = {
        getTypeDefinition: () => ({
          id: 'text',
          validate: (input: unknown) => ({ valid: true, data: input }),
          format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
          isReadonly: true,
        }),
      } as any;

      const tool = createAttachmentTools({
        attachmentManager,
        attachmentsService: readonlyAttachmentsService,
        formatContext,
      }).find((t) => t.id === attachmentTools.update)!;

      const attachment = await attachmentManager.add({
        type: 'text',
        data: 'v1',
        description: 'Test',
      });

      const result = (await tool.handler(
        { attachment_id: attachment.id, data: 'v2' },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
      expect((result.results[0] as any).data.message).toContain('read-only');
    });
  });

  describe('attachment_list', () => {
    it('lists active attachments', async () => {
      await attachmentManager.add({ type: 'text', data: 'a1', description: 'Attachment 1' });
      await attachmentManager.add({
        type: 'json',
        data: { key: 'value' },
        description: 'Attachment 2',
      });

      const tool = getTool(attachmentTools.list);
      const result = (await tool.handler({}, {} as any)) as ToolHandlerStandardReturn;

      expect((result.results[0] as any).data.count).toBe(2);
      expect((result.results[0] as any).data.attachments).toHaveLength(2);
    });

    it('includes deleted when requested', async () => {
      const a1 = await attachmentManager.add({
        type: 'text',
        data: 'a1',
        description: 'Attachment 1',
      });
      await attachmentManager.add({ type: 'text', data: 'a2', description: 'Attachment 2' });
      attachmentManager.delete(a1.id);

      const tool = getTool(attachmentTools.list);
      const resultActive = (await tool.handler({}, {} as any)) as ToolHandlerStandardReturn;
      const resultAll = (await tool.handler(
        { include_deleted: true },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect((resultActive.results[0] as any).data.count).toBe(1);
      expect((resultAll.results[0] as any).data.count).toBe(2);
    });
  });

  describe('attachment_diff', () => {
    it('computes diff between versions', async () => {
      const attachment = await attachmentManager.add({
        type: 'text',
        data: 'version 1',
        description: 'Test',
      });
      await attachmentManager.update(attachment.id, { data: 'version 2' });

      const tool = getTool(attachmentTools.diff);
      const result = (await tool.handler(
        {
          attachment_id: attachment.id,
          from_version: 1,
          to_version: 2,
        },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect((result.results[0] as any).data.attachment_id).toBe(attachment.id);
      expect((result.results[0] as any).data.from_version).toBe(1);
      expect((result.results[0] as any).data.to_version).toBe(2);
      expect((result.results[0] as any).data.from_data).toBe('version 1');
      expect((result.results[0] as any).data.to_data).toBe('version 2');
    });

    it('returns error for non-existent attachment', async () => {
      const tool = getTool(attachmentTools.diff);
      const result = (await tool.handler(
        {
          attachment_id: 'non-existent',
          from_version: 1,
          to_version: 2,
        },
        {} as any
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
    });
  });
});
