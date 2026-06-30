/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  Attachment,
  UnknownAttachment,
  TextAttachment,
  ScreenContextAttachment,
  EsqlAttachment,
  VisualizationAttachment,
  ConnectorAttachment,
} from './attachments';

export type {
  StaleAttachment,
  FreshAttachment,
  AttachmentStaleCheckResult,
  FreshAttachmentStalenessCheckError,
} from './stale_check';
export { isFreshAttachmentStalenessCheckError } from './stale_check';
export {
  AttachmentType,
  textAttachmentDataSchema,
  esqlAttachmentDataSchema,
  screenContextAttachmentDataSchema,
  visualizationAttachmentDataSchema,
  connectorAttachmentDataSchema,
  CONNECTOR_TAG_PREFIX,
  type TextAttachmentData,
  type ScreenContextAttachmentData,
  type TimeRange,
  screenContextTimeRangeSchema,
  type EsqlAttachmentData,
  type VisualizationAttachmentData,
  type ConnectorAttachmentData,
} from './attachment_types';

export type {
  VersionedAttachment,
  VersionedAttachmentWithOrigin,
  AttachmentVersion,
  AttachmentVersionRef,
  AttachmentRefOperation,
  AttachmentRefActor,
  AttachmentDiff,
  AttachmentInput,
  AttachmentGroup,
  ConversationAttachment,
  UpdateOriginResponse,
} from './versioned_attachment';
export {
  ATTACHMENT_REF_OPERATION,
  ATTACHMENT_REF_ACTOR,
  attachmentVersionSchema,
  versionedAttachmentSchema,
  attachmentVersionRefSchema,
  attachmentRefOperationSchema,
  attachmentRefActorSchema,
  attachmentInputSchema,
  attachmentGroupSchema,
  attachmentDiffSchema,
  isAttachmentGroup,
  getLatestVersion,
  getVersion,
  createVersionId,
  parseVersionId,
  isAttachmentActive,
  getActiveAttachments,
  isVersionedAttachmentWithOrigin,
  hashContent,
  estimateTokens,
  getContentKey,
} from './versioned_attachment';
