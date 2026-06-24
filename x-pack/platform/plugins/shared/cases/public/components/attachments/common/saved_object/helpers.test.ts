/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core/public';
import type { AttachmentUIV2 } from '../../../../../common/ui/types';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
} from '../../../../../common/constants/attachments';
import {
  ATTACHMENT_TYPE_TO_SO_TYPE,
  SO_TYPE_TO_ATTACHMENT_TYPE,
  SUPPORTED_SO_TYPES,
  SAVED_OBJECT_ATTACHMENT_TYPES,
  canAccessSavedObject,
  getAttachedSavedObjectKeys,
  getSavedObjectAttachmentAttributes,
  getSavedObjectKey,
  isSavedObjectAttachment,
} from './helpers';
import type { FoundSavedObject } from './types';

const baseComment = {
  id: 'comment-1',
  version: 'v1',
  createdAt: '2025-01-01T00:00:00.000Z',
  createdBy: { username: 'me' },
  owner: 'cases',
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
} as unknown as AttachmentUIV2;

const extractAttributes = (attachment: AttachmentUIV2) =>
  isSavedObjectAttachment(attachment) ? getSavedObjectAttachmentAttributes(attachment) : null;

describe('saved_object/helpers', () => {
  describe('constant tables', () => {
    it('maps each attachment type to its SO type', () => {
      expect(ATTACHMENT_TYPE_TO_SO_TYPE).toEqual({
        [DASHBOARD_ATTACHMENT_TYPE]: 'dashboard',
        [DISCOVER_SESSION_ATTACHMENT_TYPE]: 'search',
        [MAP_ATTACHMENT_TYPE]: 'map',
      });
    });

    it('inverts cleanly into SO_TYPE_TO_ATTACHMENT_TYPE', () => {
      for (const [attachmentType, soType] of Object.entries(ATTACHMENT_TYPE_TO_SO_TYPE)) {
        expect(SO_TYPE_TO_ATTACHMENT_TYPE[soType as 'dashboard' | 'map' | 'search']).toBe(
          attachmentType
        );
      }
    });

    it('exposes the same SO types via SUPPORTED_SO_TYPES', () => {
      expect(new Set(SUPPORTED_SO_TYPES)).toEqual(
        new Set(Object.values(ATTACHMENT_TYPE_TO_SO_TYPE))
      );
    });

    it('exposes the attachment-type ids via SAVED_OBJECT_ATTACHMENT_TYPES', () => {
      expect(SAVED_OBJECT_ATTACHMENT_TYPES.has(DASHBOARD_ATTACHMENT_TYPE)).toBe(true);
      expect(SAVED_OBJECT_ATTACHMENT_TYPES.has(MAP_ATTACHMENT_TYPE)).toBe(true);
      expect(SAVED_OBJECT_ATTACHMENT_TYPES.has(DISCOVER_SESSION_ATTACHMENT_TYPE)).toBe(true);
      expect(SAVED_OBJECT_ATTACHMENT_TYPES.has('user')).toBe(false);
    });
  });

  describe('getSavedObjectAttachmentAttributes', () => {
    it('returns null for non-SO attachment types', () => {
      expect(extractAttributes({ ...baseComment, type: 'user' } as AttachmentUIV2)).toBeNull();
    });

    it('extracts attributes for a dashboard attachment', () => {
      expect(
        extractAttributes({
          ...baseComment,
          type: DASHBOARD_ATTACHMENT_TYPE,
          attachmentId: 'dash-1',
          metadata: { title: 'My dashboard', soType: 'dashboard' },
        } as unknown as AttachmentUIV2)
      ).toEqual({ attachmentId: 'dash-1', soType: 'dashboard', title: 'My dashboard' });
    });

    it('extracts attributes for a map attachment', () => {
      expect(
        extractAttributes({
          ...baseComment,
          type: MAP_ATTACHMENT_TYPE,
          attachmentId: 'map-1',
          metadata: { title: 'A map', soType: 'map' },
        } as unknown as AttachmentUIV2)
      ).toEqual({ attachmentId: 'map-1', soType: 'map', title: 'A map' });
    });

    it('extracts attributes for a discover-session attachment', () => {
      expect(
        extractAttributes({
          ...baseComment,
          type: DISCOVER_SESSION_ATTACHMENT_TYPE,
          attachmentId: 'search-1',
          metadata: { title: 'A saved search', soType: 'search' },
        } as unknown as AttachmentUIV2)
      ).toEqual({ attachmentId: 'search-1', soType: 'search', title: 'A saved search' });
    });

    it('returns null for malformed SO attachments', () => {
      expect(
        extractAttributes({
          ...baseComment,
          type: DASHBOARD_ATTACHMENT_TYPE,
          metadata: { title: 'Missing id', soType: 'dashboard' },
        } as unknown as AttachmentUIV2)
      ).toBeNull();

      expect(
        extractAttributes({
          ...baseComment,
          type: DASHBOARD_ATTACHMENT_TYPE,
          attachmentId: 'dash-1',
          metadata: { title: 'Bad SO type', soType: 'unknown' },
        } as unknown as AttachmentUIV2)
      ).toBeNull();
    });
  });

  describe('getAttachedSavedObjectKeys', () => {
    const soAttachment = (id: string, type: string, attachmentId: string, soType: string) =>
      ({
        ...baseComment,
        id,
        type,
        attachmentId,
        metadata: { title: `${type}-title`, soType },
      } as unknown as AttachmentUIV2);

    it('returns an empty set when there are no comments', () => {
      expect(getAttachedSavedObjectKeys([])).toEqual(new Set());
    });

    it('collects keys from every SO-typed comment', () => {
      const keys = getAttachedSavedObjectKeys([
        soAttachment('a', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'dashboard'),
        soAttachment('b', MAP_ATTACHMENT_TYPE, 'map-1', 'map'),
        soAttachment('c', DISCOVER_SESSION_ATTACHMENT_TYPE, 'search-1', 'search'),
      ]);
      expect(keys).toEqual(
        new Set([
          getSavedObjectKey('dashboard', 'dash-1'),
          getSavedObjectKey('map', 'map-1'),
          getSavedObjectKey('search', 'search-1'),
        ])
      );
    });

    it('ignores non-SO attachment types', () => {
      const keys = getAttachedSavedObjectKeys([
        soAttachment('a', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'dashboard'),
        { ...baseComment, id: 'x', type: 'user' } as unknown as AttachmentUIV2,
      ]);
      expect(keys).toEqual(new Set([getSavedObjectKey('dashboard', 'dash-1')]));
    });
  });

  describe('canAccessSavedObject', () => {
    const capabilities: ApplicationStart['capabilities'] = {
      navLinks: {},
      management: {},
      catalogue: {},
      dashboard_v2: { show: true, createNew: false },
      maps_v2: { show: false },
    } as unknown as ApplicationStart['capabilities'];

    const withMeta = (meta: FoundSavedObject['meta']): FoundSavedObject => ({
      id: 'x',
      type: 'dashboard',
      meta,
    });

    it('returns false when the SO has no inAppUrl', () => {
      expect(canAccessSavedObject(withMeta({}), capabilities)).toBe(false);
    });

    it('returns true when inAppUrl is present without a capabilities path', () => {
      expect(
        canAccessSavedObject(
          withMeta({ inAppUrl: { path: '/x', uiCapabilitiesPath: '' } }),
          capabilities
        )
      ).toBe(true);
    });

    it('walks the dotted path on capabilities and returns the resolved value', () => {
      expect(
        canAccessSavedObject(
          withMeta({ inAppUrl: { path: '/x', uiCapabilitiesPath: 'dashboard_v2.show' } }),
          capabilities
        )
      ).toBe(true);
      expect(
        canAccessSavedObject(
          withMeta({ inAppUrl: { path: '/x', uiCapabilitiesPath: 'dashboard_v2.createNew' } }),
          capabilities
        )
      ).toBe(false);
      expect(
        canAccessSavedObject(
          withMeta({ inAppUrl: { path: '/x', uiCapabilitiesPath: 'maps_v2.show' } }),
          capabilities
        )
      ).toBe(false);
    });

    it('returns false when the path segment is missing', () => {
      expect(
        canAccessSavedObject(
          withMeta({ inAppUrl: { path: '/x', uiCapabilitiesPath: 'missing.show' } }),
          capabilities
        )
      ).toBe(false);
    });
  });
});
