/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Attachment, AttachmentInput } from '@kbn/agent-builder-common/attachments';
import type { DASHBOARD_ATTACHMENT_TYPE } from './constants';
import type {
  DashboardAttachmentData,
  AttachmentPanel,
  DashboardSection,
} from './dashboard_schema_types';
import {
  dashboardAttachmentDataSchema,
  panelGridSchema,
  sectionGridSchema,
  timeRangeSchema,
  isSection,
} from './dashboard_schema_types';

// Re-export dashboard schema types for convenience
// NOTE: These types are temporary and should be replaced with types from @kbn/dashboard-plugin
// once the dashboard plugin exports its schema types.
export type { DashboardAttachmentData, AttachmentPanel, DashboardSection };
export {
  dashboardAttachmentDataSchema,
  panelGridSchema,
  sectionGridSchema,
  timeRangeSchema,
  isSection,
};

// ============================================================================
// Attachment Type
// ============================================================================

export type DashboardAttachment = Attachment<
  typeof DASHBOARD_ATTACHMENT_TYPE,
  DashboardAttachmentData
>;

/**
 * Represents a pending dashboard attachment input.
 * Used when creating attachments before they're persisted to a conversation.
 */
export type PendingDashboardAttachment = AttachmentInput<
  typeof DASHBOARD_ATTACHMENT_TYPE,
  DashboardAttachmentData
>;
