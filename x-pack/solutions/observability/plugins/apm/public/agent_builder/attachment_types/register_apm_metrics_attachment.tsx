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
  APM_METRICS_ATTACHMENT_TYPE,
  type ApmMetricsAttachmentData,
} from '../../../common/agent_builder/attachments';
import { LazyAgentApmMetrics } from './lazy_agent_apm_metrics';

type ApmMetricsAttachment = Attachment<
  typeof APM_METRICS_ATTACHMENT_TYPE,
  ApmMetricsAttachmentData
>;

/** Exported separately so the definition object can be unit-tested without a live attachments service. */
export function createApmMetricsAttachmentDefinition() {
  return {
    getLabel: (attachment: ApmMetricsAttachment) =>
      attachment.data?.title ??
      i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.label', {
        defaultMessage: 'APM Metrics',
      }),
    getIcon: () => 'visMetric' as const,
    renderInlineContent: ({ attachment }: { attachment: ApmMetricsAttachment }) => (
      <LazyAgentApmMetrics data={attachment.data} />
    ),
  };
}

export const registerApmMetricsAttachment = (attachments: AttachmentServiceStartContract) => {
  attachments.addAttachmentType<ApmMetricsAttachment>(
    APM_METRICS_ATTACHMENT_TYPE,
    createApmMetricsAttachmentDefinition()
  );
};
