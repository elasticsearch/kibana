/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiTourState } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export const STREAMS_TOUR_CALLOUT_DISMISSED_KEY = 'streams.tour.calloutDismissed';
export const STREAMS_TOUR_STATE_KEY = 'streams.tour.state';

export type StreamsTourStepId = 'streams_list' | 'retention' | 'processing' | 'attachments';

export const STEP_ID_TO_TAB: Record<StreamsTourStepId, string | undefined> = {
  streams_list: undefined,
  retention: 'retention',
  processing: 'processing',
  attachments: 'attachments',
};

// Reverse mapping: tab name → tour step ID
export const TAB_TO_TOUR_STEP_ID: Record<string, StreamsTourStepId | undefined> =
  Object.fromEntries(
    Object.entries(STEP_ID_TO_TAB)
      .filter(([, tab]) => tab !== undefined)
      .map(([stepId, tab]) => [tab, stepId as StreamsTourStepId])
  );

export const DEFAULT_TOUR_STATE: EuiTourState = {
  currentTourStep: 1,
  isTourActive: false,
  tourPopoverWidth: 360,
  tourSubtitle: i18n.translate('xpack.streams.tour.subtitle', {
    defaultMessage: 'Streams',
  }),
};
