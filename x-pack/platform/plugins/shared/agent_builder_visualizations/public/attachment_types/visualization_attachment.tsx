/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type {
  VISUALIZATION_ATTACHMENT_TYPE,
  VisualizationAttachmentData,
} from '@kbn/agent-builder-visualizations-common';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import { type AttachmentUIDefinition } from '@kbn/agent-builder-browser/attachments';
import { getVisualizationDimensionsFromConfig } from '@kbn/agent-builder-visualizations';
import {
  InlineVisualization,
  type VegaVisualizationServices,
} from '@kbn/agent-builder-visualizations/vega';

const defaultVisualizationLabel = i18n.translate(
  'xpack.agentBuilder.attachments.visualization.label',
  { defaultMessage: 'Visualization' }
);

export type VisualizationAttachment = Attachment<
  typeof VISUALIZATION_ATTACHMENT_TYPE,
  VisualizationAttachmentData
>;

/**
 * Builds the visualization attachment UI definition that bridges the rendering
 * components from `@kbn/agent-builder-visualizations` into the Agent Builder
 * attachment registry. Renderers receive Kibana services explicitly via
 * `VegaVisualizationServices`.
 */
export const createVisualizationAttachmentDefinition = (
  services: VegaVisualizationServices
): AttachmentUIDefinition<VisualizationAttachment> => {
  return {
    getLabel: (attachment: VisualizationAttachment): string => {
      return 'title' in attachment.data && typeof attachment.data.title === 'string'
        ? attachment.data.title
        : defaultVisualizationLabel;
    },
    getIcon: () => 'lensApp',
    getMaxWidth: (attachment) => {
      const { data } = attachment;
      return getVisualizationDimensionsFromConfig(data.visualization as Record<string, unknown>)
        .width;
    },
    renderInlineContent: ({ attachment, screenContext }, callbacks) => {
      const { data } = attachment;

      return (
        <InlineVisualization
          services={services}
          renderer={data.renderer}
          visualization={data.visualization}
          timeRange={data.time_range ?? screenContext?.time_range}
          registerActionButtons={callbacks?.registerActionButtons}
        />
      );
    },
  };
};
