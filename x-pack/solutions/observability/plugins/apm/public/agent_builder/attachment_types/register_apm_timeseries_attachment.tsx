/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import {
  APM_TIMESERIES_ATTACHMENT_TYPE,
  type ApmTimeseriesAttachmentData,
} from '../../../common/agent_builder/attachments';
import { LazyAgentApmTimeseries } from './lazy_agent_apm_timeseries';

type ApmTimeseriesAttachment = Attachment<
  typeof APM_TIMESERIES_ATTACHMENT_TYPE,
  ApmTimeseriesAttachmentData
>;

/** Exported separately so the definition object can be unit-tested without a live attachments service. */
export function createApmTimeseriesAttachmentDefinition() {
  return {
    getLabel: (attachment: ApmTimeseriesAttachment) =>
      attachment.data?.title ??
      i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.label', {
        defaultMessage: 'APM Timeseries',
      }),
    getIcon: () => 'visLine' as const,
    renderInlineContent: ({ attachment }: { attachment: ApmTimeseriesAttachment }) => (
      <LazyAgentApmTimeseries data={attachment.data} />
    ),
  };
}

export const registerApmTimeseriesAttachment = (attachments: AttachmentServiceStartContract) => {
  attachments.addAttachmentType<ApmTimeseriesAttachment>(
    APM_TIMESERIES_ATTACHMENT_TYPE,
    createApmTimeseriesAttachmentDefinition()
  );
};
