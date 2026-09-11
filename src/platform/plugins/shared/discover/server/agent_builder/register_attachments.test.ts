/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  AttachmentTypeDefinition,
  AttachmentFormatContext,
  AgentFormattedAttachment,
} from '@kbn/agent-builder-server/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { platformCoreTools } from '@kbn/agent-builder-common';
import {
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  ESQL_QUERY_RESULTS_ATTACHMENT_TYPE,
} from '../../common/agent_builder';
import { registerAttachments } from './register_attachments';

const createMockAgentBuilder = () => {
  const registeredTypes: AttachmentTypeDefinition[] = [];
  return {
    mock: {
      attachments: {
        registerType: jest.fn((type: AttachmentTypeDefinition) => {
          registeredTypes.push(type);
        }),
      },
      skills: { register: jest.fn() },
    } as unknown as AgentBuilderPluginSetup,
    getRegisteredType: (id: string) => {
      const attachmentType = registeredTypes.find((type) => type.id === id);
      if (!attachmentType) {
        throw new Error(`Attachment type ${id} was not registered`);
      }
      return attachmentType;
    },
    getRegisteredTypes: () => registeredTypes,
  };
};

const createFormatContext = (): AttachmentFormatContext => ({
  request: httpServerMock.createKibanaRequest(),
  spaceId: 'default',
});

const createAttachment = (data: Record<string, unknown>): Attachment => ({
  id: 'test',
  type: ESQL_QUERY_RESULTS_ATTACHMENT_TYPE,
  data,
});

const getFormattedText = (formatted: AgentFormattedAttachment): string => {
  const representation = formatted.getRepresentation!();
  return (representation as { type: 'text'; value: string }).value;
};

