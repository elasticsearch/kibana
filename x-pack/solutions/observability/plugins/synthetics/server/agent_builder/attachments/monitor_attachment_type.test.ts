/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { KibanaRequest } from '@kbn/core-http-server';
import {
  MONITOR_ATTACHMENT_TYPE,
  type MonitorAttachmentData,
} from '../../../common/agent_builder/attachments/monitor_attachment_schema';
import { MONITOR_MANAGEMENT_SKILL_ID } from '../common/constants';
import { createMonitorAttachmentType } from './monitor_attachment_type';

const baseMonitorData: MonitorAttachmentData = {
  type: 'http',
  metadata: {
    name: 'example.com health',
    description: 'Hourly liveness check for the marketing site',
    tags: ['marketing', 'liveness'],
  },
  urls: 'https://example.com',
  schedule: { number: '5', unit: 'm' },
  locations: [{ id: 'us_central', label: 'US Central', isServiceManaged: true }],
};

describe('createMonitorAttachmentType', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let definition: AttachmentTypeDefinition<typeof MONITOR_ATTACHMENT_TYPE, MonitorAttachmentData>;

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
    definition = createMonitorAttachmentType({ logger });
  });

  describe('id', () => {
    it('uses the shared MONITOR_ATTACHMENT_TYPE constant', () => {
      expect(definition.id).toBe(MONITOR_ATTACHMENT_TYPE);
    });
  });

  describe('validate', () => {
    it('returns valid result when input matches schema', async () => {
      const result = await definition.validate(baseMonitorData);
      expect(result).toEqual({
        valid: true,
        data: expect.objectContaining({ type: 'http', urls: 'https://example.com' }),
      });
    });

    it('returns valid for proposed monitor (no id, no enabled)', async () => {
      const proposed = {
        type: 'http',
        metadata: { name: 'New monitor' },
        urls: 'https://acme.test',
        schedule: { number: '1', unit: 'm' },
        locations: [{ id: 'us_east' }],
      };
      const result = await definition.validate(proposed);
      expect(result.valid).toBe(true);
    });

    it('returns invalid result when input is missing required fields', async () => {
      const result = await definition.validate({ foo: 'bar' });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toEqual(expect.any(String));
      }
    });
  });

  describe('format', () => {
    const buildAttachment = (
      data: MonitorAttachmentData,
      origin?: string
    ): Attachment<typeof MONITOR_ATTACHMENT_TYPE, MonitorAttachmentData> => ({
      id: 'attach-1',
      type: MONITOR_ATTACHMENT_TYPE,
      data,
      ...(origin ? { origin } : {}),
    });

    const formatValue = async (data: MonitorAttachmentData, origin?: string): Promise<string> => {
      const formatted = await definition.format(buildAttachment(data, origin), {
        request: {} as KibanaRequest,
        spaceId: 'default',
      });
      if (!formatted.getRepresentation) {
        throw new Error('expected format() to return getRepresentation');
      }
      const repr = await formatted.getRepresentation();
      return (repr as { type: 'text'; value: string }).value;
    };

    it('reports enabled saved monitor', async () => {
      const value = await formatValue({ ...baseMonitorData, enabled: true }, 'config-1');
      expect(value).toContain('Status: enabled');
      expect(value).toContain('"example.com health"');
      expect(value).toContain('Schedule: every 5m');
      expect(value).toContain('URL: https://example.com');
      expect(value).toContain('Tags: marketing, liveness');
      expect(value).toContain('Description: Hourly liveness check');
      expect(value).toContain('Type: http');
      expect(value).toContain('Locations: US Central');
    });

    it('reports disabled saved monitor', async () => {
      const value = await formatValue({ ...baseMonitorData, enabled: false }, 'config-1');
      expect(value).toContain('Status: disabled');
    });

    it('includes Monitor ID when origin is set', async () => {
      const value = await formatValue(baseMonitorData, 'config-1');
      expect(value).toContain('Monitor ID: config-1');
    });

    it('omits Monitor ID when origin is not set', async () => {
      const value = await formatValue(baseMonitorData);
      expect(value).not.toContain('Monitor ID:');
    });

    it('reports draft status when origin is not set', async () => {
      const value = await formatValue(baseMonitorData);
      expect(value).toContain('Status: draft (not yet saved)');
    });

    it('omits description and tags lines when absent', async () => {
      const value = await formatValue({
        ...baseMonitorData,
        metadata: { name: 'Bare' },
      });
      expect(value).not.toContain('Description:');
      expect(value).not.toContain('Tags:');
      expect(value).toContain('"Bare"');
    });

    it('falls back to location id when label is missing', async () => {
      const value = await formatValue({
        ...baseMonitorData,
        locations: [{ id: 'private-1' }],
      });
      expect(value).toContain('Locations: private-1');
    });
  });

  describe('getAgentDescription', () => {
    it('mentions monitor attachment, persistence states, and the monitor-management skill', () => {
      const description = definition.getAgentDescription!();
      expect(description).toContain('synthetics monitor');
      expect(description).toContain('draft');
      expect(description).toContain('saved monitor');
      expect(description).toContain(MONITOR_MANAGEMENT_SKILL_ID);
    });
  });

  describe('getTools', () => {
    it('returns an empty list (tools come from the skill, not the attachment type)', () => {
      expect(definition.getTools!()).toEqual([]);
    });
  });
});
