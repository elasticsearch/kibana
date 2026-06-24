/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedReferenceAttachmentPayload } from '../../../../common/types/domain';
import { AttachmentType } from '../../../../common/types/domain';
import type { AttachmentUI } from '../../../containers/types';
import type {
  CaseUI,
  AlertAttachmentUI,
  EventAttachmentUI,
  AttachmentUIV2,
} from '../../../../common/ui/types';
import {
  isLegacyEventAttachment,
  isUnifiedReferenceAttachmentRequest,
  isUnifiedAlertAttachment,
  isUnifiedEventAttachment,
} from '../../../../common/utils/attachments';
import {
  getSavedObjectAttachmentAttributes,
  isSavedObjectAttachment,
} from '../../attachments/common/saved_object/helpers';
import type { SavedObjectAttachmentAttributes } from '../../attachments/common/saved_object/types';
import { UNKNOWN } from '../../../common/translations';

/**
 * Stable identifier for an attachment author. Prefers `profileUid`, then
 * `username`, then `email`. Returns the empty string when none are set.
 */
export const getAttachmentAuthorKey = (user: AttachmentUIV2['createdBy']): string =>
  user.profileUid ?? user.username ?? user.email ?? '';

/**
 * Display label for an attachment author. Prefers `fullName`, then `username`,
 * then `email`, falling back to a localized "Unknown" placeholder.
 */
export const getAttachmentAuthorLabel = (user: AttachmentUIV2['createdBy']): string =>
  user.fullName || user.username || user.email || UNKNOWN;

export const getAttachmentItemCount = (comment: AttachmentUIV2): number => {
  if (isAlertAttachment(comment)) {
    return Array.isArray(comment.alertId) ? comment.alertId.length : 1;
  }
  if (isLegacyEventAttachment(comment)) {
    return Array.isArray(comment.eventId) ? comment.eventId.length : 1;
  }
  if (isUnifiedReferenceAttachmentRequest(comment)) {
    return Array.isArray(comment.attachmentId) ? comment.attachmentId.length : 1;
  }
  return 1;
};

const isAlertAttachment = (comment: AttachmentUIV2): comment is AlertAttachmentUI => {
  return comment.type === AttachmentType.alert && `alertId` in comment;
};

const filterAlertCommentByIds = (
  comment: AlertAttachmentUI,
  searchTerm: string
): AlertAttachmentUI | null => {
  const ids = Array.isArray(comment.alertId) ? comment.alertId : [comment.alertId];
  const filteredIds = ids.filter((id: string) => Boolean(id) && id.includes(searchTerm));
  if (filteredIds.length === 0) {
    return null;
  }
  return {
    ...comment,
    alertId: filteredIds,
  };
};

const filterLegacyEventCommentByIds = (
  comment: EventAttachmentUI,
  searchTerm: string
): EventAttachmentUI | null => {
  const ids = Array.isArray(comment.eventId) ? comment.eventId : [comment.eventId];
  const filteredIds = ids.filter((id: string) => Boolean(id) && id.includes(searchTerm));
  if (filteredIds.length === 0) {
    return null;
  }
  return {
    ...comment,
    eventId: filteredIds,
  };
};

/**
 * SO-typed unified reference attachments (dashboard, map, discoverSession)
 * filter on title (cached in `metadata.title` at attach time) as well as the
 * foreign SO id, case-insensitively — matching the experience the user gets
 * when typing into the modal search.
 */
const filterSavedObjectCommentBySearchTerm = (
  comment: AttachmentUIV2,
  attributes: SavedObjectAttachmentAttributes,
  searchTerm: string
): AttachmentUIV2 | null => {
  const term = searchTerm.toLowerCase();
  const title = (attributes.title ?? '').toLowerCase();
  const id = attributes.attachmentId.toLowerCase();
  return title.includes(term) || id.includes(term) ? comment : null;
};

const filterUnifiedCommentById = (
  comment: UnifiedReferenceAttachmentPayload,
  searchTerm: string
): UnifiedReferenceAttachmentPayload | null => {
  if (Array.isArray(comment.attachmentId)) {
    const matchingIds = comment.attachmentId.filter((id) => id.includes(searchTerm));
    if (matchingIds.length === 0) {
      return null;
    }
    return { ...comment, attachmentId: matchingIds };
  }
  if (!comment.attachmentId.includes(searchTerm)) {
    return null;
  }
  return comment;
};

export const filterCaseAttachmentsBySearchTerm = (caseData: CaseUI, searchTerm: string): CaseUI => {
  if (!searchTerm) {
    return caseData;
  }

  return {
    ...caseData,
    comments: caseData.comments
      .map((comment) => {
        if (isAlertAttachment(comment)) {
          return filterAlertCommentByIds(comment, searchTerm);
        }
        if (isLegacyEventAttachment(comment)) {
          return filterLegacyEventCommentByIds(comment, searchTerm);
        }
        if (isSavedObjectAttachment(comment)) {
          const savedObjectAttributes = getSavedObjectAttachmentAttributes(comment);
          return filterSavedObjectCommentBySearchTerm(comment, savedObjectAttributes, searchTerm);
        }
        if (isUnifiedEventAttachment(comment) || isUnifiedAlertAttachment(comment)) {
          return filterUnifiedCommentById(comment, searchTerm);
        }
        return comment;
      })
      .filter((comment): comment is AttachmentUI => comment !== null),
  };
};