describe('registerAttachments', () => {
  let attachmentType: AttachmentTypeDefinition;

  beforeAll(() => {
    const { mock, getRegisteredType } = createMockAgentBuilder();
    registerAttachments(mock);
    attachmentType = getRegisteredType(ESQL_QUERY_RESULTS_ATTACHMENT_TYPE);
  });

  it('registers esql.query_results and discover.session', () => {
    const { mock, getRegisteredTypes } = createMockAgentBuilder();
    registerAttachments(mock);
    expect(getRegisteredTypes().map((type) => type.id)).toEqual([
      ESQL_QUERY_RESULTS_ATTACHMENT_TYPE,
      DISCOVER_SESSION_ATTACHMENT_TYPE,
    ]);
  });

  it('registers the attachment type with the correct id', () => {
    expect(attachmentType.id).toBe(ESQL_QUERY_RESULTS_ATTACHMENT_TYPE);
  });

  it('exposes generateEsql, executeEsql, and createVisualization tools', () => {
    expect(attachmentType.getTools?.()).toEqual([
      platformCoreTools.generateEsql,
      platformCoreTools.executeEsql,
      platformCoreTools.createVisualization,
    ]);
  });

  describe('validate', () => {
    it('accepts valid ES|QL query results data', () => {
      const result = attachmentType.validate({
        query: 'FROM logs-* | LIMIT 10',
        columns: [{ name: '@timestamp', type: 'date' }],
        sampleRows: [{ '@timestamp': '2026-04-10T00:00:00Z' }],
        totalHits: 100,
        timeRange: { from: 'now-15m', to: 'now' },
      });

      expect(result).toEqual({ valid: true, data: expect.any(Object) });
    });

    it('accepts data without timeRange', () => {
      const result = attachmentType.validate({
        query: 'FROM logs-*',
        columns: [{ name: 'status', type: 'keyword' }],
        sampleRows: [],
        totalHits: 0,
      });

      expect(result).toEqual({ valid: true, data: expect.any(Object) });
    });

    it('rejects data missing required fields', () => {
      const result = attachmentType.validate({
        query: 'FROM logs-*',
      });

      expect(result).toEqual({ valid: false, error: expect.any(String) });
    });

    it('rejects data with wrong types', () => {
      const result = attachmentType.validate({
        query: 123,
        columns: 'not an array',
        sampleRows: [],
        totalHits: 'not a number',
      });

      expect(result).toEqual({ valid: false, error: expect.any(String) });
    });
  });

  describe('format', () => {
    const context = createFormatContext();

    it('formats query results into readable text', () => {
      const attachment = createAttachment({
        query: 'FROM logs-* | LIMIT 10',
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'status', type: 'keyword' },
        ],
        sampleRows: [
          { '@timestamp': '2026-04-10T00:00:00Z', status: 'success' },
          { '@timestamp': '2026-04-10T01:00:00Z', status: 'error' },
        ],
        totalHits: 500,
        timeRange: { from: 'now-24h', to: 'now' },
      });

      const formatted = attachmentType.format(attachment, context) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).toContain('ES|QL Query: FROM logs-* | LIMIT 10');
      expect(text).toContain('Total Results: 500');
      expect(text).toContain('Time Range: now-24h to now');
      expect(text).toContain('@timestamp (date)');
      expect(text).toContain('status (keyword)');
      expect(text).toContain('Sample Rows (2 of 500)');
      expect(text).toContain('status: success');
      expect(text).toContain('status: error');
    });

    it('truncates long values in sample rows', () => {
      const longValue = 'a'.repeat(150);
      const attachment = createAttachment({
        query: 'FROM logs-*',
        columns: [{ name: 'message', type: 'text' }],
        sampleRows: [{ message: longValue }],
        totalHits: 1,
      });

      const formatted = attachmentType.format(attachment, context) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).toContain('a'.repeat(100) + '...');
      expect(text).not.toContain(longValue);
    });

    it('omits time range when not provided', () => {
      const attachment = createAttachment({
        query: 'FROM logs-*',
        columns: [{ name: 'status', type: 'keyword' }],
        sampleRows: [],
        totalHits: 0,
      });

      const formatted = attachmentType.format(attachment, context) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).not.toContain('Time Range');
    });

    it('throws for invalid attachment data', () => {
      const attachment = createAttachment({ invalid: true });

      expect(() => attachmentType.format(attachment, context)).toThrow(
        'Invalid ES|QL query results attachment data'
      );
    });

    it('emits a Shape Profile block when playbookContribution is present, intersected against columns', () => {
      const attachment = createAttachment({
        query: 'FROM logs-* | LIMIT 10',
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'log.level', type: 'keyword' },
          { name: 'service.name', type: 'keyword' },
        ],
        sampleRows: [],
        totalHits: 1,
        playbookContribution: {
          shapeId: 'logs',
          shapeLabel: 'Application & infrastructure logs',
          characteristicFields: ['log.level', 'service.name', 'host.name'],
          guidance: 'Prefer STATS BY log.level and service.name.',
          interestingSignals: ['spikes in log.level=error'],
        },
      });

      const formatted = attachmentType.format(attachment, context) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).toContain('Shape Profile:');
      expect(text).toContain('Application & infrastructure logs (logs)');
      expect(text).toContain('Characteristic fields present: log.level, service.name');
      expect(text).not.toContain('host.name');
      expect(text).toContain('Guidance: Prefer STATS BY log.level and service.name.');
      expect(text).toContain('- spikes in log.level=error');
    });

    it('omits the Shape Profile block when no playbookContribution is provided', () => {
      const attachment = createAttachment({
        query: 'FROM logs-*',
        columns: [{ name: 'status', type: 'keyword' }],
        sampleRows: [],
        totalHits: 0,
      });

      const formatted = attachmentType.format(attachment, context) as AgentFormattedAttachment;
      const text = getFormattedText(formatted);

      expect(text).not.toContain('Shape Profile');
    });
  });

  describe('getAgentDescription', () => {
    it('returns a description mentioning ES|QL query results', () => {
      const description = attachmentType.getAgentDescription?.();
      expect(description).toContain('ES|QL query results');
      expect(description).toContain('executeEsql');
    });
  });
});
