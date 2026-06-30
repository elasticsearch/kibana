/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { VisualizationAttachment } from '@kbn/agent-builder-visualizations-common';
import { type AttachmentUIDefinition } from '@kbn/agent-builder-browser/attachments';
import { getVisualizationDimensionsFromConfig } from './shared/get_visualization_dimensions';
import { InlineVisualization } from './inline_visualization';
import type { VisualizationServices } from './services';

const defaultVisualizationLabel = i18n.translate(
  'xpack.agentBuilder.attachments.visualization.label',
  { defaultMessage: 'Visualization' }
);

/**
 * Factory function that creates the visualization attachment UI definition.
 * Renderers receive Kibana services explicitly via `VisualizationServices`, so
 * this package stays decoupled from any single consumer's Kibana context shape.
 */
export const createVisualizationAttachmentDefinition = (
  services: VisualizationServices
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
