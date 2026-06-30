/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { VisualizationAttachment } from '@kbn/agent-builder-common/attachments';
import { type AttachmentUIDefinition } from '@kbn/agent-builder-browser/attachments';
import {
  getVisualizationDimensionsFromLensConfig,
  type VisualizationServices,
} from '@kbn/agent-builder-visualizations';
import type { AgentBuilderStartDependencies } from '../../../types';

const LazyVisualizeLens = React.lazy(() =>
  import('@kbn/agent-builder-visualizations').then((m) => ({ default: m.VisualizeLens }))
);

const LazyVisualizeVega = React.lazy(() =>
  import('@kbn/agent-builder-visualizations').then((m) => ({ default: m.VisualizeVega }))
);

const defaultVisualizationLabel = i18n.translate(
  'xpack.agentBuilder.attachments.visualization.label',
  { defaultMessage: 'Visualization' }
);

/**
 * Factory function that creates the visualization attachment UI definition.
 * Reuses the shared visualization renderers from `@kbn/agent-builder-visualizations`.
 */
export const createVisualizationAttachmentDefinition = ({
  application,
  startDependencies,
}: {
  application: ApplicationStart;
  startDependencies: AgentBuilderStartDependencies;
}): AttachmentUIDefinition<VisualizationAttachment> => {
  const services: VisualizationServices = {
    application,
    lens: startDependencies.lens,
    dataViews: startDependencies.dataViews,
    uiActions: startDependencies.uiActions,
    unifiedSearch: startDependencies.unifiedSearch,
    embeddable: startDependencies.embeddable,
  };

  return {
    getLabel: (attachment: VisualizationAttachment): string => {
      const { data } = attachment;
      if (data.renderer === 'vega') {
        return defaultVisualizationLabel;
      }
      const { title } = data.visualization;
      return typeof title === 'string' ? title : defaultVisualizationLabel;
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
