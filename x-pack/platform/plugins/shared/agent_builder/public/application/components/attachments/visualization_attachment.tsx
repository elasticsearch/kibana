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
import type { AgentBuilderStartDependencies } from '../../../types';
import { getVisualizationDimensionsFromLensConfig } from '../tools/esql/shared/get_visualization_dimensions';

const LazyVisualizeLens = React.lazy(() =>
  import('../tools/esql/visualize_lens').then((m) => ({ default: m.VisualizeLens }))
);

const LazyVisualizeVega = React.lazy(() =>
  import('../tools/esql/visualize_vega').then((m) => ({ default: m.VisualizeVega }))
);

const defaultVisualizationLabel = i18n.translate(
  'xpack.agentBuilder.attachments.visualization.label',
  { defaultMessage: 'Visualization' }
);

/**
 * Factory function that creates the visualization attachment UI definition.
 * Reuses the existing VisualizeLens component used for visualization tool results.
 */
export const createVisualizationAttachmentDefinition = ({
  startDependencies,
}: {
  startDependencies: AgentBuilderStartDependencies;
}): AttachmentUIDefinition<VisualizationAttachment> => {
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
        return (
          <Suspense fallback={<EuiLoadingSpinner />}>
            <LazyVisualizeVega
              spec={data.spec}
              timeRange={timeRange}
              registerActionButtons={callbacks?.registerActionButtons}
            />
          </Suspense>
        );
      }

      return (
        <Suspense fallback={<EuiLoadingSpinner />}>
          <LazyVisualizeLens
            lensConfig={data.visualization}
            dataViews={startDependencies.dataViews}
            lens={startDependencies.lens}
            uiActions={startDependencies.uiActions}
            timeRange={timeRange}
            registerActionButtons={callbacks?.registerActionButtons}
          />
        </Suspense>
      );
    },
  };
};
