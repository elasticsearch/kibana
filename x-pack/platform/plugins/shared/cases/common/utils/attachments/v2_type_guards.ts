/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { AttachmentRequestV2 } from '../../types/api';
import { AttachmentType } from '../../types/domain';
import type {
  UnifiedAttachmentPayload,
  UnifiedReferenceAttachmentPayload,
  UnifiedValueAttachmentPayload,
} from '../../types/domain';
import {
  COMMENT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '../../constants/attachments';

const isReferenceAttachmentId = (value: unknown): value is string | string[] => {
  if (typeof value === 'string') {
    return true;
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

/**
 * A type narrowing function for  reference-based unified attachment.
 */
export const isUnifiedReferenceAttachmentRequest = (
  context: AttachmentRequestV2
): context is UnifiedReferenceAttachmentPayload => {
  return 'attachmentId' in context && isReferenceAttachmentId(context.attachmentId);
};

/**
 * A type narrowing function for value-based unified attachment.
 */
export const isUnifiedValueAttachmentRequest = (
  context: AttachmentRequestV2
): context is UnifiedValueAttachmentPayload => {
  return 'data' in context && context.data !== null && typeof context.data === 'object';
};

/**
 * A type narrowing function for unified attachment (either reference or value-based).
 */
export const isUnifiedAttachmentRequest = (
  context: AttachmentRequestV2
): context is UnifiedAttachmentPayload => {
  return isUnifiedReferenceAttachmentRequest(context) || isUnifiedValueAttachmentRequest(context);
};

// ------ Comment -------
export const isCommentAttachmentType = (type: string): boolean =>
  type === AttachmentType.user || type === COMMENT_ATTACHMENT_TYPE;

export const isUnifiedCommentAttachment = (
  attachment: AttachmentRequestV2
): attachment is UnifiedValueAttachmentPayload & {
  type: 'comment';
  data: { content: string };
} =>
  isUnifiedValueAttachmentRequest(attachment) &&
  attachment.type === COMMENT_ATTACHMENT_TYPE &&
  typeof attachment.data.content === 'string';

// ------ Event -------
export const isEventAttachmentType = (type: string): boolean =>
  type === AttachmentType.event || type === SECURITY_EVENT_ATTACHMENT_TYPE;

export const isUnifiedEventAttachment = (
  attachment: AttachmentRequestV2
): attachment is UnifiedReferenceAttachmentPayload =>
  isUnifiedReferenceAttachmentRequest(attachment) && isEventAttachmentType(attachment.type);

// ------ Alert -------
export const UNIFIED_ALERT_TYPES_ARRAY: string[] = [
  SECURITY_ALERT_ATTACHMENT_TYPE,
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
];
export const UNIFIED_ALERT_TYPES = new Set<string>(UNIFIED_ALERT_TYPES_ARRAY);

export const isAlertAttachmentType = (type: string): boolean =>
  type === AttachmentType.alert || UNIFIED_ALERT_TYPES.has(type);

export const isUnifiedAlertAttachment = (
  attachment: AttachmentRequestV2
): attachment is UnifiedReferenceAttachmentPayload =>
  isUnifiedReferenceAttachmentRequest(attachment) && UNIFIED_ALERT_TYPES.has(attachment.type);

// ------ Detection -------
/**
 * Attachment types whose referenced documents carry `kibana.alert.workflow_status` and
 * therefore participate in the case status sync. Deliberately kept separate from
 * `UNIFIED_ALERT_TYPES`, which drives alert-specific counting and the alerts table where
 * counting an attack as an alert would be wrong.
 */
export const UNIFIED_DETECTION_TYPES_ARRAY: string[] = [
  ...UNIFIED_ALERT_TYPES_ARRAY,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
];
export const UNIFIED_DETECTION_TYPES = new Set<string>(UNIFIED_DETECTION_TYPES_ARRAY);

export const isDetectionAttachmentType = (type: string): boolean =>
  type === AttachmentType.alert || UNIFIED_DETECTION_TYPES.has(type);
