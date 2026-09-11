/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type {
  AgentFormattedAttachment,
  AttachmentFormatContext,
  AttachmentTypeDefinition,
} from '@kbn/agent-builder-server/attachments';
import { AS_CODE_ESQL_DATA_SOURCE_TYPE } from '@kbn/as-code-data-views-schema';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../common/agent_builder';
import { createDiscoverSessionAttachmentType } from './create_discover_session_attachment';

const esqlTab = {
  id: 'tab-1',
  label: 'Documents',
  data_source: {
    type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
    query: 'FROM logs-* | WHERE status >= 500 | LIMIT 100',
  },
  hide_chart: true,
  time_range: { from: 'now-24h', to: 'now' },
  column_order: ['@timestamp', 'status', 'message'],
};

const createFormatContext = (): AttachmentFormatContext => ({
  request: httpServerMock.createKibanaRequest(),
  spaceId: 'default',
});

const createAttachment = (data: unknown): Attachment => ({
  id: 'test',
  type: DISCOVER_SESSION_ATTACHMENT_TYPE,
  data: data as Record<string, unknown>,
});

const getFormattedText = (formatted: AgentFormattedAttachment): string => {
  const representation = formatted.getRepresentation!();
  return (representation as { type: 'text'; value: string }).value;
};

describe('createDiscoverSessionAttachmentType', () => {
  const attachmentType: AttachmentTypeDefinition = createDiscoverSessionAttachmentType();
  const context = createFormatContext();

  it('uses the discover.session id', () => {
    expect(attachmentType.id).toBe(DISCOVER_SESSION_ATTACHMENT_TYPE);
  });

  it('exposes no tools', () => {
    expect(attachmentType.getTools?.()).toEqual([]);
  });

  describe('validate', () => {
    it('accepts a minimal one-tab ES|QL session and applies schema defaults', async () => {
      const result = await attachmentType.validate({
        title: 'Nginx errors',
        tabs: [esqlTab],
      });

      expect(result).toEqual({ valid: true, data: expect.any(Object) });
      if (result.valid) {
        expect(result.data).toMatchObject({
          title: 'Nginx errors',
          description: '',
        });
      }
    });
  });

  describe('format', () => {
    it('formats a compact ES|QL session summary', async () => {
      const validated = await attachmentType.validate({
        title: 'Nginx errors',
        description: '5xx from nginx',
        tabs: [esqlTab],
      });
      expect(validated.valid).toBe(true);
      if (!validated.valid) {
        throw new Error('expected valid session');
      }

      const formatted = attachmentType.format(
        createAttachment(validated.data),
        context
      ) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).toContain('Discover session "Nginx errors" (attachment id: "test")');
      expect(text).toContain('Description: 5xx from nginx');
      expect(text).toContain('Tabs: 1');
      expect(text).toContain('Tab "Documents" (tab-1)');
      expect(text).toContain('ES|QL: FROM logs-* | WHERE status >= 500 | LIMIT 100');
      expect(text).toContain('Time range: now-24h to now');
      expect(text).toContain('Columns: @timestamp, status, message');
      expect(text).toContain('Chart hidden: true');
      expect(text).not.toContain('Sample Rows');
      expect(text).not.toContain('vis_context');
    });

    it('omits time range when the tab has none', async () => {
      const validated = await attachmentType.validate({
        title: 'ES|QL only',
        tabs: [
          {
            id: 'tab-esql',
            label: 'ES|QL',
            data_source: {
              type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
              query: 'FROM logs-* | LIMIT 10',
            },
            sort: [],
            hide_chart: false,
            hide_table: false,
          },
        ],
      });
      expect(validated.valid).toBe(true);
      if (!validated.valid) {
        throw new Error('expected valid session');
      }

      const formatted = attachmentType.format(
        createAttachment(validated.data),
        context
      ) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).not.toContain('Time range');
      expect(text).toContain('Columns: (default columns)');
    });

    it('does not dump vis_context from a fat session payload', async () => {
      const validated = await attachmentType.validate({
        title: 'Fat session',
        tabs: [
          {
            ...esqlTab,
            vis_context: {
              suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
              attributes: {
                title: 'results over timestamp',
                datasourceStates: { secret: true },
              },
            },
          },
        ],
      });
      expect(validated.valid).toBe(true);
      if (!validated.valid) {
        throw new Error('expected valid session');
      }

      const formatted = attachmentType.format(
        createAttachment(validated.data),
        context
      ) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).not.toContain('datasourceStates');
      expect(text).not.toContain('vis_context');
    });

    it('caps a long column_order list', async () => {
      const columnOrder = Array.from({ length: 25 }, (_, index) => `field_${index}`);
      const validated = await attachmentType.validate({
        title: 'Many columns',
        tabs: [{ ...esqlTab, column_order: columnOrder }],
      });
      expect(validated.valid).toBe(true);
      if (!validated.valid) {
        throw new Error('expected valid session');
      }

      const formatted = attachmentType.format(
        createAttachment(validated.data),
        context
      ) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).toContain('field_0');
      expect(text).toContain('field_19');
      expect(text).not.toContain('field_20');
      expect(text).toContain('and 5 more');
    });

    it('throws for invalid attachment data', () => {
      const attachment = createAttachment({ invalid: true });

      expect(() => attachmentType.format(attachment, context)).toThrow(
        'Invalid Discover session attachment data'
      );
    });
  });

  describe('getAgentDescription', () => {
    it('describes a Discover session without sample rows', () => {
      const description = attachmentType.getAgentDescription?.();
      expect(description).toContain('Discover session');
      expect(description).toContain('<render_attachment>');
      expect(description).toContain(platformCoreTools.createDiscoverSession);
      expect(description).toContain('does not include result rows');
      expect(description).toContain('Do not create a second Discover session');
    });
  });
});
