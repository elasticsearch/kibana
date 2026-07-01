/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChartType } from '@kbn/visualization-utils';

export interface VisualizationElementAttributes {
  toolResultId?: string;
  chartType?: ChartType;
}

export const visualizationElement = {
  tagName: 'visualization',
  attributes: {
    toolResultId: 'tool-result-id',
    chartType: 'chart-type',
  },
};

export interface DashboardElementAttributes {
  toolResultId?: string;
}

export const dashboardElement = {
  tagName: 'dashboard',
  attributes: {
    toolResultId: 'tool-result-id',
  },
};

export interface RenderAttachmentElementAttributes {
  attachmentId?: string;
  version?: number | string;
}

export const renderAttachmentElement = {
  tagName: 'render_attachment',
  attributes: {
    attachmentId: 'id',
    version: 'version',
  },
};

export interface RenderElementAttributes {
  path?: string;
  type?: string;
}

export const renderElement = {
  tagName: 'render',
  attributes: {
    path: 'path',
    type: 'type',
  },
};
