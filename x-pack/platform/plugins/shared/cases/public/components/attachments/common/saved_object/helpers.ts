/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core/public';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  DASHBOARD_SO_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  DISCOVER_SESSION_SO_TYPE,
  MAP_ATTACHMENT_TYPE,
  MAP_SO_TYPE,
} from '../../../../../common/constants/attachments';
import type { AttachmentUIV2 } from '../../../../../common/ui/types';
import type {
  FoundSavedObject,
  SavedObjectAttachmentAttributes,
  SavedObjectAttachmentUI,
} from './types';

/**
 * Maps each attachment-type id that represents a saved-object attachment to
 * its SO type name as understood by the `_find` API and in-app URLs. Single
 * source of truth for "is this attachment a saved-object reference, and which
 * SO type does it point at?".
 */
export const ATTACHMENT_TYPE_TO_SO_TYPE = {
  [DASHBOARD_ATTACHMENT_TYPE]: DASHBOARD_SO_TYPE,
  [DISCOVER_SESSION_ATTACHMENT_TYPE]: DISCOVER_SESSION_SO_TYPE,
  [MAP_ATTACHMENT_TYPE]: MAP_SO_TYPE,
} as const satisfies Record<string, string>;

export type SavedObjectAttachmentType = keyof typeof ATTACHMENT_TYPE_TO_SO_TYPE;
export type SupportedSavedObjectType =
  (typeof ATTACHMENT_TYPE_TO_SO_TYPE)[SavedObjectAttachmentType];

/** Attachment-type ids that correspond to saved-object attachments. */
export const SAVED_OBJECT_ATTACHMENT_TYPES = new Set<string>(
  Object.keys(ATTACHMENT_TYPE_TO_SO_TYPE)
);

/** SO types the attach modal can search for, derived from the same source. */
export const SUPPORTED_SO_TYPES = Object.values(
  ATTACHMENT_TYPE_TO_SO_TYPE
) as SupportedSavedObjectType[];

/** Inverse of `ATTACHMENT_TYPE_TO_SO_TYPE`, used by the attach action. */
export const SO_TYPE_TO_ATTACHMENT_TYPE = Object.fromEntries(
  Object.entries(ATTACHMENT_TYPE_TO_SO_TYPE).map(([attachmentType, soType]) => [
    soType,
    attachmentType,
  ])
) as Record<SupportedSavedObjectType, SavedObjectAttachmentType>;

const SUPPORTED_SO_TYPE_SET = new Set<string>(SUPPORTED_SO_TYPES);

export const isSavedObjectAttachment = (
  attachment: AttachmentUIV2
): attachment is SavedObjectAttachmentUI => {
  if (!SAVED_OBJECT_ATTACHMENT_TYPES.has(attachment.type)) {
    return false;
  }
  if (
    !('attachmentId' in attachment) ||
    !('metadata' in attachment) ||
    typeof attachment.metadata !== 'object'
  ) {
    return false;
  }

  const soType = attachment.metadata?.soType ?? undefined;
  const title = attachment.metadata?.title ?? undefined;

  return (
    typeof soType === 'string' && SUPPORTED_SO_TYPE_SET.has(soType) && typeof title === 'string'
  );
};

/**
 * Extracts the SO-attachment attributes (foreign SO id, soType, cached title)
 * from any SO-backed unified attachment.
 */
export const getSavedObjectAttachmentAttributes = (
  attachment: SavedObjectAttachmentUI
): SavedObjectAttachmentAttributes => {
  const {
    attachmentId,
    metadata: { soType, title },
  } = attachment;
  return { attachmentId, soType, title };
};

export const getSavedObjectKey = (soType: SupportedSavedObjectType, id: string): string =>
  `${soType}:${id}`;

/**
 * Walks `caseData.comments` once to collect the foreign SO keys of every
 * SO-typed attachment on the case.
 */
export const getAttachedSavedObjectKeys = (attachments: AttachmentUIV2[]): Set<string> =>
  attachments.reduce<Set<string>>((keys, attachment) => {
    if (isSavedObjectAttachment(attachment)) {
      const { attachmentId, soType } = getSavedObjectAttachmentAttributes(attachment);
      keys.add(getSavedObjectKey(soType, attachmentId));
    }
    return keys;
  }, new Set());

/**
 * Walks the dotted `uiCapabilitiesPath` on `application.capabilities` to decide
 * whether the current user can open the SO in its source app. Returns true
 * when the SO has no `inAppUrl` capability requirement at all.
 */
export const canAccessSavedObject = (
  object: FoundSavedObject,
  capabilities: ApplicationStart['capabilities']
): boolean => {
  const { inAppUrl } = object.meta;
  if (!inAppUrl) {
    return false;
  }
  if (!inAppUrl.uiCapabilitiesPath) {
    return true;
  }
  const segments = inAppUrl.uiCapabilitiesPath.split('.');
  let current: unknown = capabilities;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return Boolean(current);
};
