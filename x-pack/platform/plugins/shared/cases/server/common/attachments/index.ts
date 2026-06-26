/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  COMMENT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  PERSISTABLE_ATTACHMENT_TYPES,
  EXTERNAL_REFERENCE_TYPE_MAP,
  LEGACY_ACTIONS_TYPE,
} from '../../../common/constants/attachments';
import {
  isAlertAttachmentType,
  toUnifiedAttachmentType,
  toUnifiedPersistableStateAttachmentType,
} from '../../../common/utils/attachments';
import type {
  AttachmentPersistedAttributes,
  UnifiedAttachmentAttributes,
} from '../types/attachments_v2';
import { passThroughTransformer, type AttachmentTypeTransformer } from './base';
import { commentAttachmentTransformer } from './comment';
import { externalReferenceAttachmentTransformer } from './external_reference';
import { persistableStateAttachmentTransformer } from './persistable_state';
import { eventAttachmentTransformer } from './event';
import { actionsAttachmentTransformer } from './actions';
import { alertAttachmentTransformer } from './alert';

export { getCommentContentFromUnifiedPayload, commentAttachmentTransformer } from './comment';
export { actionsAttachmentTransformer } from './actions';
export {
  getAttachmentSavedObjectType,
  resolveAttachmentSavedObjectTypes,
} from './saved_object_type';
export type { ResolvedAttachmentSavedObjectType } from './saved_object_type';
// Re-exported so existing server call sites keep their `from '.'` import path.
export { getAttachmentTypeFromAttributes } from '../../../common/utils/attachments';

/** Set of all unified type names that map to external references */
const UNIFIED_EXTERNAL_REFERENCE_TYPES = new Set(Object.values(EXTERNAL_REFERENCE_TYPE_MAP));

/**
 * Returns the persisted transformer for the routing key from {@link getAttachmentTypeFromAttributes}.
 * For comment/user types returns the comment transformer; for migrated persistable
 * types (e.g. Lens) returns the persistable-state transformer; for migrated external
 * reference subtypes (e.g. endpoint) returns the external reference transformer;
 * otherwise pass-through.
 */
export function getAttachmentTypeTransformers(
  type: string,
  owner: string
): AttachmentTypeTransformer<AttachmentPersistedAttributes, UnifiedAttachmentAttributes> {
  const normalizedType = toUnifiedAttachmentType(type, owner);
  const normalizedPersistableType = toUnifiedPersistableStateAttachmentType(type);

  if (normalizedType === COMMENT_ATTACHMENT_TYPE || normalizedType === 'comment') {
    return commentAttachmentTransformer;
  }
  if (PERSISTABLE_ATTACHMENT_TYPES.has(normalizedPersistableType)) {
    return persistableStateAttachmentTransformer;
  }
  if (normalizedType === SECURITY_EVENT_ATTACHMENT_TYPE) {
    return eventAttachmentTransformer;
  }
  if (type === LEGACY_ACTIONS_TYPE) {
    return actionsAttachmentTransformer;
  }
  if (isAlertAttachmentType(normalizedType)) {
    return alertAttachmentTransformer;
  }
  if (UNIFIED_EXTERNAL_REFERENCE_TYPES.has(normalizedType)) {
    return externalReferenceAttachmentTransformer;
  }
  return passThroughTransformer;
}
