/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isPlainObject } from 'lodash';
import {
  EXTERNAL_REFERENCE_TYPE_MAP,
  LEGACY_TO_UNIFIED_MAP,
  MIGRATED_ATTACHMENT_TYPES,
  PERSISTABLE_STATE_LEGACY_TO_UNIFIED_MAP,
  PERSISTABLE_STATE_UNIFIED_TO_LEGACY_MAP,
  PERSISTABLE_ATTACHMENT_TYPES,
  UNIFIED_TO_LEGACY_MAP,
  OWNER_TO_PREFIX_MAP,
  LEGACY_EVENT_TYPE,
  LEGACY_ALERT_TYPE,
} from '../../constants/attachments';
import { AttachmentType } from '../../types/domain';
import type { AttachmentRequestV2 } from '../../types/api';

export const isMigratedAttachmentType = (type: string, owner: string): boolean => {
  return (
    MIGRATED_ATTACHMENT_TYPES.has(toUnifiedAttachmentType(type, owner)) ||
    MIGRATED_ATTACHMENT_TYPES.has(toUnifiedPersistableStateAttachmentType(type))
  );
};

/**
 * True only for migrated attachment types that have no legacy (v1) equivalent.
 *
 * The incoming `type` may be legacy (`alert`/`event`) or unified, so we first
 * normalize via `toUnifiedAttachmentType(type, owner)`. A type is treated
 * as unified-only when it:
 *  1) is in `MIGRATED_ATTACHMENT_TYPES`,
 *  2) has no entry in `UNIFIED_TO_LEGACY_MAP`, and
 *  3) is not a persistable-state subtype (handled separately).
 */
export const isUnifiedOnlyAttachmentType = (type: string, owner: string): boolean => {
  const unifiedType = toUnifiedAttachmentType(type, owner);
  if (!MIGRATED_ATTACHMENT_TYPES.has(unifiedType)) {
    return false;
  }
  const hasLegacyMapping = unifiedType in UNIFIED_TO_LEGACY_MAP;
  const isPersistable = PERSISTABLE_ATTACHMENT_TYPES.has(unifiedType);
  return !hasLegacyMapping && !isPersistable;
};

export const toLegacyAttachmentType = (type?: string): string | undefined => {
  if (typeof type !== 'string') {
    return undefined;
  }
  if (type in PERSISTABLE_STATE_UNIFIED_TO_LEGACY_MAP) {
    return toLegacyPersistableStateAttachmentType(type);
  }
  return UNIFIED_TO_LEGACY_MAP[type] ?? type;
};

export const toUnifiedAttachmentType = (type: string, owner: string): string => {
  if (type === LEGACY_EVENT_TYPE || type === LEGACY_ALERT_TYPE) {
    const ownerPrefix = OWNER_TO_PREFIX_MAP[owner];
    if (ownerPrefix == null) {
      return type;
    }
    return `${ownerPrefix}.${type}`;
  }
  return LEGACY_TO_UNIFIED_MAP[type] ?? type;
};

/**
 * Returns true when the owner has a registered prefix in `OWNER_TO_PREFIX_MAP`,
 * meaning legacy `alert` / `event` types can be mapped to a valid unified
 * `<prefix>.<type>` (e.g. `security.alert`).
 */
export const hasOwnerUnifiedPrefix = (owner: string): boolean => OWNER_TO_PREFIX_MAP[owner] != null;

/**
 * True when the persistable-state subtype id (legacy `.lens` or unified `lens`) is one
 * that this stack migrates to unified attachment attributes (currently Lens only).
 */
export const isPersistableType = (type: string): boolean =>
  PERSISTABLE_ATTACHMENT_TYPES.has(toUnifiedPersistableStateAttachmentType(type));

export const toUnifiedPersistableStateAttachmentType = (type: string): string => {
  return PERSISTABLE_STATE_LEGACY_TO_UNIFIED_MAP[type] ?? type;
};

export const toLegacyPersistableStateAttachmentType = (type: string): string => {
  return PERSISTABLE_STATE_UNIFIED_TO_LEGACY_MAP[type] ?? type;
};

/**
 * Returns a routing key derived from raw attachment attributes — useful when working
 * with persisted SO data of unknown shape.
 *
 * Not a fully-normalized unified type — for that compose with
 * {@link toUnifiedAttachmentType} / {@link toUnifiedPersistableStateAttachmentType}
 * (or use {@link resolveUnifiedAttachmentType}).
 *
 * @throws Error if attributes is null or not an object, or if `type` is missing.
 */
export const getAttachmentTypeFromAttributes = (attributes: unknown): string => {
  if (!isPlainObject(attributes)) {
    throw new Error('Invalid attributes: expected non-null object');
  }
  const { type, persistableStateAttachmentTypeId, externalReferenceAttachmentTypeId } =
    attributes as Record<string, unknown>;
  if (typeof type !== 'string') {
    throw new Error('Invalid attributes: missing attachment type');
  }
  if (
    type === AttachmentType.persistableState &&
    typeof persistableStateAttachmentTypeId === 'string'
  ) {
    return persistableStateAttachmentTypeId;
  }
  if (
    type === AttachmentType.externalReference &&
    typeof externalReferenceAttachmentTypeId === 'string'
  ) {
    return EXTERNAL_REFERENCE_TYPE_MAP[externalReferenceAttachmentTypeId] ?? type;
  }
  return type;
};

/**
 * Resolves a typed V2 attachment to its fully-normalized unified type
 * (`security.alert`, `lens`, `file`, …).
 */
export const resolveUnifiedAttachmentType = (
  attachment: AttachmentRequestV2,
  owner: string
): string => {
  const routingKey = getAttachmentTypeFromAttributes(attachment);
  return toUnifiedAttachmentType(toUnifiedPersistableStateAttachmentType(routingKey), owner);
};
