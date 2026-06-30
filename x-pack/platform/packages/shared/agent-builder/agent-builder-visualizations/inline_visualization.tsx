/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import type { TimeRange } from '@kbn/es-query';
import type { InlineRenderCallbacks } from '@kbn/agent-builder-browser/attachments';
import type { VisualizationServices } from './services';

const LazyVisualizeLens = React.lazy(() =>
  import('./visualize_lens').then((m) => ({ default: m.VisualizeLens }))
);

const LazyVisualizeVega = React.lazy(() =>
  import('./visualize_vega').then((m) => ({ default: m.VisualizeVega }))
);

export interface InlineVisualizationProps {
  services: VisualizationServices;
  /** Which renderer to use. Anything other than `'vega'` renders via Lens. */
  renderer?: 'lens' | 'vega';
  /** Renderer-specific payload: a Lens config, or a Vega spec under `spec`. */
  visualization: Record<string, unknown>;
  timeRange?: TimeRange;
  registerActionButtons?: InlineRenderCallbacks['registerActionButtons'];
}

/**
 * Renders a stored visualization payload with the renderer selected by
 * `renderer`, lazily loading the underlying component and sharing the
 * `Suspense` loading boilerplate between renderers.
 */
export const InlineVisualization = ({
  services,
  renderer,
  visualization,
  timeRange,
  registerActionButtons,
}: InlineVisualizationProps) => {
  return (
    <Suspense fallback={<EuiLoadingSpinner />}>
      {renderer === 'vega' ? (
        <LazyVisualizeVega
          services={services}
          visualization={visualization}
          timeRange={timeRange}
          registerActionButtons={registerActionButtons}
        />
      ) : (
        <LazyVisualizeLens
          services={services}
          lensConfig={visualization}
          timeRange={timeRange}
          registerActionButtons={registerActionButtons}
        />
      )}
    </Suspense>
  );
};
