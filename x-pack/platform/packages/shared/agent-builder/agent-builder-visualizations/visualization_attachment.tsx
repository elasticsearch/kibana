/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { VisualizationAttachment } from '@kbn/agent-builder-common/attachments';
import { type AttachmentUIDefinition } from '@kbn/agent-builder-browser/attachments';
import { getVisualizationDimensionsFromLensConfig } from './shared/get_visualization_dimensions';
import type { VisualizationServices } from './services';

const LazyVisualizeLens = React.lazy(() =>
  import('./visualize_lens').then((m) => ({ default: m.VisualizeLens }))
);

const LazyVisualizeVega = React.lazy(() =>
  import('./visualize_vega').then((m) => ({ default: m.VisualizeVega }))
);

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
      return attachment.data?.title ?? defaultVisualizationLabel;
    },
    getIcon: () => 'lensApp',
    getMaxWidth: (attachment) => {
      const { data } = attachment;
      if (data.renderer === 'vega') {
        return undefined;
      }
      return getVisualizationDimensionsFromLensConfig(data.visualization as Record<string, unknown>)
        .width;
    },
    renderInlineContent: ({ attachment, screenContext }, callbacks) => {
      const { data } = attachment;

      const timeRange = data.time_range ?? screenContext?.time_range;

      if (data.renderer === 'vega') {
        const spec = data.visualization?.spec;
        if (typeof spec !== 'string') {
          return null;
        }
        return (
          <Suspense fallback={<EuiLoadingSpinner />}>
            <LazyVisualizeVega
              services={services}
              spec={spec}
              timeRange={timeRange}
              registerActionButtons={callbacks?.registerActionButtons}
            />
          </Suspense>
        );
      }

      return (
        <Suspense fallback={<EuiLoadingSpinner />}>
          <LazyVisualizeLens
            services={services}
            lensConfig={data.visualization}
            timeRange={timeRange}
            registerActionButtons={callbacks?.registerActionButtons}
          />
        </Suspense>
      );
    },
  };
};
