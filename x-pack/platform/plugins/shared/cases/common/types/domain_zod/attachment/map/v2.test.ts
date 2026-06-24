/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAP_ATTACHMENT_TYPE } from '../../../../constants/attachments';
import { MapAttachmentPayloadSchema } from './v2';

describe('MapAttachmentPayloadSchema', () => {
  const validPayload = {
    type: MAP_ATTACHMENT_TYPE,
    owner: 'cases',
    attachmentId: 'map-1',
    metadata: {
      title: 'My map',
      soType: 'map',
    },
  };

  it('accepts a valid reference-only payload', () => {
    const result = MapAttachmentPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts a payload with an inline `data.attributes` snapshot', () => {
    const result = MapAttachmentPayloadSchema.safeParse({
      ...validPayload,
      data: {
        attributes: { title: 'My map', layers: [], settings: {} },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a `data` block without `attributes` (schema requires attributes when data is set)', () => {
    const result = MapAttachmentPayloadSchema.safeParse({
      ...validPayload,
      data: {
        timeRange: { from: 'now-15m', to: 'now' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing `attachmentId`', () => {
    const { attachmentId, ...rest } = validPayload;
    const result = MapAttachmentPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a missing `metadata.title`', () => {
    const result = MapAttachmentPayloadSchema.safeParse({
      ...validPayload,
      metadata: { soType: 'map' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong `metadata.soType`', () => {
    const result = MapAttachmentPayloadSchema.safeParse({
      ...validPayload,
      metadata: { title: 'x', soType: 'dashboard' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong type literal', () => {
    const result = MapAttachmentPayloadSchema.safeParse({ ...validPayload, type: 'comment' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const result = MapAttachmentPayloadSchema.safeParse({ ...validPayload, extra: true });
    expect(result.success).toBe(false);
  });

  // The maps embeddable snapshot ships runtime extras like `filters`, `query`,
  // `refreshInterval`, `timeFilters`, and `openTOCDetails` that aren't part of
  // the cases-owned snapshot subset. The schema uses `.loose()` so they pass
  // validation and are forwarded verbatim to the `<maps.Map />` renderer.
  it('accepts and preserves unknown keys inside `data.attributes`', () => {
    const extras = {
      filters: [],
      query: { language: 'kuery', query: '' },
      refreshInterval: { pause: true, value: 0 },
      timeFilters: { from: 'now-15m', to: 'now' },
      openTOCDetails: [],
    };
    const result = MapAttachmentPayloadSchema.safeParse({
      ...validPayload,
      data: {
        attributes: { title: 'My map', layers: [], settings: {}, ...extras },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data?.attributes).toMatchObject(extras);
    }
  });
});
