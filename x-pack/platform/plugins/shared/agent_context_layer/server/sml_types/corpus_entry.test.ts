/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import type { SmlContext, SmlDocument, SmlToAttachmentContext } from '../services/sml/types';
import { corpusEntrySmlType, CORPUS_ENTRY_SML_TYPE } from './corpus_entry';

const mockSmlContext = {} as SmlContext;
const mockAttachmentContext = {} as SmlToAttachmentContext;

const baseItem: SmlDocument = {
  id: 'item-1',
  type: CORPUS_ENTRY_SML_TYPE,
  title: 'Base Title',
  content: 'base content',
  origin: { uri: `${CORPUS_ENTRY_SML_TYPE}://item-1` },
  origin_id: 'origin-1',
  spaces: ['default'],
  ingestion_method: 'manual',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
};

describe('corpusEntrySmlType', () => {
  describe('id', () => {
    it('is corpus_entry', () => {
      expect(corpusEntrySmlType.id).toBe('corpus_entry');
    });
  });

  describe('list', () => {
    it('yields nothing', async () => {
      const items: unknown[] = [];
      for await (const item of corpusEntrySmlType.list(mockSmlContext)) {
        items.push(item);
      }
      expect(items).toHaveLength(0);
    });
  });

  describe('getSmlData', () => {
    it('returns undefined', async () => {
      await expect(
        corpusEntrySmlType.getSmlData('origin-1', mockSmlContext)
      ).resolves.toBeUndefined();
    });
  });

  describe('toAttachment', () => {
    it('returns undefined when all text fields are empty', async () => {
      const result = await corpusEntrySmlType.toAttachment!(
        { ...baseItem, title: '', content: '', description: '' },
        mockAttachmentContext
      );
      expect(result).toBeUndefined();
    });

    it('returns undefined when content is whitespace only and no title or description', async () => {
      const result = await corpusEntrySmlType.toAttachment!(
        { ...baseItem, title: '', content: '   ' },
        mockAttachmentContext
      );
      expect(result).toBeUndefined();
    });

    it('builds attachment from content alone', async () => {
      const result = await corpusEntrySmlType.toAttachment!(
        { ...baseItem, title: '', content: 'body text' },
        mockAttachmentContext
      );
      expect(result).toEqual({
        id: 'item-1',
        type: AttachmentType.text,
        data: { content: 'body text' },
        readonly: true,
      });
    });

    it('folds title and content with double newline separator', async () => {
      const result = await corpusEntrySmlType.toAttachment!(
        { ...baseItem, title: 'My Title', content: 'body text' },
        mockAttachmentContext
      );
      expect(result).toEqual({
        id: 'item-1',
        type: AttachmentType.text,
        data: { content: '# My Title\n\nbody text' },
        readonly: true,
      });
    });

    it('includes description in content and sets description field', async () => {
      const result = await corpusEntrySmlType.toAttachment!(
        { ...baseItem, title: 'My Title', description: 'A summary', content: 'body text' },
        mockAttachmentContext
      );
      expect(result).toEqual({
        id: 'item-1',
        type: AttachmentType.text,
        data: { content: '# My Title\n\nA summary\n\nbody text' },
        description: 'A summary',
        readonly: true,
      });
    });

    it('does not set description field when description is absent', async () => {
      const result = await corpusEntrySmlType.toAttachment!(
        { ...baseItem, title: 'My Title', content: 'body text' },
        mockAttachmentContext
      );
      expect(result).not.toHaveProperty('description');
    });
  });
});
