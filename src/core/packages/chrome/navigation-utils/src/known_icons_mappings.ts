/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// TODO: move this to core as part of deep link registration
export const AppDeepLinkIdToIcon: Record<string, string> = {
  workflows: 'workflowsApp',
  // analytics
  discover: 'discoverApp',
  dashboards: 'dashboardApp',
  visualize: 'visualizeApp',
  maps: 'mapApp',
  canvas: 'canvasApp',
  graph: 'graphApp',

  // management
  dev_tools: 'devToolsApp',
  management: 'managementApp',
  monitoring: 'monitoringApp',
  fleet: 'fleetApp',
  integrations: 'plugs',

  // ml
  ml: 'machineLearningApp',
  'ml:dataVisualizer': 'dataVisualizer',
};
