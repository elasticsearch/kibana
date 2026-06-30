/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import {
  SERVICE_MAP_ATTACHMENT_TYPE,
  type ServiceMapAttachmentData,
} from '../../../common/agent_builder/attachments';
import { LazyAgentServiceMap } from './lazy_agent_service_map';

type ServiceMapAttachment = Attachment<
  typeof SERVICE_MAP_ATTACHMENT_TYPE,
  ServiceMapAttachmentData
>;

export const registerServiceMapAttachment = (attachments: AttachmentServiceStartContract) => {
  attachments.addAttachmentType<ServiceMapAttachment>(SERVICE_MAP_ATTACHMENT_TYPE, {
    getLabel: (attachment) =>
      attachment.data?.title ??
      i18n.translate('xpack.apm.agentBuilder.attachments.serviceMap.label', {
        defaultMessage: 'Service Map',
      }),
    getIcon: () => 'graphApp',
    renderInlineContent: ({ attachment }) => {
      return (
        <div
          css={css`
            width: 100%;
            height: 500px;
          `}
        >
          <LazyAgentServiceMap
            connections={attachment.data.connections}
            nodeMetadata={attachment.data.nodeMetadata}
          />
        </div>
      );
    },
  });
};
