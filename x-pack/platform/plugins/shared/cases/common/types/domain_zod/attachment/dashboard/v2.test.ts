/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DASHBOARD_ATTACHMENT_TYPE } from '../../../../constants/attachments';
import { DashboardAttachmentPayloadSchema } from './v2';

describe('DashboardAttachmentPayloadSchema', () => {
  const validPayload = {
    type: DASHBOARD_ATTACHMENT_TYPE,
    owner: 'cases',
    attachmentId: 'dashboard-1',
    metadata: {
      title: 'My dashboard',
      soType: 'dashboard',
    },
  };

  it('accepts a valid reference-only payload', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts a payload with an inline `data.config` snapshot', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse({
      ...validPayload,
      data: {
        config: { title: 'My dashboard', panels: [] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a `data` block without `config` (schema requires config when data is set)', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse({
      ...validPayload,
      data: {
        timeRange: { from: 'now-15m', to: 'now' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing `attachmentId`', () => {
    const { attachmentId, ...rest } = validPayload;
    const result = DashboardAttachmentPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a missing `metadata.title`', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse({
      ...validPayload,
      metadata: { soType: 'dashboard' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong `metadata.soType`', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse({
      ...validPayload,
      metadata: { title: 'x', soType: 'search' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong type literal', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse({ ...validPayload, type: 'comment' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const result = DashboardAttachmentPayloadSchema.safeParse({ ...validPayload, extra: true });
    expect(result.success).toBe(false);
  });
});
