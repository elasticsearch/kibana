/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createApmMetricsAttachmentType } from './apm_metrics';

// Minimal stub for AttachmentFormatContext
const mockContext = {} as any;

describe('createApmMetricsAttachmentType', () => {
  const type = createApmMetricsAttachmentType();

  it('has the correct id', () => {
    expect(type.id).toBe('observability.apm-metrics');
  });

  describe('validate', () => {
    it('accepts valid data with all fields', async () => {
      const result = await type.validate({
        serviceName: 'checkout',
        environment: 'production',
        title: 'Checkout metrics',
        current: { latencyMs: 250, errorRate: 8.0, throughputRpm: 100 },
        baseline: { latencyMs: 200, errorRate: 2.0, throughputRpm: 120 },
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.serviceName).toBe('checkout');
      }
    });

    it('accepts minimal valid data (current only, no baseline)', async () => {
      const result = await type.validate({ serviceName: 'svc', current: {} });
      expect(result.valid).toBe(true);
    });

    it('rejects data missing serviceName', async () => {
      const result = await type.validate({ current: {} });
      expect(result.valid).toBe(false);
    });

    it('rejects data missing current snapshot', async () => {
      const result = await type.validate({ serviceName: 'svc' });
      expect(result.valid).toBe(false);
    });

    it('rejects data where errorRate is not a number', async () => {
      const result = await type.validate({
        serviceName: 'svc',
        current: { errorRate: 'high' },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('format', () => {
    it('returns a text representation containing the service name', async () => {
      const attachment = {
        id: 'a',
        type: 'observability.apm-metrics' as const,
        data: { serviceName: 'payment', current: { latencyMs: 500, errorRate: 15.0 } },
      };
      const formatted = await type.format(attachment as any, mockContext);
      const representation = await formatted.getRepresentation?.();
      expect(representation?.type).toBe('text');
      if (representation?.type === 'text') {
        expect(representation.value).toContain('payment');
        expect(representation.value).toContain('500');
      }
    });
  });

  describe('getAgentDescription', () => {
    it('returns a non-empty description string when defined', () => {
      const description = type.getAgentDescription?.();
      expect(typeof description).toBe('string');
      expect((description ?? '').length).toBeGreaterThan(10);
    });
  });
});
