/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformAttributesForMode } from './utils';
import { createUserAttachment } from '../test_utils';
import { SECURITY_TIMELINE_ATTACHMENT_TYPE } from '../../../../common/constants';

describe('transformAttributesForMode', () => {
  it('maps legacy user comments to unified schema when mode is unified', () => {
    const attrs = createUserAttachment().attributes;
    const out = transformAttributesForMode({ attributes: attrs, mode: 'unified' });
    expect(out.isUnified).toBe(true);
    if (out.isUnified) {
      expect(out.attributes.type).toBe('comment');
      expect(out.attributes.data?.content).toBe(attrs.comment);
    }
  });

  it('keeps legacy shape when mode is legacy', () => {
    const attrs = createUserAttachment().attributes;
    const out = transformAttributesForMode({ attributes: attrs, mode: 'legacy' });
    expect(out.isUnified).toBe(false);
    if (!out.isUnified) {
      expect(out.attributes.type).toBe('user');
      expect(out.attributes.comment).toBe(attrs.comment);
    }
  });

  // Net-new unified types (no v1 equivalent) must stay in the unified branch even when
  // the caller asks for legacy mode, otherwise the legacy decoder rejects them.
  it('keeps unified-only types (security.timeline) on the unified branch in legacy mode', () => {
    const attrs = {
      type: SECURITY_TIMELINE_ATTACHMENT_TYPE,
      attachmentId: 'timeline-1',
      owner: 'securitySolution',
      metadata: { title: 'My timeline' },
      created_at: '2024-01-01T00:00:00.000Z',
      created_by: { username: 'elastic', full_name: null, email: null, profile_uid: undefined },
      pushed_at: null,
      pushed_by: null,
      updated_at: null,
      updated_by: null,
    } as unknown as Parameters<typeof transformAttributesForMode>[0]['attributes'];

    const out = transformAttributesForMode({ attributes: attrs, mode: 'legacy' });
    expect(out.isUnified).toBe(true);
    if (out.isUnified) {
      expect(out.attributes).toMatchObject({
        type: SECURITY_TIMELINE_ATTACHMENT_TYPE,
        attachmentId: 'timeline-1',
        owner: 'securitySolution',
        metadata: { title: 'My timeline' },
      });
    }
  });

  // Unified-only types (dashboard, map, discoverSession) have no v1 equivalent,
  // so transformAttributesForMode must surface them as unified even when called
  // with mode=legacy — otherwise the legacy decoder rejects them.
  it('keeps a unified-only reference payload (dashboard) on the unified branch in legacy mode', () => {
    const attrs = {
      type: 'dashboard',
      owner: 'cases',
      attachmentId: 'dash-1',
      metadata: { title: 'My dashboard', soType: 'dashboard' },
      created_at: '2026-05-29T00:00:00.000Z',
      created_by: { username: 'tester', full_name: null, email: null },
      pushed_at: null,
      pushed_by: null,
      updated_at: null,
      updated_by: null,
    } as unknown as Parameters<typeof transformAttributesForMode>[0]['attributes'];
    const out = transformAttributesForMode({ attributes: attrs, mode: 'legacy' });
    expect(out.isUnified).toBe(true);
    if (out.isUnified) {
      expect(out.attributes.type).toBe('dashboard');
    }
  });

  it('keeps a unified-only reference payload (discoverSession) on the unified branch in legacy mode', () => {
    const attrs = {
      type: 'discoverSession',
      owner: 'cases',
      attachmentId: 'search-1',
      metadata: { title: 'Saved search', soType: 'search' },
      created_at: '2026-05-29T00:00:00.000Z',
      created_by: { username: 'tester', full_name: null, email: null },
      pushed_at: null,
      pushed_by: null,
      updated_at: null,
      updated_by: null,
    } as unknown as Parameters<typeof transformAttributesForMode>[0]['attributes'];
    const out = transformAttributesForMode({ attributes: attrs, mode: 'legacy' });
    expect(out.isUnified).toBe(true);
    if (out.isUnified) {
      expect(out.attributes.type).toBe('discoverSession');
    }
  });
});
