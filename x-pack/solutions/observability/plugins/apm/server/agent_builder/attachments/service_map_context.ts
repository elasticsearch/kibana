/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
  serviceMapContextAttachmentDataSchema,
  type ServiceMapContextAttachmentData,
} from '../../../common/agent_builder/attachments';

export const createServiceMapContextAttachmentType = (): AttachmentTypeDefinition<
  typeof SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
  ServiceMapContextAttachmentData
> => {
  return {
    id: SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
    validate: (input) => {
      const parseResult = serviceMapContextAttachmentDataSchema.safeParse(input);
      if (!parseResult.success) {
        return { valid: false, error: parseResult.error.message };
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
      'UI context captured from the APM service map page the user is viewing. Contains only the view filters — environment, kuery, time range, service group, and any highlighted services — NOT topology data. Re-fetch live data scoped to these filters with tools such as get_services, get_alerts, and get_service_topology.',
    getTools: () => [],
  };
};
