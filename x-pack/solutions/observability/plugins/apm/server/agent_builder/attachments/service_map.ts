/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  SERVICE_MAP_ATTACHMENT_TYPE,
  serviceMapAttachmentDataSchema,
  type ServiceMapAttachmentData,
} from '../../../common/agent_builder/attachments';

export const createServiceMapAttachmentType = (): AttachmentTypeDefinition<
  typeof SERVICE_MAP_ATTACHMENT_TYPE,
  ServiceMapAttachmentData
> => {
  return {
    id: SERVICE_MAP_ATTACHMENT_TYPE,
    validate: (input) => {
      const parseResult = serviceMapAttachmentDataSchema.safeParse(input);
      if (!parseResult.success) {
        return { valid: false, error: parseResult.error.message };
      }
      if (parseResult.data.connections.length === 0) {
        return { valid: false, error: 'Service map has no connections to display.' };
      }
      return { valid: true, data: parseResult.data };
    },
    format: (attachment) => {
      return {
        getRepresentation: () => ({
          type: 'text' as const,
          value: JSON.stringify(attachment.data),
        }),
      };
    },
    getAgentDescription: () =>
      'A service map attachment showing the topology of services and their dependencies with RED metrics (latency, throughput, error rate) on each connection. Service nodes can optionally carry alertsCount (active alerts), sloStatus (violated/degrading/healthy), and sloCount fields that render as inline badges. Rendered as an interactive graph with service nodes (circles) and dependency nodes (diamonds).',
    getTools: () => [],
  };
};
