/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Attachment, AttachmentInput } from '@kbn/agent-builder-common/attachments';
import type { SignificantEvent } from '@kbn/significant-events-schema';

export const SIGNIFICANT_EVENT_ATTACHMENT_TYPE = 'platform.streams.significant_event' as const;
export const SIGNIFICANT_EVENT_SML_TYPE = 'significant_event' as const;

export type SignificantEventAttachment = Attachment<
  typeof SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  SignificantEvent
>;

export type PendingSignificantEventAttachment = AttachmentInput<
  typeof SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  SignificantEvent
>;
