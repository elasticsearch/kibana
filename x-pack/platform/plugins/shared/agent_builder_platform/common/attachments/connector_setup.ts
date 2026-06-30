/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { Attachment } from '@kbn/agent-builder-common/attachments';

export const CONNECTOR_SETUP_ATTACHMENT_TYPE = 'connector_setup' as const;

export const connectorSetupAttachmentDataSchema = z.object({
  connector_type: z.string(),
  connector_type_name: z.string().optional(),
  suggested_name: z.string().optional(),
  reason: z.string().optional(),
});

/**
 * Data shape stored on a `connector_setup` attachment.
 *
 * A `connector_setup` attachment is a call-to-action card the agent renders so
 * the user can create a connector instance from chat without leaving the
 * conversation. It carries only the intended connector type (and presentation
 * hints) — never config or secrets, which the user enters in the connector
 * flyout and which go straight to the Actions API.
 */
export type ConnectorSetupAttachmentData = z.infer<typeof connectorSetupAttachmentDataSchema>;

export type ConnectorSetupAttachment = Attachment<
  typeof CONNECTOR_SETUP_ATTACHMENT_TYPE,
  ConnectorSetupAttachmentData
>;
