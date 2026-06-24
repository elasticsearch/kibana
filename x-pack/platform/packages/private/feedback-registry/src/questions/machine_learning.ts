/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeedbackRegistryEntry } from '@kbn/ui-feedback';

/**
 * Custom page-specific ML feedback questions live in this module. When you add
 * questions for a new ML deep link / app id, also add that app id to
 * `APPS_WITHOUT_CATEGORY_PREFIX` in
 * `x-pack/platform/plugins/private/feedback/public/src/utils/get_app_details.ts`
 * so the feedback form title omits the redundant category prefix (same pattern
 * as existing `ml:*` entries there).
 */
export const anomalyExplorerQuestions: FeedbackRegistryEntry[] = [
  {
    id: 'ml_ad_anomaly_explorer_use_case',
    order: 1,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.anomalyExplorer.q1Placeholder',
      defaultMessage: 'Share your use case',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.anomalyExplorer.q1Label',
      defaultMessage: 'What were you trying to investigate or explain just now?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.anomalyExplorer.q1AriaLabel',
      defaultMessage: 'What were you trying to investigate or explain just now?',
    },
    question: 'What were you trying to investigate or explain just now?',
  },
  {
    id: 'ml_ad_anomaly_explorer_improvements',
    order: 2,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.anomalyExplorer.q2Placeholder',
      defaultMessage: 'Share what would help',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.anomalyExplorer.q2Label',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.anomalyExplorer.q2AriaLabel',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    question: "What's one thing that would make this more useful for you?",
  },
];

export const dfaResultsExplorerQuestions: FeedbackRegistryEntry[] = [
  {
    id: 'ml_dfa_results_explorer_use_case',
    order: 1,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.dfaResultsExplorer.q1Placeholder',
      defaultMessage: 'Share your use case',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.dfaResultsExplorer.q1Label',
      defaultMessage: 'What were you trying to evaluate or inspect just now?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.dfaResultsExplorer.q1AriaLabel',
      defaultMessage: 'What were you trying to evaluate or inspect just now?',
    },
    question: 'What were you trying to evaluate or inspect just now?',
  },
  {
    id: 'ml_dfa_results_explorer_improvements',
    order: 2,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.dfaResultsExplorer.q2Placeholder',
      defaultMessage: 'Share what would help',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.dfaResultsExplorer.q2Label',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.dfaResultsExplorer.q2AriaLabel',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    question: "What's one thing that would make this more useful for you?",
  },
];

export const analyticsMapQuestions: FeedbackRegistryEntry[] = [
  {
    id: 'ml_analytics_map_use_case',
    order: 1,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.analyticsMap.q1Placeholder',
      defaultMessage: 'Share your use case',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.analyticsMap.q1Label',
      defaultMessage: 'What were you trying to trace or map out just now?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.analyticsMap.q1AriaLabel',
      defaultMessage: 'What were you trying to trace or map out just now?',
    },
    question: 'What were you trying to trace or map out just now?',
  },
  {
    id: 'ml_analytics_map_improvements',
    order: 2,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.analyticsMap.q2Placeholder',
      defaultMessage: 'Share what would help',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.analyticsMap.q2Label',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.analyticsMap.q2AriaLabel',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    question: "What's one thing that would make this more useful for you?",
  },
];

export const singleMetricViewerQuestions: FeedbackRegistryEntry[] = [
  {
    id: 'ml_smv_use_case',
    order: 1,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.singleMetricViewer.q1Placeholder',
      defaultMessage: 'Share your use case',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.singleMetricViewer.q1Label',
      defaultMessage: 'What were you trying to investigate or explain just now?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.singleMetricViewer.q1AriaLabel',
      defaultMessage: 'What were you trying to investigate or explain just now?',
    },
    question: 'What were you trying to investigate or explain just now?',
  },
  {
    id: 'ml_smv_improvements',
    order: 2,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.ml.singleMetricViewer.q2Placeholder',
      defaultMessage: 'Share what would help',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.ml.singleMetricViewer.q2Label',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.ml.singleMetricViewer.q2AriaLabel',
      defaultMessage: "What's one thing that would make this more useful for you?",
    },
    question: "What's one thing that would make this more useful for you?",
  },
];
