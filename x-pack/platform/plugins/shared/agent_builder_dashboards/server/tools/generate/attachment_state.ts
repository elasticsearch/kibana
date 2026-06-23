/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  isDashboardAttachment,
} from '@kbn/agent-builder-dashboards-common';
import { type AttachmentVersion, getLatestVersion } from '@kbn/agent-builder-common/attachments';

/**
 * Retrieves and validates the latest version of a dashboard attachment by ID.
 *
 * Kibana-specific I/O: reads from the conversation attachment store. The
 * generate core never calls this — the tool wrapper resolves the prior
 * dashboard payload here before handing it to the pure core.
 */
export const retrieveLatestVersion = (
  attachments: AttachmentStateManager,
  attachmentId: string | undefined
): AttachmentVersion<DashboardAttachmentData> | undefined => {
  if (!attachmentId) {
    return undefined;
  }

  const attachment = attachments.getAttachmentRecord(attachmentId);
  if (!attachment) {
    throw new Error(`Dashboard attachment "${attachmentId}" not found.`);
  }

  if (!isDashboardAttachment(attachment)) {
    throw new Error(
      `Attachment "${attachmentId}" is not a ${DASHBOARD_ATTACHMENT_TYPE} attachment.`
    );
  }

  const latestVersion = getLatestVersion(attachment);
  if (!latestVersion) {
    throw new Error(`Could not retrieve latest version of dashboard attachment "${attachmentId}".`);
  }

  return latestVersion;
};
