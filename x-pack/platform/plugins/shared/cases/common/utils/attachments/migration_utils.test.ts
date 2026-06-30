/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DASHBOARD_ATTACHMENT_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  FILE_ATTACHMENT_TYPE,
  LEGACY_ACTIONS_TYPE,
  INDICATOR_ATTACHMENT_TYPE,
  LEGACY_LENS_ATTACHMENT_TYPE,
  LENS_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
  SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  OSQUERY_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_TIMELINE_ATTACHMENT_TYPE,
} from '../../constants/attachments';
import { AttachmentType, ExternalReferenceStorageType } from '../../types/domain';
import { SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER, GENERAL_CASES_OWNER } from '../../constants';
import type { AttachmentRequestV2 } from '../../types/api';
import {
  getAttachmentTypeFromAttributes,
  isMigratedAttachmentType,
  isPersistableType,
  resolveUnifiedAttachmentType,
  isUnifiedOnlyAttachmentType,
  toLegacyAttachmentType,
  toUnifiedAttachmentType,
} from './migration_utils';

const makeExternalReference = (externalReferenceAttachmentTypeId: string): AttachmentRequestV2 => ({
  type: AttachmentType.externalReference,
  externalReferenceAttachmentTypeId,
  externalReferenceId: 'ref-id',
  externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
  externalReferenceMetadata: null,
  owner,
});

const makePersistableState = (persistableStateAttachmentTypeId: string): AttachmentRequestV2 => ({
  type: AttachmentType.persistableState,
  persistableStateAttachmentTypeId,
  persistableStateAttachmentState: {},
  owner,
});

const makeUnifiedRef = (type: string): AttachmentRequestV2 => ({
  type,
  attachmentId: 'att-id',
  owner,
});

const makeAlert = (): AttachmentRequestV2 => ({
  type: AttachmentType.alert,
  alertId: 'alert-id',
  index: 'idx',
  rule: { id: 'rule-id', name: 'rule' },
  owner,
});

const makeEvent = (): AttachmentRequestV2 => ({
  type: AttachmentType.event,
  eventId: 'evt-id',
  index: 'idx',
  owner,
});

const owner = SECURITY_SOLUTION_OWNER;

