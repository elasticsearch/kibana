/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeedbackRegistryEntry } from '@kbn/ui-feedback';
import { DEFAULT_REGISTRY_ID } from './constants';
import type { FeedbackRegistry } from './types';

async function apmLoader() {
  const m = await import('./questions/apm');
  return m.questions;
}

async function infraLoader() {
  const m = await import('./questions/infra');
  return m.questions;
}

const feedbackRegistry: FeedbackRegistry = new Map([
  [DEFAULT_REGISTRY_ID, () => import('./questions/default').then((m) => m.questions)],
  [
    'ml:anomalyExplorer',
    () => import('./questions/machine_learning').then((m) => m.anomalyExplorerQuestions),
  ],
  [
    'ml:resultExplorer',
    () => import('./questions/machine_learning').then((m) => m.dfaResultsExplorerQuestions),
  ],
  [
    'ml:analyticsMap',
    () => import('./questions/machine_learning').then((m) => m.analyticsMapQuestions),
  ],
  [
    'ml:singleMetricViewer',
    () => import('./questions/machine_learning').then((m) => m.singleMetricViewerQuestions),
  ],
  ['apm', apmLoader],
  ['apm:service-groups-list', apmLoader],
  ['apm:services', apmLoader],
  ['apm:traces', apmLoader],
  ['apm:service-map', apmLoader],
  ['apm:dependencies', apmLoader],
  ['apm:settings', apmLoader],
  ['apm:storage-explorer', apmLoader],
  ['apm:tutorial', apmLoader],
  ['metrics', infraLoader],
  ['metrics:inventory', infraLoader],
  ['metrics:hosts', infraLoader],
  ['metrics:metrics-explorer', infraLoader],
  ['metrics:settings', infraLoader],
  ['metrics:assetDetails', infraLoader],
]);

export const getFeedbackQuestionsForApp = async (
  appId?: string
): Promise<FeedbackRegistryEntry[]> => {
  const loader =
    appId && feedbackRegistry.has(appId)
      ? feedbackRegistry.get(appId)!
      : feedbackRegistry.get(DEFAULT_REGISTRY_ID)!;
  const questions = await loader();
  return questions.sort((a, b) => a.order - b.order);
};
