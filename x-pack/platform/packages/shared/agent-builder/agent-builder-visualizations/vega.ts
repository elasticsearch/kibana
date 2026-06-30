/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Vega-capable public surface. Importing from here pulls the Vega renderer and
// therefore `embeddable` / `presentationUtil`; consumers that only render Lens
// should import from the package root instead.
export { VisualizeVega } from './visualize_vega';
export { InlineVisualization, type InlineVisualizationProps } from './inline_visualization';
export type { VegaVisualizationServices } from './services';
