/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALLOWED_SCHEDULES_IN_MINUTES } from '../../constants/monitor_defaults';
import {
  ALLOWED_MONITOR_SCHEDULES_IN_MINUTES,
  MONITOR_ATTACHMENT_TYPE,
  monitorAttachmentDataSchema,
} from './monitor_attachment_schema';

describe('monitor_attachment_schema', () => {
  const validProposal = {
    type: 'http' as const,
    metadata: { name: 'example.com health' },
    urls: 'https://example.com',
    schedule: { number: '5' as const, unit: 'm' as const },
    locations: [{ id: 'us_central', label: 'US Central', isServiceManaged: true }],
  };

  it('exposes the stable attachment type id', () => {
    expect(MONITOR_ATTACHMENT_TYPE).toBe('observability.synthetics.monitor');
  });

  it('keeps schedule allow-list in sync with the source-of-truth constant', () => {
    expect([...ALLOWED_MONITOR_SCHEDULES_IN_MINUTES]).toEqual(ALLOWED_SCHEDULES_IN_MINUTES);
  });

  it('accepts a minimal valid HTTP proposal (no id, no enabled)', () => {
    const result = monitorAttachmentDataSchema.safeParse(validProposal);
    expect(result.success).toBe(true);
  });

  it('accepts a saved monitor (id + enabled set)', () => {
    const result = monitorAttachmentDataSchema.safeParse({
      ...validProposal,
      id: 'config-123',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unsupported monitor types', () => {
    const result = monitorAttachmentDataSchema.safeParse({ ...validProposal, type: 'browser' });
    expect(result.success).toBe(false);
  });

  it('rejects schedule numbers outside the synthetics allow list', () => {
    const result = monitorAttachmentDataSchema.safeParse({
      ...validProposal,
      schedule: { number: '7', unit: 'm' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects schedule units other than minutes', () => {
    const result = monitorAttachmentDataSchema.safeParse({
      ...validProposal,
      schedule: { number: '5', unit: 's' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty locations', () => {
    const result = monitorAttachmentDataSchema.safeParse({ ...validProposal, locations: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL urls', () => {
    const result = monitorAttachmentDataSchema.safeParse({
      ...validProposal,
      urls: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing monitor name', () => {
    const result = monitorAttachmentDataSchema.safeParse({
      ...validProposal,
      metadata: { name: '' },
    });
    expect(result.success).toBe(false);
  });
});
