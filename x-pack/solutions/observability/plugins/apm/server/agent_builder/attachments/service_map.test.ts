/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AttachmentFormatContext,
  TextAttachmentRepresentation,
} from '@kbn/agent-builder-server/attachments';
import { createServiceMapAttachmentType } from './service_map';
import { SERVICE_MAP_ATTACHMENT_TYPE } from '../../../common/agent_builder/attachments';

describe('createServiceMapAttachmentType', () => {
  const attachmentType = createServiceMapAttachmentType();
  const mockContext = {} as AttachmentFormatContext;

  it('exposes the correct attachment type id', () => {
    expect(attachmentType.id).toBe(SERVICE_MAP_ATTACHMENT_TYPE);
  });

  const minimalConnection = {
    source: { 'service.name': 'frontend' },
    target: { 'service.name': 'backend' },
    metrics: undefined,
  };

  describe('validate', () => {
    it('accepts a valid payload with one connection', async () => {
      const result = await attachmentType.validate({ connections: [minimalConnection] });
      expect(result.valid).toBe(true);
    });

    it('rejects an empty connections array', async () => {
      const result = await attachmentType.validate({ connections: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects a payload without connections', async () => {
      const result = await attachmentType.validate({});
      expect(result.valid).toBe(false);
    });

    it('accepts a connection where span.type and span.subtype are absent (bug-fix)', async () => {
      const connectionWithExternalNodeMissingSubtype = {
        source: { 'service.name': 'frontend' },
        target: {
          'span.destination.service.resource': 'postgresql:5432',
          // span.type and span.subtype intentionally omitted
        },
        metrics: undefined,
      };
      const result = await attachmentType.validate({
        connections: [connectionWithExternalNodeMissingSubtype],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a connection where span.type is present but span.subtype is absent', async () => {
      const result = await attachmentType.validate({
        connections: [
          {
            source: { 'service.name': 'a' },
            target: {
              'span.destination.service.resource': 'redis:6379',
              'span.type': 'cache',
            },
            metrics: undefined,
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts nodeMetadata with alert/SLO/anomaly fields', async () => {
      const result = await attachmentType.validate({
        connections: [minimalConnection],
        nodeMetadata: {
          frontend: {
            alertsCount: 2,
            sloStatus: 'violated',
            sloCount: 3,
            anomalySeverity: 'critical',
            anomalyScore: 95,
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts nodeMetadata with only some fields present', async () => {
      const result = await attachmentType.validate({
        connections: [minimalConnection],
        nodeMetadata: {
          frontend: { alertsCount: 1 },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects nodeMetadata with an invalid sloStatus value', async () => {
      const result = await attachmentType.validate({
        connections: [minimalConnection],
        nodeMetadata: {
          frontend: { sloStatus: 'unknown-value' },
        },
      });
      expect(result.valid).toBe(false);
    });

    it('accepts nodeMetadata omitted entirely', async () => {
      const result = await attachmentType.validate({
        connections: [minimalConnection],
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.nodeMetadata).toBeUndefined();
      }
    });
  });

  describe('format', () => {
    it('returns a text representation with connections and nodeMetadata', async () => {
      const data = {
        connections: [minimalConnection],
        nodeMetadata: { frontend: { alertsCount: 1 } },
      };
      if (!(await attachmentType.validate(data)).valid) throw new Error('pre-condition failed');
      const formatted = await attachmentType.format(
        { id: 'test', type: attachmentType.id, data },
        mockContext
      );
      const representation = (await formatted.getRepresentation!()) as TextAttachmentRepresentation;
      expect(representation.type).toBe('text');
      const parsed = JSON.parse(representation.value);
      expect(parsed.nodeMetadata).toEqual({ frontend: { alertsCount: 1 } });
    });
  });

  describe('getAgentDescription', () => {
    it('mentions badge metadata fields', () => {
      const description = attachmentType.getAgentDescription!();
      expect(description).toContain('alertsCount');
      expect(description).toContain('sloStatus');
      expect(description).toContain('nodeMetadata');
    });
  });
});
