/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import type { Logger } from '@kbn/core/server';
import {
  MONITOR_ATTACHMENT_TYPE,
  monitorAttachmentDataSchema,
  type MonitorAttachmentData,
} from '../../../common/agent_builder/attachments/monitor_attachment_schema';
import { MONITOR_MANAGEMENT_SKILL_ID } from '../common/constants';

interface CreateMonitorAttachmentTypeOptions {
  logger: Logger;
}

const formatMonitorAttachmentDescription = (
  attachmentId: string,
  data: MonitorAttachmentData,
  savedObjectId?: string
): string => {
  const isPersisted = Boolean(savedObjectId);
  const isEnabled = data.enabled ?? true;
  const status = isPersisted ? (isEnabled ? 'enabled' : 'disabled') : 'draft (not yet saved)';
  const schedule = `every ${data.schedule.number}${data.schedule.unit}`;
  const locations = data.locations.map((l) => l.label ?? l.id).join(', ') || 'none';

  return [
    `Synthetics monitor "${data.metadata.name}" (monitorAttachment.id: "${attachmentId}")`,
    ...(savedObjectId ? [`Monitor ID: ${savedObjectId}`] : []),
    `Type: ${data.type}`,
    `Status: ${status}`,
    `URL: ${data.urls}`,
    `Schedule: ${schedule}`,
    `Locations: ${locations}`,
    ...(data.metadata.description ? [`Description: ${data.metadata.description}`] : []),
    ...(data.metadata.tags?.length ? [`Tags: ${data.metadata.tags.join(', ')}`] : []),
  ].join('\n');
};

export const createMonitorAttachmentType = ({
  logger,
}: CreateMonitorAttachmentTypeOptions): AttachmentTypeDefinition<
  typeof MONITOR_ATTACHMENT_TYPE,
  MonitorAttachmentData
> => ({
  id: MONITOR_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = monitorAttachmentDataSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    logger.debug(`Invalid synthetics monitor attachment payload: ${result.error.message}`);
    return { valid: false, error: result.error.message };
  },

  format: (attachment) => ({
    getRepresentation: () => ({
      type: 'text',
      value: formatMonitorAttachmentDescription(attachment.id, attachment.data, attachment.origin),
    }),
  }),

  getAgentDescription: () =>
    `A synthetics monitor attachment represents a Synthetics HTTP monitor — either a draft the agent is composing (not yet saved) or a saved monitor linked via its config_id. To compose, modify, or save monitors, load the ${MONITOR_MANAGEMENT_SKILL_ID} skill.`,

  getTools: () => [],
});