describe('migration_utils', () => {
  describe('isMigratedAttachmentType', () => {
    it('is true for legacy migrated attachment types', () => {
      expect(isMigratedAttachmentType(AttachmentType.user, owner)).toBe(true);
      expect(isMigratedAttachmentType('user', owner)).toBe(true);
      expect(isMigratedAttachmentType('event', owner)).toBe(true);
    });

    it('is true for legacy alert attachment type', () => {
      expect(isMigratedAttachmentType(AttachmentType.alert, owner)).toBe(true);
      expect(isMigratedAttachmentType(AttachmentType.alert, OBSERVABILITY_OWNER)).toBe(true);
      expect(isMigratedAttachmentType(AttachmentType.alert, GENERAL_CASES_OWNER)).toBe(true);
    });

    it('is true for owner-scoped unified attachment types', () => {
      expect(isMigratedAttachmentType('comment', owner)).toBe(true);
      expect(isMigratedAttachmentType('security.event', 'security')).toBe(true);
      expect(isMigratedAttachmentType('security.alert', owner)).toBe(true);
      expect(isMigratedAttachmentType('observability.alert', OBSERVABILITY_OWNER)).toBe(true);
      expect(isMigratedAttachmentType('stack.alert', GENERAL_CASES_OWNER)).toBe(true);
    });
    it('is true for legacy and unified Lens persistable subtype ids', () => {
      expect(isMigratedAttachmentType(LEGACY_LENS_ATTACHMENT_TYPE, owner)).toBe(true);
      expect(isMigratedAttachmentType(LENS_ATTACHMENT_TYPE, owner)).toBe(true);
    });

    it('is false for non-migrated attachment types', () => {
      expect(isMigratedAttachmentType('custom', owner)).toBe(false);
    });
  });

  describe('toUnifiedAttachmentType', () => {
    it('does not produce undefined prefixes for unknown owners', () => {
      expect(toUnifiedAttachmentType(AttachmentType.event, 'unknownOwner')).toBe(
        AttachmentType.event
      );
    });
  });

  describe('toUnifiedAttachmentType - legacy actions', () => {
    it('maps the legacy top-level `actions` type to security.endpoint', () => {
      expect(toUnifiedAttachmentType(LEGACY_ACTIONS_TYPE, owner)).toBe(
        SECURITY_ENDPOINT_ATTACHMENT_TYPE
      );
    });
  });

  describe('toLegacyAttachmentType', () => {
    it('maps the unified file type back to externalReference (top-level type)', () => {
      expect(toLegacyAttachmentType(FILE_ATTACHMENT_TYPE)).toBe(AttachmentType.externalReference);
    });

    it('maps the unified security.endpoint type back to externalReference (top-level type)', () => {
      expect(toLegacyAttachmentType(SECURITY_ENDPOINT_ATTACHMENT_TYPE)).toBe(
        AttachmentType.externalReference
      );
    });
  });

  describe('isMigratedAttachmentType - file & endpoint', () => {
    it('is true for the unified file type', () => {
      expect(isMigratedAttachmentType(FILE_ATTACHMENT_TYPE, owner)).toBe(true);
    });
  });

  describe('isMigratedAttachmentType - osquery', () => {
    it('is true for the unified osquery type', () => {
      expect(isMigratedAttachmentType(OSQUERY_ATTACHMENT_TYPE, owner)).toBe(true);
      expect(isMigratedAttachmentType(OSQUERY_ATTACHMENT_TYPE, OBSERVABILITY_OWNER)).toBe(true);
    });
  });

  describe('toLegacyAttachmentType - osquery', () => {
    it('maps the unified osquery type back to externalReference (top-level type)', () => {
      expect(toLegacyAttachmentType(OSQUERY_ATTACHMENT_TYPE)).toBe(
        AttachmentType.externalReference
      );
    });
  });

  describe('isMigratedAttachmentType - indicator', () => {
    it('is true for the unified indicator type', () => {
      expect(isMigratedAttachmentType(INDICATOR_ATTACHMENT_TYPE, owner)).toBe(true);
    });
  });

  describe('toLegacyAttachmentType - indicator', () => {
    it('maps the unified indicator type back to externalReference (top-level type)', () => {
      expect(toLegacyAttachmentType(INDICATOR_ATTACHMENT_TYPE)).toBe(
        AttachmentType.externalReference
      );
    });
  });

  describe('getAttachmentTypeFromAttributes', () => {
    it('throws for null', () => {
      expect(() => getAttachmentTypeFromAttributes(null)).toThrow(
        'Invalid attributes: expected non-null object'
      );
    });

    it('throws for non-object', () => {
      expect(() => getAttachmentTypeFromAttributes('string')).toThrow(
        'Invalid attributes: expected non-null object'
      );
      expect(() => getAttachmentTypeFromAttributes(42)).toThrow(
        'Invalid attributes: expected non-null object'
      );
    });

    it('throws when attributes have no recognizable attachment type', () => {
      expect(() => getAttachmentTypeFromAttributes({ foo: 'bar' })).toThrow(
        'Invalid attributes: missing attachment type'
      );
    });

    it('throws when type is not a string', () => {
      expect(() => getAttachmentTypeFromAttributes({ type: 1 })).toThrow(
        'Invalid attributes: missing attachment type'
      );
      expect(() =>
        getAttachmentTypeFromAttributes({
          pushed_at: '2020-01-01T00:00:00.000Z',
          pushed_by: { username: 'elastic', full_name: null, email: null },
        })
      ).toThrow('Invalid attributes: missing attachment type');
    });

    it('returns the top-level type for plain attachments', () => {
      expect(getAttachmentTypeFromAttributes({ type: 'user' })).toBe('user');
      expect(getAttachmentTypeFromAttributes({ type: AttachmentType.alert })).toBe(
        AttachmentType.alert
      );
    });

    it('resolves migrated external reference subtypes to unified type names', () => {
      expect(
        getAttachmentTypeFromAttributes({
          type: AttachmentType.externalReference,
          externalReferenceAttachmentTypeId: 'endpoint',
        })
      ).toBe(SECURITY_ENDPOINT_ATTACHMENT_TYPE);
    });

    it('returns the top-level type for unmigrated external reference subtypes', () => {
      expect(
        getAttachmentTypeFromAttributes({
          type: AttachmentType.externalReference,
          externalReferenceAttachmentTypeId: 'some-unknown-type',
        })
      ).toBe(AttachmentType.externalReference);
    });

    it('returns the top-level type for external references without externalReferenceAttachmentTypeId', () => {
      expect(
        getAttachmentTypeFromAttributes({
          type: AttachmentType.externalReference,
        })
      ).toBe(AttachmentType.externalReference);
    });

    it('returns persistableStateAttachmentTypeId for persistable state attachments', () => {
      expect(
        getAttachmentTypeFromAttributes({
          type: AttachmentType.persistableState,
          persistableStateAttachmentTypeId: LEGACY_LENS_ATTACHMENT_TYPE,
        })
      ).toBe(LEGACY_LENS_ATTACHMENT_TYPE);
    });
  });

  describe('resolveUnifiedAttachmentType', () => {
    it('passes through unified types unchanged', () => {
      expect(resolveUnifiedAttachmentType(makeUnifiedRef(LENS_ATTACHMENT_TYPE), owner)).toBe(
        LENS_ATTACHMENT_TYPE
      );
      expect(resolveUnifiedAttachmentType(makeUnifiedRef(FILE_ATTACHMENT_TYPE), owner)).toBe(
        FILE_ATTACHMENT_TYPE
      );
    });

    it('maps legacy alert/event using owner prefix', () => {
      expect(resolveUnifiedAttachmentType(makeAlert(), owner)).toBe('security.alert');
      expect(resolveUnifiedAttachmentType(makeEvent(), owner)).toBe('security.event');
    });

    it('resolves legacy externalReference + typeId to the unified type', () => {
      expect(resolveUnifiedAttachmentType(makeExternalReference('.files'), owner)).toBe(
        FILE_ATTACHMENT_TYPE
      );
      expect(resolveUnifiedAttachmentType(makeExternalReference('endpoint'), owner)).toBe(
        SECURITY_ENDPOINT_ATTACHMENT_TYPE
      );
      expect(
        resolveUnifiedAttachmentType(makeExternalReference(OSQUERY_ATTACHMENT_TYPE), owner)
      ).toBe(OSQUERY_ATTACHMENT_TYPE);
      expect(resolveUnifiedAttachmentType(makeExternalReference('indicator'), owner)).toBe(
        INDICATOR_ATTACHMENT_TYPE
      );
    });

    it('falls back to the top-level type for unknown externalReference subtypes', () => {
      expect(resolveUnifiedAttachmentType(makeExternalReference('unknownSubtype'), owner)).toBe(
        AttachmentType.externalReference
      );
    });

    it('resolves legacy persistableState + typeId to the unified persistable type', () => {
      expect(
        resolveUnifiedAttachmentType(makePersistableState(LEGACY_LENS_ATTACHMENT_TYPE), owner)
      ).toBe(LENS_ATTACHMENT_TYPE);
    });
  });

  describe('isUnifiedOnlyAttachmentType', () => {
    it('is true for unified types with no legacy equivalent', () => {
      expect(isUnifiedOnlyAttachmentType(SECURITY_TIMELINE_ATTACHMENT_TYPE, owner)).toBe(true);
      expect(isUnifiedOnlyAttachmentType(SECURITY_ENTITY_ATTACHMENT_TYPE, owner)).toBe(true);
      expect(isUnifiedOnlyAttachmentType(DASHBOARD_ATTACHMENT_TYPE, owner)).toBe(true);
      expect(isUnifiedOnlyAttachmentType(MAP_ATTACHMENT_TYPE, owner)).toBe(true);
      expect(isUnifiedOnlyAttachmentType(DISCOVER_SESSION_ATTACHMENT_TYPE, owner)).toBe(true);
    });

    it('is false for unified types that map back to a legacy type', () => {
      expect(isUnifiedOnlyAttachmentType(SECURITY_ALERT_ATTACHMENT_TYPE, owner)).toBe(false);
      expect(isUnifiedOnlyAttachmentType(FILE_ATTACHMENT_TYPE, owner)).toBe(false);
    });

    it('is false for persistable unified types', () => {
      expect(isUnifiedOnlyAttachmentType(LENS_ATTACHMENT_TYPE, owner)).toBe(false);
    });

    it('is false for legacy and unknown types', () => {
      expect(isUnifiedOnlyAttachmentType(AttachmentType.user, owner)).toBe(false);
      expect(isUnifiedOnlyAttachmentType('something-custom', owner)).toBe(false);
    });

    it('is false for the legacy alert type with a security owner (owner drives legacy→unified mapping)', () => {
      // AttachmentType.alert + SECURITY_SOLUTION_OWNER → toUnifiedAttachmentType → 'security.alert'
      // 'security.alert' IS in UNIFIED_TO_LEGACY_MAP, so hasLegacyMapping=true → returns false.
      expect(isUnifiedOnlyAttachmentType(AttachmentType.alert, SECURITY_SOLUTION_OWNER)).toBe(
        false
      );
    });
  });

  describe('isPersistableType', () => {
    it('is true for Lens legacy and unified subtype ids', () => {
      expect(isPersistableType(LEGACY_LENS_ATTACHMENT_TYPE)).toBe(true);
      expect(isPersistableType(LENS_ATTACHMENT_TYPE)).toBe(true);
    });

    it('is false for unrelated persistable subtype ids', () => {
      expect(isPersistableType('.test')).toBe(false);
    });
  });
});
