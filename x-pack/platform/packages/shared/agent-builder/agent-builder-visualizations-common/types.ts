/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Attachment, AttachmentInput } from '@kbn/agent-builder-common/attachments';
import type { VISUALIZATION_ATTACHMENT_TYPE } from './constants';
import type { VisualizationAttachmentData } from './visualization_schema_types';

export type VisualizationAttachment = Attachment<
  typeof VISUALIZATION_ATTACHMENT_TYPE,
  VisualizationAttachmentData
>;

/**
 * Represents a pending visualization attachment input.
 * Used when creating attachments before they're persisted to a conversation.
 */
export type PendingVisualizationAttachment = AttachmentInput<
  typeof VISUALIZATION_ATTACHMENT_TYPE,
  VisualizationAttachmentData
>;
