/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ApmDocumentType } from '../../../common/document_type';
import { RollupInterval } from '../../../common/rollup';

/** Minimal time_range_metadata response so usePreferredDataSourceAndBucketSize resolves. */
export const TIME_RANGE_METADATA_DEFAULTS = {
  isUsingServiceDestinationMetrics: true,
  sources: [
    {
      documentType: ApmDocumentType.ServiceTransactionMetric,
      hasDocs: true,
      rollupInterval: RollupInterval.OneMinute,
      hasDurationSummaryField: true,
    },
    {
      documentType: ApmDocumentType.TransactionMetric,
      hasDocs: true,
      rollupInterval: RollupInterval.OneMinute,
      hasDurationSummaryField: true,
    },
    {
      documentType: ApmDocumentType.TransactionEvent,
      hasDocs: true,
      rollupInterval: RollupInterval.None,
      hasDurationSummaryField: false,
    },
    {
      documentType: ApmDocumentType.ServiceDestinationMetric,
      hasDocs: true,
      rollupInterval: RollupInterval.None,
      hasDurationSummaryField: false,
    },
  ],
};

/** Shared a11y rule config for APM stories — enable common rules, disable region (Storybook has no landmarks). */
export const APM_STORY_A11Y = {
  config: {
    rules: [
      { id: 'color-contrast', enabled: true },
      { id: 'image-alt', enabled: true },
      { id: 'aria-required-attr', enabled: true },
      { id: 'aria-roles', enabled: true },
      { id: 'region', enabled: false },
    ],
  },
};

/**
 * Builds `parameters.apmContext` for a story's HTTP mock.
 * Omit `post` to keep the default mock POST handler (preserves mockApmApiCallResponse cache).
 */
export function makeApmContextParams(
  get: (endpoint: string) => unknown,
  post?: (endpoint: string) => unknown
) {
  return {
    apmContext: {
      core: {
        http: {
          get: async (endpoint: string) => get(endpoint),
          ...(post ? { post: async (endpoint: string) => post(endpoint) } : {}),
        },
      },
    },
  };
}
