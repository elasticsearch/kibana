/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../../../constants/attachments';
import { DiscoverSessionAttachmentPayloadSchema } from './v2';

describe('DiscoverSessionAttachmentPayloadSchema', () => {
  const validPayload = {
    type: DISCOVER_SESSION_ATTACHMENT_TYPE,
    owner: 'cases',
    attachmentId: 'search-1',
    metadata: {
      title: 'My saved search',
      soType: 'search',
    },
  };

  it('accepts a valid reference payload', () => {
    const result = DiscoverSessionAttachmentPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects a missing `attachmentId`', () => {
    const { attachmentId: _omit, ...rest } = validPayload;
    const result = DiscoverSessionAttachmentPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a wrong `soType` literal', () => {
    const result = DiscoverSessionAttachmentPayloadSchema.safeParse({
      ...validPayload,
      metadata: { ...validPayload.metadata, soType: 'dashboard' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong type literal', () => {
    const result = DiscoverSessionAttachmentPayloadSchema.safeParse({
      ...validPayload,
      type: 'comment',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const result = DiscoverSessionAttachmentPayloadSchema.safeParse({
      ...validPayload,
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});
