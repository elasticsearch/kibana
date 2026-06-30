/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createApmTimeseriesAttachmentType } from './apm_timeseries';

const mockContext = {} as any;

const validData = {
  serviceName: 'payment',
  metric: 'latency' as const,
  unit: 'ms' as const,
  dataPoints: [
    { timestamp: 1_720_000_000_000, value: 100 },
    { timestamp: 1_720_000_060_000, value: 800 },
  ],
};

describe('createApmTimeseriesAttachmentType', () => {
  const type = createApmTimeseriesAttachmentType();

  it('has the correct id', () => {
    expect(type.id).toBe('observability.apm-timeseries');
  });

  describe('validate', () => {
    it('accepts valid data', async () => {
      const result = await type.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('accepts data with threshold and alertStart', async () => {
      const result = await type.validate({
        ...validData,
        threshold: 500,
        alertStart: 1_720_000_060_000,
      });
      expect(result.valid).toBe(true);
    });

    it('accepts null values in dataPoints (sparse buckets)', async () => {
      const result = await type.validate({
        ...validData,
        dataPoints: [
          { timestamp: 1_720_000_000_000, value: null },
          { timestamp: 1_720_000_060_000, value: 100 },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty dataPoints array', async () => {
      const result = await type.validate({ ...validData, dataPoints: [] });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/no data points/i);
      }
    });

    it('rejects data missing serviceName', async () => {
      const { serviceName: _, ...noName } = validData;
      expect((await type.validate(noName)).valid).toBe(false);
    });

    it('rejects invalid metric enum value', async () => {
      expect((await type.validate({ ...validData, metric: 'cpu' })).valid).toBe(false);
    });

    it('rejects invalid unit enum value', async () => {
      expect((await type.validate({ ...validData, unit: 'seconds' })).valid).toBe(false);
    });

    it('rejects a dataPoint where value is not a number or null', async () => {
      const result = await type.validate({
        ...validData,
        dataPoints: [{ timestamp: 1_720_000_000_000, value: 'high' }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('format', () => {
    it('returns a text representation containing the service name', async () => {
      const attachment = {
        id: 'a',
        type: 'observability.apm-timeseries' as const,
        data: validData,
      };
      const formatted = await type.format(attachment as any, mockContext);
      const repr = await formatted.getRepresentation?.();
      expect(repr?.type).toBe('text');
      if (repr?.type === 'text') {
        expect(repr.value).toContain('payment');
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
